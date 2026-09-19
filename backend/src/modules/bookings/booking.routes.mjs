import express from 'express';
import bookingController from './booking.controller.mjs';
import bookingCurrentSearchController from './booking-current-search.controller.mjs';
import bookingPublicReservationController from './booking-public-reservation.controller.mjs';
import rateLimit from '../../middleware/rate-limit.mjs';
import authenticate from '../../middleware/authenticate.mjs';
import { loadBackOfficeProfile, requirePermission } from '../backoffice/backoffice.middleware.mjs';
import { abandonedBookingRouter } from '../abandoned-bookings/abandoned-booking.routes.mjs';
import { normalizeBookingCreateRequest } from './booking-create-normalization.mjs';
import applyVoucherPricingToBooking from '../vouchers/voucher-booking.middleware.mjs';
import syncTripAddonRequestToCheckout from '../journey-sessions/trip-addon-request-sync.middleware.mjs';
import completeJourneySessionAfterBooking from '../journey-sessions/checkout-session-booking.middleware.mjs';
import './booking.repository.egress-hardening.mjs';
import './booking.service.status-hardening.mjs';
import './booking.service.addon-hardening.mjs';
import './booking.service.trip-addon-parity-hardening.mjs';
import './booking.service.passenger-profile-hardening.mjs';
import './booking.service.assistance-hardening.mjs';

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

// Legacy booking write endpoints pre-date the back-office router. They are still
// used by the flight editor, but they must never be callable anonymously. Keep
// public creation/search/read routes public and require a real staff profile plus
// the relevant server-side permission for every mutation below.
const staff = [authenticate, loadBackOfficeProfile];
const flightEdit = [...staff, requirePermission('bookings.flights.edit')];
const ticketEdit = [...staff, requirePermission('ticketing.update')];

router.post(
  '/',
  bookingRateLimiter,
  normalizeBookingCreateRequest,
  applyVoucherPricingToBooking,
  syncTripAddonRequestToCheckout,
  completeJourneySessionAfterBooking,
  bookingController.create
);
router.get('/search', searchRateLimiter, bookingCurrentSearchController.search);
router.get('/reservation/:reference', bookingReadRateLimiter, bookingPublicReservationController.get);
router.get('/user/:email', bookingReadRateLimiter, authenticate, bookingController.getByUserEmail);
router.use('/abandoned', abandonedBookingRouter);

router.post('/:id/resend-confirmation', bookingRateLimiter, ...flightEdit, bookingController.resendConfirmation);
router.post('/:id/payment-method', bookingRateLimiter, ...flightEdit, bookingController.savePaymentMethod);
router.patch('/:id/payment-method', bookingRateLimiter, ...flightEdit, bookingController.savePaymentMethod);
router.patch('/:id/payment-splits', bookingRateLimiter, ...flightEdit, bookingController.updatePaymentSplits);
router.put('/:id/payment-splits', bookingRateLimiter, ...flightEdit, bookingController.updatePaymentSplits);
router.patch('/:id/status', bookingRateLimiter, ...flightEdit, bookingController.updateStatus);
router.patch('/:id/payment', bookingRateLimiter, ...flightEdit, bookingController.updatePayment);
router.patch('/:id/itinerary', bookingRateLimiter, ...flightEdit, bookingController.updateItinerary);
router.patch('/:id/ticket', bookingRateLimiter, ...ticketEdit, bookingController.updateTicket);
router.patch('/:id/notes', bookingRateLimiter, ...flightEdit, bookingController.updateNotes);

router.get('/confirmation/:confirmationCode', bookingReadRateLimiter, bookingController.getConfirmationDTO);
router.get('/:reference', bookingReadRateLimiter, bookingPublicReservationController.get);

export default router;
export { router as bookingRouter };