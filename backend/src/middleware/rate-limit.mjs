import logger from '../config/logger.mjs';

let limiterSequence = 0;

export const rateLimit = ({ windowMs = 60000, maxRequests = 60, message = 'Too many requests, please try again later.' } = {}) => {
  const buckets = new Map();
  const limiterId = ++limiterSequence;
  let requestCounter = 0;

  return (req, res, next) => {
    const rawForwarded = req.headers['x-forwarded-for'];
    const forwardedIp = Array.isArray(rawForwarded) ? rawForwarded[0] : String(rawForwarded || '').split(',')[0].trim();
    const ip = req.ip || forwardedIp || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    const timestamps = (buckets.get(ip) || []).filter(timestamp => now - timestamp < windowMs);

    if (timestamps.length >= maxRequests) {
      logger.warn(`Rate limit exceeded [limiter=${limiterId}] for IP: ${ip} on path: ${req.path}`);
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil(windowMs / 1000))));
      return res.status(429).json({
        success: false,
        error: { code: 'TOO_MANY_REQUESTS', message }
      });
    }

    timestamps.push(now);
    buckets.set(ip, timestamps);

    // Periodic bounded cleanup prevents a long-lived process from accumulating
    // stale IP entries while keeping request-path work very small.
    requestCounter += 1;
    if (requestCounter % 500 === 0) {
      for (const [bucketIp, values] of buckets.entries()) {
        const active = values.filter(timestamp => now - timestamp < windowMs);
        if (active.length) buckets.set(bucketIp, active);
        else buckets.delete(bucketIp);
      }
    }

    return next();
  };
};

export default rateLimit;
