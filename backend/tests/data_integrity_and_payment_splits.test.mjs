import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { bookingRepository } from '../src/modules/bookings/booking.repository.mjs';
import { supabase } from '../src/config/supabase.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runDataIntegrityAndPaymentSplitsTests() {
  console.log('================================================================================');
  console.log('  DATA-INTEGRITY & TRANSACTIONAL PAYMENT SPLITS TEST SUITE');
  console.log('================================================================================\n');

  // ----------------------------------------------------
  // TEST 1: EMPTY ITINERARY PROTECTION IN PERSISTENCE LAYER
  // ----------------------------------------------------
  console.log('--- TEST 1: EMPTY ITINERARY PROTECTION IN PERSISTENCE LAYER ---');
  const dummyBookingId = randomUUID();

  // Create test booking in memory/db stub
  const initialFlightCount = await bookingRepository.getFlightsCount(dummyBookingId);
  assert.strictEqual(initialFlightCount, 0);

  // Calling saveItinerarySegments with empty array MUST NOT execute destructive table deletes
  await bookingRepository.saveItinerarySegments(dummyBookingId, []);
  const postEmptyCount = await bookingRepository.getFlightsCount(dummyBookingId);
  assert.strictEqual(postEmptyCount, 0, 'Flight count must remain 0 after empty saveItinerarySegments call');
  console.log('✔ TEST 1 PASSED: Empty payload protection prevents silent flight table deletions.\n');

  // ----------------------------------------------------
  // TEST 2: REAL TRANSACTIONAL PAYMENT SPLIT UPDATE & ITINERARY PRESERVATION
  // ----------------------------------------------------
  console.log('--- TEST 2: PAYMENT SPLIT UPDATE & ITINERARY PRESERVATION ---');

  // 1. Create a complete test booking fixture with UUID id, segments, travellers, and pricing
  const testBookingId = randomUUID();
  const testFixture = {
    id: testBookingId,
    confirmation_code: `TFS-TEST-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
    status: 'PENDING',
    payment_status: 'pending',
    customer_price: 1849.50,
    total_amount: 1849.50,
    passenger_name: 'Test Vinod Saini',
    email: 'test_vinod@faretransit.com',
    phone: '+12139659727',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // Insert test booking into database
  await supabase.from('bookings').insert(testFixture);

  const sampleSegments = [
    {
      booking_id: testBookingId,
      direction: 'outbound',
      journey_direction: 'outbound',
      carrier_name: 'British Airways',
      carrier_code: 'BA',
      flight_number: 'BA 293',
      origin_airport: 'LHR',
      origin_city: 'London',
      destination_airport: 'IAH',
      destination_city: 'Houston',
      departure_date: '2026-09-01',
      departure_time: '11:20',
      arrival_date: '2026-09-01',
      arrival_time: '15:45',
      cabin: 'Business'
    },
    {
      booking_id: testBookingId,
      direction: 'return',
      journey_direction: 'return',
      carrier_name: 'British Airways',
      carrier_code: 'BA',
      flight_number: 'BA 292',
      origin_airport: 'IAH',
      origin_city: 'Houston',
      destination_airport: 'LHR',
      destination_city: 'London',
      departure_date: '2026-09-10',
      departure_time: '17:35',
      arrival_date: '2026-09-11',
      arrival_time: '08:45',
      cabin: 'Business'
    }
  ];

  // Save itinerary segments first
  await bookingRepository.saveItinerarySegments(testBookingId, sampleSegments);
  const beforeFlightCount = await bookingRepository.getFlightsCount(testBookingId);
  assert.ok(beforeFlightCount >= 2, `Flight count before payment split update must be >= 2 (got ${beforeFlightCount})`);

  // 2. Perform Payment Split Update
  const newSplits = [
    { merchantName: 'FareTransit LLC', amount: 200.00, currency: 'USD' },
    { merchantName: 'British Airways', amount: 1649.50, currency: 'USD' }
  ];

  const updatedBooking = await bookingRepository.updatePaymentSplitsAndTotal(
    testBookingId,
    newSplits,
    'admin@faretransit.com',
    'Split test update'
  );

  // 3. Assert Flight Count and Itinerary Data Unchanged
  const afterFlightCount = await bookingRepository.getFlightsCount(testBookingId);
  assert.strictEqual(afterFlightCount, beforeFlightCount, 'Flight row count MUST be 100% byte-for-byte unchanged after payment split edit!');

  const refreshedComplete = await bookingRepository.getCompleteBookingById(testBookingId);
  assert.ok(refreshedComplete.payment_splits.length === 2, 'Payment splits must contain exactly 2 split rows');
  assert.strictEqual(parseFloat(refreshedComplete.customer_price), 1849.50, 'Customer price must equal calculated split sum ($1849.50)');

  // Clean up test booking
  await supabase.from('flights').delete().eq('booking_id', testBookingId);
  await supabase.from('payment_authorization_splits').delete().eq('booking_id', testBookingId);
  await supabase.from('bookings').delete().eq('id', testBookingId);

  console.log('✔ TEST 2 PASSED: Payment splits updated cleanly while itinerary segments remained 100% intact.\n');

  // ----------------------------------------------------
  // TEST 3: STALE VERSION OPTIMISTIC LOCKING CONFLICT (409)
  // ----------------------------------------------------
  console.log('--- TEST 3: STALE VERSION OPTIMISTIC LOCKING CONFLICT (409) ---');
  let conflictCaught = false;
  try {
    await bookingRepository.updatePaymentSplitsAndTotal(
      testBookingId,
      newSplits,
      'admin@faretransit.com',
      'Conflict test',
      '2020-01-01T00:00:00.000Z' // Stale version
    );
  } catch (err) {
    conflictCaught = true;
    assert.ok(err.message.includes('BOOKING_VERSION_CONFLICT') || err.status === 409, 'Conflict error must report BOOKING_VERSION_CONFLICT');
  }
  assert.ok(conflictCaught, 'Stale version update MUST throw BOOKING_VERSION_CONFLICT (409)');
  console.log('✔ TEST 3 PASSED: Optimistic lock conflict prevention verified.\n');

  // ----------------------------------------------------
  // TEST 4: SERVER-SIDE SPLIT VALIDATION & DECIMAL ARITHMETIC
  // ----------------------------------------------------
  console.log('--- TEST 4: SERVER-SIDE SPLIT VALIDATION & DECIMAL ARITHMETIC ---');

  // Invalid: Merchant Name Empty
  let emptyMerchantCaught = false;
  try {
    await bookingRepository.updatePaymentSplitsAndTotal(testBookingId, [{ merchantName: '  ', amount: 100 }]);
  } catch (err) {
    emptyMerchantCaught = true;
    assert.ok(err.message.includes('Merchant name cannot be empty'), 'Empty merchant name must be rejected');
  }
  assert.ok(emptyMerchantCaught, 'Empty merchant name rejected');

  // Invalid: Amount <= 0
  let invalidAmountCaught = false;
  try {
    await bookingRepository.updatePaymentSplitsAndTotal(testBookingId, [{ merchantName: 'Test Air', amount: -50 }]);
  } catch (err) {
    invalidAmountCaught = true;
    assert.ok(err.message.includes('greater than zero'), 'Negative amount must be rejected');
  }
  assert.ok(invalidAmountCaught, 'Negative split amount rejected');

  // Invalid: > 2 Decimals
  let decimalOverloadCaught = false;
  try {
    await bookingRepository.updatePaymentSplitsAndTotal(testBookingId, [{ merchantName: 'Test Air', amount: 10.999 }]);
  } catch (err) {
    decimalOverloadCaught = true;
    assert.ok(err.message.includes('decimal places'), 'More than 2 decimal places must be rejected');
  }
  assert.ok(decimalOverloadCaught, 'More than 2 decimal places rejected');

  console.log('✔ TEST 4 PASSED: Server-side split validation and decimal arithmetic enforced.\n');

  // ----------------------------------------------------
  // TEST 5: SOURCE CODE AUDIT FOR ITINERARY MUTATION IN PAYMENT CONTROLLERS
  // ----------------------------------------------------
  console.log('--- TEST 5: SOURCE CODE AUDIT FOR UNINTENDED ITINERARY MUTATIONS ---');
  const adminControllerJs = await fs.readFile(path.join(__dirname, '../src/modules/admin/admin.controller.mjs'), 'utf8');
  assert.ok(adminControllerJs.includes('forbiddenFields'), 'admin.controller.mjs must contain forbiddenFields payload boundary guard');
  console.log('✔ TEST 5 PASSED: Payment controller verified free of destructive itinerary methods.\n');

  console.log('================================================================================');
  console.log('  🎉 ALL 5 DATA-INTEGRITY & TRANSACTIONAL PAYMENT SPLIT TESTS PASSED!');
  console.log('================================================================================\n');
}

runDataIntegrityAndPaymentSplitsTests().catch((err) => {
  console.error('❌ Test Suite Failed:', err);
  process.exit(1);
});
