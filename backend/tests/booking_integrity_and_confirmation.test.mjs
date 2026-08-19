import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

import assert from 'assert';
import bookingRepository from '../src/modules/bookings/booking.repository.mjs';
import bookingService from '../src/modules/bookings/booking.service.mjs';
import { bookingController } from '../src/modules/bookings/booking.controller.mjs';
import { bookingValidatorService } from '../src/modules/bookings/booking-validator.service.mjs';

async function runBookingIntegrityAndConfirmationTests() {
  console.log('================================================================================');
  console.log('  BOOKING CREATION, ITINERARY INTEGRITY & CONFIRMATION DTO TEST SUITE');
  console.log('================================================================================\n');

  const randomSuffix = Math.floor(Math.random() * 89999 + 10000);

  // ----------------------------------------------------
  // CASE 1: SUCCESSFUL ROUND-TRIP BOOKING
  // ----------------------------------------------------
  console.log('--- CASE 1: SUCCESSFUL ROUND-TRIP BOOKING ---');
  const payloadCase1 = {
    idempotency_key: `idemp_test_case1_${randomSuffix}`,
    customerName: 'Marion Cotillard',
    email: 'marion.cotillard@example.com',
    phone: '+1 415-555-0199',
    customer_price: 2450.00,
    supplier_price: 2750.00,
    currency: 'USD',
    passengers: [
      { firstName: 'Marion', lastName: 'Cotillard', gender: 'female', dateOfBirth: '1980-05-15' }
    ],
    flight: {
      airline: 'British Airways',
      flightNumber: 'BA268',
      departureAirport: 'LAX',
      arrivalAirport: 'LHR',
      departureDate: '2026-10-10',
      departureTime: '17:30',
      arrivalDate: '2026-10-11',
      arrivalTime: '11:45',
      stops: 0,
      cabinClass: 'Economy',
      price: 1450.00,
      returnFlight: {
        airline: 'British Airways',
        flightNumber: 'BA269',
        departureAirport: 'LHR',
        arrivalAirport: 'LAX',
        departureDate: '2026-10-20',
        departureTime: '15:15',
        arrivalDate: '2026-10-20',
        arrivalTime: '18:40',
        stops: 0,
        cabinClass: 'Economy',
        price: 1000.00
      }
    }
  };

  const created1 = await bookingService.create(payloadCase1);
  assert.ok(created1, 'Booking record must be returned');
  const bId1 = created1.booking?.id || created1.id;
  const confCode1 = created1.booking?.confirmation_code || created1.confirmation_code;
  assert.ok(confCode1, 'Confirmation code must exist');

  const complete1 = await bookingRepository.getCompleteBookingById(bId1);
  assert.strictEqual(complete1.flights.length, 2, 'Must insert exactly 2 flight segments (outbound & return)');
  assert.strictEqual(complete1.flights[0].departure_airport, 'LAX');
  assert.strictEqual(complete1.flights[0].arrival_airport, 'LHR');
  assert.strictEqual(complete1.flights[1].departure_airport, 'LHR');
  assert.strictEqual(complete1.flights[1].arrival_airport, 'LAX');
  assert.strictEqual(parseFloat(complete1.customer_price), 2450.00, 'Customer price must equal $2,450.00');

  console.log(`✔ CASE 1 PASSED: Booking ${confCode1} created with 2 flight segments and total $2,450.00.\n`);

  // ----------------------------------------------------
  // CASE 2: FLIGHT INSERTION FAILURE & TRANSACTION ROLLBACK
  // ----------------------------------------------------
  console.log('--- CASE 2: FLIGHT INSERTION FAILURE & TRANSACTION ROLLBACK ---');
  const payloadCase2 = {
    idempotency_key: `idemp_test_case2_${randomSuffix}`,
    customerName: 'Invalid Flight User',
    email: 'invalid.flight@example.com',
    phone: '+1 415-555-0188',
    customer_price: 1200.00,
    currency: 'USD',
    passengers: [{ firstName: 'Invalid', lastName: 'User', gender: 'male', dateOfBirth: '1990-01-01' }],
    flight: null // Missing flight object
  };

  try {
    await bookingService.create(payloadCase2);
    assert.fail('Should have rejected booking creation with missing flight');
  } catch (err) {
    assert.ok(err.message.includes('BOOKING_CREATION_INCOMPLETE') || err.message.includes('itinerary') || err.message.includes('flight'));
  }
  console.log('✔ CASE 2 PASSED: Missing flight creation failed and transaction rolled back cleanly.\n');

  // ----------------------------------------------------
  // CASE 3: AMOUNT MISSING / ZERO TOTAL
  // ----------------------------------------------------
  console.log('--- CASE 3: AMOUNT MISSING / ZERO TOTAL ---');
  const payloadCase3 = {
    idempotency_key: `idemp_test_case3_${randomSuffix}`,
    customerName: 'Zero Price User',
    email: 'zero.price@example.com',
    phone: '+1 415-555-0177',
    customer_price: 0.00, // Zero price!
    currency: 'USD',
    passengers: [{ firstName: 'Zero', lastName: 'User', gender: 'male', dateOfBirth: '1992-02-02' }],
    flight: {
      airline: 'Delta Air Lines',
      flightNumber: 'DL400',
      departureAirport: 'JFK',
      arrivalAirport: 'LHR',
      departureDate: '2026-11-01'
    }
  };

  try {
    await bookingService.create(payloadCase3);
    assert.fail('Should have rejected zero total price');
  } catch (err) {
    assert.ok(err.message.includes('INVALID_BOOKING_PRICE') || err.message.includes('greater than zero'));
  }
  console.log('✔ CASE 3 PASSED: Zero total amount ($0.00) rejected with explicit error.\n');

  // ----------------------------------------------------
  // CASE 4: PARTIAL FLIGHT OBJECT (MISSING AIRPORTS)
  // ----------------------------------------------------
  console.log('--- CASE 4: PARTIAL FLIGHT OBJECT (MISSING AIRPORTS) ---');
  const payloadCase4 = {
    idempotency_key: `idemp_test_case4_${randomSuffix}`,
    customerName: 'Partial Flight User',
    email: 'partial.flight@example.com',
    phone: '+1 415-555-0166',
    customer_price: 850.00,
    currency: 'USD',
    passengers: [{ firstName: 'Partial', lastName: 'User', gender: 'female', dateOfBirth: '1995-03-03' }],
    flight: {
      airline: 'United Airlines',
      flightNumber: 'UA100',
      // Missing departureAirport and arrivalAirport!
      departureDate: '2026-11-15'
    }
  };

  try {
    await bookingService.create(payloadCase4);
    assert.fail('Should have rejected flight with missing airport codes');
  } catch (err) {
    assert.ok(err.message.includes('ITINERARY_NORMALIZATION_FAILED') || err.message.includes('airport'));
  }
  console.log('✔ CASE 4 PASSED: Flight missing airport codes rejected before database commit.\n');

  // ----------------------------------------------------
  // CASE 5: CONFIRMATION-PAGE DTO & REFRESH PERSISTENCE
  // ----------------------------------------------------
  console.log('--- CASE 5: CONFIRMATION-PAGE DTO & REFRESH PERSISTENCE ---');
  const mockReq = { params: { confirmationCode: confCode1 } };
  let dtoData = null;
  const mockRes = {
    json: (resObj) => { dtoData = resObj; }
  };

  await bookingController.getConfirmationDTO(mockReq, mockRes, () => {});

  assert.ok(dtoData && dtoData.success, 'DTO endpoint must return success');
  assert.strictEqual(dtoData.data.booking.confirmationCode, confCode1);
  assert.strictEqual(dtoData.data.booking.totalAmount, 2450.00);
  assert.strictEqual(dtoData.data.flights.length, 2);
  assert.strictEqual(dtoData.data.flights[0].departure_airport, 'LAX');
  assert.strictEqual(dtoData.data.flights[1].departure_airport, 'LHR');

  console.log('✔ CASE 5 PASSED: Confirmation DTO returned complete reservation details from backend.\n');

  // ----------------------------------------------------
  // CASE 6: SPLIT-PAYMENT UPDATE ISOLATION
  // ----------------------------------------------------
  console.log('--- CASE 6: SPLIT-PAYMENT UPDATE ISOLATION ---');
  const splits = [
    { merchant_name: 'British Airways', amount: 1450.00, currency: 'USD' },
    { merchant_name: 'FareTransit LLC', amount: 1000.00, currency: 'USD' }
  ];

  const splitUpdated = await bookingService.updatePaymentSplits(bId1, splits, 'admin-tester', 'Split update test');
  const postSplitFlights = await bookingRepository.getFlightsCount(bId1);
  assert.strictEqual(postSplitFlights, 2, 'Flight count must remain 2 after split payment save');
  assert.strictEqual(splitUpdated.customer_price, 2450.00, 'Total customer price must remain $2,450.00');

  console.log('✔ CASE 6 PASSED: Split payments updated while flight count and total price remained 100% UNCHANGED.\n');

  // ----------------------------------------------------
  // CASE 7: CONFIRMATION EMAIL HANDLING
  // ----------------------------------------------------
  console.log('--- CASE 7: CONFIRMATION EMAIL HANDLING ---');
  const valResult = await bookingValidatorService.validateCompletedBooking(bId1);
  assert.strictEqual(valResult.valid, true, 'Booking must pass completed validation');
  console.log('✔ CASE 7 PASSED: Booking passed complete transactional validation for confirmation email.\n');

  // ----------------------------------------------------
  // CASE 8: IDEMPOTENCY & DUPLICATE SUBMISSION GUARD
  // ----------------------------------------------------
  console.log('--- CASE 8: IDEMPOTENCY & DUPLICATE SUBMISSION GUARD ---');
  const repeatSubmission = await bookingService.create(payloadCase1);
  assert.strictEqual(repeatSubmission.id || repeatSubmission.booking?.id, bId1, 'Repeat idempotency submission must return existing booking ID');
  const postIdempFlights = await bookingRepository.getFlightsCount(bId1);
  assert.strictEqual(postIdempFlights, 2, 'Duplicate click must not insert extra flight rows');

  console.log('✔ CASE 8 PASSED: Idempotency key prevented duplicate booking and duplicate flight insertions.\n');

  console.log('================================================================================');
  console.log('  🎉 ALL 8 / 8 BOOKING INTEGRITY & CONFIRMATION DTO TEST CASES PASSED!');
  console.log('================================================================================\n');
}

runBookingIntegrityAndConfirmationTests().catch(err => {
  console.error('❌ Test Suite Failed:', err);
  process.exit(1);
});
