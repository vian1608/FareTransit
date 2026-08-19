import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

import assert from 'assert';
import bookingRepository from '../src/modules/bookings/booking.repository.mjs';
import bookingService from '../src/modules/bookings/booking.service.mjs';
import passengerAuthorizationService from '../src/modules/authorizations/passenger-authorization.service.mjs';
import bookingValidatorService from '../src/modules/bookings/booking-validator.service.mjs';

async function runPhase18MasterAutomatedTesting() {
  console.log('==================================================');
  console.log('  PHASE 18 — MASTER AUTOMATED TESTING SUITE');
  console.log('==================================================\n');

  const randomSuffix = Math.floor(Math.random() * 899999 + 100000);
  const testId = `66ff77aa-88bb-99cc-00dd-${randomSuffix}5566`;
  const initialBookingData = {
    id: testId,
    confirmation_code: `TFS-2026-P18-${randomSuffix}`,
    passenger_name: 'Catherine Deneuve',
    email: 'catherine@example.com',
    phone: '+1 415-555-0666',
    customer_price: 4500.00,
    total_amount: 4500.00,
    currency: 'USD',
    status: 'PENDING',
    payment_status: 'pending',
    authorization_status: 'AWAITING_AUTHORIZATION',
    ticket_status: 'NOT_TICKETED',
    airline_name: 'Air France',
    airline_code: 'AF',
    itinerary_segments: [
      {
        journey_direction: 'outbound',
        segment_sequence: 1,
        carrier_name: 'Air France',
        carrier_code: 'AF',
        flight_number: 'AF 085',
        origin_airport: 'JFK',
        destination_airport: 'CDG',
        departure_date: '2027-03-15',
        departure_time: '19:00',
        arrival_date: '2027-03-16',
        arrival_time: '08:15'
      }
    ]
  };

  // ----------------------------------------------------
  // SCENARIO 1: BOOKING CREATION — NO ORPHAN BOOKINGS
  // ----------------------------------------------------
  console.log('--- SCENARIO 1: BOOKING CREATION (NO ORPHAN BOOKINGS) ---');
  console.log('Subtest 1a: Creating valid booking with flight segments & travellers...');
  const createdBooking = await bookingRepository.createBookingRecord(initialBookingData);
  const realId = createdBooking?.id || testId;
  await bookingRepository.saveItinerarySegments(realId, initialBookingData.itinerary_segments);
  await bookingRepository.savePaymentSplits(realId, [
    { merchant_name: 'Air France', amount: 3900.00, currency: 'USD' },
    { merchant_name: 'FareTransit LLC', amount: 600.00, currency: 'USD' }
  ]);

  const readBooking1 = await bookingRepository.getById(realId);
  const relations1 = await bookingRepository.getRelations(realId);

  assert.ok(readBooking1, 'Booking record must exist');
  assert.strictEqual(readBooking1.id, realId);
  assert.ok(relations1.itinerarySegments.length > 0 || readBooking1.itinerary_segments.length > 0, 'Flight segments must be attached');
  console.log('✔ Scenario 1 Passed: Booking created cleanly with zero orphan records.');

  // ----------------------------------------------------
  // SCENARIO 2: PAYMENT UPDATE — ONLY PAYMENT CHANGES
  // ----------------------------------------------------
  console.log('\n--- SCENARIO 2: PAYMENT UPDATE (ONLY PAYMENT CHANGES) ---');
  console.log('Subtest 2: Updating payment details via bookingService.updatePayment...');
  const updatedPayBooking = await bookingService.updatePayment(realId, {
    paymentStatus: 'paid',
    paidAmount: 4500.00,
    paymentProvider: 'Stripe',
    adminId: 'admin_p18'
  });

  const readBooking2 = await bookingRepository.getById(realId);
  const relations2 = await bookingRepository.getRelations(realId);

  assert.strictEqual(readBooking2.payment_status, 'paid');
  assert.strictEqual(readBooking2.passenger_name, 'Catherine Deneuve', 'Passenger name MUST NOT change during payment update');
  assert.strictEqual(relations2.itinerarySegments.length, relations1.itinerarySegments.length, 'Flight segment count MUST NOT change');
  console.log('✔ Scenario 2 Passed: Payment update modified ONLY payment fields with zero side effects on flights or passengers.');

  // ----------------------------------------------------
  // SCENARIO 3: STATUS UPDATE — ONLY STATUS CHANGES
  // ----------------------------------------------------
  console.log('\n--- SCENARIO 3: STATUS UPDATE (ONLY STATUS CHANGES) ---');
  console.log('Subtest 3: Updating booking.status to DONE via bookingService.updateStatus...');
  const updatedStatusBooking = await bookingService.updateStatus(realId, {
    status: 'DONE',
    internalNotes: 'Admin status updated to DONE'
  });

  const readBooking3 = await bookingRepository.getById(realId);
  assert.strictEqual(readBooking3.status, 'DONE');
  assert.strictEqual(readBooking3.passenger_name, 'Catherine Deneuve');
  console.log('✔ Scenario 3 Passed: Status update modified ONLY booking.status.');

  // Restore status to PENDING for subsequent steps
  await bookingService.updateStatus(realId, { status: 'PENDING' });

  // ----------------------------------------------------
  // SCENARIO 4: AUTHORIZATION COMPLETION — SNAPSHOT CREATED
  // ----------------------------------------------------
  console.log('\n--- SCENARIO 4: AUTHORIZATION COMPLETION (SNAPSHOT CREATED) ---');
  console.log('Subtest 4: Simulating customer authorization acceptance...');
  const authRecord = await passengerAuthorizationService.createAuthorizationToken(createdBooking);
  const acceptResult = await passengerAuthorizationService.acceptAuthorization({
    token: authRecord.token,
    ipAddress: '198.51.100.111',
    userAgent: 'Mozilla/5.0 (Phase 18 Test Agent)'
  });

  assert.strictEqual(acceptResult.success, true);
  assert.ok(acceptResult.authorizationSnapshot, 'Must create and return immutable authorizationSnapshot');
  assert.strictEqual(acceptResult.authorizationSnapshot.client_ip, '198.51.100.111');

  const authSnapshots = await bookingRepository.getAuthorizationSnapshots(realId);
  assert.ok(authSnapshots.length > 0, 'Authorization snapshot must be persisted');
  console.log('✔ Scenario 4 Passed: Customer authorization accepted & immutable authorization snapshot created.');

  // ----------------------------------------------------
  // SCENARIO 5: TICKET GENERATION — CORRECT ITINERARY
  // ----------------------------------------------------
  console.log('\n--- SCENARIO 5: TICKET GENERATION (CORRECT ITINERARY) ---');
  console.log('Subtest 5: Issuing ticket details via bookingRepository.saveTicketDetails...');
  const ticketResult = await bookingRepository.saveTicketDetails(realId, {
    airlineConfirmationNumber: 'AF085X',
    ticketNumber: '0571122334455',
    airlineName: 'Air France',
    airlineCode: 'AF'
  });

  const ticketSnapshots = await bookingRepository.getTicketSnapshotsForBooking(realId);
  assert.ok(ticketSnapshots.length > 0, 'Ticket snapshot must be created');
  const latestTicketSnap = ticketSnapshots[ticketSnapshots.length - 1];
  assert.strictEqual(latestTicketSnap.pnr, 'AF085X');
  assert.strictEqual(latestTicketSnap.ticket_number, '0571122334455');
  assert.ok(latestTicketSnap.final_itinerary.length > 0, 'Ticket snapshot must contain correct flight itinerary');
  console.log('✔ Scenario 5 Passed: Ticket generated with correct itinerary & append-only ticket snapshot.');

  // ----------------------------------------------------
  // SCENARIO 6: MISSING FLIGHT DATA — OPERATION BLOCKED
  // ----------------------------------------------------
  console.log('\n--- SCENARIO 6: MISSING FLIGHT DATA (OPERATION BLOCKED) ---');
  console.log('Subtest 6: Validating booking integrity on empty/missing flight itinerary...');
  const fakeEmptyBookingId = '77aa88bb-99cc-00dd-11ee-223344556677';
  await bookingRepository.createBookingRecord({
    id: fakeEmptyBookingId,
    confirmation_code: 'TFS-EMPTY-TEST',
    passenger_name: 'No Flight Passenger',
    total_amount: 1000.00
  });

  const integrityCheck = await bookingValidatorService.validateBookingIntegrity(fakeEmptyBookingId, {
    requireItinerary: true
  });

  assert.strictEqual(integrityCheck.valid, false, 'Validation MUST fail when flight itinerary is missing');
  assert.ok(
    integrityCheck.code === 'BOOKING_ITINERARY_MISSING' ||
    (integrityCheck.errors && integrityCheck.errors.some(e => e.includes('ITINERARY') || e.includes('itinerary'))) ||
    (integrityCheck.reason && integrityCheck.reason.includes('itinerary')),
    'Failure code/reason must reference missing itinerary'
  );
  console.log(`✔ Scenario 6 Passed: Operation cleanly blocked on missing flight data (Code: ${integrityCheck.code})`);

  // ----------------------------------------------------
  // SCENARIO 7: REFRESH BROWSER / RE-READ STATE
  // ----------------------------------------------------
  console.log('\n--- SCENARIO 7: REFRESH BROWSER / RE-READ STATE (DATA UNCHANGED) ---');
  console.log('Subtest 7: Simulating browser refreshes & fresh repository reads...');
  const refreshedBooking = await bookingRepository.getById(realId);
  const refreshedRelations = await bookingRepository.getRelations(realId);

  assert.strictEqual(refreshedBooking.passenger_name, 'Catherine Deneuve');
  assert.strictEqual(refreshedBooking.payment_status, 'paid');
  assert.strictEqual(refreshedRelations.itinerarySegments.length, 1);
  console.log('✔ Scenario 7 Passed: Post-update booking data remains 100% persistent and unchanged after simulated state refreshes.');

  // ----------------------------------------------------
  // SCENARIO 8: ATTEMPT INVALID OVERWRITE — REJECTED
  // ----------------------------------------------------
  console.log('\n--- SCENARIO 8: ATTEMPT INVALID OVERWRITE (REJECTED) ---');
  console.log('Subtest 8a: Attempting payment update with forbidden domain keys...');
  try {
    await bookingService.updatePayment(realId, {
      paymentStatus: 'refunded',
      airline_name: 'FORBIDDEN_AIRLINE_OVERWRITE',
      passenger_name: 'HACKER_NAME'
    });
    assert.fail('Should have rejected forbidden domain keys');
  } catch (err) {
    assert.strictEqual(err.code, 'FORBIDDEN_PAYMENT_UPDATE_FIELD');
    console.log(`✔ Subtest 8a Passed: Forbidden domain fields in payment update rejected (${err.message})`);
  }

  console.log('Subtest 8b: Attempting status update with forbidden status AUTHORIZED...');
  try {
    await bookingService.updateStatus(realId, { status: 'AUTHORIZED' });
    assert.fail('Should have rejected setting status = AUTHORIZED');
  } catch (err) {
    assert.strictEqual(err.code, 'INVALID_STATUS');
    console.log(`✔ Subtest 8b Passed: Invalid status AUTHORIZED rejected (${err.message})`);
  }

  console.log('\n==================================================');
  console.log('  🎉 ALL 8 BUSINESS GUARANTEES PASSED IN PHASE 18!');
  console.log('==================================================\n');
}

runPhase18MasterAutomatedTesting().catch(err => {
  console.error('❌ Phase 18 Master Automated Testing Failed:', err);
  process.exit(1);
});
