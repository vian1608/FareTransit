import carService from './car.service.mjs';
import bookingDemandApiClient from '../../services/bookingDemandApiClient.mjs';
import logger from '../../config/logger.mjs';

export const carController = {
  /**
   * Search available rental cars
   * POST /api/cars/search
   */
  search: async (req, res, next) => {
    try {
      const searchData = req.body || {};
      const result = await carService.search(searchData);

      return res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error(`Error in carController.search: ${error.message}`);
      const statusCode = error.statusCode || 400;
      return res.status(statusCode).json({
        success: false,
        error: {
          code: error.code || 'CAR_SEARCH_ERROR',
          message: error.message,
          requestId: error.requestId || null
        }
      });
    }
  },

  /**
   * Fetch car details catalog
   * POST /api/cars/details
   */
  getDetails: async (req, res, next) => {
    try {
      const result = await bookingDemandApiClient.getCarDetails(req.body || {});
      return res.json({
        success: true,
        data: result.data
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        success: false,
        error: { code: 'CAR_DETAILS_ERROR', message: error.message, requestId: error.requestId || null }
      });
    }
  },

  /**
   * Fetch depots catalog
   * POST /api/cars/depots
   */
  getDepots: async (req, res, next) => {
    try {
      const result = await bookingDemandApiClient.getDepots(req.body || {});
      return res.json({
        success: true,
        data: result.data
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        success: false,
        error: { code: 'CAR_DEPOTS_ERROR', message: error.message, requestId: error.requestId || null }
      });
    }
  },

  /**
   * Fetch suppliers catalog
   * POST /api/cars/suppliers
   */
  getSuppliers: async (req, res, next) => {
    try {
      const result = await bookingDemandApiClient.getSuppliers(req.body || {});
      return res.json({
        success: true,
        data: result.data
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        success: false,
        error: { code: 'CAR_SUPPLIERS_ERROR', message: error.message, requestId: error.requestId || null }
      });
    }
  },

  /**
   * Fetch depot review scores
   * POST /api/cars/depot-scores
   */
  getDepotScores: async (req, res, next) => {
    try {
      const result = await bookingDemandApiClient.getDepotScores(req.body || {});
      return res.json({
        success: true,
        data: result.data
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        success: false,
        error: { code: 'CAR_DEPOT_SCORES_ERROR', message: error.message, requestId: error.requestId || null }
      });
    }
  },

  /**
   * Fetch car constants / translated labels
   * POST /api/cars/constants
   */
  getConstants: async (req, res, next) => {
    try {
      const result = await bookingDemandApiClient.getCarConstants(req.body || {});
      return res.json({
        success: true,
        data: result.data
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        success: false,
        error: { code: 'CAR_CONSTANTS_ERROR', message: error.message, requestId: error.requestId || null }
      });
    }
  },

  /**
   * Location Autocomplete (Airports & Cities)
   * GET /api/cars/locations/autocomplete
   */
  autocompleteLocations: async (req, res, next) => {
    try {
      const q = String(req.query.q || req.query.query || '').trim();
      if (!q || q.length < 2) {
        return res.json({ success: true, data: [] });
      }

      // Featured major airports database for instant responsive autocomplete
      const popularAirports = [
        { type: 'airport', code: 'JFK', label: 'John F. Kennedy International Airport (JFK)', city: 'New York', country: 'United States' },
        { type: 'airport', code: 'LGA', label: 'LaGuardia Airport (LGA)', city: 'New York', country: 'United States' },
        { type: 'airport', code: 'EWR', label: 'Newark Liberty International Airport (EWR)', city: 'Newark/New York', country: 'United States' },
        { type: 'airport', code: 'MIA', label: 'Miami International Airport (MIA)', city: 'Miami', country: 'United States' },
        { type: 'airport', code: 'FLL', label: 'Fort Lauderdale-Hollywood International Airport (FLL)', city: 'Fort Lauderdale', country: 'United States' },
        { type: 'airport', code: 'LAX', label: 'Los Angeles International Airport (LAX)', city: 'Los Angeles', country: 'United States' },
        { type: 'airport', code: 'ORD', label: 'Chicago O\'Hare International Airport (ORD)', city: 'Chicago', country: 'United States' },
        { type: 'airport', code: 'DFW', label: 'Dallas/Fort Worth International Airport (DFW)', city: 'Dallas', country: 'United States' },
        { type: 'airport', code: 'MCO', label: 'Orlando International Airport (MCO)', city: 'Orlando', country: 'United States' },
        { type: 'airport', code: 'SFO', label: 'San Francisco International Airport (SFO)', city: 'San Francisco', country: 'United States' },
        { type: 'airport', code: 'LAS', label: 'Harry Reid International Airport (LAS)', city: 'Las Vegas', country: 'United States' },
        { type: 'airport', code: 'BOS', label: 'Boston Logan International Airport (BOS)', city: 'Boston', country: 'United States' },
        { type: 'airport', code: 'ATL', label: 'Hartsfield-Jackson Atlanta International Airport (ATL)', city: 'Atlanta', country: 'United States' },
        { type: 'city', city_id: -2140479, label: 'Amsterdam, Netherlands', city: 'Amsterdam', country: 'Netherlands' },
        { type: 'city', city_id: -2601889, label: 'London, United Kingdom', city: 'London', country: 'United Kingdom' },
        { type: 'city', city_id: -1456928, label: 'Paris, France', city: 'Paris', country: 'France' },
        { type: 'city', city_id: -2092174, label: 'Miami, Florida, United States', city: 'Miami', country: 'United States' },
        { type: 'city', city_id: -2125103, label: 'New York City, New York, United States', city: 'New York', country: 'United States' }
      ];

      const qLower = q.toLowerCase();
      const matches = popularAirports.filter(item => 
        item.code?.toLowerCase().includes(qLower) ||
        item.label.toLowerCase().includes(qLower) ||
        item.city.toLowerCase().includes(qLower)
      );

      return res.json({
        success: true,
        data: matches
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: { code: 'AUTOCOMPLETE_ERROR', message: error.message }
      });
    }
  },

  /**
   * Track affiliate redirect click event
   * POST /api/cars/click
   */
  recordClick: async (req, res, next) => {
    try {
      const clickData = req.body || {};
      const result = await carService.recordClick(clickData);
      return res.json({
        success: true,
        data: result
      });
    } catch (error) {
      return res.status(error.statusCode || 400).json({
        success: false,
        error: { code: 'CLICK_TRACKING_ERROR', message: error.message }
      });
    }
  }
};

export default carController;
