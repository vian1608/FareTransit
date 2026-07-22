import abandonedBookingService from './abandoned-booking.service.mjs';

export const abandonedBookingController = {
  save: async (req, res, next) => {
    try {
      const result = await abandonedBookingService.saveSession(req.body);
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  delete: async (req, res, next) => {
    try {
      const { sessionKey } = req.params;
      await abandonedBookingService.removeSession(sessionKey);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }
};

export default abandonedBookingController;
