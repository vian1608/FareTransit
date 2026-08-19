import express from 'express';
import bookingController from './booking.controller.mjs';
import rateLimit from '../../middleware/rate-limit.mjs';
import { abandonedBookingRouter } from '../abandoned-bookings/abandoned-booking.routes.mjs';
import { normalizeBookingCreateRequest } from './booking-create-normalization.mjs';
import applyVoucherPricingToBooking from '../vouchers/voucher-booking.middleware.mjs';
import completeJourneySessionAfterBooking from '../journey-sessions/checkout-session-booking.middleware.mjs';
import './booking.repository.egress-hardening.mjs';
import './booking.service.status-hardening.mjs';

const router = express.Router();

const bookingRateLimiter = rateLimit({
  windowMs: 60000,
  maxRequests: 10,
  message: 'Too many booking actions. Please wait before attempting again.'
});

const searchRateLimiter = rateLimit({
  windowMs: 60000,
  maxRequests: 30,
  message: 'Too many search requests. Please wait a minute.'
});

const bookingReadRateLimiter = rateLimit({
  windowMs: 60000,
  maxRequests: 60,
  message: 'Too many booking lookups. Please wait a minute before trying again.'
});

router.post(
  '/',
  bookingRateLimiter,
  normalizeBookingCreateRequest,
  applyVoucherPricingToBooking,
  completeJourneySessionAfterBooking,
  bookingController.create
);
router.get('/search', searchRateLimiter, bookingController.search);
router.get('/user/:email', bookingReadRateLimiter, bookingController.getByUserEmail);
router.use('/abandoned', abandonedBookingRouter);
router.post('/:id/resend-confirmation', bookingRateLimiter, bookingController.resendConfirmation);

router.post('/:id/payment-method', bookingRateLimiter, bookingController.savePaymentMethod);
router.patch('/:id/payment-method', bookingRateLimiter, bookingController.savePaymentMethod);

router.patch('/:id/payment-splits', bookingRateLimiter, bookingController.updatePaymentSplits);
router.put('/:id/payment-splits', bookingRateLimiter, bookingController.updatePaymentSplits);
router.patch('/:id/status', bookingRateLimiter, bookingController.updateStatus);
router.patch('/:id/payment', bookingRateLimiter, bookingController.updatePayment);
router.patch('/:id/itinerary', bookingRateLimiter, bookingController.updateItinerary);
router.patch('/:id/ticket', bookingRateLimiter, bookingController.updateTicket);
router.patch('/:id/notes', bookingRateLimiter, bookingController.updateNotes);

router.get('/confirmation/:confirmationCode', bookingReadRateLimiter, bookingController.getConfirmationDTO);
router.get('/:reference', bookingReadRateLimiter, bookingController.getByReference);

export default router;
export { router as bookingRouter };
