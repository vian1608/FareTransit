import env from './env.mjs';

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

const currentLevel = env.nodeEnv === 'development' ? levels.debug : levels.info;

const SENSITIVE_KEYS = [
  'cardNumber', 'card_number', 'fullCardNumber', 'pan', 'cvv', 'cvc', 'cid',
  'securityCode', 'security_code', 'pin', 'track_data', 'trackData'
];

function sanitizeArg(arg) {
  if (!arg) return arg;
  if (typeof arg === 'string') {
    let sanitized = arg;
    SENSITIVE_KEYS.forEach(key => {
      const regex = new RegExp(`("${key}"|'${key}'|${key})\\s*[:=]\\s*["']?([^"',\\s}]+)["']?`, 'gi');
      sanitized = sanitized.replace(regex, `$1: "[REDACTED]"`);
    });
    return sanitized;
  }
  if (typeof arg === 'object') {
    if (Array.isArray(arg)) return arg.map(sanitizeArg);
    const cleaned = {};
    for (const [k, v] of Object.entries(arg)) {
      if (SENSITIVE_KEYS.some(sk => sk.toLowerCase() === k.toLowerCase())) {
        cleaned[k] = '[REDACTED]';
      } else {
        cleaned[k] = sanitizeArg(v);
      }
    }
    return cleaned;
  }
  return arg;
}

export const logger = {
  error: (msg, ...meta) => {
    if (levels.error <= currentLevel) {
      console.error(`[ERROR] [${new Date().toISOString()}]`, sanitizeArg(msg), ...meta.map(sanitizeArg));
    }
  },
  warn: (msg, ...meta) => {
    if (levels.warn <= currentLevel) {
      console.warn(`[WARN] [${new Date().toISOString()}]`, sanitizeArg(msg), ...meta.map(sanitizeArg));
    }
  },
  info: (msg, ...meta) => {
    if (levels.info <= currentLevel) {
      console.log(`[INFO] [${new Date().toISOString()}]`, sanitizeArg(msg), ...meta.map(sanitizeArg));
    }
  },
  debug: (msg, ...meta) => {
    if (levels.debug <= currentLevel) {
      console.debug(`[DEBUG] [${new Date().toISOString()}]`, sanitizeArg(msg), ...meta.map(sanitizeArg));
    }
  }
};

export default logger;
