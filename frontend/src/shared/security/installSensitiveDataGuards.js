import api from '../api/api';

const FORBIDDEN_KEYS = new Set([
  'cardnumber',
  'card_number',
  'pan',
  'cvv',
  'cvc',
  'cid',
  'cch',
  'securitycode',
  'security_code',
]);

const DEFAULT_FETCH_TIMEOUT_MS = 30000;

function digits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

export function sanitizeSensitivePayload(value, keyName = '') {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeSensitivePayload(item));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).reduce((clean, [key, child]) => {
      const normalizedKey = key.toLowerCase();
      if (FORBIDDEN_KEYS.has(normalizedKey)) return clean;

      if (normalizedKey === 'cardlast4' || normalizedKey === 'card_last4') {
        const last4 = digits(child).slice(-4);
        clean[key] = last4 || null;
        return clean;
      }

      clean[key] = sanitizeSensitivePayload(child, key);
      return clean;
    }, {});
  }

  if (typeof value === 'string') {
    const normalizedKey = String(keyName || '').toLowerCase();
    if (FORBIDDEN_KEYS.has(normalizedKey)) return '[REDACTED]';
  }

  return value;
}

function sanitizeAxiosData(data) {
  if (!data) return data;
  if (typeof data === 'string') {
    try {
      return JSON.stringify(sanitizeSensitivePayload(JSON.parse(data)));
    } catch {
      return data;
    }
  }
  return sanitizeSensitivePayload(data);
}

function redactForConsole(value, keyName = '') {
  if (Array.isArray(value)) return value.map((item) => redactForConsole(item));
  if (value && typeof value === 'object') {
    const output = {};
    for (const [key, child] of Object.entries(value)) {
      const normalizedKey = key.toLowerCase();
      if (FORBIDDEN_KEYS.has(normalizedKey)) {
        output[key] = '[REDACTED]';
      } else if (normalizedKey === 'cardlast4' || normalizedKey === 'card_last4') {
        output[key] = digits(child).slice(-4) || '[REDACTED]';
      } else {
        output[key] = redactForConsole(child, key);
      }
    }
    return output;
  }
  if (typeof value === 'string') {
    if (FORBIDDEN_KEYS.has(String(keyName).toLowerCase())) return '[REDACTED]';
    return value.replace(/\b(?:\d[ -]*?){13,19}\b/g, '[REDACTED CARD]');
  }
  return value;
}

function isSameOriginApiRequest(input) {
  if (typeof window === 'undefined') return false;
  try {
    const raw = typeof input === 'string' ? input : input?.url;
    if (!raw) return false;
    const url = new URL(raw, window.location.origin);
    return url.origin === window.location.origin && url.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

function installApiFetchTimeout() {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input, init = {}) => {
    // Respect explicit caller cancellation/timeout behavior.
    if (!isSameOriginApiRequest(input) || init.signal) {
      return originalFetch(input, init);
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), DEFAULT_FETCH_TIMEOUT_MS);
    return originalFetch(input, { ...init, signal: controller.signal })
      .finally(() => window.clearTimeout(timer));
  };
}

function normalizeInquiryErrorShape(error) {
  const url = String(error?.config?.url || '');
  if (!url.includes('/inquiries/consulting')) return error;

  const responseError = error?.response?.data?.error;
  if (responseError && typeof responseError === 'object') {
    const message = responseError.message || error.userMessage || error.message || 'Unable to submit your request right now.';
    error.response.data.error = String(message);
    error.userMessage = String(message);
  }
  return error;
}

let installed = false;

export function installSensitiveDataGuards() {
  if (installed) return;
  installed = true;

  api.interceptors.request.use((config) => {
    config.data = sanitizeAxiosData(config.data);
    return config;
  });

  // Some legacy landing pages read response.data.error directly. Guarantee
  // that inquiry failures are always render-safe strings rather than objects.
  api.interceptors.response.use(
    (response) => response,
    (error) => Promise.reject(normalizeInquiryErrorShape(error))
  );

  installApiFetchTimeout();

  if (process.env.NODE_ENV === 'production' && typeof console !== 'undefined') {
    ['log', 'info', 'debug', 'warn', 'error'].forEach((method) => {
      const original = console[method]?.bind(console);
      if (!original) return;
      console[method] = (...args) => original(...args.map((arg) => redactForConsole(arg)));
    });
  }
}

export default installSensitiveDataGuards;
