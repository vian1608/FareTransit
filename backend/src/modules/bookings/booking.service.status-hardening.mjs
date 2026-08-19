import bookingService from './booking.service.mjs';
import bookingRepository from './booking.repository.mjs';
import './booking.search.current-hardening.mjs';

const ALLOWED_PAYMENT_STATES = new Set(['PENDING', 'PROCESSING', 'PAID', 'FAILED', 'REFUNDED']);

function normalizePaymentState(value, fallback = 'PENDING') {
  const normalized = String(value ?? fallback).trim().toUpperCase();
  if (normalized === 'DRAFT' || normalized === 'AUTHORIZED') {
    return normalized === 'AUTHORIZED' ? 'PROCESSING' : 'PENDING';
  }
  return ALLOWED_PAYMENT_STATES.has(normalized) ? normalized : fallback;
}

if (!bookingService.__canonicalPaymentStateHardening) {
  const originalCreate = bookingService.create.bind(bookingService);
  const originalUpdatePayment = bookingService.updatePayment.bind(bookingService);
  const originalInsertPayment = bookingRepository.insertPayment.bind(bookingRepository);

  // Checkout historically posted lowercase `pending`, while migration 033 now
  // enforces the canonical uppercase payment-state contract. Normalize at the
  // service boundary before booking + payment rows are derived.
  bookingService.create = async (payload = {}) => {
    const requested = payload.paymentStatus ?? payload.payment_status ?? 'PENDING';
    const paymentStatus = normalizePaymentState(requested);
    return originalCreate({
      ...payload,
      paymentStatus,
      payment_status: paymentStatus,
    });
  };

  // Final DB boundary protection: drafts used to emit payment_status='draft'
  // from the legacy service implementation. A draft booking still has a
  // PENDING payment state; DRAFT belongs only to bookings.status.
  bookingRepository.insertPayment = async (paymentRow = {}) => originalInsertPayment({
    ...paymentRow,
    payment_status: normalizePaymentState(paymentRow.payment_status),
  });

  bookingService.updatePayment = async (id, paymentData = {}) => {
    const raw = paymentData.paymentState ?? paymentData.paymentStatus;
    if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
      const normalized = String(raw).trim().toUpperCase();
      if (!ALLOWED_PAYMENT_STATES.has(normalized)) {
        const error = new Error(`Invalid payment status '${raw}'. Allowed payment states are: ${Array.from(ALLOWED_PAYMENT_STATES).join(', ')}. Passenger authorization belongs to booking authorization_status, not payment_status.`);
        error.code = 'INVALID_PAYMENT_STATUS';
        error.status = 400;
        throw error;
      }
      paymentData = { ...paymentData, paymentState: normalized, paymentStatus: normalized };
    }
    return originalUpdatePayment(id, paymentData);
  };

  Object.defineProperty(bookingService, '__canonicalPaymentStateHardening', {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });
}

export { ALLOWED_PAYMENT_STATES, normalizePaymentState };
export default bookingService;
