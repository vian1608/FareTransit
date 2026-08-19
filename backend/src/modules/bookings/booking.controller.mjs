import bookingService from './booking.service.mjs';
import { bookingRepository } from './booking.repository.mjs';
import { sendBookingConfirmation, sendBookingRequestReceivedEmail } from '../../integrations/resend/resend.service.mjs';
import { buildCanonicalItinerary } from '../../shared/utils/airline-lookup.mjs';
import logger from '../../config/logger.mjs';

export const bookingController = {
  create: async (req, res, next) => {
    try {
      const result = await bookingService.create(req.body);

      // Trigger idempotent booking request received email after DB commit
      const bookingId = result?.booking?.id || result?.id;
      if (bookingId) {
        sendBookingRequestReceivedEmail(bookingId).catch(err => {
          logger.error(`[Email] Non-blocking sendBookingRequestReceivedEmail error for ${bookingId}: ${err.message}`);
        });
      }

      res.status(201).json({
        success: true,
        integrityValidated: true,
        message: 'Booking request created successfully.',
        data: result
      });
    } catch (error) {
      next(error);
    }
  },


  getByReference: async (req, res, next) => {
    try {
      const { reference } = req.params;
      const booking = await bookingService.getDetailsByCodeOrId(reference);
      if (!booking) {
        return res.status(404).json({
          success: false,
          error: { code: 'BOOKING_NOT_FOUND', message: 'Booking not found.' }
        });
      }
      res.json({
        success: true,
        data: booking
      });
    } catch (error) {
      next(error);
    }
  },

  getConfirmationDTO: async (req, res, next) => {
    try {
      const { confirmationCode } = req.params;
      const completeBooking = await bookingService.getDetailsByCodeOrId(confirmationCode);
      if (!completeBooking) {
        return res.status(404).json({
          success: false,
          error: { code: 'BOOKING_NOT_FOUND', message: 'Booking reference not found.' }
        });
      }

      // Total Price Rule (Section 8):
      // customer_price when numeric & > 0, otherwise total_amount when numeric & > 0
      const custPrice = parseFloat(completeBooking.customer_price);
      const totAmt = parseFloat(completeBooking.total_amount);

      let totalAmount = null;
      if (!isNaN(custPrice) && custPrice > 0) {
        totalAmount = custPrice;
      } else if (!isNaN(totAmt) && totAmt > 0) {
        totalAmount = totAmt;
      }

      const itinerary = buildCanonicalItinerary(completeBooking);

      const pmRecord = (completeBooking.paymentMethod && typeof completeBooking.paymentMethod === 'object')
        ? completeBooking.paymentMethod
        : ((completeBooking.payment_method && typeof completeBooking.payment_method === 'object') ? completeBooking.payment_method : {});

      const rawLast4 = String(pmRecord?.card_last4 || pmRecord?.cardLast4 || pmRecord?.last4 || '').trim().replace(/\D/g, '');
      const validLast4 = /^\d{4}$/.test(rawLast4) ? rawLast4 : null;

      const cardReference = {
        cardholderName: pmRecord?.cardholder_name || pmRecord?.cardholderName || completeBooking.passenger_name || null,
        cardBrand: pmRecord?.card_brand || pmRecord?.cardBrand || null,
        last4: validLast4,
        expMonth: pmRecord?.card_exp_month || pmRecord?.cardExpMonth || null,
        expYear: pmRecord?.card_exp_year || pmRecord?.cardExpYear || null,
        billingAddress: [
          pmRecord?.billing_address_line1 || pmRecord?.billingAddressLine1 || pmRecord?.billingAddress,
          pmRecord?.billing_address_line2 || pmRecord?.billingAddressLine2,
          pmRecord?.billing_city || pmRecord?.billingCity,
          pmRecord?.billing_state || pmRecord?.billingState,
          pmRecord?.billing_postal_code || pmRecord?.billingPostalCode,
          pmRecord?.billing_country || pmRecord?.billingCountry
        ].filter(Boolean).join(', ') || null,
        billingPhone: pmRecord?.billing_phone || pmRecord?.billingPhone || completeBooking.phone || null
      };

      const emailDeliveryRecord = await bookingRepository.getEmailDeliveryStatus(completeBooking.id, 'BOOKING_CONFIRMATION');
      const emailDelivery = {
        status: emailDeliveryRecord?.status || (completeBooking.authorization_email_sent_at ? 'SENT' : 'UNATTEMPTED'),
        providerMessageId: emailDeliveryRecord?.provider_message_id || completeBooking.authorization_email_message_id || null,
        errorMessage: emailDeliveryRecord?.error_message || null,
        sentAt: emailDeliveryRecord?.sent_at || completeBooking.authorization_email_sent_at || null
      };

      // Map raw flights list to camelCase normalized flight segments
      const rawFlights = completeBooking.flights || completeBooking.itinerary_segments || [];
      const normalizedFlights = rawFlights.map(f => ({
        id: f.id,
        leg: f.leg || f.journey_direction || 'outbound',
        airlineName: f.airline_name || f.carrier_name || f.airline || '',
        flightNumber: f.flight_number || f.flightNumber || '',
        departureAirport: (f.departure_airport || f.origin_airport || f.origin_code || f.origin || '').trim().toUpperCase(),
        arrivalAirport: (f.arrival_airport || f.destination_airport || f.destination_code || f.destination || '').trim().toUpperCase(),
        departureDate: f.departure_date || f.departureDate || '',
        departureTime: f.departure_time_str || f.departure_time || f.departureTime || '',
        arrivalDate: f.arrival_date || f.arrivalDate || '',
        arrivalTime: f.arrival_time_str || f.arrival_time || f.arrivalTime || '',
        duration: f.duration || '',
        stops: f.stops !== undefined ? parseInt(f.stops, 10) : 0,
        cabinClass: f.cabin_class || f.cabinClass || 'Economy'
      }));

      const dto = {
        booking: {
          id: completeBooking.id,
          confirmationCode: completeBooking.confirmation_code || completeBooking.confirmationCode,
          status: completeBooking.status,
          paymentStatus: completeBooking.payment_status || completeBooking.paymentStatus,
          passengerName: completeBooking.passenger_name || completeBooking.customerName,
          email: completeBooking.email,
          phone: completeBooking.phone,
          totalAmount: totalAmount,
          currency: (completeBooking.currency || 'USD').toUpperCase(),
          bookingDate: completeBooking.created_at || new Date().toISOString()
        },
        itinerary,
        flights: normalizedFlights,
        travellers: completeBooking.travellers || [],
        contact: completeBooking.contacts?.[0] || { email: completeBooking.email, phone: completeBooking.phone },
        cardReference,
        paymentMethod: cardReference,
        emailDelivery,
        emailDeliveryStatus: emailDelivery.status
      };

      res.json({
        success: true,
        data: dto,
        ...dto
      });
    } catch (error) {
      next(error);
    }
  },

  getByUserEmail: async (req, res, next) => {
    try {
      const { email } = req.params;
      const bookings = await bookingService.getBookingsForEmail(email);
      res.json({
        success: true,
        data: bookings
      });
    } catch (error) {
      next(error);
    }
  },

  search: async (req, res, next) => {
    try {
      const { query } = req.query;
      if (!query) {
        return res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'Search query parameter is required.' }
        });
      }

      const bookings = await bookingService.search(query);
      res.json({
        success: true,
        data: bookings
      });
    } catch (error) {
      next(error);
    }
  },

  resendConfirmation: async (req, res, next) => {
    try {
      const { id } = req.params;
      const booking = await bookingService.getDetailsByCodeOrId(id);
      if (!booking) {
        return res.status(404).json({
          success: false,
          error: { code: 'BOOKING_NOT_FOUND', message: 'Booking not found.' }
        });
      }

      const emailResult = await sendBookingConfirmation(booking, { force: true });
      res.json({
        success: true,
        message: 'Confirmation email resend initiated.',
        data: emailResult
      });
    } catch (error) {
      next(error);
    }
  },

  updateStatus: async (req, res, next) => {
    try {
      const { id } = req.params;
      const adminId = req.user?.email || 'admin';
      const updated = await bookingService.updateStatus(id, { ...req.body, adminId });
      res.json({
        success: true,
        message: 'Booking status updated successfully.',
        data: updated
      });
    } catch (error) {
      const statusCode = error.status || (error.code === 'INVALID_STATUS' ? 400 : 500);
      res.status(statusCode).json({
        success: false,
        error: { code: error.code || 'STATUS_UPDATE_FAILED', message: error.message }
      });
    }
  },

  updatePayment: async (req, res, next) => {
    const startTime = Date.now();
    const requestId = `PAY-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const identifier = req.params.identifier || req.params.id;
    const clientRequestId = req.headers['idempotency-key'] || req.body?.clientRequestId || null;

    logger.info(`[PAYMENT_SAVE_START] requestId=${requestId} identifier=${identifier} clientRequestId=${clientRequestId}`);

    try {
      const adminId = req.user?.email || 'admin';
      const updated = await bookingService.updatePayment(identifier, {
        ...req.body,
        adminId,
        clientRequestId
      });

      const elapsedMs = Date.now() - startTime;
      logger.info(`[PAYMENT_RESPONSE_SENT] requestId=${requestId} confirmationCode=${updated.confirmation_code || updated.confirmationCode} elapsedMs=${elapsedMs}`);

      const splitsList = (updated.paymentSplits || updated.payment_splits || []).map(s => ({
        merchantName: s.merchant_name || s.merchantName || s.name || 'Merchant',
        amount: parseFloat(s.amount || 0)
      }));

      const totalAmt = parseFloat(
        updated.authorized_amount ??
        updated.customer_price ??
        updated.total_amount ??
        updated.authorization?.authorizedAmount ??
        0
      );

      res.json({
        success: true,
        requestId,
        booking: {
          id: updated.id,
          confirmationCode: updated.confirmation_code || updated.confirmationCode || 'N/A',
          paymentStatus: (updated.payment_status || updated.paymentStatus || 'PENDING').toUpperCase(),
          totalAmount: totalAmt,
          updatedAt: updated.updated_at || new Date().toISOString()
        },
        payment: {
          authorizedAmount: totalAmt,
          transactionReference: updated.transaction_reference || updated.transactionReference || updated.payment?.transactionReference || '',
          splits: splitsList
        }
      });
    } catch (error) {
      const statusCode = error.status || (error.code === 'BOOKING_NOT_FOUND' ? 404 : 400);
      const elapsedMs = Date.now() - startTime;
      logger.error(`[PAYMENT_SAVE_FAILED] requestId=${requestId} statusCode=${statusCode} elapsedMs=${elapsedMs} error=${error.message}`);

      res.status(statusCode).json({
        success: false,
        requestId,
        error: {
          code: error.code || 'PAYMENT_UPDATE_FAILED',
          message: error.message
        }
      });
    }
  },

  updateItinerary: async (req, res, next) => {
    try {
      const { id } = req.params;
      const adminId = req.user?.email || 'admin';
      const updated = await bookingService.updateItinerary(id, { ...req.body, adminId });
      res.json({
        success: true,
        message: 'Itinerary segments updated successfully.',
        data: updated
      });
    } catch (error) {
      const statusCode = error.status || 400;
      res.status(statusCode).json({
        success: false,
        error: { code: error.code || 'ITINERARY_UPDATE_FAILED', message: error.message }
      });
    }
  },

  importItineraryText: async (req, res, next) => {
    try {
      const { id } = req.params;
      const adminId = req.user?.email || 'admin';
      const updated = await bookingService.importItineraryFromText(id, { ...req.body, adminId });
      res.json({
        success: true,
        message: 'Flight itinerary text imported and updated successfully.',
        booking: updated,
        data: updated
      });
    } catch (error) {
      const statusCode = error.status || 400;
      res.status(statusCode).json({
        success: false,
        error: { code: error.code || 'IMPORT_ITINERARY_FAILED', message: error.message }
      });
    }
  },

  updateTicket: async (req, res, next) => {
    try {
      const { id } = req.params;
      const adminId = req.user?.email || 'admin';
      const updated = await bookingService.updateTicket(id, req.body || {}, adminId);
      res.json({
        success: true,
        message: 'Airline ticket details updated successfully.',
        data: updated
      });
    } catch (error) {
      const statusCode = error.status || 400;
      res.status(statusCode).json({
        success: false,
        error: { code: error.code || 'TICKET_UPDATE_FAILED', message: error.message }
      });
    }
  },

  updateNotes: async (req, res, next) => {
    try {
      const { id } = req.params;
      const adminId = req.user?.email || 'admin';
      const updated = await bookingService.updateNotes(id, { ...req.body, adminId });
      res.json({
        success: true,
        message: 'Internal notes updated successfully.',
        data: updated
      });
    } catch (error) {
      const statusCode = error.status || 400;
      res.status(statusCode).json({
        success: false,
        error: { code: error.code || 'NOTES_UPDATE_FAILED', message: error.message }
      });
    }
  },

  savePaymentMethod: async (req, res, next) => {
    try {
      const { id } = req.params;
      const saved = await bookingService.savePaymentMethod(id, req.body || {});
      res.status(200).json({
        success: true,
        message: 'Tokenized payment method and billing metadata saved successfully.',
        data: saved
      });
    } catch (error) {
      const statusCode = error.status || 400;
      res.status(statusCode).json({
        success: false,
        error: { code: error.code || 'PAYMENT_METHOD_SAVE_FAILED', message: error.message }
      });
    }
  },

  updatePaymentSplits: async (req, res, next) => {
    try {
      const { id } = req.params;
      const body = req.body || {};

      // 1. Strict Request Allowlist Guard (Reject payloads containing prohibited keys)
      const PROHIBITED_KEYS = ['flights', 'itinerary', 'itinerarySegments', 'passengers', 'travellers', 'contacts', 'ticket', 'booking', 'route', 'airline'];
      for (const key of PROHIBITED_KEYS) {
        if (body[key] !== undefined) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'PROHIBITED_PAYLOAD_KEY',
              message: `Payment split update payload contains prohibited key '${key}'. Payment split updates cannot modify or touch itinerary/flight records.`
            }
          });
        }
      }

      const splits = body.splits || body.payment_splits || body.paymentSplits;
      if (!splits) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PAYMENT_SPLIT',
            message: 'Request body must contain a valid splits array.'
          }
        });
      }

      const adminId = req.user?.email || 'admin';
      const reason = body.reason || 'Payment split breakdown update';

      const updatedBooking = await bookingService.updatePaymentSplits(id, splits, adminId, reason);

      res.status(200).json({
        success: true,
        message: 'Payment splits updated successfully.',
        data: updatedBooking,
        booking: updatedBooking
      });
    } catch (error) {
      const statusCode = error.status || 400;
      res.status(statusCode).json({
        success: false,
        error: { code: error.code || 'PAYMENT_SPLIT_UPDATE_FAILED', message: error.message }
      });
    }
  }
};

export default bookingController;
