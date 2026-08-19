import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

import assert from 'assert';
import bookingValidatorService from '../src/modules/bookings/booking-validator.service.mjs';
import bookingRepository from '../src/modules/bookings/booking.repository.mjs';

async function runComprehensiveIntegrityValidatorTests() {
  console.log('=== RUNNING COMPREHENSIVE BOOKING INTEGRITY VALIDATOR TESTS ===\n');

  // Test 1: Complete Valid Booking — Must pass all 5 domains cleanly
  console.log('Test 1: Complete valid booking validation...');
  const validId = '66cc77dd-88ee-99ff-00aa-112233445566';
  const completeBooking = {
    id: validId,
    confirmation_code: 'TFS-2026-VAL99',
    passenger_name: 'Elena Rostova',
    email: 'elena.rostova@example.com',
    phone: '+1 415-555-0166',
    customer_price: 1250.00,
    total_amount: 1250.00,
    currency: 'USD',
    status: 'DONE',
    authorization_status: 'AUTHORIZED',
    airline_confirmation_number: 'VAL123',
    ticket_number: '0169988776655',
    itinerary_segments: [
      {
        journey_direction: 'outbound',
        segment_sequence: 1,
        carrier_name: 'United Airlines',
        carrier_code: 'UA',
        flight_number: 'UA 889',
        origin_airport: 'SFO',
        destination_airport: 'LHR',
        departure_date: '2026-12-01',
        departure_time: '18:00',
        arrival_date: '2026-12-02',
        arrival_time: '12:30'
      }
    ],
    payment_splits: [
      { merchant_name: 'United Airlines', amount: 950.00, currency: 'USD' },
      { merchant_name: 'FareTransit LLC', amount: 300.00, currency: 'USD' }
    ]
  };

  await bookingRepository.createBookingRecord(completeBooking);
  await bookingRepository.saveItinerarySegments(validId, completeBooking.itinerary_segments);

  const val1 = await bookingValidatorService.validateBookingIntegrity(completeBooking, {
    requireItinerary: true,
    requirePassengers: true,
    requirePayment: true,
    requireAuthorization: true,
    requirePnr: true,
    requireTicket: true
  });

  assert.strictEqual(val1.valid, true, 'Complete booking must pass validation');
  assert.strictEqual(val1.reason, null);
  assert.strictEqual(val1.errors.length, 0);
  console.log('✔ Test 1 Passed: Complete valid booking passed all 5 domains (Booking, Itinerary, Payment, Auth, Ticket)');

  // Test 2: Missing Flight Itinerary Segment Details (Domain 2 Failure)
  console.log('\nTest 2: Detecting incomplete flight segment attributes...');
  const incompleteFlightBooking = {
    ...completeBooking,
    id: '77dd88ee-99ff-00aa-11bb-223344556677',
    confirmation_code: 'TFS-2026-MISSFL',
    itinerary_segments: [
      {
        journey_direction: 'outbound',
        segment_sequence: 1,
        // Missing carrier_name and flight_number
        origin_airport: 'SFO',
        destination_airport: 'LHR'
      }
    ]
  };

  const val2 = await bookingValidatorService.validateBookingIntegrity(incompleteFlightBooking, {
    requireItinerary: true
  });

  assert.strictEqual(val2.valid, false);
  assert.ok(val2.errors.some(e => e.includes('missing airline')), 'Must flag missing airline');
  assert.ok(val2.errors.some(e => e.includes('missing flight number')), 'Must flag missing flight number');
  console.log(`✔ Test 2 Passed: Incomplete flight segment correctly flagged (${val2.reason})`);

  // Test 3: Payment Split Sum Mismatch (Domain 3 Failure)
  console.log('\nTest 3: Detecting payment splits sum mismatch...');
  const splitMismatchBooking = {
    ...completeBooking,
    id: '88ee99ff-00aa-11bb-22cc-334455667788',
    confirmation_code: 'TFS-2026-SPLITBAD',
    total_amount: 1250.00,
    customer_price: 1250.00,
    payment_splits: [
      { merchant_name: 'United Airlines', amount: 500.00, currency: 'USD' },
      { merchant_name: 'FareTransit LLC', amount: 300.00, currency: 'USD' }
      // Sum is 800.00, mismatching 1250.00
    ]
  };

  const val3 = await bookingValidatorService.validateBookingIntegrity(splitMismatchBooking, {
    requirePayment: true
  });

  assert.strictEqual(val3.valid, false);
  assert.ok(val3.reason.includes('Payment split total'), 'Must flag payment split sum mismatch');
  console.log(`✔ Test 3 Passed: Payment split sum mismatch correctly flagged (${val3.reason})`);

  // Test 4: Pending Authorization (Domain 4 Failure)
  console.log('\nTest 4: Detecting pending authorization status...');
  const pendingAuthBooking = {
    ...completeBooking,
    id: '99ff00aa-11bb-22cc-33dd-445566778899',
    confirmation_code: 'TFS-2026-AUTHBAD',
    authorization_status: 'AWAITING_AUTHORIZATION'
  };

  const val4 = await bookingValidatorService.validateBookingIntegrity(pendingAuthBooking, {
    requireAuthorization: true
  });

  assert.strictEqual(val4.valid, false);
  assert.ok(val4.reason.includes('authorization is pending'), 'Must flag pending authorization');
  console.log(`✔ Test 4 Passed: Pending authorization correctly flagged (${val4.reason})`);

  // Test 5: Missing Ticket / Invalid PNR (Domain 5 Failure)
  console.log('\nTest 5: Detecting missing PNR / Ticket details...');
  const missingPnrBooking = {
    ...completeBooking,
    id: '00aa11bb-22cc-33dd-44ee-556677889900',
    confirmation_code: 'TFS-2026-PNRBAD',
    airline_confirmation_number: 'INVALID_LONG_PNR_999'
  };

  const val5 = await bookingValidatorService.validateBookingIntegrity(missingPnrBooking, {
    requirePnr: true
  });

  assert.strictEqual(val5.valid, false);
  assert.ok(val5.reason.includes('6-character airline PNR'), 'Must flag invalid 6-char PNR');
  console.log(`✔ Test 5 Passed: Invalid PNR correctly flagged (${val5.reason})`);

  console.log('\n🎉 ALL COMPREHENSIVE BOOKING INTEGRITY VALIDATOR TESTS PASSED SUCCESSFULLY!\n');
}

runComprehensiveIntegrityValidatorTests().catch(err => {
  console.error('❌ Comprehensive Booking Integrity Validator Test Failed:', err);
  process.exit(1);
});
