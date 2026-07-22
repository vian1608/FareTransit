import paymentService from './payment.service.mjs';

export const paymentController = {
  getConfig: (req, res, next) => {
    try {
      const config = paymentService.getConfig();
      res.json(config);
    } catch (error) {
      next(error);
    }
  },

  createCheckoutSession: async (req, res, next) => {
    try {
      const hostOrigin = req.headers.origin || 'http://localhost:3000';
      const session = await paymentService.createSession(req.body, hostOrigin);
      res.json(session);
    } catch (error) {
      next(error);
    }
  },

  getSessionStatus: async (req, res, next) => {
    try {
      const { session_id } = req.query;
      if (!session_id) {
        return res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'Session ID is required' }
        });
      }

      const status = await paymentService.getStatus(session_id);
      res.json(status);
    } catch (error) {
      next(error);
    }
  }
};

export default paymentController;
