import bookingMutationService from '../bookings/booking-mutation.service.mjs';
import logger from '../../config/logger.mjs';

const contextFrom = (req) => ({
  adminId: req.user?.email || req.user?.id || 'admin',
  expectedVersion: req.body?.bookingVersion ?? req.body?.expectedVersion ?? req.body?.version,
  reason: req.body?.reason,
});

function respondError(res, error, fallbackCode) {
  const status = error.status || (error.code === 'BOOKING_VERSION_CONFLICT' ? 409 : error.code === 'BOOKING_NOT_FOUND' ? 404 : 400);
  return res.status(status).json({
    success: false,
    error: {
      code: error.code || fallbackCode,
      message: error.message,
    },
  });
}

const adminBookingMutationController = {
  updateContactDetails: async (req, res) => {
    try {
      const booking = await bookingMutationService.updateContact(req.params.id, req.body || {}, contextFrom(req));
      return res.json({ success: true, message: 'Contact details saved.', booking, data: booking });
    } catch (error) {
      logger.error(`[BookingMutation] contact ${req.params.id}: ${error.message}`);
      return respondError(res, error, 'CONTACT_DETAILS_ERROR');
    }
  },

  updateStatusNotes: async (req, res) => {
    try {
      const booking = await bookingMutationService.updateStatusAndNotes(req.params.id, req.body || {}, contextFrom(req));
      return res.json({ success: true, message: 'Booking status & notes saved.', booking, data: booking });
    } catch (error) {
      logger.error(`[BookingMutation] status-notes ${req.params.id}: ${error.message}`);
      return respondError(res, error, 'STATUS_NOTES_ERROR');
    }
  },

  updateAuthorizationSettings: async (req, res) => {
    try {
      const booking = await bookingMutationService.updateAuthorizationSettings(req.params.id, req.body || {}, contextFrom(req));
      return res.json({ success: true, message: 'Authorization settings saved.', booking, data: booking });
    } catch (error) {
      logger.error(`[BookingMutation] authorization-settings ${req.params.id}: ${error.message}`);
      return respondError(res, error, 'AUTHORIZATION_SETTINGS_ERROR');
    }
  },

  updatePaymentSplits: async (req, res) => {
    try {
      const splits = req.body?.splits || req.body?.payment_splits;
      const booking = await bookingMutationService.updatePaymentSplits(req.params.id, splits, contextFrom(req));
      return res.json({
        success: true,
        message: 'Payment splits updated successfully. Current booking reloaded.',
        booking,
        data: booking,
      });
    } catch (error) {
      logger.error(`[BookingMutation] payment-splits ${req.params.id}: ${error.message}`);
      return respondError(res, error, 'PAYMENT_SPLIT_ERROR');
    }
  },

  saveTicketDetails: async (req, res) => {
    try {
      const booking = await bookingMutationService.updateTicket(req.params.id, req.body || {}, contextFrom(req));
      return res.json({ success: true, message: 'Airline ticket details saved.', booking, data: booking });
    } catch (error) {
      logger.error(`[BookingMutation] ticket ${req.params.id}: ${error.message}`);
      return respondError(res, error, 'TICKET_DETAILS_ERROR');
    }
  },
};

export default adminBookingMutationController;
