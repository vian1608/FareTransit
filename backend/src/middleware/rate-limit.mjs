import logger from '../config/logger.mjs';

const cache = new Map();

export const rateLimit = ({ windowMs = 60000, maxRequests = 60, message = 'Too many requests, please try again later.' } = {}) => {
  return (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const now = Date.now();
    
    if (!cache.has(ip)) {
      cache.set(ip, []);
    }

    const timestamps = cache.get(ip);
    // Filter timestamps older than the window
    const activeTimestamps = timestamps.filter(t => now - t < windowMs);
    
    if (activeTimestamps.length >= maxRequests) {
      logger.warn(`Rate limit exceeded for IP: ${ip} on path: ${req.path}`);
      return res.status(429).json({
        success: false,
        error: {
          code: 'TOO_MANY_REQUESTS',
          message
        }
      });
    }

    activeTimestamps.push(now);
    cache.set(ip, activeTimestamps);
    next();
  };
};

export default rateLimit;
