import express from 'express';
import paymentController from './payment.controller.mjs';
import rateLimit from '../../middleware/rate-limit.mjs';

const router = express.Router();

const paymentRateLimiter = rateLimit({
  windowMs: 60000,
  maxRequests: 15,
  message: 'Too many payment requests. Please wait a minute.'
});

router.get('/stripe/config', paymentController.getConfig);
router.post('/stripe/create-checkout-session', paymentRateLimiter, paymentController.createCheckoutSession);
router.get('/stripe/session-status', paymentController.getSessionStatus);

export default router;
export { router as paymentRouter };
