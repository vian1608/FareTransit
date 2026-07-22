import express from 'express';
import adminController from './admin.controller.mjs';
import authenticate from '../../middleware/authenticate.mjs';
import authorize from '../../middleware/authorize.mjs';
import rateLimit from '../../middleware/rate-limit.mjs';

const router = express.Router();

const loginRateLimiter = rateLimit({
  windowMs: 60000,
  maxRequests: 5,
  message: 'Too many admin login attempts. Please try again later.'
});

// Public login
router.post('/login', loginRateLimiter, adminController.login);

// Protected admin endpoints
router.get('/bookings', authenticate, authorize(['admin']), adminController.getBookings);
router.get('/bookings/:id', authenticate, authorize(['admin']), adminController.getBookingDetail);
router.put('/bookings/:id', authenticate, authorize(['admin']), adminController.updateBooking);
router.get('/stats', authenticate, authorize(['admin']), adminController.getStats);

export default router;
export { router as adminRouter };
