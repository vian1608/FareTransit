import express from 'express';
import carController from './car.controller.mjs';
import carLocationService from './car-location.service.mjs';
import rateLimit from '../../middleware/rate-limit.mjs';
import { noStore, publicLookupCache } from '../../middleware/cache-control.middleware.mjs';

const router = express.Router();

const carSearchRateLimiter = rateLimit({
  windowMs: 60000,
  maxRequests: 20,
  message: 'Too many car search requests. Please wait a minute before searching again.'
});

const carBookingRateLimiter = rateLimit({
  windowMs: 60000,
  maxRequests: 8,
  message: 'Too many reservation requests. Please wait a minute and retry.'
});

const carBookingLookupRateLimiter = rateLimit({
  windowMs: 60000,
  maxRequests: 30,
  message: 'Too many reservation lookups. Please wait a minute and retry.'
});

// Live Enterprise inventory search via Parse. Results contain signed FareTransit
// quote tokens used by the on-site checkout; no supplier reservation is created here.
router.post('/search', noStore, carSearchRateLimiter, carController.search);

// FareTransit-owned customer reservation requests.
router.post('/bookings', noStore, carBookingRateLimiter, carController.createBooking);
router.get('/bookings/:reference', noStore, carBookingLookupRateLimiter, carController.getBooking);

// Autocomplete Enterprise rental branches/airports. A short CDN cache saves Parse
// credits while the service layer also keeps a best-effort in-memory cache.
router.get('/locations/autocomplete', publicLookupCache(300, 1800, 600), async (req, res) => {
  try {
    const q = String(req.query.q || req.query.query || '').trim();
    if (q.length < 2) return res.json({ success: true, data: [] });
    const countryCode = String(req.query.countryCode || req.query.country_code || 'US').trim().toUpperCase();
    const data = await carLocationService.autocomplete(q, { countryCode });
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'AUTOCOMPLETE_ERROR',
        message: error.message || 'Unable to retrieve rental locations right now.'
      }
    });
  }
});

// Legacy Booking.com catalog endpoints retained temporarily for internal compatibility.
router.post('/details', noStore, carController.getDetails);
router.post('/depots', noStore, carController.getDepots);
router.post('/suppliers', noStore, carController.getSuppliers);
router.post('/depot-scores', noStore, carController.getDepotScores);
router.post('/constants', noStore, carController.getConstants);
router.post('/click', noStore, carController.recordClick);

export default router;
export { router as carRouter };
