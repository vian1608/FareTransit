import logger from '../config/logger.mjs';
import { getRequestMetrics } from '../observability/request-metrics.mjs';

const LARGE_RESPONSE_BYTES = 256 * 1024;
const VERY_LARGE_RESPONSE_BYTES = 1024 * 1024;
const SLOW_REQUEST_MS = 2000;
const HIGH_SUPABASE_CALLS = 12;
const CRITICAL_SUPABASE_CALLS = 20;

function byteLength(body) {
  try {
    if (body === undefined || body === null) return 0;
    if (Buffer.isBuffer(body)) return body.length;
    if (typeof body === 'string') return Buffer.byteLength(body, 'utf8');
    return Buffer.byteLength(JSON.stringify(body), 'utf8');
  } catch {
    return 0;
  }
}

export default function responseMetrics(req, res, next) {
  const startedAt = Date.now();
  let responseBytes = 0;
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);
  let insideJson = false;

  res.json = body => {
    responseBytes = Math.max(responseBytes, byteLength(body));
    insideJson = true;
    try {
      return originalJson(body);
    } finally {
      insideJson = false;
    }
  };

  res.send = body => {
    if (!insideJson) responseBytes = Math.max(responseBytes, byteLength(body));
    return originalSend(body);
  };

  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    const contentLength = Number(res.getHeader('content-length') || 0);
    if (Number.isFinite(contentLength) && contentLength > responseBytes) responseBytes = contentLength;
    const requestMetrics = getRequestMetrics();

    const meta = {
      method: req.method,
      path: req.originalUrl?.split('?')[0] || req.path,
      status: res.statusCode,
      durationMs,
      responseBytes,
      supabaseCalls: requestMetrics.supabaseCalls,
      supabaseTables: requestMetrics.supabaseTables
    };

    if (responseBytes >= VERY_LARGE_RESPONSE_BYTES) {
      logger.error('[API_EGRESS_CRITICAL] Response exceeded 1 MB', meta);
    } else if (responseBytes >= LARGE_RESPONSE_BYTES) {
      logger.warn('[API_EGRESS_WARNING] Response exceeded 256 KB', meta);
    }

    if (requestMetrics.supabaseCalls >= CRITICAL_SUPABASE_CALLS) {
      logger.error('[SUPABASE_FANOUT_CRITICAL] One API request caused 20+ Supabase relation calls', meta);
    } else if (requestMetrics.supabaseCalls >= HIGH_SUPABASE_CALLS) {
      logger.warn('[SUPABASE_FANOUT_WARNING] One API request caused 12+ Supabase relation calls', meta);
    }

    if (durationMs >= SLOW_REQUEST_MS) {
      logger.warn('[API_SLOW_REQUEST]', meta);
    }
  });

  next();
}

export {
  LARGE_RESPONSE_BYTES,
  VERY_LARGE_RESPONSE_BYTES,
  SLOW_REQUEST_MS,
  HIGH_SUPABASE_CALLS,
  CRITICAL_SUPABASE_CALLS
};
