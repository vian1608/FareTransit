import flightService from './flight.service.mjs';

export const flightController = {
  search: async (req, res, next) => {
    try {
      const { from, to, departure, returnDate, adults, children, infants, travelClass, currency } = req.body;

      if (!from || !to || !departure) {
        return res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'Missing required parameters: from, to, departure' }
        });
      }

      // Safe check to verify we are not sending empty or invalid airport inputs
      const extractCode = (val) => {
        if (!val) return '';
        if (typeof val === 'object') return val.code || '';
        const match = String(val).match(/\(([A-Z]{3,4})\)/i);
        return match ? match[1].toUpperCase() : String(val).trim().toUpperCase().substring(0, 3);
      };

      const fromCode = extractCode(from);
      const toCode = extractCode(to);

      if (fromCode.length !== 3 || toCode.length !== 3) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_AIRPORT_CODE', message: 'Invalid airport codes: must be 3-letter IATA codes.' }
        });
      }

      const searchParams = {
        from,
        to,
        departure,
        returnDate,
        adults: parseInt(adults || 1, 10),
        children: parseInt(children || 0, 10),
        infants: parseInt(infants || 0, 10),
        travelClass: travelClass || 'economy',
        currency: currency || 'USD'
      };

      const results = await flightService.searchFlights(searchParams);
      
      // Standard stable response shape requested: { success: true, data: [...], meta: { source: '...', count: X } }
      res.json({
        success: true,
        data: results.flights || [],
        meta: {
          source: results.meta?.isMock ? 'offline' : 'supplier',
          count: results.meta?.count || (results.flights?.length || 0)
        }
      });
    } catch (error) {
      console.error('[Controller Error] Flight search handler failed:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'FLIGHT_SEARCH_FAILED',
          message: 'Unable to retrieve available flights.'
        }
      });
    }
  },

  searchAirports: async (req, res, next) => {
    try {
      const { q } = req.query;
      if (!q) {
        return res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'Query parameter q is required' }
        });
      }

      const suggestions = await flightService.autocompleteAirports(q);
      res.json({
        success: true,
        data: suggestions
      });
    } catch (error) {
      next(error);
    }
  }
};

export default flightController;
