import express from 'express';
import rateLimit from '../../middleware/rate-limit.mjs';
import voucherController from './voucher.controller.mjs';

const router = express.Router();

const voucherRateLimiter = rateLimit({
  windowMs: 60000,
  maxRequests: 20,
  message: 'Too many voucher attempts. Please wait before trying again.'
});

router.post('/validate', voucherRateLimiter, voucherController.validate);

export default router;
