import carService from './car.service.mjs';
import bookingDemandApiClient from '../../services/bookingDemandApiClient.mjs';
import logger from '../../config/logger.mjs';
import { createPublicCarBooking, getPublicCarBooking } from './car-booking.service.mjs';
import { sendCarRequestNotifications } from './car-request-email.service.mjs';

function errorResponse(error, fallbackCode, fallbackMessage) {
  return {
    code: error.code || fallbackCode,
    message: error.message || fallbackMessage,
    requestId: error.requestId || null,
    details: error.details || undefined
  };
}

export const carController = {
  /**
   * Search live Enterprise inventory through the server-side Parse integration.
   * POST /api/cars/search
   */
  search: async (req, res) => {
    try {
      const result = await carService.search(req.body || {});
      return res.json({ success: true, data: result });
    } catch (error) {
      logger.error(`Error in carController.search: ${error.message}`);
      return res.status(error.statusCode || 400).json({
        success: false,
        error: errorResponse(error, 'CAR_SEARCH_ERROR', 'Unable to search rental cars.')
      });
    }
  },

  /**
   * Create a FareTransit-owned reservation request. This does not submit a
   * reservation to Enterprise; the request enters the internal manual-fulfillment workflow.
   * POST /api/cars/bookings
   */
  createBooking: async (req, res) => {
    try {
      const booking = await createPublicCarBooking(req.body || {});
      const customerInput = req.body?.customer || {};
      const customer = {
        firstName: String(customerInput.firstName || '').trim(),
        lastName: String(customerInput.lastName || '').trim(),
        fullName: `${String(customerInput.firstName || '').trim()} ${String(customerInput.lastName || '').trim()}`.trim(),
        email: String(customerInput.email || '').trim().toLowerCase(),
        phone: String(customerInput.phone || '').trim()
      };

      // A retried POST returns the same reservation and public token, but does not
      // resend customer/admin notifications. Notification failures also never undo
      // a successfully persisted request.
      if (booking.created) {
        void sendCarRequestNotifications({ booking, customer }).catch((error) => {
          logger.warn(`[CarBooking] notification notice: ${error.message}`);
        });
      }

      return res.status(booking.created ? 201 : 200).json({
        success: true,
        data: booking,
        message: 'Reservation request received. FareTransit will confirm supplier availability and final details.'
      });
    } catch (error) {
      logger.error(`Error in carController.createBooking: ${error.message}`);
      return res.status(error.statusCode || 400).json({
        success: false,
        error: errorResponse(error, 'CAR_BOOKING_ERROR', 'Unable to create the reservation request.')
      });
    }
  },

  /**
   * Customer-safe request lookup using the public read token returned when the
   * request is created. No customer PII is exposed by this endpoint.
   * GET /api/cars/bookings/:reference?token=...
   */
  getBooking: async (req, res) => {
    try {
      const result = await getPublicCarBooking(req.params.reference, req.query.token);
      return res.json({ success: true, data: result });
    } catch (error) {
      return res.status(error.statusCode || 400).json({
        success: false,
        error: errorResponse(error, 'CAR_BOOKING_LOOKUP_ERROR', 'Unable to load the reservation request.')
      });
    }
  },

  // Legacy Booking.com catalog endpoints remain available for internal compatibility.
  getDetails: async (req, res) => {
    try {
      const result = await bookingDemandApiClient.getCarDetails(req.body || {});
      return res.json({ success: true, data: result.data });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        success: false,
        error: errorResponse(error, 'CAR_DETAILS_ERROR', 'Unable to retrieve car details.')
      });
    }
  },

  getDepots: async (req, res) => {
    try {
      const result = await bookingDemandApiClient.getDepots(req.body || {});
      return res.json({ success: true, data: result.data });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        success: false,
        error: errorResponse(error, 'CAR_DEPOTS_ERROR', 'Unable to retrieve depots.')
      });
    }
  },

  getSuppliers: async (req, res) => {
    try {
      const result = await bookingDemandApiClient.getSuppliers(req.body || {});
      return res.json({ success: true, data: result.data });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        success: false,
        error: errorResponse(error, 'CAR_SUPPLIERS_ERROR', 'Unable to retrieve suppliers.')
      });
    }
  },

  getDepotScores: async (req, res) => {
    try {
      const result = await bookingDemandApiClient.getDepotScores(req.body || {});
      return res.json({ success: true, data: result.data });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        success: false,
        error: errorResponse(error, 'CAR_DEPOT_SCORES_ERROR', 'Unable to retrieve depot scores.')
      });
    }
  },

  getConstants: async (req, res) => {
    try {
      const result = await bookingDemandApiClient.getCarConstants(req.body || {});
      return res.json({ success: true, data: result.data });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        success: false,
        error: errorResponse(error, 'CAR_CONSTANTS_ERROR', 'Unable to retrieve car constants.')
      });
    }
  },

  recordClick: async (req, res) => {
    return res.status(410).json({
      success: false,
      error: {
        code: 'AFFILIATE_REDIRECT_RETIRED',
        message: 'FareTransit car results now use the on-site reservation-request flow.'
      }
    });
  }
};

export default carController;
