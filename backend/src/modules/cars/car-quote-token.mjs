import crypto from 'crypto';
import env from '../../config/env.mjs';

function quoteError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function signingSecret() {
  const secret = env.carQuoteSigningSecret;
  if (!secret) {
    throw quoteError('CAR_QUOTE_SIGNING_NOT_CONFIGURED', 'Car-rental checkout is not configured yet.', 503);
  }
  return secret;
}

function encode(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decode(value) {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    throw quoteError('INVALID_CAR_QUOTE', 'This rental quote is invalid. Please search again.');
  }
}

function signPayload(encodedPayload) {
  return crypto.createHmac('sha256', signingSecret()).update(encodedPayload).digest('base64url');
}

export function createCarQuoteToken(quote = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    ...quote,
    iat: now,
    exp: now + env.carQuoteTtlSeconds,
    v: 1
  };
  const encoded = encode(payload);
  const signature = signPayload(encoded);
  return `${encoded}.${signature}`;
}

export function verifyCarQuoteToken(token) {
  const value = String(token || '').trim();
  const [encoded, signature, extra] = value.split('.');
  if (!encoded || !signature || extra) {
    throw quoteError('INVALID_CAR_QUOTE', 'This rental quote is invalid. Please search again.');
  }

  const expected = signPayload(encoded);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw quoteError('INVALID_CAR_QUOTE', 'This rental quote could not be verified. Please search again.');
  }

  const payload = decode(encoded);
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) {
    throw quoteError('CAR_QUOTE_EXPIRED', 'This rental quote has expired. Please run the search again.', 409);
  }
  if (payload.v !== 1 || payload.provider !== 'parse-enterprise') {
    throw quoteError('INVALID_CAR_QUOTE', 'This rental quote is not supported. Please search again.');
  }
  return payload;
}

export function carQuoteExpiresAt(token) {
  const payload = verifyCarQuoteToken(token);
  return new Date(payload.exp * 1000).toISOString();
}

export { quoteError };
