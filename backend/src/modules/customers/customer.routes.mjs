import express from 'express';
import customerController from './customer.controller.mjs';
import authenticate from '../../middleware/authenticate.mjs';

const router = express.Router();

// Allow authenticated users to get their profile and bookings
router.get('/profile', authenticate, customerController.getProfile);
router.get('/bookings', authenticate, customerController.getBookings);

// Dynamic routes for admin access or internal integrations
router.get('/:email/profile', authenticate, customerController.getProfile);
router.get('/:email/bookings', authenticate, customerController.getBookings);

export default router;
export { router as customerRouter };
