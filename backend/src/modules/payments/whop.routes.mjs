import express from 'express';
import env from '../../config/env.mjs';
import whopController from './whop.controller.mjs';

const router = express.Router();

function requireWhopEnabled(req, res, next) {
  if (!env.whopFlightCheckoutEnabled) {
    return res.status(404).json({
      success: false,
      error: { code: 'WHOP_DISABLED', message: 'This payment integration is not enabled.' }
    });
  }
  return next();
}

// Legacy Whop checkout remains available only when explicitly enabled.
router.post('/whop/create-checkout', requireWhopEnabled, whopController.createCheckout);
router.post('/webhooks/whop', requireWhopEnabled, whopController.handleWebhook);

// Read-only compatibility polling endpoint is safe to keep for older sessions.
router.get('/bookings/:bookingId/payment-status', whopController.getPaymentStatus);

export default router;
