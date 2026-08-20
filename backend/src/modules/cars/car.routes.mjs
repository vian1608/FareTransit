import express from 'express';
import carController from './car.controller.mjs';
import carLocationService from './car-location.service.mjs';
import rateLimit from '../../middleware/rate-limit.mjs';
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

// Mounted under /cars
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
