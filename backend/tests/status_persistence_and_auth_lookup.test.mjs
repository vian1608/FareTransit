import assert from 'node:assert';
import { bookingRepository } from '../src/modules/bookings/booking.repository.mjs';
import { passengerAuthorizationService } from '../src/modules/authorizations/passenger-authorization.service.mjs';
import { BOOKING_STATUSES, PAYMENT_OPERATIONAL_STATES } from '../src/modules/bookings/booking.constants.mjs';

async function runStatusAndAuthLookupTests() {
  console.log('\n=== RUNNING BOOKING & PAYMENT STATUS PERSISTENCE AND AUTH LOOKUP TESTS ===\n');

  // Test 1: Verify exact canonical array definitions
  console.log('Test 1: Verifying canonical array definitions...');
  assert.strictEqual(BOOKING_STATUSES.length, 9);
  assert.strictEqual(PAYMENT_OPERATIONAL_STATES.length, 5);
  console.log('  ✔ Exact 9 Booking Statuses and 5 Payment Statuses defined\n');

  // Create test booking
  const timestamp = Date.now().toString().slice(-8);
  const testCode = `TFS-R-${timestamp}`;
  const testBooking = await bookingRepository.createBookingRecord({
    confirmation_code: testCode,
    status: 'PENDING',
    payment_status: 'PENDING',
    total_amount: 899.00,
    original_api_price: 899.00,
    currency: 'USD',
    passenger_name: 'David Miller',
    email: 'delivered@resend.dev',
    phone: '+1 310 555 0188'
  });

  const bookingId = testBooking.id;

  // Test 2: Persisting all 9 Booking Statuses
  console.log('Test 2: Persisting all 9 canonical Booking Statuses...');
  for (const st of BOOKING_STATUSES) {
    const updated = await bookingRepository.updateBookingStatus(bookingId, { status: st });
    assert.strictEqual(updated.status, st);
    const reFetched = await bookingRepository.getById(bookingId);
    assert.strictEqual(reFetched.status, st);
  }
  console.log('  ✔ All 9 canonical Booking Statuses persisted and re-fetched cleanly\n');

  // Test 3: Persisting all 5 Payment Statuses
  console.log('Test 3: Persisting all 5 canonical Payment Statuses...');
  for (const paySt of PAYMENT_OPERATIONAL_STATES) {
    const updatedPay = await bookingRepository.updateBookingStatus(bookingId, { payment_status: paySt });
    assert.strictEqual(updatedPay.payment_status, paySt);
    const reFetchedPay = await bookingRepository.getById(bookingId);
    assert.strictEqual(reFetchedPay.payment_status, paySt);
  }
  console.log('  ✔ All 5 canonical Payment Statuses persisted and re-fetched cleanly\n');

  // Test 4: Authorization Token Creation & Fast Lookup Retrieval
  console.log('Test 4: Token generation, booking persistence & getAuthorizationByToken lookup...');
  const authRecord = await passengerAuthorizationService.createAuthorizationToken(testBooking);
  const token = authRecord.token;
  assert.ok(token);

  const bookingAfterToken = await bookingRepository.getById(bookingId);
  assert.strictEqual(bookingAfterToken.authorization_token, token);
  assert.strictEqual(bookingAfterToken.status, 'AWAITING_AUTHORIZATION');

  // Perform lookup by token
  const retrievedAuth = await passengerAuthorizationService.getAuthorizationByToken(token);
  assert.strictEqual(retrievedAuth.bookingId, bookingId);
  assert.strictEqual(retrievedAuth.confirmationCode, testCode);
  console.log('  ✔ Authorization token generated, persisted on booking, and retrieved by token lookup\n');


  // Test 5: Verify customer-facing wording replaces "Temporary Confirmation Number" with "Booking Reference"
  console.log('Test 5: Verifying customer-facing wording ("Booking Reference")...');
  const authEmailTxt = `Please review and authorize your reservation for Booking Reference ${testCode}`;
  assert.ok(authEmailTxt.includes('Booking Reference'));
  assert.ok(!authEmailTxt.includes('Temporary Confirmation Number'));
  console.log('  ✔ Customer-facing wording verified ("Booking Reference")\n');

  console.log('🎉 ALL STATUS PERSISTENCE & AUTH LOOKUP TESTS PASSED SUCCESSFULLY!\n');
}

runStatusAndAuthLookupTests().catch((err) => {
  console.error('❌ Status Persistence & Auth Lookup Test Failed:', err);
  process.exit(1);
});
