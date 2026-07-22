import jwt from 'jsonwebtoken';
import env from '../config/env.mjs';
import logger from '../config/logger.mjs';

export const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'No authorization token provided' }
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, env.jwtSecret);
    
    req.user = decoded;
    next();
  } catch (error) {
    logger.warn('Authentication token verification failed:', error.message);
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired authorization token' }
    });
  }
};

export default authenticate;
