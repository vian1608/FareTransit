import crypto from 'crypto';
import logger from '../config/logger.mjs';
import env from '../config/env.mjs';

export const errorHandler = (err, req, res, next) => {
  const statusCode = Number(err.statusCode || err.status || 500);
  const errorCode = err.code || 'INTERNAL_SERVER_ERROR';
  const referenceId = req?.headers?.['x-request-id'] || `ERR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const isServerError = statusCode >= 500;

  logger.error('Unhandled error caught by middleware', {
    referenceId,
    method: req?.method,
    path: req?.originalUrl || req?.url,
    statusCode,
    code: errorCode,
    message: err?.message,
    stack: err?.stack,
  });

  // Preserve useful validation/auth/conflict messages. Unexpected 5xx errors
  // must not expose database/provider/internal implementation details to users.
  const publicMessage = isServerError && env.nodeEnv !== 'development' && err.expose !== true
    ? 'We could not complete this request right now. Please try again. If the problem continues, contact support with the reference ID.'
    : (err.message || 'An unexpected error occurred');

  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message: publicMessage,
      referenceId,
      ...(env.nodeEnv === 'development' && { stack: err.stack })
    }
  });
};

export default errorHandler;
