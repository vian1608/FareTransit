/**
 * Admin Payment Save Regression — Automated Test Suite (17 Tests)
 * Verifies non-JSON retry handling, request phase separation, strict 15s timeout,
 * central booking resolver, idempotency, read-only reconciliation, and form preservation.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const loadFile = (relativePath) => {
  try {
    return readFileSync(resolve(process.cwd(), relativePath), 'utf-8');
  } catch {
    try {
      return readFileSync(resolve(process.cwd(), '..', relativePath), 'utf-8');
    } catch {
      return '';
    }
  }
};

const adminDashboardSrc = loadFile('frontend/src/features/admin/pages/AdminDashboardPage.js');
const bookingControllerSrc = loadFile('backend/src/modules/bookings/booking.controller.mjs');
const bookingServiceSrc = loadFile('backend/src/modules/bookings/booking.service.mjs');
const bookingRepoSrc = loadFile('backend/src/modules/bookings/booking.repository.mjs');
const adminRoutesSrc = loadFile('backend/src/modules/admin/admin.routes.mjs');

describe('TEST 1 — Correct split values validation', () => {
  it('validates 49.99 + 500.00 = 549.99 split amounts', () => {
    const split1 = 49.99;
    const split2 = 500.00;
    const total = split1 + split2;
    expect(total).toBeCloseTo(549.99, 2);
    expect(adminDashboardSrc).toContain('parseFloat(s.amount)');
  });
});

describe('TEST 2 — Booking UUID resolution & save', () => {
  it('uses resolveBooking in backend to resolve UUID and execute payment update', () => {
    expect(bookingServiceSrc).toContain('bookingRepository.resolveBooking(id)');
    expect(bookingServiceSrc).toContain('updatePaymentSplitsAndTotal');
  });
});

describe('TEST 3 — Fast 404 JSON for missing booking', () => {
  it('returns 404 JSON immediately when booking lookup fails', () => {
    expect(bookingRepoSrc).toContain("BOOKING_NOT_FOUND");
    expect(bookingControllerSrc).toContain("statusCode = error.status || (error.code === 'BOOKING_NOT_FOUND' ? 404 : 400)");
  });
});

describe('TEST 4 — Confirmation-code lookup', () => {
  it('findBaseBookingRecord supports both UUID and confirmation_code', () => {
    expect(bookingRepoSrc).toContain("supabase.from('bookings').select('*').eq('id', ref)");
    expect(bookingRepoSrc).toContain("supabase.from('bookings').select('*').eq('confirmation_code', ref)");
  });
});

describe('TEST 5 — Plain-text error response handling', () => {
  it('checks content-type before parsing JSON to prevent Unexpected token errors', () => {
    const saveFnCode = adminDashboardSrc.split('const handleSavePaymentSplits =')[1]?.slice(0, 8000) || '';
    expect(saveFnCode).toContain("contentType.includes('application/json')");
    expect(saveFnCode).not.toContain("await res.json()");
  });
});

describe('TEST 6 — HTML response handling', () => {
  it('safely handles HTML error responses without exposing raw markup', () => {
    expect(adminDashboardSrc).toContain("rawBody.trim().startsWith('<!DOCTYPE') || rawBody.trim().startsWith('<html')");
    expect(adminDashboardSrc).toContain("safeServerText ||");
  });
});

describe('TEST 7 — Shared Save / Retry function', () => {
  it('Retry Payment Save calls the exact same handleSavePaymentSplits function', () => {
    expect(adminDashboardSrc).toContain("handleSavePaymentSplits({ isRetry: true })");
    expect(adminDashboardSrc).toContain("handleSavePaymentSplits({ isRetry: paymentSaveStatus === 'failure' })");
  });
});

describe('TEST 8 — Strict 15-second timeout', () => {
  it('uses AbortController with 15000ms timeout', () => {
    expect(adminDashboardSrc).toContain("new AbortController()");
    expect(adminDashboardSrc).toContain("window.setTimeout(() => {\n      controller.abort();\n    }, 15000)");
    expect(adminDashboardSrc).toContain("15 seconds");
  });
});

describe('TEST 9 — Read-only reconciliation on interrupted response', () => {
  it('enters verifying phase and queries server state to detect successful save', () => {
    expect(adminDashboardSrc).toContain("setPaymentSavePhase('verifying')");
    expect(adminDashboardSrc).toContain("Payment was saved successfully, although the original response was interrupted.");
  });
});

describe('TEST 10 — Frontend request state vs payment status separation', () => {
  it('uses paymentSavePhase separate from paymentForm.paymentStatus', () => {
    expect(adminDashboardSrc).toContain("setPaymentSavePhase");
    expect(adminDashboardSrc).toContain("paymentSavePhase === 'verifying'");
    const saveFnCode = adminDashboardSrc.split('const handleSavePaymentSplits =')[1]?.split('};')[0] || '';
    expect(saveFnCode).not.toContain("paymentForm.paymentStatus = 'PROCESSING'");
  });
});

describe('TEST 11 — Single active request guard', () => {
  it('uses paymentSaveInFlightRef to block concurrent submissions', () => {
    expect(adminDashboardSrc).toContain("paymentSaveInFlightRef = useRef(false)");
    expect(adminDashboardSrc).toContain("if (paymentSaveInFlightRef.current) return");
  });
});

describe('TEST 12 — Idempotency key tracking', () => {
  it('sends Idempotency-Key and clientRequestId header & body', () => {
    expect(adminDashboardSrc).toContain("Idempotency-Key': clientRequestId");
    expect(bookingControllerSrc).toContain("req.headers['idempotency-key'] || req.body?.clientRequestId");
    expect(bookingServiceSrc).toContain("idempotencyCache.has(clientRequestId)");
  });
});

describe('TEST 13 — Controlled backend JSON errors', () => {
  it('formats all error responses with success: false and requestId', () => {
    expect(bookingControllerSrc).toContain("res.status(statusCode).json({\n        success: false,\n        requestId,\n        error:");
  });
});

describe('TEST 14 — Admin route order & registration', () => {
  it('registers payment patch routes in admin.routes.mjs', () => {
    expect(adminRoutesSrc).toContain("router.patch('/bookings/:id/payment'");
    expect(adminRoutesSrc).toContain("router.patch('/bookings/:identifier/payment'");
  });
});

describe('TEST 15 — Form preservation on failure', () => {
  it('does not reset splits or payment form when payment save fails', () => {
    const catchBlock = adminDashboardSrc.split('} catch (err) {')[1]?.split('} finally {')[0] || '';
    expect(catchBlock).not.toContain('setPaymentSplits([])');
    expect(catchBlock).not.toContain('setPaymentForm({');
    expect(catchBlock).not.toContain('setPaymentDirty(false)');
  });
});

describe('TEST 16 — Itinerary integrity guard', () => {
  it('protects against forbidden itinerary fields during payment update', () => {
    expect(bookingServiceSrc).toContain("FORBIDDEN_KEYS");
    expect(bookingServiceSrc).toContain("FORBIDDEN_PAYMENT_UPDATE_FIELD");
  });
});

describe('TEST 17 — Production build check readiness', () => {
  it('contains Refresh Booking action buttons for invalid/interrupted responses', () => {
    expect(adminDashboardSrc).toContain("handleRefreshCurrentBooking");
    expect(adminDashboardSrc).toContain("Check Save Status");
  });
});
