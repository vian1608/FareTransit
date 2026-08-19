import assert from 'node:assert';
import { bookingRepository } from '../src/modules/bookings/booking.repository.mjs';
import { passengerAuthorizationService } from '../src/modules/authorizations/passenger-authorization.service.mjs';
import { sendFinalTicketEmail, renderFlightItineraryHtml } from '../src/integrations/resend/resend.service.mjs';
import { BOOKING_STATUSES } from '../src/modules/bookings/booking.constants.mjs';

async function runStatelessAuthAndTicketDetailsTests() {
  console.log('\n=== RUNNING STATELESS AUTH & AIRLINE TICKET DETAILS TESTS ===\n');

  // Create test booking
  const timestamp = Date.now().toString().slice(-8);
  const testCode = `TFS-ST-${timestamp}`;
  const testBooking = await bookingRepository.createBookingRecord({
    confirmation_code: testCode,
    status: 'PENDING',
    payment_status: 'PENDING',
    total_amount: 1450.00,
    original_api_price: 1450.00,
    currency: 'USD',
    passenger_name: 'Marcus Vance',
    email: 'delivered@resend.dev',
    phone: '+1 312 555 0177'
  });

  const bookingId = testBooking.id;

  await bookingRepository.saveItinerarySegments(bookingId, [
    {
      journey_direction: 'outbound',
      segment_sequence: 1,
      marketing_carrier_code: 'UA',
      airline_name: 'United Airlines',
      flight_number: 'UA 100',
      origin_airport: 'LAX',
      origin_city: 'Los Angeles',
      destination_airport: 'ORD',
      destination_city: 'Chicago',
      departure_date: '2026-11-10',
      departure_time: '08:00 AM'
    }
  ]);


  // Test 1: Stateless Token Generation & Resolution
  console.log('Test 1: Stateless Signed Authorization Token Generation & Resolution...');
  const authRecord = await passengerAuthorizationService.createAuthorizationToken(testBooking);
  const token = authRecord.token;
  assert.ok(token);
  assert.ok(token.startsWith('tks_'));

  const retrieved = await passengerAuthorizationService.getAuthorizationByToken(token);
  assert.strictEqual(retrieved.bookingId, bookingId);
  assert.strictEqual(retrieved.confirmationCode, testCode);
  console.log('  ✔ Stateless signed token generated & resolved cleanly without reliance on DB table\n');

  // Test 2: Gate Final Ticket Email without Airline PNR
  console.log('Test 2: Verifying Final Ticket Email is gated until Airline PNR exists...');
  const ticketWithoutPnr = await sendFinalTicketEmail(testBooking);
  assert.strictEqual(ticketWithoutPnr.success, false);
  assert.ok(ticketWithoutPnr.error.includes('airline PNR') || ticketWithoutPnr.error.includes('Airline Confirmation Number (PNR)'));

  console.log('  ✔ Final Ticket Email correctly blocked when Airline PNR is missing\n');

  // Test 3: Save Airline Ticket Details (PNR, Airline Name, Ticket #)
  console.log('Test 3: Saving Airline Ticket Details (PNR, Ticket #)...');
  const updatedBooking = await bookingRepository.updateBookingStatus(bookingId, {
    status: 'TICKETED',
    payment_status: 'PAID',
    airline_pnr: 'UA9X82',
    airline_name: 'United Airlines',
    ticket_number: '016-9920182741',
    ticket_issue_date: new Date().toISOString()
  });

  assert.strictEqual(updatedBooking.airline_pnr, 'UA9X82');
  assert.strictEqual(updatedBooking.airline_name, 'United Airlines');
  assert.strictEqual(updatedBooking.ticket_number, '016-9920182741');
  console.log('  ✔ Airline Ticket Details saved and retrieved cleanly\n');

  // Test 4: Send Final Ticket Email with saved PNR
  console.log('Test 4: Dispatching Final Ticket Email with saved PNR...');
  const ticketWithPnr = await sendFinalTicketEmail(updatedBooking);
  assert.strictEqual(ticketWithPnr.success, true);
  assert.ok(ticketWithPnr.emailId);
  console.log('  ✔ Final Ticket Email dispatched successfully with Airline PNR (UA9X82)\n');

  // Test 5: Verify Reusable Flight Itinerary Component & Carrier Logos
  console.log('Test 5: Verifying HTML Flight Itinerary component rendering carrier logos...');
  const sampleFlights = [
    {
      journey_direction: 'outbound',
      carrier_code: 'UA',
      carrier_name: 'United Airlines',
      flight_number: 'UA 881',
      origin_airport: 'ORD',
      destination_airport: 'LAX',
      departure_date: '2026-09-15',
      departure_time: '08:00 AM',
      arrival_date: '2026-09-15',
      arrival_time: '10:30 AM',
      cabin: 'Business'
    },
    {
      journey_direction: 'return',
      carrier_code: 'DL',
      carrier_name: 'Delta Air Lines',
      flight_number: 'DL 402',
      origin_airport: 'LAX',
      destination_airport: 'ORD',
      departure_date: '2026-09-22',
      departure_time: '01:00 PM',
      arrival_date: '2026-09-22',
      arrival_time: '07:15 PM',
      cabin: 'Business'
    }
  ];

  const htmlItinerary = renderFlightItineraryHtml(sampleFlights, 'USD');
  assert.ok(htmlItinerary.includes('assets.duffel.com/img/airlines/for-floor/sq/UA.png'));
  assert.ok(htmlItinerary.includes('assets.duffel.com/img/airlines/for-floor/sq/DL.png'));
  assert.ok(htmlItinerary.includes('United Airlines'));
  assert.ok(htmlItinerary.includes('Delta Air Lines'));
  console.log('  ✔ Reusable Flight Itinerary HTML rendered carrier logos for UA and DL\n');

  // Test 6: Verify all 9 Booking Statuses
  console.log('Test 6: Verifying all 9 canonical booking status transitions...');
  for (const st of BOOKING_STATUSES) {
    const res = await bookingRepository.updateBookingStatus(bookingId, { status: st });
    assert.strictEqual(res.status, st);
  }
  console.log('  ✔ All 9 canonical status transitions verified\n');

  console.log('🎉 ALL STATELESS AUTH & AIRLINE TICKET DETAILS TESTS PASSED SUCCESSFULLY!\n');
}

runStatelessAuthAndTicketDetailsTests().catch((err) => {
  console.error('❌ Test Failed:', err);
  process.exit(1);
});
