import paypalService from '../../integrations/paypal/paypal.service.mjs';
import bookingRepository from '../bookings/booking.repository.mjs';
import { sendBookingConfirmation } from '../../integrations/resend/resend.service.mjs';
import bookingMapper from '../bookings/booking.mapper.mjs';
import logger from '../../config/logger.mjs';

function payableAmount(booking = {}) {
  const amount = Number.parseFloat(booking.customer_price ?? booking.total_amount);
  return Number.isFinite(amount) ? amount : 0;
}

function currencyOf(booking = {}) {
  const currency = String(booking.currency || 'USD').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : 'USD';
}

function paymentStatusOf(booking = {}) {
  return String(booking.payment_status || 'PENDING').trim().toUpperCase();
}

function isPaid(booking = {}) {
  return paymentStatusOf(booking) === 'PAID';
}

function createOrderIdempotencyKey(booking, amount, currency) {
  const cents = Math.round(amount * 100);
  const version = Number.parseInt(booking.version, 10) || 1;
  return `ft_ord_${booking.id}_v${version}_${cents}_${currency}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 108);
}

function captureIdempotencyKey(bookingId, orderId) {
  return `ft_cap_${bookingId}_${orderId}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 108);
}

function extractCapture(orderResponse = {}) {
  const purchaseUnit = orderResponse.purchase_units?.[0] || {};
  const capture = purchaseUnit.payments?.captures?.[0] || {};
  return { purchaseUnit, capture, status: capture.status || orderResponse.status || null };
}

async function sendConfirmationForBooking(booking) {
  try {
    const relations = await bookingRepository.getRelations(booking.id);
    const canonical = bookingMapper.toCanonicalModel(
      booking,
      relations.travellers,
      relations.contacts,
      relations.flights,
      relations.payments,
      relations.paymentMethod
    );
    await sendBookingConfirmation(canonical);
  } catch (err) {
    logger.error('Failed to send PayPal booking confirmation email:', err.message);
  }
}

