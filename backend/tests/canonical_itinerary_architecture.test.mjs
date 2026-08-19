import assert from 'assert';
import bookingRepository from '../src/modules/bookings/booking.repository.mjs';
import {
  sendBookingRequestReceivedEmail,
  sendPassengerAuthorizationEmail,
  sendFinalTicketEmail,
  renderFlightItineraryHtml
} from '../src/integrations/resend/resend.service.mjs';
import passengerAuthorizationService from '../src/modules/authorizations/passenger-authorization.service.mjs';
import { generateAuthorizationPdfBuffer } from '../src/modules/authorizations/authorization-pdf.service.mjs';

async function runCanonicalItineraryArchitectureTests() {
  console.log('=== RUNNING CANONICAL ITINERARY ARCHITECTURE & ZERO-FALLBACK TESTS ===\n');

  // Test 1: Setup real expected booking TFS-2026-HQ39GA (LHR -> GEG, $2,122.20 USD)
  console.log('Test 1: Setting up booking TFS-2026-HQ39GA (LHR -> GEG, British Airways)...');
  const code = 'TFS-2026-HQ39GA';
  const testBooking = await bookingRepository.createBookingRecord({
    confirmation_code: code,
    status: 'READY_FOR_TICKETING',
    payment_status: 'PAID',
    total_amount: 2122.20,
    customer_price: 2122.20,
    original_api_price: 2122.20,
    currency: 'USD',
    passenger_name: 'Arthur Pendelton',
    email: 'delivered@resend.dev',
    phone: '+44 20 7946 0912',
    airline_code: 'BA',
    airline_name: 'British Airways',
    airline_confirmation_number: 'AB12CD',
    ticket_number: '1252410982341'
  });

  const realUuid = testBooking.id;

  // Insert real flight segment for LHR -> GEG
  await bookingRepository.saveItinerarySegments(realUuid, [
    {
      journey_direction: 'outbound',
      segment_sequence: 1,
      marketing_carrier_code: 'BA',
      airline_name: 'British Airways',
      flight_number: 'BA 215',
      origin_airport: 'LHR',
      origin_city: 'London',
      destination_airport: 'GEG',
      destination_city: 'Spokane',
      departure_date: '2026-10-15',
      departure_time: '11:30 AM',
      arrival_date: '2026-10-15',
      arrival_time: '04:45 PM',
      cabin_class: 'Business'
    }
  ]);

  // Test 2: getCompleteBookingById resolves public Booking ID to internal UUID
  console.log('Test 2: Verifying getCompleteBookingById resolves public Booking ID to internal UUID...');
  const completeBooking = await bookingRepository.getCompleteBookingById(code);
  assert.ok(completeBooking, 'completeBooking should be resolved');
  assert.strictEqual(completeBooking.id, realUuid, 'Internal UUID must match');
  assert.strictEqual(completeBooking.confirmation_code, code);
  assert.strictEqual(completeBooking.itinerary.outbound.length, 1);
  assert.strictEqual(completeBooking.itinerary.outbound[0].originCode, 'LHR');
  assert.strictEqual(completeBooking.itinerary.outbound[0].destinationCode, 'GEG');
  assert.strictEqual(completeBooking.itinerary.outbound[0].carrierCode, 'BA');
  assert.strictEqual(completeBooking.itinerary.outbound[0].airlineName, 'British Airways');
  console.log('  ✔ getCompleteBookingById cleanly resolved internal UUID & normalized itinerary\n');

  // Test 3: Rendered HTML itinerary contains LHR -> GEG and ZERO demo fallbacks
  console.log('Test 3: Testing rendered flight itinerary HTML component...');
  const htmlOut = renderFlightItineraryHtml(completeBooking);
  assert.ok(htmlOut.includes('LHR'), 'HTML must contain origin LHR');
  assert.ok(htmlOut.includes('GEG'), 'HTML must contain destination GEG');
  assert.ok(htmlOut.includes('British Airways') || htmlOut.includes('BA'), 'HTML must contain British Airways carrier');

  const forbiddenStrings = ['LAX', 'MIA', 'UA 100', 'Alaska', 'United', '2026-07-30', '2026-08-11', 'Commercial Airline', 'Airline information unavailable', 'DEP', 'ARR', 'Scheduled'];
  forbiddenStrings.forEach(str => {
    assert.strictEqual(htmlOut.includes(str), false, `Production rendered HTML must NOT contain demo fallback string "${str}"`);
  });
  console.log('  ✔ Rendered HTML verified cleanly with zero demo fallback strings\n');

  // Test 4: Dispatch Booking Request Email
  console.log('Test 4: Dispatching Booking Request Email...');
  const requestEmailRes = await sendBookingRequestReceivedEmail(code);
  assert.strictEqual(requestEmailRes.success, true);
  console.log('  ✔ Booking Request Email dispatched cleanly\n');

  // Test 5: Dispatch Authorization Email & create token snapshot
  console.log('Test 5: Dispatching Authorization Email...');
  const authEmailRes = await sendPassengerAuthorizationEmail(code);
  assert.strictEqual(authEmailRes.success, true);

  const updatedBookingAfterAuth = await bookingRepository.getCompleteBookingById(code);
  const token = updatedBookingAfterAuth.authorization_token;
  assert.ok(token, 'Authorization token must be generated');

  const authData = await passengerAuthorizationService.getAuthorizationByToken(token);
  assert.ok(authData, 'Stateless token lookup must return payload');
  assert.strictEqual(authData.authorizedAmount, '2122.20');
  assert.strictEqual(authData.itinerarySnapshot.outbound.originCode, 'LHR');
  assert.strictEqual(authData.itinerarySnapshot.outbound.destinationCode, 'GEG');
  console.log('  ✔ Authorization Email & Token snapshot loaded real LHR -> GEG & $2,122.20 USD\n');

  // Test 6: PDF Evidence Export
  console.log('Test 6: Generating Authorization Evidence PDF Buffer...');
  const evidence = await passengerAuthorizationService.getAuditEvidenceByBookingId(code);
  assert.ok(evidence, 'Audit evidence must be generated');
  assert.strictEqual(evidence.authorizedAmount, '2122.20');

  const pdfBuffer = await generateAuthorizationPdfBuffer(evidence);
  assert.ok(pdfBuffer instanceof Buffer);
  assert.ok(pdfBuffer.length > 500);
  assert.strictEqual(pdfBuffer.toString('utf8', 0, 4), '%PDF');
  console.log('  ✔ PDF Authorization Evidence Buffer generated cleanly\n');

  // Test 7: Dispatch Final Ticket Email
  console.log('Test 7: Dispatching Final Ticket Email...');
  const finalEmailRes = await sendFinalTicketEmail(code);
  assert.strictEqual(finalEmailRes.success, true);
  console.log('  ✔ Final E-Ticket Email dispatched cleanly\n');

  console.log('🎉 ALL CANONICAL ITINERARY ARCHITECTURE TESTS PASSED SUCCESSFULLY!\n');
}

runCanonicalItineraryArchitectureTests().catch(err => {
  console.error('❌ Canonical Itinerary Architecture Test Failed:', err);
  process.exit(1);
});
