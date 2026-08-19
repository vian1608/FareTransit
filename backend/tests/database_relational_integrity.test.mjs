import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

import assert from 'assert';
import bookingValidatorService from '../src/modules/bookings/booking-validator.service.mjs';
import bookingRepository from '../src/modules/bookings/booking.repository.mjs';

async function runRelationalIntegrityTests() {
  console.log('=== RUNNING DATABASE RELATIONAL INTEGRITY TESTS ===\n');

  // Setup mock data for relational testing
  const validBookingId = '77aa88bb-99cc-44dd-88ee-112233445566';
  const invalidBookingId = '00000000-0000-0000-0000-000000000000';

  const mockValidBooking = {
    id: validBookingId,
    confirmation_code: 'TFS-2026-REL99',
    customer_price: 650.00,
    total_amount: 650.00,
    currency: 'USD',
    passenger_name: 'Alex Rivera',
    email: 'alex.rivera@example.com',
    status: 'PENDING',
    itinerary_segments: [
      {
        journey_direction: 'outbound',
        segment_sequence: 1,
        carrier_name: 'Delta Air Lines',
        carrier_code: 'DL',
        flight_number: 'DL 450',
        origin_airport: 'JFK',
        destination_airport: 'LAX'
      }
    ]
  };

  await bookingRepository.createBookingRecord(mockValidBooking);
  await bookingRepository.saveItinerarySegments(validBookingId, mockValidBooking.itinerary_segments);

  // Test 1: Check booking WITH flights (Valid)
  console.log('Test 1: Check booking WITH flight itinerary...');
  const check1 = await bookingValidatorService.checkBookingWithoutFlights(mockValidBooking);
  assert.strictEqual(check1.valid, true, 'Booking with flights should pass integrity check');
  assert.strictEqual(check1.segmentCount, 1);
  console.log('✔ Test 1 Passed: Booking with valid flight itinerary verified cleanly');

  // Test 2: Check booking WITHOUT flights (Invalid - Orphaned booking)
  console.log('\nTest 2: Detect booking WITHOUT flight itinerary...');
  const incompleteBooking = {
    id: '88bb99cc-00dd-55ee-99ff-223344556677',
    confirmation_code: 'TFS-2026-NOFLIGHT',
    passenger_name: 'Empty Booking',
    email: 'empty@example.com',
    status: 'PENDING',
    itinerary_segments: [],
    flights: []
  };
  const check2 = await bookingValidatorService.checkBookingWithoutFlights(incompleteBooking);
  assert.strictEqual(check2.valid, false, 'Booking without flights must fail integrity check');
  assert.strictEqual(check2.issue, 'BOOKING_WITHOUT_FLIGHTS');
  console.log(`✔ Test 2 Passed: Correctly flagged booking without flights (${check2.details})`);

  // Test 3: Check payment WITHOUT valid booking (Orphaned payment)
  console.log('\nTest 3: Detect payment WITHOUT associated booking...');
  const orphanPayment = {
    id: 'pay_orphan_123',
    booking_id: invalidBookingId,
    amount: 500.00,
    status: 'completed'
  };
  const check3 = await bookingValidatorService.checkPaymentWithoutBooking(orphanPayment);
  assert.strictEqual(check3.valid, false, 'Payment referencing non-existent booking must fail');
  assert.strictEqual(check3.issue, 'PAYMENT_WITHOUT_BOOKING');
  console.log(`✔ Test 3 Passed: Correctly flagged orphan payment (${check3.details})`);

  // Test 4: Check authorization WITHOUT valid booking (Orphaned authorization)
  console.log('\nTest 4: Detect passenger authorization WITHOUT associated booking...');
  const orphanAuth = {
    id: 'auth_orphan_456',
    token: 'tks_orphan_token_999',
    booking_id: invalidBookingId,
    authorization_status: 'AUTHORIZED'
  };
  const check4 = await bookingValidatorService.checkAuthorizationWithoutBooking(orphanAuth);
  assert.strictEqual(check4.valid, false, 'Authorization referencing non-existent booking must fail');
  assert.strictEqual(check4.issue, 'AUTHORIZATION_WITHOUT_BOOKING');
  console.log(`✔ Test 4 Passed: Correctly flagged orphan authorization (${check4.details})`);

  // Test 5: Check ticket detail WITHOUT valid booking (Orphaned ticket)
  console.log('\nTest 5: Detect airline ticket detail WITHOUT associated booking...');
  const orphanTicket = {
    id: 'tkt_orphan_789',
    booking_id: invalidBookingId,
    airline_pnr: 'XYZ123',
    ticket_number: '006-1234567890'
  };
  const check5 = await bookingValidatorService.checkTicketWithoutBooking(orphanTicket);
  assert.strictEqual(check5.valid, false, 'Ticket referencing non-existent booking must fail');
  assert.strictEqual(check5.issue, 'TICKET_WITHOUT_BOOKING');
  console.log(`✔ Test 5 Passed: Correctly flagged orphan ticket (${check5.details})`);

  // Test 6: Full Relational Integrity Audit Scanner
  console.log('\nTest 6: Run full relational integrity audit scanner...');
  const auditResult = await bookingValidatorService.runRelationalIntegrityAudit({
    bookings: [mockValidBooking, incompleteBooking],
    payments: [
      { id: 'pay_valid_1', booking_id: validBookingId, amount: 650.00 },
      orphanPayment
    ],
    authorizations: [
      { id: 'auth_valid_1', booking_id: validBookingId, token: 'tks_valid_123' },
      orphanAuth
    ],
    tickets: [
      { id: 'tkt_valid_1', booking_id: validBookingId, airline_pnr: 'ABC888' },
      orphanTicket
    ]
  });

  assert.strictEqual(auditResult.clean, false, 'Audit scanner must detect relational issues');
  assert.strictEqual(auditResult.issueCount, 4, 'Must detect exactly 4 relational issues');
  console.log(`✔ Test 6 Passed: Audit scanner identified ${auditResult.issueCount} relational issues across bookings, payments, authorizations, and tickets.`);

  console.log('\n🎉 ALL DATABASE RELATIONAL INTEGRITY TESTS PASSED SUCCESSFULLY!\n');
}

runRelationalIntegrityTests().catch(err => {
  console.error('❌ Relational Integrity Test Failed:', err);
  process.exit(1);
});