export const paypalController = {
  createOrder: async (req, res, next) => {
    try {
      const { bookingId } = req.body || {};
      if (!bookingId) {
        return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'bookingId is required' } });
      }

      const booking = await bookingRepository.findBookingById(bookingId);
      if (!booking) {
        return res.status(404).json({ success: false, error: { code: 'BOOKING_NOT_FOUND', message: 'Booking record not found' } });
      }

      if (booking.is_mock || booking.isMock || booking.flight_details?.isMock) {
        return res.status(400).json({
          success: false,
          error: { code: 'MOCK_FLIGHT_NOT_BOOKABLE', message: 'Offline / sample flight routes cannot be booked online. Please contact our support team.' }
        });
      }

      if (isPaid(booking)) {
        return res.status(400).json({ success: false, error: { code: 'BOOKING_ALREADY_PAID', message: 'This booking has already been paid.' } });
      }
      if (['CANCELLED', 'FAILED'].includes(String(booking.status || '').toUpperCase())) {
        return res.status(400).json({ success: false, error: { code: 'BOOKING_EXPIRED', message: 'Booking is no longer available.' } });
      }

      const authoritativeAmount = payableAmount(booking);
      const currency = currencyOf(booking);
      if (authoritativeAmount <= 0) {
        return res.status(400).json({ success: false, error: { code: 'INVALID_AMOUNT', message: 'Invalid booking payable amount' } });
      }

      const idempotencyKey = createOrderIdempotencyKey(booking, authoritativeAmount, currency);
      const order = await paypalService.createOrder({
        bookingId: booking.id,
        amount: authoritativeAmount,
        currency,
        idempotencyKey
      });

      await bookingRepository.upsertPayPalPayment({
        booking_id: booking.id,
        payment_provider: 'paypal',
        provider_order_id: order.id,
        payment_amount: authoritativeAmount,
        amount: authoritativeAmount,
        currency,
        payment_status: 'PENDING',
        idempotency_key: idempotencyKey,
      });

      return res.json({ success: true, orderId: order.id });
    } catch (error) {
      logger.error(`PayPal createOrder controller error: ${error.message}`);
      return next(error);
    }
  },

  captureOrder: async (req, res, next) => {
    try {
      const { bookingId, paypalOrderId } = req.body || {};
      if (!bookingId || !paypalOrderId) {
        return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'bookingId and paypalOrderId are required' } });
      }

      const booking = await bookingRepository.findBookingById(bookingId);
      if (!booking) {
        return res.status(404).json({ success: false, error: { code: 'BOOKING_NOT_FOUND', message: 'Booking record not found' } });
      }

      const paymentRecord = await bookingRepository.findPaymentByOrderId(paypalOrderId);
      if (!paymentRecord) {
        return res.status(409).json({
          success: false,
          error: { code: 'PAYPAL_ORDER_NOT_REGISTERED', message: 'This PayPal order is not registered to the booking. Create a fresh payment order and retry.' }
        });
      }
      if (paymentRecord.booking_id !== booking.id) {
        return res.status(403).json({
          success: false,
          error: { code: 'OWNERSHIP_MISMATCH', message: 'PayPal Order ID does not belong to this booking' }
        });
      }

      if (isPaid(booking) || String(paymentRecord.payment_status || '').toUpperCase() === 'PAID') {
        return res.json({
          success: true,
          bookingId: booking.id,
          paymentStatus: 'COMPLETED',
          captureId: paymentRecord.provider_capture_id || 'ALREADY_COMPLETED'
        });
      }

      const idempotencyKey = captureIdempotencyKey(booking.id, paypalOrderId);
      let captureResponse;
      try {
        captureResponse = await paypalService.captureOrder({ paypalOrderId, idempotencyKey });
      } catch (captureErr) {
        if (captureErr.issue === 'UNPROCESSABLE_ENTITY' || captureErr.issue === 'PAYMENT_NOT_APPROVED_FOR_EXECUTION') {
          return res.status(422).json({ success: false, error: { code: 'PAYMENT_DECLINED', message: 'Payment was not approved or was declined by PayPal.' } });
        }
        if (captureErr.issue === 'ORDER_ALREADY_CAPTURED') {
          captureResponse = await paypalService.getOrder(paypalOrderId);
        } else {
          return res.status(captureErr.status || 500).json({
            success: false,
            error: { code: captureErr.issue || 'CAPTURE_FAILED', message: captureErr.message || 'Payment capture failed' }
          });
        }
      }

      const { purchaseUnit, capture, status: captureStatus } = extractCapture(captureResponse);
      if (captureStatus === 'PENDING') {
        await bookingRepository.upsertPayPalPayment({
          booking_id: booking.id,
          payment_provider: 'paypal',
          provider_order_id: paypalOrderId,
          payment_status: 'PROCESSING',
          failure_reason: capture.status_details?.reason || 'Capture pending'
        });
        return res.status(202).json({ success: false, error: { code: 'CAPTURE_PENDING', message: 'Payment capture is pending review by PayPal.' } });
      }
      if (captureStatus !== 'COMPLETED') {
        return res.status(422).json({ success: false, error: { code: 'PAYMENT_NOT_COMPLETED', message: `PayPal payment status: ${captureStatus || 'UNKNOWN'}` } });
      }

      const providerBookingId = String(purchaseUnit.custom_id || purchaseUnit.reference_id || '').trim();
      if (providerBookingId && providerBookingId !== booking.id) {
        logger.error(`PayPal purchase-unit ownership mismatch for booking ${booking.id}: ${providerBookingId}`);
        return res.status(403).json({ success: false, error: { code: 'OWNERSHIP_MISMATCH', message: 'Captured PayPal order does not belong to this booking.' } });
      }

      const capturedAmount = Number.parseFloat(capture.amount?.value || '0');
      const capturedCurrency = String(capture.amount?.currency_code || '').toUpperCase();
      const expectedAmount = payableAmount(booking);
      const expectedCurrency = currencyOf(booking);

      if (!Number.isFinite(capturedAmount) || Math.abs(capturedAmount - expectedAmount) > 0.01) {
        logger.error(`PayPal amount mismatch: expected ${expectedAmount}, got ${capturedAmount}`);
        return res.status(400).json({ success: false, error: { code: 'AMOUNT_MISMATCH', message: 'Captured amount does not match expected booking total' } });
      }
      if (capturedCurrency !== expectedCurrency) {
        logger.error(`PayPal currency mismatch: expected ${expectedCurrency}, got ${capturedCurrency}`);
        return res.status(400).json({ success: false, error: { code: 'CURRENCY_MISMATCH', message: 'Captured currency does not match booking currency' } });
      }

      const payer = captureResponse.payer || {};
      const captureId = capture.id;
      await bookingRepository.upsertPayPalPayment({
        booking_id: booking.id,
        payment_provider: 'paypal',
        provider_order_id: paypalOrderId,
        provider_capture_id: captureId,
        payment_amount: capturedAmount,
        amount: capturedAmount,
        currency: capturedCurrency,
        payment_status: 'PAID',
        paid_at: new Date().toISOString(),
        payer_email: payer.email_address || null,
        payer_id: payer.payer_id || null,
        idempotency_key: idempotencyKey
      });

      const updatedBooking = await bookingRepository.updateStatus(booking.id, {
        status: 'READY_FOR_TICKETING',
        payment_status: 'PAID',
        updated_at: new Date().toISOString()
      });

      void sendConfirmationForBooking(updatedBooking);
      return res.json({ success: true, bookingId: booking.id, paymentStatus: 'COMPLETED', captureId });
    } catch (error) {
      logger.error(`PayPal captureOrder controller error: ${error.message}`);
      return next(error);
    }
  },

  handleWebhook: async (req, res) => {
    try {
      const isSignatureValid = await paypalService.verifyWebhookSignature({ headers: req.headers, rawBody: req.body });
      if (!isSignatureValid) {
        logger.warn('PayPal Webhook verification failed: Invalid signature or missing production webhook configuration');
        return res.status(400).json({ success: false, error: 'Invalid webhook signature' });
      }

      const event = req.body || {};
      const eventType = event.event_type;
      const resource = event.resource || {};
      logger.info(`Processing PayPal Webhook event: ${eventType}`);

      if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
        const captureId = resource.id;
        const customId = resource.custom_id || resource.reference_id;
        const amount = Number.parseFloat(resource.amount?.value || '0');
        const currency = String(resource.amount?.currency_code || '').toUpperCase();

        const existingPayment = captureId ? await bookingRepository.findPaymentByCaptureId(captureId) : null;
        if (!existingPayment && customId) {
          const booking = await bookingRepository.findBookingById(customId);
          if (booking) {
            const expectedAmount = payableAmount(booking);
            const expectedCurrency = currencyOf(booking);
            if (!Number.isFinite(amount) || Math.abs(amount - expectedAmount) > 0.01 || currency !== expectedCurrency) {
              logger.error(`Rejected PayPal webhook reconciliation for ${booking.id}: provider ${amount} ${currency}, expected ${expectedAmount} ${expectedCurrency}`);
              return res.status(400).json({ success: false, error: 'Webhook payment amount or currency mismatch' });
            }

            await bookingRepository.upsertPayPalPayment({
              booking_id: booking.id,
              payment_provider: 'paypal',
              provider_capture_id: captureId,
              payment_amount: amount,
              amount,
              currency,
              payment_status: 'PAID',
              paid_at: new Date().toISOString()
            });

            const updatedBooking = await bookingRepository.updateStatus(booking.id, {
              status: 'READY_FOR_TICKETING',
              payment_status: 'PAID',
              updated_at: new Date().toISOString()
            });
            logger.info(`Reconciled booking ${booking.id} via PAYMENT.CAPTURE.COMPLETED webhook`);
            void sendConfirmationForBooking(updatedBooking);
          }
        }
      } else if (eventType === 'PAYMENT.CAPTURE.PENDING') {
        logger.info(`PayPal capture ${resource.id} is PENDING`);
      } else if (eventType === 'PAYMENT.CAPTURE.DENIED' || eventType === 'CHECKOUT.PAYMENT-APPROVAL.REVERSED') {
        const customId = resource.custom_id || resource.reference_id;
        if (customId) {
          await bookingRepository.updateStatus(customId, { status: 'FAILED', payment_status: 'FAILED', updated_at: new Date().toISOString() });
        }
      } else if (eventType === 'PAYMENT.CAPTURE.REFUNDED') {
        const customId = resource.custom_id || resource.reference_id;
        if (customId) {
          await bookingRepository.updateStatus(customId, { payment_status: 'REFUNDED', updated_at: new Date().toISOString() });
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
