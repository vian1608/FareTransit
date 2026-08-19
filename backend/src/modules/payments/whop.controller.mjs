import env from '../../config/env.mjs';
import logger from '../../config/logger.mjs';
import whopService from '../../integrations/whop/whop.service.mjs';
import bookingRepository from '../bookings/booking.repository.mjs';
import { sendBookingConfirmation, sendPaymentFailedEmail } from '../../integrations/resend/resend.service.mjs';
import bookingMapper from '../bookings/booking.mapper.mjs';

export const whopController = {
  /**
   * POST /api/whop/create-checkout
   * Server-side authoritative Whop checkout creation for a booking
   */
  createCheckout: async (req, res) => {
    const { bookingId } = req.body;
    try {
      if (!bookingId) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_BOOKING_ID', message: 'bookingId is required' }
        });
      }

      // Check feature flag WHOP_FLIGHT_CHECKOUT_ENABLED
      if (!env.whopFlightCheckoutEnabled && env.nodeEnv === 'production') {
        return res.status(403).json({
          success: false,
          error: { code: 'WHOP_DISABLED', message: 'Whop flight checkout is not currently active' }
        });
      }

      // 1. Fetch booking record from Supabase
      const booking = await bookingRepository.getById(bookingId);
      if (!booking) {
        return res.status(404).json({
          success: false,
          error: { code: 'BOOKING_NOT_FOUND', message: `Booking ${bookingId} not found` }
        });
      }

      // 2. Reject offline / mock flight results
      if (booking.is_mock || booking.flight_details?.isMock) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MOCK_FLIGHT_NOT_BOOKABLE',
            message: 'Offline / sample flight routes cannot be booked online. Please contact our support team.'
          }
        });
      }

      // 3. Reject already paid or cancelled bookings
      if (String(booking.payment_status).toLowerCase() === 'paid') {
        return res.status(400).json({
          success: false,
          error: { code: 'BOOKING_ALREADY_PAID', message: 'This booking has already been paid.' }
        });
      }

      if (booking.status === 'CANCELLED') {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_BOOKING_STATUS', message: `Booking is currently in ${booking.status} status` }
        });
      }

      // Reset payment status to 'pending' on retry if previously failed
      if (String(booking.payment_status).toUpperCase() === 'FAILED') {
        await bookingRepository.updateBookingStatus(booking.id, {
          payment_status: 'pending',
          payment_provider: 'whop'
        });
      }

      // 4. Calculate authoritative 10% discount price
      const supplierPrice = parseFloat(booking.supplier_price || booking.original_api_price || booking.total_amount || 0);
      const discountAmount = parseFloat(booking.discount_amount || Math.max(0, supplierPrice * 0.10));
      const customerPrice = parseFloat(booking.customer_price || booking.total_amount || (supplierPrice - discountAmount));

      if (isNaN(customerPrice) || customerPrice <= 0) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_PRICE', message: 'Invalid customer payable amount calculated by server' }
        });
      }

      // 5. Create Whop checkout configuration with authoritative price
      const whopCheckout = await whopService.createCheckoutConfiguration({
        bookingId: booking.id,
        bookingReference: booking.confirmation_code,
        customerEmail: booking.email,
        amount: customerPrice,
        currency: booking.currency || 'USD'
      });

      // 6. STORE provider_checkout_id on BOTH booking and payments record BEFORE rendering embed
      await bookingRepository.updateBookingStatus(booking.id, {
        provider_checkout_id: whopCheckout.sessionId,
        payment_provider: 'whop',
        payment_status: 'pending'
      });

      await bookingRepository.upsertWhopPayment({
        booking_id: booking.id,
        payment_provider: 'whop',
        provider_checkout_id: whopCheckout.sessionId,
        payment_amount: customerPrice,
        currency: (booking.currency || 'USD').toUpperCase(),
        payment_status: 'pending',
        payment_date: new Date().toISOString()
      });

      return res.json({
        success: true,
        sessionId: whopCheckout.sessionId,
        planId: whopCheckout.planId,
        env: env.whopEnv,
        price: {
          supplierPrice: supplierPrice.toFixed(2),
          discountAmount: discountAmount.toFixed(2),
          customerPrice: customerPrice.toFixed(2),
          currency: (booking.currency || 'USD').toUpperCase()
        }
      });
    } catch (err) {
      logger.error(`Error in Whop createCheckout: ${err.message}`);
      if (bookingId) {
        try {
          await bookingRepository.updateBookingStatus(bookingId, {
            payment_status: 'FAILED',
            payment_provider: 'whop',
            internal_notes: `Whop checkout initialization failed: ${err.message}`
          });
        } catch (dbErr) {
          logger.warn(`Failed to update booking status to FAILED: ${dbErr.message}`);
        }
      }
      return res.status(500).json({
        success: false,
        error: { code: 'WHOP_CHECKOUT_FAILED', message: err.message }
      });
    }
  },

  /**
   * POST /api/webhooks/whop
   * Verified, idempotent webhook handler for Whop payment events using @whop/sdk
   */
  handleWebhook: async (req, res) => {
    try {
      const rawBody = req.body;
      const headers = req.headers;

      // 1. Verify and unwrap webhook using official @whop/sdk client.webhooks.unwrap
      let event;
      try {
        event = whopService.verifyAndUnwrapWebhook(rawBody, headers);
      } catch (unwrapErr) {
        logger.warn(`[Whop] Webhook signature verification failed: ${unwrapErr.message}`);
        return res.status(401).json({ success: false, error: `Invalid webhook signature: ${unwrapErr.message}` });
      }

      if (!event) {
        return res.status(400).json({ success: false, error: 'Unwrapped webhook event is null' });
      }

      // Exact event type — NEVER default absent event types to payment.succeeded
      const eventType = String(event.type || event.action || event.event || '').trim();
      if (!eventType) {
        logger.warn('[Whop] Webhook event received without valid event type');
        return res.status(400).json({ success: false, error: 'Event missing type field' });
      }

      const data = event.data || event;
      const metadata = data.metadata || event.metadata || {};
      const webhookId = headers['webhook-id'] || headers['x-whop-id'] || event.id || `wh_${Date.now()}`;
      const paymentId = data.id || data.payment_id || 'N/A';
      const checkoutConfigId = data.checkout_configuration?.id || data.checkout_configuration_id || data.checkout_configuration || metadata.sessionId || 'N/A';
      const planId = data.plan?.id || data.plan_id || 'N/A';
      const companyId = event.company_id || data.company_id || env.whopCompanyId || 'N/A';
      const safeMetadataKeys = metadata && typeof metadata === 'object' ? Object.keys(metadata).join(', ') : 'none';

      // Log verified webhook metadata safely without logging secrets or full customer credentials
      logger.info(
        `[Whop Webhook Verified] ID: ${webhookId} | Type: ${eventType} | PayID: ${paymentId} | CheckoutID: ${checkoutConfigId} | PlanID: ${planId} | CompanyID: ${companyId} | SafeMetaKeys: [${safeMetadataKeys}]`
      );

      // 2. Idempotent Deduplication Check
      const existingEvent = await bookingRepository.getWebhookEvent(webhookId);
      if (existingEvent) {
        logger.info(`[Whop] Duplicate webhook received and skipped: ${webhookId}`);
        return res.status(200).json({ success: true, received: true, duplicate: true });
      }

      // Record event in webhook_events table
      await bookingRepository.recordWebhookEvent({
        id: String(webhookId),
        provider: 'whop',
        event_type: eventType,
        payload: event
      });

      // 3. Resolve Booking Robustly in 3 Fallback Steps
      let resolvedBooking = null;

      // Fallback Step 1: event.data.metadata.bookingId or booking_id
      const metadataBookingId = metadata.bookingId || metadata.booking_id || data.booking_id;
      if (metadataBookingId) {
        resolvedBooking = await bookingRepository.getById(metadataBookingId);
      }

      // Fallback Step 2: Whop API Checkout Configuration fetch
      if (!resolvedBooking && checkoutConfigId && checkoutConfigId !== 'N/A') {
        logger.info(`[Whop] Fetching checkout configuration metadata via API for ${checkoutConfigId}...`);
        const checkoutConfig = await whopService.getCheckoutConfiguration(checkoutConfigId);
        const cfgMetadata = checkoutConfig?.metadata || {};
        const cfgBookingId = cfgMetadata.bookingId || cfgMetadata.booking_id;
        if (cfgBookingId) {
          resolvedBooking = await bookingRepository.getById(cfgBookingId);
        }
      }

      // Fallback Step 3: Database lookup matching provider_checkout_id
      if (!resolvedBooking && checkoutConfigId && checkoutConfigId !== 'N/A') {
        logger.info(`[Whop] Looking up booking by provider_checkout_id in database for ${checkoutConfigId}...`);
        resolvedBooking = await bookingRepository.findBookingByCheckoutId(checkoutConfigId);
        if (!resolvedBooking) {
          const payRecord = await bookingRepository.findPaymentByCheckoutId(checkoutConfigId);
          if (payRecord?.booking_id) {
            resolvedBooking = await bookingRepository.getById(payRecord.booking_id);
          }
        }
      }

      // 4. Process Verified Event Types
      if (eventType === 'payment.succeeded' || eventType === 'payment_succeeded') {
        if (!resolvedBooking) {
          logger.warn(`[Whop] payment.succeeded event received but booking could not be resolved for checkout ${checkoutConfigId}`);
          return res.status(200).json({ success: true, warning: 'Booking could not be resolved' });
        }

        const providerPaymentId = data.id || data.payment_id || `wh_pay_${Date.now()}`;
        const paidAmount = parseFloat(data.final_amount || data.amount || metadata.expectedAmount || resolvedBooking.customer_price || resolvedBooking.total_amount || 0);

        // Run ONE idempotent server-side transaction
        const { booking: updatedBooking } = await bookingRepository.executePaymentConfirmationTx({
          bookingId: resolvedBooking.id,
          paymentProvider: 'whop',
          providerPaymentId,
          providerCheckoutId: checkoutConfigId !== 'N/A' ? checkoutConfigId : resolvedBooking.provider_checkout_id,
          paidAmount,
          currency: (resolvedBooking.currency || 'USD').toUpperCase(),
          paymentDate: new Date().toISOString()
        });

        logger.info(`[Whop] Server-side transaction completed: marked booking ${resolvedBooking.confirmation_code || resolvedBooking.id} as PAID & CONFIRMED`);

        // Unique email delivery check
        const existingDelivery = await bookingRepository.getEmailDeliveryRecord(webhookId, resolvedBooking.id);
        if (existingDelivery) {
          logger.info(`[Whop] Email delivery record already exists for webhook ${webhookId} and booking ${resolvedBooking.id}. Skipping email.`);
        } else {
          try {
            const canonicalBooking = bookingMapper.toCanonicalModel(
              { ...resolvedBooking, ...updatedBooking, payment_status: 'paid', status: 'CONFIRMED' },
              resolvedBooking.travellers || [],
              [{ email: resolvedBooking.email, phone_number: resolvedBooking.phone }],
              resolvedBooking.flights || [],
              [{ payment_provider: 'whop', payment_amount: paidAmount, payment_status: 'paid', provider_payment_id: providerPaymentId }]
            );

            const emailRes = await sendBookingConfirmation(canonicalBooking);

            if (emailRes.success) {
              await bookingRepository.recordEmailDelivery({
                webhook_id: webhookId,
                booking_id: resolvedBooking.id,
                recipient_email: resolvedBooking.email,
                resend_message_id: emailRes.emailId,
                status: 'delivered'
              });
              logger.info(`[Whop] Confirmation email sent successfully via Resend: ${emailRes.emailId}`);
            } else {
              await bookingRepository.recordEmailDelivery({
                webhook_id: webhookId,
                booking_id: resolvedBooking.id,
                recipient_email: resolvedBooking.email,
                status: 'failed',
                error_message: emailRes.error || 'Resend error'
              });
              logger.error(`[Whop] Confirmation email recorded as failed: ${emailRes.error}`);
            }
          } catch (emailErr) {
            logger.error(`[Whop] Confirmation email dispatch exception: ${emailErr.message}`);
            await bookingRepository.recordEmailDelivery({
              webhook_id: webhookId,
              booking_id: resolvedBooking.id,
              recipient_email: resolvedBooking.email,
              status: 'failed',
              error_message: emailErr.message
            });
          }
        }

      } else if (eventType === 'payment.failed' || eventType === 'payment_failed') {
        if (resolvedBooking) {
          await bookingRepository.updateBookingStatus(resolvedBooking.id, {
            payment_status: 'FAILED',
            status: 'FAILED'
          });
          await bookingRepository.upsertWhopPayment({
            booking_id: resolvedBooking.id,
            payment_provider: 'whop',
            payment_status: 'failed',
            provider_checkout_id: checkoutConfigId !== 'N/A' ? checkoutConfigId : resolvedBooking.provider_checkout_id
          });
          logger.info(`[Whop] Webhook updated booking ${resolvedBooking.id} to FAILED`);

          try {
            await sendPaymentFailedEmail(resolvedBooking, data.failure_reason || 'Payment declined by card issuer');
          } catch (err) {
            logger.error(`[Whop] Payment failed email dispatch error: ${err.message}`);
          }
        }

      } else if (eventType === 'payment.pending' || eventType === 'payment_pending') {
        if (resolvedBooking) {
          logger.info(`[Whop] payment.pending received for booking ${resolvedBooking.id}. Keeping status pending.`);
        }
      } else {
        logger.info(`[Whop] Event ${eventType} received and safely ignored.`);
      }

      return res.status(200).json({ success: true, received: true });
    } catch (err) {
      logger.error(`[Whop] Error handling webhook: ${err.message}`);
      return res.status(500).json({ success: false, error: err.message });
    }
  },

  /**
   * GET /api/bookings/:bookingId/payment-status
   * Authoritative status polling endpoint for client confirmation page
   */
  getPaymentStatus: async (req, res) => {
    try {
      const { bookingId } = req.params;
      if (!bookingId) {
        return res.status(400).json({ success: false, error: 'bookingId is required' });
      }

      const booking = await bookingRepository.getById(bookingId) || await bookingRepository.getByReference(bookingId);
      if (!booking) {
        return res.status(404).json({ success: false, error: 'Booking not found' });
      }

      const relations = await bookingRepository.getRelations(booking.id);
      const payments = relations.payments || booking.payments || [];

      // Case-insensitive status normalization using authoritative booking & payment relation
      const rawPayStatus = String(booking.payment_status || '').toLowerCase();
      const rawBookingStatus = String(booking.status || '').toUpperCase();
      const hasPaidPaymentRecord = payments.some(p => String(p.payment_status).toLowerCase() === 'paid');

      const isPaid = rawPayStatus === 'paid' || rawBookingStatus === 'CONFIRMED' || rawBookingStatus === 'DONE' || hasPaidPaymentRecord;

      const normalizedPaymentStatus = isPaid ? 'paid' : (rawPayStatus === 'failed' || rawBookingStatus === 'FAILED' ? 'failed' : 'pending');
      const normalizedBookingStatus = isPaid ? 'CONFIRMED' : (rawBookingStatus === 'FAILED' || rawBookingStatus === 'CANCELLED' ? 'FAILED' : 'PENDING');

      const supplierPrice = parseFloat(booking.supplier_price || booking.original_api_price || booking.total_amount || 0);
      const customerPrice = parseFloat(booking.customer_price || booking.total_amount || 0);
      const discountAmount = parseFloat(booking.discount_amount || Math.max(0, supplierPrice - customerPrice));

      return res.json({
        success: true,
        bookingId: booking.id,
        confirmationCode: booking.confirmation_code,
        paymentStatus: normalizedPaymentStatus,
        bookingStatus: normalizedBookingStatus,
        paymentProvider: booking.payment_provider || 'whop',
        amount: customerPrice.toFixed(2),
        supplierPrice: supplierPrice.toFixed(2),
        discountAmount: discountAmount.toFixed(2),
        discountPercent: booking.discount_percent || 10,
        paidAt: booking.paid_at || null,
        passengerName: booking.passenger_name || 'Customer',
        email: booking.email || null,
        emailSentAt: booking.confirmation_email_sent_at || null
      });
    } catch (err) {
      logger.error(`Error in getPaymentStatus: ${err.message}`);
      return res.status(500).json({ success: false, error: err.message });
    }
  }
};

export default whopController;
