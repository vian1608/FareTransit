import express from 'express';
import authController from './auth.controller.mjs';
import rateLimit from '../../middleware/rate-limit.mjs';

const router = express.Router();

const authRateLimiter = rateLimit({
  windowMs: 60000,
  maxRequests: 10,
  message: 'Too many authentication attempts. Please try again in a minute.'
});

router.post('/register', authRateLimiter, authController.register);
router.post('/login', authRateLimiter, authController.login);
router.get('/verify', authController.verify);

export default router;
export { router as authRouter };
