import env from './env.mjs';

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

const currentLevel = env.nodeEnv === 'development' ? levels.debug : levels.info;

export const logger = {
  error: (msg, ...meta) => {
    if (levels.error <= currentLevel) {
      console.error(`[ERROR] [${new Date().toISOString()}]`, msg, ...meta);
    }
  },
  warn: (msg, ...meta) => {
    if (levels.warn <= currentLevel) {
      console.warn(`[WARN] [${new Date().toISOString()}]`, msg, ...meta);
    }
  },
  info: (msg, ...meta) => {
    if (levels.info <= currentLevel) {
      console.log(`[INFO] [${new Date().toISOString()}]`, msg, ...meta);
    }
  },
  debug: (msg, ...meta) => {
    if (levels.debug <= currentLevel) {
      console.debug(`[DEBUG] [${new Date().toISOString()}]`, msg, ...meta);
    }
  }
};

export default logger;
