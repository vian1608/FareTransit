import assert from 'assert';
import { bookingRepository } from '../src/modules/bookings/booking.repository.mjs';
import passengerAuthorizationService from '../src/modules/authorizations/passenger-authorization.service.mjs';

console.log('========================================================================');
console.log('  AUTHORIZATION EMAIL ACTIVITY & STATUS SEPARATION TEST SUITE');
console.log('========================================================================\n');

async function runTests() {
  // Setup Test Booking Fixture
  console.log('--- TEST 1: Booking Creation & Email Dispatch ---');
  const testRef = `TFS-TEST-${Date.now().toString().slice(-6)}`;
  const createdBooking = await bookingRepository.createBookingRecord({
    confirmation_code: testRef,
    reference_number: testRef,
    passenger_name: 'Jane Doe',
    contact_email: 'jane.doe@example.com',
    email: 'jane.doe@example.com',
    contact_phone: '+15559990000',
    total_amount: 450.00,
    customer_price: 450.00,
    status: 'PENDING',
    payment_status: 'pending'
  });

  const bookingId = createdBooking.id;
  assert.ok(bookingId, 'Booking fixture must have valid ID');
  console.log(`✓ Fixture created: UUID=${bookingId}, Reference=${testRef}`);

  // Create Auth Record Token
  const authRecord = await passengerAuthorizationService.createAuthorizationToken(createdBooking, {
    authorizedAmount: 450.00,
    currency: 'USD',
    cardBrand: 'Visa',
    cardLast4: '4242'
  });
  const token = authRecord.token;
  assert.ok(token, 'Authorization token must exist');

  // Dispatch Email and save email activity log
  const emailLog = await bookingRepository.saveEmailActivity(bookingId, {
    template_type: 'AUTHORIZATION_EMAIL',
    status: 'SENT',
    provider_message_id: 're_test_msg_98765',
    recipient: 'jane.doe@example.com',
    sent_at: new Date().toISOString()
  });

  assert.strictEqual(emailLog.status, 'SENT', 'Email log status must be SENT');
  assert.strictEqual(emailLog.provider_message_id, 're_test_msg_98765', 'Provider message ID must match');
  console.log('✓ TEST 1 PASSED: Email activity saved with provider ID.\n');

  // TEST 2: Dual-Identifier Lookup (UUID & Booking Reference)
  console.log('--- TEST 2: Dual-Identifier Lookup (UUID vs Reference Number) ---');
  const bookingByUuid = await bookingRepository.getCompleteBookingById(bookingId);
  const bookingByRef = await bookingRepository.getCompleteBookingById(testRef);

  assert.ok(bookingByUuid, 'Lookup by UUID must return booking');
  assert.ok(bookingByRef, 'Lookup by Reference Code must return booking');

  assert.strictEqual(bookingByUuid.authorization_email_status, 'SENT', 'UUID lookup must show authorization_email_status = SENT');
  assert.strictEqual(bookingByRef.authorization_email_status, 'SENT', 'Ref lookup must show authorization_email_status = SENT');
  assert.strictEqual(bookingByUuid.authorization_email_id, 're_test_msg_98765', 'UUID lookup provider ID must match');
  assert.strictEqual(bookingByRef.authorization_email_id, 're_test_msg_98765', 'Ref lookup provider ID must match');

  assert.strictEqual(bookingByUuid.emailActivity.count, 1, 'Email activity count must be 1');
  assert.strictEqual(bookingByRef.emailActivity.count, 1, 'Email activity count must be 1');

  console.log('✓ TEST 2 PASSED: Dual-identifier lookup returns consistent email activity.\n');

  // TEST 3: Passenger Authorization Acceptance & Status Preservation
  console.log('--- TEST 3: Passenger Accepts Authorization — Email Status Preservation ---');
  const acceptResult = await passengerAuthorizationService.acceptAuthorization({
    token: token,
    acceptedCheckboxText: 'I confirm that the passenger names, itinerary, dates, fare, fees and contact information shown above are correct.',
    clientIp: '198.51.100.42',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)'
  });

  assert.strictEqual(acceptResult.success, true, 'Acceptance must succeed');
  assert.strictEqual(acceptResult.status, 'AUTHORIZED', 'Result status must be AUTHORIZED');

  // Refetch booking details after authorization completion
  const refreshedBooking = await bookingRepository.getCompleteBookingById(bookingId);

  // CRITICAL AUDIT: authorization_status must be AUTHORIZED, BUT authorization_email_status & provider ID MUST BE PRESERVED!
  assert.strictEqual(refreshedBooking.authorization_status, 'AUTHORIZED', 'authorization_status must be AUTHORIZED');
  assert.strictEqual(refreshedBooking.authorization_email_status, 'SENT', 'authorization_email_status MUST REMAINS SENT (NOT NOT_SENT)');
  assert.strictEqual(refreshedBooking.authorization_email_id, 're_test_msg_98765', 'authorization_email_id MUST BE PRESERVED');
  assert.ok(refreshedBooking.authorization.authorizedAt, 'authorizedAt timestamp must be recorded');
  assert.strictEqual(refreshedBooking.emailActivity.authorization.status, 'SENT', 'emailActivity.authorization.status must remain SENT');
  assert.strictEqual(refreshedBooking.emailActivity.count, 1, 'Email activity count must remain 1');

  console.log('✓ TEST 3 PASSED: Passenger authorization completed successfully without overwriting email activity log.\n');

  console.log('🎉 ALL AUTHORIZATION EMAIL ACTIVITY & STATUS SEPARATION TESTS PASSED!\n');
}

runTests().catch((err) => {
  console.error('❌ Test Suite Failed:', err);
  process.exit(1);
});
