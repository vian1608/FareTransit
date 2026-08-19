import express from 'express';
import carController from './car.controller.mjs';
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

// Autocomplete location search
router.get('/locations/autocomplete', publicLookupCache(300, 86400, 3600), carController.autocompleteLocations);

// Click tracking
router.post('/click', clickTrackingRateLimiter, carController.recordClick);

export default router;
export { router as carRouter };
