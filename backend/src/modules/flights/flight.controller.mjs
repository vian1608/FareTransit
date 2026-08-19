import flightService from './flight.service.mjs';

function extractIataCode(value) {
  if (!value) return '';

  if (typeof value === 'object') {
    const code = String(value.code || value.iata || value.id || '').trim().toUpperCase();
    return /^[A-Z]{3}$/.test(code) ? code : '';
  }

  const text = String(value).trim();
  if (/^[A-Z]{3}$/i.test(text)) return text.toUpperCase();
  const match = text.match(/\(([A-Z]{3})\)/i);
  return match ? match[1].toUpperCase() : '';
}

function toNonNegativeInteger(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export const flightController = {
  search: async (req, res) => {
    try {
      const {
        from,
        to,
        departure,
        returnDate,
        adults,
        children,
        infants,
        infantsInSeat,
        infantsOnLap,
        travelClass,
        currency,
        departureToken,
      } = req.body;

      if (!from || !to || !departure) {
        return res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'Missing required parameters: from, to, departure' },
        });
      }

      const fromCode = extractIataCode(from);
      const toCode = extractIataCode(to);

      if (!fromCode || !toCode) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_AIRPORT_CODE',
            message: 'Origin and destination must be valid 3-letter IATA airport codes (for example TPA, LAX or LOS). Select an airport from the suggestions instead of entering a city name alone.',
          },
        });
      }

      if (fromCode === toCode) {
        return res.status(400).json({
          success: false,
          error: { code: 'SAME_AIRPORT', message: 'Origin and destination airports must be different.' },
        });
      }

      const normalizedDepartureToken = typeof departureToken === 'string'
        ? departureToken.trim()
        : '';

      if (normalizedDepartureToken && !returnDate) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'RETURN_DATE_REQUIRED',
            message: 'A return date is required when continuing a round-trip flight selection.',
          },
        });
      }

      const normalizedAdults = Math.max(1, toNonNegativeInteger(adults, 1));
      const normalizedChildren = toNonNegativeInteger(children, 0);
      const legacyInfants = toNonNegativeInteger(infants, 0);
      const hasSplitInfantCounts = infantsInSeat !== undefined || infantsOnLap !== undefined;
      const normalizedInfantsInSeat = hasSplitInfantCounts ? toNonNegativeInteger(infantsInSeat, 0) : 0;
      const normalizedInfantsOnLap = hasSplitInfantCounts
        ? toNonNegativeInteger(infantsOnLap, 0)
        : legacyInfants;
      const normalizedInfants = hasSplitInfantCounts
        ? normalizedInfantsInSeat + normalizedInfantsOnLap
        : legacyInfants;

      if (normalizedInfantsOnLap > normalizedAdults) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_LAP_INFANT_COUNT',
            message: 'Infants on lap cannot exceed the number of adult passengers.',
          },
        });
      }

      const searchParams = {
        from: fromCode,
        to: toCode,
        departure,
        returnDate,
        adults: normalizedAdults,
        children: normalizedChildren,
        // Keep total infants for backwards-compatible booking/passenger counts,
        // while preserving the supplier-specific seated/lap split below.
        infants: normalizedInfants,
        infantsInSeat: normalizedInfantsInSeat,
        infantsOnLap: normalizedInfantsOnLap,
        travelClass: travelClass || 'economy',
        currency: currency || 'USD',
        departureToken: normalizedDepartureToken || undefined,
      };

      const results = await flightService.searchFlights(searchParams);
      const isProduction = (process.env.NODE_ENV || 'development') === 'production';

      if (isProduction && results.meta?.isMock) {
        return res.status(503).json({
          success: false,
          error: {
            code: 'FLIGHT_SEARCH_UNAVAILABLE',
            message: 'Live flight search is temporarily unavailable. Mock results are blocked in production.',
          },
        });
      }

      return res.json({
        success: true,
        data: results.flights || [],
        meta: {
          source: results.meta?.isMock ? 'offline' : 'supplier',
          count: results.meta?.count || (results.flights?.length || 0),
        },
      });
    } catch (error) {
      console.error('[Controller Error] Flight search handler failed:', error);
      const statusCode = error.status || 500;
      return res.status(statusCode).json({
        success: false,
        error: {
          code: error.code || 'FLIGHT_SEARCH_FAILED',
          message: error.message || 'Unable to retrieve available flights.',
        },
      });
    }
  },

  searchAirports: async (req, res, next) => {
    try {
      const { q } = req.query;
      if (!q) {
        return res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'Query parameter q is required' },
        });
      }

      const suggestions = await flightService.autocompleteAirports(q);
      return res.json({
        success: true,
        data: (Array.isArray(suggestions) ? suggestions : []).filter((airport) => /^[A-Z]{3}$/.test(String(airport?.code || '').toUpperCase())),
      });
    } catch (error) {
      return next(error);
    }
  },
};

export default flightController;
