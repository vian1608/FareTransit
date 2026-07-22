import express from 'express';
import { authRouter } from '../modules/auth/auth.routes.mjs';
import { customerRouter } from '../modules/customers/customer.routes.mjs';
import { bookingRouter } from '../modules/bookings/booking.routes.mjs';
import { paymentRouter } from '../modules/payments/payment.routes.mjs';
import { flightRouter, airportRouter } from '../modules/flights/flight.routes.mjs';
import { enquiryRouter } from '../modules/enquiries/enquiry.routes.mjs';
import { adminRouter } from '../modules/admin/admin.routes.mjs';

const router = express.Router();

router.use('/auth', authRouter);
router.use('/customers', customerRouter);
router.use('/bookings', bookingRouter);
router.use('/payments', paymentRouter);
router.use('/flights', flightRouter);
router.use('/airports', airportRouter);
router.use('/inquiries', enquiryRouter);
router.use('/admin', adminRouter);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ 
    success: true,
    data: {
      status: 'ok',
      message: 'Urgent Travel API is running',
      timestamp: new Date().toISOString()
    }
  });
});

export default router;
export { router as rootRouter };
