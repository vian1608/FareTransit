import journeySessionService from './journey-session.service.mjs';

function publicSession(row) {
  return {
    token: row.token,
    type: row.session_type,
    payload: row.payload || {},
    status: row.status,
    expiresAt: row.expires_at,
    bookingId: row.booking_id || null,
  };
}

const journeySessionController = {
  createQuote: async (req, res, next) => {
    try {
      const { searchParams, selectedFlight } = req.body || {};
      if (!searchParams || !selectedFlight) {
        return res.status(400).json({
          success: false,
          error: { code: 'QUOTE_SESSION_INPUT_REQUIRED', message: 'Search parameters and the selected departure flight are required.' },
        });
      }
      const row = await journeySessionService.createQuote({ searchParams, selectedFlight });
      res.status(201).json({ success: true, data: publicSession(row) });
    } catch (error) {
      next(error);
    }
  },

  getQuote: async (req, res, next) => {
    try {
      const row = await journeySessionService.getQuote(req.params.token);
      res.json({ success: true, data: publicSession(row) });
    } catch (error) {
      next(error);
    }
  },

  createCheckout: async (req, res, next) => {
    try {
      const { searchParams, selectedFlight, returnFlight, quoteToken } = req.body || {};
      if (!searchParams || !selectedFlight) {
        return res.status(400).json({
          success: false,
          error: { code: 'CHECKOUT_SESSION_INPUT_REQUIRED', message: 'Search parameters and the selected itinerary are required.' },
        });
      }
      const row = await journeySessionService.createCheckout({ searchParams, selectedFlight, returnFlight, quoteToken });
      res.status(201).json({ success: true, data: publicSession(row) });
    } catch (error) {
      next(error);
    }
  },

  getCheckout: async (req, res, next) => {
    try {
      const row = await journeySessionService.getCheckout(req.params.token);
      const data = publicSession(row);

      // A duplicated/refreshed checkout link after a successful submit should land
      // on the durable r_ confirmation URL instead of reopening an editable form.
      if (row.status === 'COMPLETED' && row.booking_id) {
        try {
          const completed = await journeySessionService.completeCheckout(row.token, row.booking_id);
          data.reservationToken = completed.reservationToken || null;
        } catch (error) {
          console.error('[JourneySession] Completed-checkout restore warning:', error.message);
        }
      }

      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  patchCheckout: async (req, res, next) => {
    try {
      const row = await journeySessionService.patchCheckout(req.params.token, req.body || {});
      res.json({ success: true, data: publicSession(row) });
    } catch (error) {
      next(error);
    }
  },

  createPayment: async (req, res, next) => {
    try {
      const row = await journeySessionService.createPayment(req.body || {});
      res.status(201).json({ success: true, data: publicSession(row) });
    } catch (error) {
      next(error);
    }
  },

  getPayment: async (req, res, next) => {
    try {
      const row = await journeySessionService.getPayment(req.params.token);
      res.json({ success: true, data: publicSession(row) });
    } catch (error) {
      next(error);
    }
  },

  patchPayment: async (req, res, next) => {
    try {
      const row = await journeySessionService.patchPayment(req.params.token, req.body || {});
      res.json({ success: true, data: publicSession(row) });
    } catch (error) {
      next(error);
    }
  },

  getReservation: async (req, res, next) => {
    try {
      const dto = await journeySessionService.getReservationByToken(req.params.token);
      res.json({ success: true, data: dto, ...dto });
    } catch (error) {
      next(error);
    }
  },
};

export default journeySessionController;
