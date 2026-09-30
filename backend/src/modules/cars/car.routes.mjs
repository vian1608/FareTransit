import express from 'express';
import carController from './car.controller.mjs';
import carLocationService from './car-location.service.mjs';
import enterpriseRentalController from './enterprise-rental.controller.mjs';
import rateLimit from '../../middleware/rate-limit.mjs';
import authenticate from '../../middleware/authenticate.mjs';
import authorize from '../../middleware/authorize.mjs';
import { publicLookupCache } from '../../middleware/cache-control.middleware.mjs';

const router = express.Router();

const carSearchRateLimiter = rateLimit({
  windowMs: 60000,
  maxRequests: 30,
  message: 'Too many car search requests. Please wait a minute before searching again.'
});

const clickTrackingRateLimiter = rateLimit({
  windowMs: 60000,
  maxRequests: 60,
  message: 'Too many click tracking requests.'
});

const enterpriseLookupRateLimiter = rateLimit({
  windowMs: 60000,
  maxRequests: 30,
  message: 'Too many Enterprise location requests. Please wait a minute.'
});

const enterpriseVehicleRateLimiter = rateLimit({
  windowMs: 60000,
  maxRequests: 15,
  message: 'Too many Enterprise vehicle searches. Please wait a minute.'
});

const enterpriseCheckoutRateLimiter = rateLimit({
  windowMs: 60000,
  maxRequests: 12,
  message: 'Too many rental checkout requests. Please wait a minute.'
});

const enterprisePaymentRateLimiter = rateLimit({
  windowMs: 60000,
  maxRequests: 5,
  message: 'Too many payment attempts. Please wait before trying again.'
});

const enterpriseAdminReadRateLimiter = rateLimit({
  windowMs: 60000,
  maxRequests: 120,
  message: 'Too many rental-order requests. Please wait a minute.'
});

const enterpriseAdminWriteRateLimiter = rateLimit({
  windowMs: 60000,
  maxRequests: 30,
  message: 'Too many rental-order changes. Please wait a minute.'
});

// Enterprise Rent-A-Car via Parse.bot. Parse credentials never leave the server.
router.get('/enterprise/locations', enterpriseLookupRateLimiter, enterpriseRentalController.locations);
router.post('/enterprise/vehicles', enterpriseVehicleRateLimiter, enterpriseRentalController.vehicles);
router.post('/enterprise/quotes', enterpriseCheckoutRateLimiter, enterpriseRentalController.createQuote);
router.get('/enterprise/quotes/:quoteToken', enterpriseCheckoutRateLimiter, enterpriseRentalController.getQuote);
router.post('/enterprise/orders', enterpriseCheckoutRateLimiter, enterpriseRentalController.createOrder);
router.get('/enterprise/orders/:publicToken', enterpriseCheckoutRateLimiter, enterpriseRentalController.getOrder);
router.get('/enterprise/payment-config', enterpriseCheckoutRateLimiter, enterpriseRentalController.paymentConfig);
router.post('/enterprise/orders/:publicToken/authorize', enterprisePaymentRateLimiter, enterpriseRentalController.authorizeOrder);

// Manual Enterprise fulfillment queue. These endpoints are protected by the
// existing FareTransit admin JWT/RBAC middleware.
router.get('/enterprise/admin/orders', enterpriseAdminReadRateLimiter, authenticate, authorize(['admin']), enterpriseRentalController.adminListOrders);
router.get('/enterprise/admin/orders/:reference', enterpriseAdminReadRateLimiter, authenticate, authorize(['admin']), enterpriseRentalController.adminGetOrder);
router.patch('/enterprise/admin/orders/:reference', enterpriseAdminWriteRateLimiter, authenticate, authorize(['admin']), enterpriseRentalController.adminMarkBookingDetails);
router.post('/enterprise/admin/orders/:reference/confirm-and-capture', enterpriseAdminWriteRateLimiter, authenticate, authorize(['admin']), enterpriseRentalController.adminConfirmAndCapture);
router.post('/enterprise/admin/orders/:reference/mark-unavailable', enterpriseAdminWriteRateLimiter, authenticate, authorize(['admin']), enterpriseRentalController.adminMarkUnavailable);

// Existing Booking.com car-rental compatibility routes.
router.post('/search', carSearchRateLimiter, carController.search);
router.post('/details', carController.getDetails);
router.post('/depots', carController.getDepots);
router.post('/suppliers', carController.getSuppliers);
router.post('/depot-scores', carController.getDepotScores);
router.post('/constants', carController.getConstants);

// Autocomplete rental locations. Airports come from the live flight-location
// provider; Booking.com city IDs are added when Demand API credentials exist.
router.get('/locations/autocomplete', publicLookupCache(300, 86400, 3600), async (req, res) => {
  try {
    const q = String(req.query.q || req.query.query || '').trim();
    if (q.length < 2) return res.json({ success: true, data: [] });
    const data = await carLocationService.autocomplete(q);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: { code: 'AUTOCOMPLETE_ERROR', message: 'Unable to retrieve rental locations right now.' }
    });
  }
});

// Click tracking
router.post('/click', clickTrackingRateLimiter, carController.recordClick);

export default router;
export { router as carRouter };
