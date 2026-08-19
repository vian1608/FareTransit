import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  normalizeBookingCreatePayload,
  normalizeBookingCreateRequest
} from '../src/modules/bookings/booking-create-normalization.mjs';
import {
  validateDateOfBirth,
  validatePassportNumber,
  validatePassportExpiry
} from '../src/shared/utils/validationHelpers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '../../');

const departureDate = '2026-09-15';
const passengers = [
  { role: 'adult', firstName: 'Daniel', lastName: 'Miller', dateOfBirth: '1987-03-14', passportNumber: 'X12345678', passportExpiry: '2031-09-18' },
  { role: 'adult', firstName: 'Sophia', lastName: 'Miller', dateOfBirth: '1990-08-22', passportNumber: 'X23456789', passportExpiry: '2032-04-11' },
  { role: 'adult', firstName: 'Michael', lastName: 'Anderson', dateOfBirth: '1984-11-05', passportNumber: 'X34567890', passportExpiry: '2030-12-25' },
  { role: 'child', firstName: 'Ethan', lastName: 'Miller', dateOfBirth: '2017-05-16', passportNumber: 'X45678901', passportExpiry: '2031-06-20' },
  { role: 'child', firstName: 'Emma', lastName: 'Miller', dateOfBirth: '2020-09-27', passportNumber: 'X56789012', passportExpiry: '2032-02-14' },
  { role: 'infant', firstName: 'Noah', lastName: 'Miller', dateOfBirth: '2025-03-08', passportNumber: 'X67890123', passportExpiry: '2030-08-29' }
];

async function run() {
  console.log('--- CUSTOMER BOOKING: 3 ADULT + 2 CHILD + 1 INFANT ---');

  assert.strictEqual(passengers.length, 6);
  assert.strictEqual(passengers.filter(p => p.role === 'adult').length, 3);
  assert.strictEqual(passengers.filter(p => p.role === 'child').length, 2);
  assert.strictEqual(passengers.filter(p => p.role === 'infant').length, 1);

  for (const passenger of passengers) {
    assert.strictEqual(
      validateDateOfBirth(passenger.dateOfBirth, passenger.role, departureDate).valid,
      true,
      `${passenger.firstName} must satisfy ${passenger.role} age rules`
    );
    assert.strictEqual(validatePassportNumber(passenger.passportNumber).valid, true);
    assert.strictEqual(validatePassportExpiry(passenger.passportExpiry, departureDate).valid, true);
  }

  const normalized = normalizeBookingCreatePayload({
    status: 'pending',
    paymentStatus: 'pending',
    passengers
  });
  assert.strictEqual(normalized.status, 'PENDING');
  assert.strictEqual(normalized.paymentStatus, 'PENDING');

  const legacy = normalizeBookingCreatePayload({
    status: 'pending',
    payment_status: 'paid'
  });
  assert.strictEqual(legacy.status, 'PENDING');
  assert.strictEqual(legacy.paymentStatus, 'PAID');
  assert.strictEqual(legacy.payment_status, 'PAID');

  const req = { body: { status: 'pending', paymentStatus: 'pending', passengers } };
  let middlewareError = null;
  normalizeBookingCreateRequest(req, null, (error) => {
    middlewareError = error || null;
  });
  assert.strictEqual(middlewareError, null);
  assert.strictEqual(req.body.status, 'PENDING');
  assert.strictEqual(req.body.paymentStatus, 'PENDING');

  let badStatusError = null;
  try {
    normalizeBookingCreatePayload({ status: 'pending', paymentStatus: 'not-a-real-state' });
  } catch (error) {
    badStatusError = error;
  }
  assert.ok(badStatusError);
  assert.strictEqual(badStatusError.statusCode, 400);
  assert.strictEqual(badStatusError.code, 'INVALID_PAYMENT_STATUS');

  const routeSource = await fs.readFile(
    path.join(ROOT_DIR, 'backend/src/modules/bookings/booking.routes.mjs'),
    'utf8'
  );
  assert.ok(routeSource.includes('normalizeBookingCreateRequest'));
  assert.ok(routeSource.includes('applyVoucherPricingToBooking'));
  assert.ok(routeSource.includes('completeJourneySessionAfterBooking'));
  assert.match(
    routeSource,
    /router\.post\([\s\S]*?'\/'[\s\S]*?bookingRateLimiter[\s\S]*?normalizeBookingCreateRequest[\s\S]*?applyVoucherPricingToBooking[\s\S]*?completeJourneySessionAfterBooking[\s\S]*?bookingController\.create[\s\S]*?\);/
  );

  console.log('✔ Six-passenger validation passed.');
  console.log('✔ Lowercase checkout statuses normalize to canonical uppercase DB states.');
  console.log('✔ Invalid status values return a 400-class validation error.');
  console.log('✔ Voucher pricing and durable journey finalization remain in the booking-create middleware chain.');
}

run().catch((error) => {
  console.error('❌ Customer six-passenger booking regression test failed:', error);
  process.exit(1);
});
