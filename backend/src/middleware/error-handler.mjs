import logger from '../config/logger.mjs';
import env from '../config/env.mjs';

export const errorHandler = (err, req, res, next) => {
  logger.error('Unhandled error caught by middleware:', err);

  const statusCode = err.statusCode || err.status || 500;
  const errorCode = err.code || 'INTERNAL_SERVER_ERROR';
  const errorMessage = err.message || 'An unexpected error occurred';

  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message: errorMessage,
      ...(env.nodeEnv === 'development' && { stack: err.stack })
    }
  });
};

export default errorHandler;
