import express from 'express';
import addonController from './addon.controller.mjs';
import { flexAddonController } from './flex-addon.controller.mjs';
import authenticate from '../../middleware/authenticate.mjs';
import authorize from '../../middleware/authorize.mjs';
import rateLimit from '../../middleware/rate-limit.mjs';

const router = express.Router();
const publicLimiter = rateLimit({ windowMs: 60000, maxRequests: 30, message: 'Too many trip add-on requests. Please wait a minute.' });
const paymentLimiter = rateLimit({ windowMs: 60000, maxRequests: 12, message: 'Too many baggage payment attempts. Please wait before trying again.' });
const adminLimiter = rateLimit({ windowMs: 60000, maxRequests: 60, message: 'Too many trip add-on changes. Please wait a minute.' });
const adminOnly = [adminLimiter, authenticate, authorize(['admin'])];

router.get('/pay/config', publicLimiter, addonController.getPaymentConfig);
router.get('/pay/:token', publicLimiter, addonController.getPublicOffer);
router.post('/pay/:token/paypal/create-order', paymentLimiter, addonController.createPayPalOrder);
router.post('/pay/:token/paypal/capture-order', paymentLimiter, addonController.capturePayPalOrder);
router.post('/pay/:token/decline', publicLimiter, addonController.declinePublicOffer);

router.get('/flex/:reference/change-requests', publicLimiter, flexAddonController.listCustomer);
router.post('/flex/:reference/change-requests', publicLimiter, flexAddonController.createChangeRequest);

router.get('/admin/booking/:bookingId', ...adminOnly, addonController.listAdminByBooking);
router.patch('/requests/:id/quote', ...adminOnly, addonController.quoteRequest);
router.post('/requests/:id/send-offer', ...adminOnly, addonController.sendOffer);
router.patch('/requests/:id/status', ...adminOnly, addonController.updateStatus);
router.post('/requests/:id/payment', ...adminOnly, addonController.recordPayment);
router.post('/requests/:id/fulfillment', ...adminOnly, addonController.recordFulfillment);
router.get('/admin/flex/:reference/change-requests', ...adminOnly, flexAddonController.listAdmin);
router.patch('/admin/flex/:reference/change-requests/:changeRequestId', ...adminOnly, flexAddonController.updateAdmin);

export default router;
export { router as addonRouter };
