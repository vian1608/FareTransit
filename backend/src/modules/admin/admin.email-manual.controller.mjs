import supabase from '../../integrations/supabase/supabase.client.mjs';
import bookingRepository from '../bookings/booking.repository.mjs';

const TYPE_MAP = {
  booking_request: {
    bookingFields: (timestamp, recipient) => ({
      booking_request_email_status: 'MANUALLY_SENT',
      booking_request_email_sent_at: timestamp,
      booking_request_email_recipient: recipient,
      booking_request_email_error: null,
    }),
    deliveryType: 'BOOKING_REQUEST',
  },
  authorization: {
    bookingFields: (timestamp, recipient) => ({
      authorization_email_status: 'MANUALLY_SENT',
      authorization_email_sent_at: timestamp,
      authorization_email_recipient: recipient,
      authorization_email_error: null,
    }),
    deliveryType: 'AUTHORIZATION',
  },
  final_ticket: {
    bookingFields: (timestamp, recipient) => ({
      final_confirmation_email_status: 'MANUALLY_SENT',
      final_confirmation_email_sent_at: timestamp,
      final_confirmation_email_recipient: recipient,
      final_confirmation_email_error: null,
    }),
    deliveryType: 'FINAL_TICKET',
  },
};

export const adminEmailManualController = {
  markEmailManuallySent: async (req, res, next) => {
    try {
      const booking = await bookingRepository.getCompleteBookingById(req.params.id);
      if (!booking?.id) {
        return res.status(404).json({
          success: false,
          error: { code: 'BOOKING_NOT_FOUND', message: 'Booking not found.' },
        });
      }

      const requestedType = String(req.body?.type || req.body?.emailType || 'booking_request')
        .trim()
        .toLowerCase()
        .replace(/-/g, '_');
      const config = TYPE_MAP[requestedType];
      if (!config) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_EMAIL_TYPE', message: `Unsupported email type '${requestedType}'.` },
        });
      }

      const timestamp = new Date().toISOString();
      const recipient = String(
        req.body?.recipient || booking.email || booking.contacts?.[0]?.email || ''
      ).trim().toLowerCase() || null;
      const adminIdentity = req.user?.email || req.staff?.email || 'admin';

      await bookingRepository.updateBookingStatus(
        booking.id,
        config.bookingFields(timestamp, recipient)
      );

      const { error: deliveryError } = await supabase.from('email_deliveries').insert({
        booking_id: booking.id,
        confirmation_code: booking.confirmation_code || booking.confirmationCode || null,
        email_type: config.deliveryType,
        recipient,
        status: 'MANUALLY_SENT',
        provider: 'MANUAL',
        provider_message_id: null,
        error_code: null,
        error_message: null,
        attempt_count: 1,
        last_attempt_at: timestamp,
        sent_at: timestamp,
      });
      if (deliveryError) throw deliveryError;

      return res.json({
        success: true,
        message: 'Email marked as manually sent successfully.',
        status: 'MANUALLY_SENT',
        emailType: requestedType,
        manual_sent_at: timestamp,
        manual_sent_by: adminIdentity,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default adminEmailManualController;
