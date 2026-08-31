import { BOOKING_STATUSES, PAYMENT_STATUSES } from './booking.constants.mjs';

const bookingStatusSet = new Set(BOOKING_STATUSES);
const paymentStatusSet = new Set(PAYMENT_STATUSES);

function createValidationError(message, code) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = code;
  error.expose = true;
  return error;
}

function canonicalizeStatus(value, fallback, allowedValues, label, code) {
  const normalized = String(value ?? fallback).trim().toUpperCase();
  if (!allowedValues.has(normalized)) {
    throw createValidationError(`Invalid ${label}: ${String(value ?? '').trim() || '(empty)'}.`, code);
  }
  return normalized;
}

/**
 * Normalize customer-created bookings at the API boundary so downstream
 * persistence always receives canonical booking/payment states. The public
 * checkout records manual masked card metadata only and does not select or
 * invoke a payment gateway.
 */
export function normalizeBookingCreatePayload(payload = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw createValidationError('Booking request body must be a JSON object.', 'INVALID_BOOKING_REQUEST');
  }

  const normalized = { ...payload };
  normalized.status = canonicalizeStatus(
    payload.status,
    'PENDING',
    bookingStatusSet,
    'booking status',
    'INVALID_BOOKING_STATUS'
  );

  const rawPaymentStatus = payload.paymentStatus ?? payload.payment_status;
  normalized.paymentStatus = canonicalizeStatus(
    rawPaymentStatus,
    'PENDING',
    paymentStatusSet,
    'payment status',
    'INVALID_PAYMENT_STATUS'
  );

  if (Object.prototype.hasOwnProperty.call(payload, 'payment_status')) {
    normalized.payment_status = normalized.paymentStatus;
  }

  // Older frontends may still send a provider field. Public FareTransit
  // checkout is gateway-neutral; never persist a third-party provider here.
  if (
    Object.prototype.hasOwnProperty.call(payload, 'payment_provider')
    || Object.prototype.hasOwnProperty.call(payload, 'paymentProvider')
  ) {
    normalized.payment_provider = 'manual';
    normalized.paymentProvider = 'manual';
  }

  return normalized;
}

export function normalizeBookingCreateRequest(req, res, next) {
  try {
    req.body = normalizeBookingCreatePayload(req.body || {});
    next();
  } catch (error) {
    next(error);
  }
}

export default normalizeBookingCreateRequest;
