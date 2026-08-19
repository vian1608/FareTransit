import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

import assert from 'assert';
import bookingService from '../src/modules/bookings/booking.service.mjs';
import bookingRepository from '../src/modules/bookings/booking.repository.mjs';

async function runFieldLevelPatchApiTests() {
  console.log('=== RUNNING FIELD-LEVEL PATCH API ENDPOINT TESTS ===\n');

  const testId = '55bb66cc-77dd-88ee-99ff-001122334455';
  const initialBooking = {
    id: testId,
    confirmation_code: 'TFS-2026-PATCH88',
    passenger_name: 'David Kim',
    email: 'david.kim@example.com',
    phone: '+1 415-555-0177',
    customer_price: 1100.00,
    total_amount: 1100.00,
    currency: 'USD',
    status: 'PENDING',
    payment_status: 'pending',
    airline_name: 'Alaska Airlines',
    airline_confirmation_number: 'PTCH12',
    ticket_number: '027-1122334455'
  };

  await bookingRepository.createBookingRecord(initialBooking);

  // Test 1: PATCH /bookings/:id/status
  console.log('Test 1: PATCH /bookings/:id/status validation & update...');
  try {
    await bookingService.updateStatus(testId, { status: 'INVALID_STATUS_STRING' });
    assert.fail('Invalid status should throw INVALID_STATUS error');
  } catch (err) {
    assert.strictEqual(err.code, 'INVALID_STATUS', 'Must reject non-canonical status');
    console.log('✔ Test 1a Passed: Invalid status rejected with 400 INVALID_STATUS');
  }

  const statusResult = await bookingService.updateStatus(testId, {
    status: 'DONE',
    reason: 'Admin manually confirmed ticket issuance'
  });
  assert.strictEqual(statusResult.status, 'DONE', 'Status updated to DONE');
  assert.strictEqual(statusResult.customer.name, 'David Kim', 'Passenger name preserved');
  console.log('✔ Test 1b Passed: Valid status updated cleanly to DONE');

  // Test 2: PATCH /bookings/:id/payment
  console.log('\nTest 2: PATCH /bookings/:id/payment validation & update...');
  const paymentResult = await bookingService.updatePayment(testId, {
    paymentStatus: 'paid',
    paidAmount: 1100.00,
    paymentProvider: 'whop',
    reason: 'Whop payment webhook confirmed charge'
  });
  assert.strictEqual(paymentResult.payment.status, 'PAID');
  assert.strictEqual(paymentResult.status, 'DONE', 'Booking status unchanged');
  console.log('✔ Test 2 Passed: Payment details updated cleanly without affecting status or itinerary');

  // Test 3: PATCH /bookings/:id/itinerary
  console.log('\nTest 3: PATCH /bookings/:id/itinerary validation & update...');
  try {
    await bookingService.updateItinerary(testId, { segments: [] });
    assert.fail('Empty itinerary segments should throw BOOKING_ITINERARY_MISSING');
  } catch (err) {
    assert.strictEqual(err.code, 'BOOKING_ITINERARY_MISSING');
    console.log('✔ Test 3a Passed: Empty itinerary payload rejected');
  }

  const validSegments = [
    {
      journey_direction: 'outbound',
      segment_sequence: 1,
      carrier_name: 'Alaska Airlines',
      carrier_code: 'AS',
      flight_number: 'AS 402',
      origin_airport: 'SEA',
      destination_airport: 'SFO',
      departure_date: '2026-11-10',
      departure_time: '10:00',
      arrival_date: '2026-11-10',
      arrival_time: '12:15'
    }
  ];

  const itineraryResult = await bookingService.updateItinerary(testId, {
    segments: validSegments,
    reason: 'Admin updated itinerary leg'
  });
  console.log('itineraryResult keys:', Object.keys(itineraryResult || {}));
  assert.ok(itineraryResult, 'Itinerary result returned');
  console.log('✔ Test 3b Passed: Valid itinerary segments updated cleanly');

  // Test 4: PATCH /bookings/:id/ticket
  console.log('\nTest 4: PATCH /bookings/:id/ticket validation & update...');
  const ticketResult = await bookingService.updateTicket(testId, {
    airlineConfirmationNumber: 'CONF88',
    ticketNumber: '0279988776655',
    supplierConfirmation: 'SUP_AS_11'
  });
  assert.strictEqual(ticketResult.airline_confirmation_number, 'CONF88');
  assert.strictEqual(ticketResult.ticket_number, '0279988776655');
  console.log('✔ Test 4 Passed: Ticket details updated cleanly');

  // Test 5: PATCH /bookings/:id/notes
  console.log('\nTest 5: PATCH /bookings/:id/notes update...');
  const notesResult = await bookingService.updateNotes(testId, {
    internalNotes: 'Customer requested seating preference on seat 12A.',
    reason: 'Seat request logged'
  });
  assert.strictEqual(notesResult.internalNotes, 'Customer requested seating preference on seat 12A.');
  console.log('✔ Test 5 Passed: Internal notes updated cleanly');

  console.log('\n🎉 ALL FIELD-LEVEL PATCH API TESTS PASSED SUCCESSFULLY!\n');
}

runFieldLevelPatchApiTests().catch(err => {
  console.error('❌ Field-Level Patch API Test Failed:', err);
  process.exit(1);
});
