import express from 'express';
import flightController from './flight.controller.mjs';
import rateLimit from '../../middleware/rate-limit.mjs';

const flightRouter = express.Router();
const airportRouter = express.Router();

const searchRateLimiter = rateLimit({
  windowMs: 60000,
  maxRequests: 30,
  message: 'Too many search requests. Please wait before searching again.'
});

// Mounted under /flights
flightRouter.post('/search', searchRateLimiter, flightController.search);

// Mounted under /airports
airportRouter.get('/search', flightController.searchAirports);
airportRouter.get('/', flightController.searchAirports);

export { flightRouter, airportRouter };
export default flightRouter;
