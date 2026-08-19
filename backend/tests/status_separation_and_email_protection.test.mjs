import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

import assert from 'assert';
import bookingRepository from '../src/modules/bookings/booking.repository.mjs';
import bookingService from '../src/modules/bookings/booking.service.mjs';
import { sendBookingConfirmation, sendPassengerAuthorizationEmail, sendFinalTicketEmail } from '../src/integrations/resend/resend.service.mjs';

async function runStatusSeparationAndEmailProtectionTests() {
  console.log('=== RUNNING STATUS SEPARATION & EMAIL PROTECTION TESTS ===\n');

  const testId = '22bb33cc-44dd-55ee-66ff-778899001122';
  const initialBooking = {
    id: testId,
    confirmation_code: 'TFS-2026-SEPPROT',
    passenger_name: 'Charlotte Gainsbourg',
    email: 'charlotte@example.com',
    phone: '+1 415-555-0222',
    customer_price: 2800.00,
    total_amount: 2800.00,
    currency: 'USD',
    status: 'PENDING',
    payment_status: 'pending',
    authorization_status: 'AWAITING_AUTHORIZATION',
    ticket_status: 'NOT_TICKETED',
    airline_name: 'British Airways',
    airline_code: 'BA'
  };

  const createdBooking = await bookingRepository.createBookingRecord(initialBooking);
  const realId = createdBooking?.id || testId;

  // ----------------------------------------------------
  // TEST SECTION 1: PHASE 12 STATUS SEPARATION
  // ----------------------------------------------------
  console.log('--- TEST SECTION 1: PHASE 12 STATUS SEPARATION ---');

  // Test 1a: Attempting to store 'AUTHORIZED' inside booking.status MUST fail with 400 INVALID_STATUS
  console.log('Test 1a: Rejection of status: "AUTHORIZED" in booking.status...');
  try {
    await bookingService.updateStatus(realId, { status: 'AUTHORIZED' });
    assert.fail('Should have rejected status: "AUTHORIZED"');
  } catch (err) {
    assert.strictEqual(err.code, 'INVALID_STATUS');
    console.log(`✔ Test 1a Passed: Correctly rejected setting booking.status = 'AUTHORIZED' (${err.message})`);
  }

  // Test 1b: Attempting to store 'TICKETED' inside booking.status MUST fail with 400 INVALID_STATUS
  console.log('\nTest 1b: Rejection of status: "TICKETED" in booking.status...');
  try {
    await bookingService.updateStatus(realId, { status: 'TICKETED' });
    assert.fail('Should have rejected status: "TICKETED"');
  } catch (err) {
    assert.strictEqual(err.code, 'INVALID_STATUS');
    console.log(`✔ Test 1b Passed: Correctly rejected setting booking.status = 'TICKETED' (${err.message})`);
  }

  // Test 1c: Valid booking statuses ('DONE', 'PENDING', 'CANCELLED', 'FAILED') succeed cleanly
  console.log('\nTest 1c: Valid status update to DONE...');
  const updatedStatusBooking = await bookingService.updateStatus(realId, { status: 'DONE' });
  assert.strictEqual(updatedStatusBooking.status || updatedStatusBooking.booking_status, 'DONE');
  console.log('✔ Test 1c Passed: Valid booking.status updated to DONE.');

  // ----------------------------------------------------
  // TEST SECTION 2: PHASE 13 EMAIL PROTECTION
  // ----------------------------------------------------
  console.log('\n--- TEST SECTION 2: PHASE 13 EMAIL PROTECTION ---');

  // Test 2a: Booking Confirmation Email blocked if flight itinerary is missing
  console.log('Test 2a: Blocking Booking Confirmation Email when flight itinerary is missing...');
  const bookingEmailResult1 = await sendBookingConfirmation(realId, { force: true });
  assert.strictEqual(bookingEmailResult1.success, false);
  assert.ok(bookingEmailResult1.error.includes('EMAIL_PROTECTION_BLOCKED'));
  console.log(`✔ Test 2a Passed: Booking email blocked cleanly (${bookingEmailResult1.error})`);

  // Now add flight itinerary segments
  const validSegments = [
    {
      journey_direction: 'outbound',
      segment_sequence: 1,
      carrier_name: 'British Airways',
      carrier_code: 'BA',
      flight_number: 'BA 286',
      origin_airport: 'SFO',
      destination_airport: 'LHR',
      departure_date: '2026-12-28',
      departure_time: '19:40',
      arrival_date: '2026-12-29',
      arrival_time: '14:00'
    }
  ];
  await bookingRepository.saveItinerarySegments(realId, validSegments);

  // Test 2b: Authorization Email blocked if payment splits are missing
  console.log('\nTest 2b: Blocking Authorization Request Email when payment splits are missing...');
  const authEmailResult1 = await sendPassengerAuthorizationEmail(realId);
  assert.strictEqual(authEmailResult1.success, false);
  assert.ok(authEmailResult1.error.includes('EMAIL_PROTECTION_BLOCKED'));
  console.log(`✔ Test 2b Passed: Authorization email blocked cleanly (${authEmailResult1.error})`);

  // Now add payment splits
  await bookingRepository.savePaymentSplits(realId, [
    { merchant_name: 'British Airways', amount: 2200.00, currency: 'USD' },
    { merchant_name: 'FareTransit LLC', amount: 600.00, currency: 'USD' }
  ]);

  // Test 2c: Final Ticket Email blocked if authorization is pending or PNR is missing
  console.log('\nTest 2c: Blocking Final Ticket Email when authorization is pending or PNR is missing...');
  const ticketEmailResult1 = await sendFinalTicketEmail(realId);
  assert.strictEqual(ticketEmailResult1.success, false);
  assert.ok(ticketEmailResult1.error.includes('Final ticket email blocked') || ticketEmailResult1.error.includes('EMAIL_PROTECTION_BLOCKED'));
  console.log(`✔ Test 2c Passed: Final ticket email blocked cleanly (${ticketEmailResult1.error})`);

  // Now save ticket details & customer authorization
  await bookingRepository.saveTicketDetails(realId, {
    airlineConfirmationNumber: 'BA286X',
    ticketNumber: '1251122334455',
    airlineName: 'British Airways',
    airlineCode: 'BA'
  });
  await bookingRepository.updateStatus(realId, { authorization_status: 'AUTHORIZED' });

  // Test 2d: Complete Valid Booking Confirmation Email Dispatch
  console.log('\nTest 2d: Valid Booking Confirmation Email dispatch after satisfying all protections...');
  const validBookingEmailResult = await sendBookingConfirmation(realId, { force: true });
  assert.strictEqual(validBookingEmailResult.success, true);
  console.log('✔ Test 2d Passed: Complete valid booking confirmation email dispatched successfully.');

  console.log('\n🎉 ALL STATUS SEPARATION & EMAIL PROTECTION TESTS PASSED SUCCESSFULLY!\n');
}

runStatusSeparationAndEmailProtectionTests().catch(err => {
  console.error('❌ Status Separation & Email Protection Test Failed:', err);
  process.exit(1);
});
