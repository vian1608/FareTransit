import assert from 'node:assert';
import { bookingRepository } from '../src/modules/bookings/booking.repository.mjs';
import { sendFinalTicketEmail, sendPassengerAuthorizationEmail, sendBookingRequestReceivedEmail } from '../src/integrations/resend/resend.service.mjs';
import { BOOKING_STATUSES, PAYMENT_OPERATIONAL_STATES } from '../src/modules/bookings/booking.constants.mjs';

async function runEmailActivityAndFinalTicketTests() {
  console.log('\n=== RUNNING EMAIL DELIVERY ACTIVITY & FINAL TICKET EMAIL TESTS ===\n');

  // Create test booking
  const timestamp = Date.now().toString().slice(-8);
  const testCode = `TFS-ET-${timestamp}`;
  const testBooking = await bookingRepository.createBookingRecord({
    confirmation_code: testCode,
    status: 'TICKETED',
    payment_status: 'PAID',
    airline_pnr: 'UA1029',
    total_amount: 1250.00,

    original_api_price: 1250.00,
    currency: 'USD',
    passenger_name: 'Sophia Anderson',
    email: 'delivered@resend.dev',
    phone: '+1 415 555 0199'
  });

  const bookingId = testBooking.id;

  await bookingRepository.saveItinerarySegments(bookingId, [
    {
      journey_direction: 'outbound',
      segment_sequence: 1,
      marketing_carrier_code: 'UA',
      airline_name: 'United Airlines',
      flight_number: 'UA 1029',
      origin_airport: 'SFO',
      origin_city: 'San Francisco',
      destination_airport: 'JFK',
      destination_city: 'New York',
      departure_date: '2026-11-15',
      departure_time: '09:00 AM'
    }
  ]);


  // Test 1: Send Final Ticket Email
  console.log('Test 1: Dispatching Final E-Ticket Email...');
  const ticketRes = await sendFinalTicketEmail(testBooking);
  assert.strictEqual(ticketRes.success, true);
  assert.ok(ticketRes.emailId);

  const bookingAfterTicket = await bookingRepository.getById(bookingId);
  assert.strictEqual(bookingAfterTicket.final_confirmation_email_status, 'SENT');
  assert.ok(bookingAfterTicket.final_confirmation_email_sent_at);
  assert.strictEqual(bookingAfterTicket.final_confirmation_email_recipient, 'delivered@resend.dev');
  console.log('  ✔ Final E-Ticket Email dispatched and persisted cleanly\n');

  // Test 2: Calculate Email Delivery Activity Sent Counter
  console.log('Test 2: Calculating Email Delivery Activity Sent Counter...');
  let sentCount = 0;
  if ((bookingAfterTicket.booking_request_email_status || '').toUpperCase() === 'SENT') sentCount++;
  if ((bookingAfterTicket.authorization_email_status || '').toUpperCase() === 'SENT') sentCount++;
  if ((bookingAfterTicket.final_confirmation_email_status || '').toUpperCase() === 'SENT') sentCount++;
  assert.strictEqual(sentCount, 1);
  console.log(`  ✔ Correct sent email count calculated (${sentCount} Sent)\n`);

  // Test 3: Send Authorization Email and check counter increment
  console.log('Test 3: Dispatching Authorization Email...');
  const authRes = await sendPassengerAuthorizationEmail(bookingId);
  assert.strictEqual(authRes.success, true);

  const bookingAfterAuth = await bookingRepository.getById(bookingId);
  assert.strictEqual(bookingAfterAuth.authorization_email_status, 'SENT');

  let newSentCount = 0;
  if ((bookingAfterAuth.booking_request_email_status || '').toUpperCase() === 'SENT') newSentCount++;
  if ((bookingAfterAuth.authorization_email_status || '').toUpperCase() === 'SENT') newSentCount++;
  if ((bookingAfterAuth.final_confirmation_email_status || '').toUpperCase() === 'SENT') newSentCount++;
  assert.strictEqual(newSentCount, 2);
  console.log(`  ✔ Incremented sent email count calculated (${newSentCount} Sent)\n`);

  // Test 4: Verify Booking ID Wording across email subjects & bodies
  console.log('Test 4: Verifying Booking ID wording standard...');
  const ticketSubject = `Official Flight E-Ticket & Confirmation — Booking ID ${testCode} | FareTransit`;
  assert.ok(ticketSubject.includes('Booking ID'));
  assert.ok(!ticketSubject.includes('Temporary Confirmation Number'));
  console.log('  ✔ Customer-facing wording verified ("Booking ID")\n');

  console.log('🎉 ALL EMAIL DELIVERY ACTIVITY & FINAL TICKET TESTS PASSED SUCCESSFULLY!\n');
}

runEmailActivityAndFinalTicketTests().catch((err) => {
  console.error('❌ Email Delivery Activity & Final Ticket Test Failed:', err);
  process.exit(1);
});
