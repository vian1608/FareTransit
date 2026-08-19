import express from 'express';
import whopController from './whop.controller.mjs';

const router = express.Router();

// Whop checkout configuration creation
router.post('/whop/create-checkout', whopController.createCheckout);

// Whop webhook verification and event handling
router.post('/webhooks/whop', whopController.handleWebhook);

// Booking payment status polling endpoint
router.get('/bookings/:bookingId/payment-status', whopController.getPaymentStatus);

export default router;
