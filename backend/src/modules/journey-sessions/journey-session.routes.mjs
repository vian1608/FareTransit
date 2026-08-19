import express from 'express';
import rateLimit from '../../middleware/rate-limit.mjs';
import journeySessionController from './journey-session.controller.mjs';

const router = express.Router();

const sessionWriteLimiter = rateLimit({
  windowMs: 60000,
  maxRequests: 30,
  message: 'Too many travel-session updates. Please wait a moment and try again.',
});

const sessionReadLimiter = rateLimit({
  windowMs: 60000,
  maxRequests: 90,
  message: 'Too many travel-session lookups. Please wait a moment and try again.',
});

router.post('/quote', sessionWriteLimiter, journeySessionController.createQuote);
router.get('/quote/:token', sessionReadLimiter, journeySessionController.getQuote);

router.post('/checkout', sessionWriteLimiter, journeySessionController.createCheckout);
router.get('/checkout/:token', sessionReadLimiter, journeySessionController.getCheckout);
router.patch('/checkout/:token', sessionWriteLimiter, journeySessionController.patchCheckout);

router.post('/payment', sessionWriteLimiter, journeySessionController.createPayment);
router.get('/payment/:token', sessionReadLimiter, journeySessionController.getPayment);
router.patch('/payment/:token', sessionWriteLimiter, journeySessionController.patchPayment);

router.get('/reservation/:token', sessionReadLimiter, journeySessionController.getReservation);

export default router;
export { router as journeySessionRouter };
