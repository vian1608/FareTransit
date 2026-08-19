import paypalService from '../../integrations/paypal/paypal.service.mjs';
import bookingRepository from '../bookings/booking.repository.mjs';
import { sendBookingConfirmation } from '../../integrations/resend/resend.service.mjs';
import bookingMapper from '../bookings/booking.mapper.mjs';
import logger from '../../config/logger.mjs';

export const paypalController = {
  createOrder: async (req, res, next) => {
    try {
      const { bookingId } = req.body;

      if (!bookingId) {
        return res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'bookingId is required' }
        });
      }

      // 1. Retrieve booking from database
      const booking = await bookingRepository.findBookingById(bookingId);
      if (!booking) {
        return res.status(404).json({
          success: false,
          error: { code: 'BOOKING_NOT_FOUND', message: 'Booking record not found' }
        });
      }

      // Reject offline / mock flight results
      if (booking.is_mock || booking.isMock || booking.flight_details?.isMock) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MOCK_FLIGHT_NOT_BOOKABLE',
            message: 'Offline / sample flight routes cannot be booked online. Please contact our support team.'
          }
        });
      }

      // 2. Check if booking is pending & payable
      if (booking.status === 'DONE' || booking.payment_status === 'paid') {
        return res.status(400).json({
          success: false,
          error: { code: 'BOOKING_ALREADY_PAID', message: 'This booking has already been paid and confirmed.' }
        });
      }

      if (booking.status === 'CANCELLED' || booking.status === 'FAILED') {
        return res.status(400).json({
          success: false,
          error: { code: 'BOOKING_EXPIRED', message: 'Booking is no longer available.' }
        });
      }

      // 3. Retrieve authoritative amount & currency from database
      const authoritativeAmount = parseFloat(booking.total_amount);
      const currency = (booking.currency || 'USD').toUpperCase();

      if (isNaN(authoritativeAmount) || authoritativeAmount <= 0) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_AMOUNT', message: 'Invalid booking payable amount' }
        });
      }

      // 4. Create PayPal Order v2 with Idempotency Key
      const idempotencyKey = `ord_${bookingId}_${Date.now()}`;
      const order = await paypalService.createOrder({
        bookingId: booking.id,
        amount: authoritativeAmount,
        currency,
        idempotencyKey
      });

      // 5. Store PayPal Order ID in payments table
      await bookingRepository.upsertPayPalPayment({
        booking_id: booking.id,
        payment_provider: 'paypal',
        provider_order_id: order.id,
        payment_amount: authoritativeAmount,
        amount: authoritativeAmount,
        currency,
        payment_status: 'pending',
        idempotency_key: idempotencyKey,
      });

      // 6. Return only required order ID to frontend
      return res.json({
        success: true,
        orderId: order.id
      });
    } catch (error) {
      logger.error(`PayPal createOrder controller error: ${error.message}`);
      return next(error);
    }
  },

  captureOrder: async (req, res, next) => {
    try {
      const { bookingId, paypalOrderId } = req.body;

      if (!bookingId || !paypalOrderId) {
        return res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'bookingId and paypalOrderId are required' }
        });
      }

      // 1. Retrieve booking from database
      const booking = await bookingRepository.findBookingById(bookingId);
      if (!booking) {
        return res.status(404).json({
          success: false,
          error: { code: 'BOOKING_NOT_FOUND', message: 'Booking record not found' }
        });
      }

      // 2. Prevent double capture if already completed
      if (booking.status === 'DONE' && booking.payment_status === 'paid') {
        const existingRelations = await bookingRepository.getRelations(booking.id);
        const existingPayment = existingRelations.payments?.find(p => p.provider_order_id === paypalOrderId || p.payment_provider === 'paypal');

        return res.json({
          success: true,
          bookingId: booking.id,
          paymentStatus: 'COMPLETED',
          captureId: existingPayment?.provider_capture_id || 'ALREADY_COMPLETED'
        });
      }

      // 3. Confirm associated payment record or order ownership
      const paymentRecord = await bookingRepository.findPaymentByOrderId(paypalOrderId);
      if (paymentRecord && paymentRecord.booking_id !== booking.id) {
        return res.status(403).json({
          success: false,
          error: { code: 'OWNERSHIP_MISMATCH', message: 'PayPal Order ID does not belong to this booking' }
        });
      }

      // 4. Capture PayPal Order with Idempotency Key
      const idempotencyKey = `cap_${bookingId}_${paypalOrderId}`;
      let captureResponse;
      try {
        captureResponse = await paypalService.captureOrder({
          paypalOrderId,
          idempotencyKey
        });
      } catch (captureErr) {
        // Handle specific capture errors
        if (captureErr.issue === 'UNPROCESSABLE_ENTITY' || captureErr.issue === 'PAYMENT_NOT_APPROVED_FOR_EXECUTION') {
          return res.status(422).json({
            success: false,
            error: { code: 'PAYMENT_DECLINED', message: 'Payment was not approved or was declined by PayPal.' }
          });
        }
        if (captureErr.issue === 'ORDER_ALREADY_CAPTURED') {
          // Retrieve existing capture details
        } else {
          return res.status(captureErr.status || 500).json({
            success: false,
            error: { code: captureErr.issue || 'CAPTURE_FAILED', message: captureErr.message || 'Payment capture failed' }
          });
        }
      }

      // 5. Inspect capture status
      const purchaseUnit = captureResponse?.purchase_units?.[0] || {};
      const capture = purchaseUnit.payments?.captures?.[0] || {};
      const captureStatus = capture.status || captureResponse?.status;

      if (captureStatus !== 'COMPLETED') {
        if (captureStatus === 'PENDING') {
          await bookingRepository.upsertPayPalPayment({
            booking_id: booking.id,
            payment_provider: 'paypal',
            provider_order_id: paypalOrderId,
            payment_status: 'pending',
            failure_reason: capture.status_details?.reason || 'Capture pending'
          });

          return res.status(202).json({
            success: false,
            error: { code: 'CAPTURE_PENDING', message: 'Payment capture is pending review by PayPal.' }
          });
        }

        return res.status(422).json({
          success: false,
          error: { code: 'PAYMENT_NOT_COMPLETED', message: `PayPal payment status: ${captureStatus}` }
        });
      }

      // 6. Verify amount, currency, and reference match authoritative booking
      const capturedAmountStr = capture.amount?.value || '0.00';
      const capturedCurrencyStr = (capture.amount?.currency_code || 'USD').toUpperCase();
      const capturedAmount = parseFloat(capturedAmountStr);
      const expectedAmount = parseFloat(booking.total_amount);
      const expectedCurrency = (booking.currency || 'USD').toUpperCase();

      if (Math.abs(capturedAmount - expectedAmount) > 0.01) {
        logger.error(`Amount mismatch: Expected ${expectedAmount}, got ${capturedAmount}`);
        return res.status(400).json({
          success: false,
          error: { code: 'AMOUNT_MISMATCH', message: 'Captured amount does not match expected booking total' }
        });
      }

      if (capturedCurrencyStr !== expectedCurrency) {
        logger.error(`Currency mismatch: Expected ${expectedCurrency}, got ${capturedCurrencyStr}`);
        return res.status(400).json({
          success: false,
          error: { code: 'CURRENCY_MISMATCH', message: 'Captured currency does not match booking currency' }
        });
      }

      // 7. Extract payer details (sanitized)
      const payer = captureResponse.payer || {};
      const payerEmail = payer.email_address || null;
      const payerId = payer.payer_id || null;
      const captureId = capture.id;

      // 8. Atomic Database Updates
      await bookingRepository.upsertPayPalPayment({
        booking_id: booking.id,
        payment_provider: 'paypal',
        provider_order_id: paypalOrderId,
        provider_capture_id: captureId,
        payment_amount: capturedAmount,
        amount: capturedAmount,
        currency: capturedCurrencyStr,
        payment_status: 'paid',
        paid_at: new Date().toISOString(),
        payer_email: payerEmail,
        payer_id: payerId,
        idempotency_key: idempotencyKey
      });

      // Update booking status to CONFIRMED / paid
      await bookingRepository.updateStatus(booking.id, {
        status: 'CONFIRMED',
        payment_status: 'paid',
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      // 9. Send Confirmation Email asynchronously (idempotent)
      bookingRepository.getRelations(booking.id).then(relations => {
        const canonical = bookingMapper.toCanonicalModel(
          { ...booking, status: 'CONFIRMED', payment_status: 'paid' },
          relations.travellers,
          relations.contacts,
          relations.flights,
          relations.payments
        );
        sendBookingConfirmation(canonical).catch(err => {
          logger.error('Failed to send PayPal booking confirmation email:', err.message);
        });
      }).catch(err => {
        logger.error('Error constructing canonical booking for email:', err.message);
      });

      // 10. Return sanitized response
      return res.json({
        success: true,
        bookingId: booking.id,
        paymentStatus: 'COMPLETED',
        captureId
      });
    } catch (error) {
      logger.error(`PayPal captureOrder controller error: ${error.message}`);
      return next(error);
    }
  },

  handleWebhook: async (req, res) => {
    try {
      // 1. Verify PayPal Webhook Signature
      const isSignatureValid = await paypalService.verifyWebhookSignature({
        headers: req.headers,
        rawBody: req.body
      });

      if (!isSignatureValid) {
        logger.warn('PayPal Webhook verification failed: Invalid Signature');
        return res.status(400).json({ success: false, error: 'Invalid webhook signature' });
      }

      const event = req.body;
      const eventType = event.event_type;
      const resource = event.resource || {};

      logger.info(`Processing PayPal Webhook event: ${eventType}`);

      // 2. Handle Event Types
      if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
        const captureId = resource.id;
        const customId = resource.custom_id || resource.reference_id;
        const amount = parseFloat(resource.amount?.value || '0');
        const currency = resource.amount?.currency_code || 'USD';

        // Check if capture was already processed
        let paymentRecord = await bookingRepository.findPaymentByCaptureId(captureId);
        
        if (!paymentRecord && customId) {
          const booking = await bookingRepository.findBookingById(customId);
          if (booking && booking.status !== 'CONFIRMED') {
            await bookingRepository.upsertPayPalPayment({
              booking_id: booking.id,
              payment_provider: 'paypal',
              provider_capture_id: captureId,
              payment_amount: amount,
              amount,
              currency,
              payment_status: 'paid',
              paid_at: new Date().toISOString()
            });

            await bookingRepository.updateStatus(booking.id, {
              status: 'CONFIRMED',
              payment_status: 'paid',
              paid_at: new Date().toISOString()
            });
            logger.info(`Reconciled booking ${booking.id} via PAYMENT.CAPTURE.COMPLETED webhook`);

            // Send confirmation email asynchronously (idempotent)
            bookingRepository.getRelations(booking.id).then(relations => {
              const canonical = bookingMapper.toCanonicalModel(
                { ...booking, status: 'CONFIRMED', payment_status: 'paid' },
                relations.travellers,
                relations.contacts,
                relations.flights,
                relations.payments
              );
              sendBookingConfirmation(canonical).catch(err => {
                logger.error('Failed to send PayPal webhook booking confirmation email:', err.message);
              });
            }).catch(err => {
              logger.error('Error constructing canonical booking for email:', err.message);
            });
          }
        }
      } else if (eventType === 'PAYMENT.CAPTURE.PENDING') {
        logger.info(`PayPal capture ${resource.id} is PENDING`);
      } else if (eventType === 'PAYMENT.CAPTURE.DENIED' || eventType === 'CHECKOUT.PAYMENT-APPROVAL.REVERSED') {
        const customId = resource.custom_id || resource.reference_id;
        if (customId) {
          await bookingRepository.updateStatus(customId, {
            status: 'FAILED',
            payment_status: 'failed'
          });
        }
      } else if (eventType === 'PAYMENT.CAPTURE.REFUNDED') {
        const customId = resource.custom_id || resource.reference_id;
        if (customId) {
          await bookingRepository.updateStatus(customId, {
            payment_status: 'refunded'
          });
        }
      }

      return res.json({ status: 'success' });
    } catch (error) {
      logger.error(`PayPal webhook processing error: ${error.message}`);
      return res.status(500).json({ success: false, error: 'Webhook processing error' });
    }
  }
};

export default paypalController;
