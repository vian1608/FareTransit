import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

import assert from 'assert';
import bookingRepository from '../src/modules/bookings/booking.repository.mjs';
import bookingService from '../src/modules/bookings/booking.service.mjs';

async function runPaymentSafetyIsolationTests() {
  console.log('=== RUNNING PAYMENT SAFETY & ISOLATION TESTS ===\n');

  const testId = '11aa22bb-33cc-44dd-55ee-667788990011';
  const initialBooking = {
    id: testId,
    confirmation_code: 'TFS-2026-PAYSAFE',
    passenger_name: 'Isabella Rossellini',
    email: 'isabella@example.com',
    phone: '+1 415-555-0211',
    customer_price: 2400.00,
    total_amount: 2400.00,
    currency: 'USD',
    status: 'PENDING',
    payment_status: 'pending',
    airline_name: 'Emirates',
    airline_code: 'EK',
    itinerary_segments: [
      {
        journey_direction: 'outbound',
        segment_sequence: 1,
        carrier_name: 'Emirates',
        carrier_code: 'EK',
        flight_number: 'EK 202',
        origin_airport: 'JFK',
        destination_airport: 'DXB',
        departure_date: '2026-12-25',
        departure_time: '22:20',
        arrival_date: '2026-12-26',
        arrival_time: '19:30'
      }
    ]
  };

  const createdBooking = await bookingRepository.createBookingRecord(initialBooking);
  const realId = createdBooking?.id || testId;
  await bookingRepository.saveItinerarySegments(realId, initialBooking.itinerary_segments);

  // Test 1: Valid Payment Update — Must succeed cleanly
  console.log('Test 1: Valid payment status & paid amount update...');
  const updatedBooking = await bookingService.updatePayment(realId, {
    paymentStatus: 'paid',
    paidAmount: 2400.00,
    paymentProvider: 'Stripe',
    adminId: 'admin_paysafety'
  });

  assert.strictEqual(updatedBooking.paymentStatus || updatedBooking.payment_status, 'paid');
  assert.strictEqual(updatedBooking.passenger_name, 'Isabella Rossellini');
  console.log('✔ Test 1 Passed: Valid payment update applied cleanly.');

  // Test 2: Attempting Forbidden Domain Mutation — Must throw 400 FORBIDDEN_PAYMENT_UPDATE_FIELD
  console.log('\nTest 2: Rejection of forbidden domain fields in payment payload...');
  try {
    await bookingService.updatePayment(realId, {
      paymentStatus: 'refunded',
      refundedAmount: 500.00,
      airline_name: 'FORBIDDEN_AIRLINE_MUTATION',
      passenger_name: 'HACKER_NAME'
    });
    assert.fail('Should have thrown 400 FORBIDDEN_PAYMENT_UPDATE_FIELD');
  } catch (err) {
    assert.strictEqual(err.code, 'FORBIDDEN_PAYMENT_UPDATE_FIELD');
    console.log(`✔ Test 2 Passed: Forbidden fields correctly rejected (${err.message})`);
  }

  // Test 3: Post-Update Structural Verification — Verify zero side effects on itinerary/passengers
  console.log('\nTest 3: Verifying structural post-update immutability (Flight count, passenger name, total amount)...');
  const finalBooking = await bookingService.getDetailsByCodeOrId(realId);
  const relations = await bookingRepository.getRelations(realId);

  assert.strictEqual(finalBooking.passenger_name, 'Isabella Rossellini', 'Passenger name must be unchanged');
  const finalAmount = parseFloat(finalBooking.amount ?? finalBooking.customer_price ?? finalBooking.total_amount ?? finalBooking.pricing?.total ?? 0);
  assert.strictEqual(finalAmount, 2400.00, 'Booking total amount must be unchanged');
  assert.ok(relations.itinerarySegments.length > 0 || finalBooking.itinerary_segments.length > 0, 'Flight itinerary segments must be intact');

  console.log('✔ Test 3 Passed: Structural verification confirmed zero side effects on flight itinerary, passenger details, and booking total amount.');

  console.log('\n🎉 ALL PAYMENT SAFETY & ISOLATION TESTS PASSED SUCCESSFULLY!\n');
}

runPaymentSafetyIsolationTests().catch(err => {
  console.error('❌ Payment Safety Isolation Test Failed:', err);
  process.exit(1);
});
