import assert from 'assert';
import { bookingRepository } from '../src/modules/bookings/booking.repository.mjs';
import { sendPassengerAuthorizationEmail } from '../src/integrations/resend/resend.service.mjs';

console.log('========================================================================');
console.log('  PAYMENT AUTHORIZATION SPLITS PERSISTENCE & EMAIL TEST SUITE');
console.log('========================================================================\n');

async function runTests() {
  // TEST 1: Dual-Identifier Persistence (Save by Ref, Query by UUID)
  console.log('--- TEST 1: Dual-Identifier Split Persistence & Hard Refresh Simulation ---');
  const testRef = `TFS-SPLIT-${Date.now().toString().slice(-6)}`;
  const createdBooking = await bookingRepository.createBookingRecord({
    confirmation_code: testRef,
    reference_number: testRef,
    passenger_name: 'John Merchant',
    contact_email: 'john.merchant@example.com',
    email: 'john.merchant@example.com',
    total_amount: 500.00,
    customer_price: 500.00,
    authorized_amount: 500.00,
    status: 'PENDING',
    payment_status: 'pending'
  });

  const realId = createdBooking.id;
  assert.ok(realId, 'Booking fixture must have valid UUID');

  // Save splits using confirmation code (simulating admin dashboard request with ref code)
  const splitsToSave = [
    { merchant_name: 'FareTransit LLC', amount: 100.00, currency: 'USD' },
    { merchant_name: 'Frontier Airlines', amount: 400.00, currency: 'USD' }
  ];

  await bookingRepository.savePaymentSplits(testRef, splitsToSave);
  console.log(`✓ Saved 2 splits under reference code ${testRef}`);

  // Query splits using internal UUID (simulating email sender lookup)
  const fetchedSplitsByUuid = await bookingRepository.getPaymentSplits(realId);
  assert.strictEqual(fetchedSplitsByUuid.length, 2, 'Fetched splits by UUID must return 2 rows');
  assert.strictEqual(fetchedSplitsByUuid[0].merchant_name, 'FareTransit LLC');
  assert.strictEqual(fetchedSplitsByUuid[1].merchant_name, 'Frontier Airlines');
  assert.strictEqual(fetchedSplitsByUuid[0].amount, 100.00);
  assert.strictEqual(fetchedSplitsByUuid[1].amount, 400.00);

  // Query splits using reference code again
  const fetchedSplitsByRef = await bookingRepository.getPaymentSplits(testRef);
  assert.strictEqual(fetchedSplitsByRef.length, 2, 'Fetched splits by Reference Code must return 2 rows');

  console.log('✓ TEST 1 PASSED: Dual-identifier lookup returns consistent split rows.\n');

  // TEST 2: Email Send without Frontend Payload (Backend fetches fresh DB splits)
  console.log('--- TEST 2: Authorization Email Dispatch using Fresh Database Splits ---');

  // Add dummy itinerary segment so itinerary protection check passes
  const memorySegs = [
    {
      booking_id: realId,
      journey_direction: 'outbound',
      direction: 'outbound',
      carrier_name: 'Frontier Airlines',
      flight_number: 'F9-101',
      origin_airport: 'JFK',
      destination_airport: 'MIA',
      departure_date: '2026-09-01',
      arrival_date: '2026-09-01'
    }
  ];
  await bookingRepository._persistToFlightsTable(realId, memorySegs);

  // Call sendPassengerAuthorizationEmail passing ONLY the booking ID
  const emailResult = await sendPassengerAuthorizationEmail(realId);
  assert.strictEqual(emailResult.success, true, `Email dispatch must succeed. Got error: ${emailResult.error}`);
  assert.ok(emailResult.emailId, 'Email ID must be returned');
  console.log(`✓ TEST 2 PASSED: Email dispatched cleanly using persisted splits (MessageId=${emailResult.emailId}).\n`);

  // TEST 3: Missing Payment Splits Test
  console.log('--- TEST 3: Missing Payment Splits Error Handling ---');
  const emptyBookingRef = `TFS-EMPTY-${Date.now().toString().slice(-6)}`;
  const emptyBooking = await bookingRepository.createBookingRecord({
    confirmation_code: emptyBookingRef,
    passenger_name: 'No Split User',
    email: 'nosplit@example.com',
    total_amount: 300.00,
    status: 'PENDING'
  });
  await bookingRepository._persistToFlightsTable(emptyBooking.id, memorySegs);

  const missingResult = await sendPassengerAuthorizationEmail(emptyBooking.id);
  assert.strictEqual(missingResult.success, false, 'Missing splits must block email dispatch');
  assert.ok(
    missingResult.error.includes('No saved payment split breakdown exists'),
    `Error must contain clear missing message. Got: ${missingResult.error}`
  );
  console.log('✓ TEST 3 PASSED: Missing splits returns precise error message.\n');

  // TEST 4: Split Total Mismatch Test
  console.log('--- TEST 4: Split Total Mismatch Error Handling ---');
  const mismatchRef = `TFS-MISMATCH-${Date.now().toString().slice(-6)}`;
  const mismatchBooking = await bookingRepository.createBookingRecord({
    confirmation_code: mismatchRef,
    passenger_name: 'Mismatch User',
    email: 'mismatch@example.com',
    total_amount: 500.00,
    customer_price: 500.00,
    authorized_amount: 500.00,
    status: 'PENDING'
  });
  await bookingRepository._persistToFlightsTable(mismatchBooking.id, memorySegs);

  // Save splits totaling $490.00 for an authorized amount of $500.00
  await bookingRepository.savePaymentSplits(mismatchBooking.id, [
    { merchant_name: 'Merchant A', amount: 200.00 },
    { merchant_name: 'Merchant B', amount: 290.00 }
  ]);
  // Re-set authorized_amount on mismatch booking to $500.00 to force mismatch check
  await bookingRepository.updateBookingStatus(mismatchBooking.id, { authorized_amount: 500.00 });

  const mismatchResult = await sendPassengerAuthorizationEmail(mismatchBooking.id);
  assert.strictEqual(mismatchResult.success, false, 'Mismatch total must block email dispatch');
  assert.ok(
    mismatchResult.error.includes('Saved payment split total ($490.00) does not match the authorized amount ($500.00)'),
    `Error must state exact mismatch totals. Got: ${mismatchResult.error}`
  );
  console.log('✓ TEST 4 PASSED: Split total mismatch returns exact decimal amounts.\n');

  console.log('🎉 ALL PAYMENT AUTHORIZATION SPLITS TESTS PASSED SUCCESSFULLY!\n');
}

runTests().catch((err) => {
  console.error('❌ Test Suite Failed:', err);
  process.exit(1);
});
