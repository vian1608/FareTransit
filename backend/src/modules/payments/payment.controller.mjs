import paymentService from './payment.service.mjs';
import env from '../../config/env.mjs';

function isProductionDeployment() {
  const vercelEnv = String(process.env.VERCEL_ENV || '').toLowerCase();
  if (vercelEnv) return vercelEnv === 'production';
  return String(process.env.NODE_ENV || 'development').toLowerCase() === 'production';
}

function resolveCheckoutOrigin(req) {
  const configured = String(env.frontendUrl || '').trim();
  if (isProductionDeployment()) {
    try {
      const parsed = new URL(configured);
      if (parsed.protocol === 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
        return parsed.origin;
      }
    } catch {
      // Fall through to the canonical FareTransit production origin.
    }
    return 'https://www.faretransit.com';
  }

  const requested = String(req.headers.origin || '').trim();
  try {
    const parsed = new URL(requested || configured || 'http://localhost:3000');
    if (['http:', 'https:'].includes(parsed.protocol)) return parsed.origin;
  } catch {
    // Ignore malformed Origin headers in local development.
  }
  return 'http://localhost:3000';
}

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
      const hostOrigin = resolveCheckoutOrigin(req);
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
