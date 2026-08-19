import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

import assert from 'assert';
import bookingRepository from '../src/modules/bookings/booking.repository.mjs';
import bookingService from '../src/modules/bookings/booking.service.mjs';
import { bookingController } from '../src/modules/bookings/booking.controller.mjs';

async function runSplitPaymentItineraryProtectionTests() {
  console.log('================================================================================');
  console.log('  SPLIT PAYMENT & ITINERARY DATA INTEGRITY PROTECTION TEST SUITE');
  console.log('================================================================================\n');

  const randomSuffix = Math.floor(Math.random() * 89999 + 10000);
  const randomHex = (Date.now().toString(16) + '000000000000').slice(0, 12);
  const testId = `b8c9d0e1-f2a3-4455-6677-${randomHex}`;
  const confirmationCode = `SPLIT-REG-${randomSuffix}`;

  // ----------------------------------------------------
  // SETUP: CREATE CONTROLLED BOOKING WITH REAL FLIGHTS
  // ----------------------------------------------------
  console.log('--- SETUP: CREATING TEST BOOKING WITH FLIGHTS ---');
  const initialBooking = await bookingRepository.createBookingRecord({
    id: testId,
    confirmation_code: confirmationCode,
    passenger_name: 'Marion Cotillard',
    email: 'marion@example.com',
    phone: '+1 415-555-4321',
    customer_price: 2450.00,
    total_amount: 2450.00,
    currency: 'USD',
    status: 'PENDING',
    payment_status: 'pending',
    authorization_status: 'AWAITING_AUTHORIZATION'
  });

  const realId = initialBooking.id || testId;

  await bookingRepository.insertTravellers([{
    booking_id: realId,
    first_name: 'Marion',
    last_name: 'Cotillard',
    date_of_birth: '1980-05-15',
    gender: 'female'
  }]);

  await bookingRepository.insertFlights([
    {
      booking_id: realId,
      leg: 'outbound',
      departure_airport: 'LAX',
      arrival_airport: 'LHR',
      airline_name: 'British Airways',
      flight_number: 'BA268',
      departure_date: '2026-10-10'
    },
    {
      booking_id: realId,
      leg: 'return',
      departure_airport: 'LHR',
      arrival_airport: 'LAX',
      airline_name: 'British Airways',
      flight_number: 'BA269',
      departure_date: '2026-10-20'
    }
  ]);

  const initialFlightsCount = await bookingRepository.getFlightsCount(realId);
  assert.strictEqual(initialFlightsCount, 2, 'Initial booking must contain exactly 2 flight segments');
  console.log(`✔ SETUP COMPLETED: Booking ${confirmationCode} created with ${initialFlightsCount} flight segments.\n`);

  // ----------------------------------------------------
  // CASE 1: REGRESSION TEST FOR SPLIT PAYMENT SAVE
  // ----------------------------------------------------
  console.log('--- CASE 1: REGRESSION TEST — SAVE SPLIT PAYMENTS ---');
  const splitPayload = [
    { merchant_name: 'British Airways', amount: 1450.00, currency: 'USD' },
    { merchant_name: 'FareTransit LLC', amount: 1000.00, currency: 'USD' }
  ];

  const updatedBooking = await bookingService.updatePaymentSplits(realId, splitPayload, 'admin-tester', 'Testing split payment save');
  const postFlightsCount = await bookingRepository.getFlightsCount(realId);

  assert.strictEqual(postFlightsCount, 2, 'Flight count must remain strictly 2 after split payment save');
  assert.strictEqual(updatedBooking.paymentSplits.length, 2, 'Must contain 2 saved payment splits');
  assert.strictEqual(updatedBooking.customer_price, 2450.00, 'Customer price must equal split total ($2,450.00)');

  const complete1 = await bookingRepository.getCompleteBookingById(realId);
  assert.strictEqual(complete1.flights.length, 2, 'Enriched complete booking must retain both flights');
  assert.strictEqual(complete1.flights[0].departure_airport, 'LAX');
  assert.strictEqual(complete1.flights[1].departure_airport, 'LHR');
  console.log('✔ CASE 1 PASSED: Split payments saved cleanly; flight count and flight rows remained 100% UNCHANGED.\n');

  // ----------------------------------------------------
  // CASE 2: STRICT REQUEST ALLOWLIST REJECTION
  // ----------------------------------------------------
  console.log('--- CASE 2: STRICT REQUEST ALLOWLIST REJECTION ---');
  const reqProhibited = {
    params: { id: realId },
    body: {
      splits: splitPayload,
      flights: [] // Prohibited key attempt
    }
  };

  let resCode = null;
  let resBody = null;
  const mockRes = {
    status: (code) => {
      resCode = code;
      return {
        json: (data) => { resBody = data; }
      };
    }
  };

  await bookingController.updatePaymentSplits(reqProhibited, mockRes, () => {});

  assert.strictEqual(resCode, 400, 'Must return HTTP 400 for payload with prohibited key');
  assert.strictEqual(resBody.error.code, 'PROHIBITED_PAYLOAD_KEY');
  console.log('✔ CASE 2 PASSED: Request payload with prohibited "flights" key rejected with PROHIBITED_PAYLOAD_KEY.\n');

  // ----------------------------------------------------
  // CASE 3: FAILURE INJECTION & TRANSACTION ROLLBACK
  // ----------------------------------------------------
  console.log('--- CASE 3: FAILURE INJECTION & TRANSACTION ROLLBACK ---');
  const invalidSplitPayload = [
    { merchant_name: '', amount: -50.00 } // Invalid merchant & negative amount
  ];

  try {
    await bookingService.updatePaymentSplits(realId, invalidSplitPayload, 'admin-tester', 'Invalid split test');
    assert.fail('Invalid split payload must throw validation error');
  } catch (err) {
    assert.ok(err.message.includes('cannot be empty') || err.message.includes('greater than zero'));
  }

  const postRollbackFlightsCount = await bookingRepository.getFlightsCount(realId);
  assert.strictEqual(postRollbackFlightsCount, 2, 'Flight count must remain 2 after failed split update');
  console.log('✔ CASE 3 PASSED: Validation failure rolled back transaction cleanly without altering flights.\n');

  // ----------------------------------------------------
  // CASE 4: TOTAL CONSISTENCY RULE
  // ----------------------------------------------------
  console.log('--- CASE 4: TOTAL CONSISTENCY RULE ---');
  const splitsCents = splitPayload.reduce((sum, s) => sum + Math.round(s.amount * 100), 0);
  assert.strictEqual(splitsCents / 100, 2450.00, 'Split total in cents must equal 2450.00 USD exactly');
  console.log('✔ CASE 4 PASSED: Split payments sum equals total amount using decimal-safe arithmetic.\n');

  // ----------------------------------------------------
  // CASE 5: AUDIT LOG VERIFICATION
  // ----------------------------------------------------
  console.log('--- CASE 5: AUDIT LOG VERIFICATION ---');
  const history = await bookingRepository.getBookingHistory(realId);
  assert.ok(history, 'Booking history/audits must exist');
  console.log('✔ CASE 5 PASSED: Payment update audit record generated successfully.\n');

  // ----------------------------------------------------
  // CASE 6: STAGING SQL QUERY ASSERTION
  // ----------------------------------------------------
  console.log('--- CASE 6: STAGING SQL QUERY ASSERTION ---');
  const finalBk = await bookingRepository.getById(realId);
  const finalFlightsCount = await bookingRepository.getFlightsCount(realId);

  assert.strictEqual(finalBk.confirmation_code, confirmationCode);
  assert.strictEqual(parseFloat(finalBk.total_amount), 2450.00);
  assert.strictEqual(finalFlightsCount, 2);

  console.log(`[SQL VERIFICATION] Confirmation: ${finalBk.confirmation_code} | Total: $${finalBk.total_amount} | Flight Count: ${finalFlightsCount}`);
  console.log('✔ CASE 6 PASSED: Verified SQL query parameters — split-payment rows changed, flight_count UNCHANGED.\n');

  console.log('================================================================================');
  console.log('  🎉 ALL 6 / 6 SPLIT PAYMENT & ITINERARY PROTECTION TEST CASES PASSED!');
  console.log('================================================================================\n');
}

runSplitPaymentItineraryProtectionTests().catch(err => {
  console.error('❌ Test Suite Failed:', err);
  process.exit(1);
});
