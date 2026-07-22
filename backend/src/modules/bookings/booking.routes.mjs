import express from 'express';
import bookingController from './booking.controller.mjs';
import rateLimit from '../../middleware/rate-limit.mjs';
import { abandonedBookingRouter } from '../abandoned-bookings/abandoned-booking.routes.mjs';

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

router.post('/', bookingRateLimiter, bookingController.create);
router.get('/search', searchRateLimiter, bookingController.search);
router.get('/user/:email', bookingController.getByUserEmail);
router.use('/abandoned', abandonedBookingRouter);
router.get('/:reference', bookingController.getByReference);

export default router;
export { router as bookingRouter };
