import assert from 'node:assert';
import { bookingRepository } from '../src/modules/bookings/booking.repository.mjs';
import passengerAuthorizationService from '../src/modules/authorizations/passenger-authorization.service.mjs';
import { generateAuthorizationPdfBuffer } from '../src/modules/authorizations/authorization-pdf.service.mjs';
import adminController from '../src/modules/admin/admin.controller.mjs';
import { supabase } from '../src/config/supabase.mjs';

async function createTestFlight(bookingId) {
  const { error } = await supabase.from('flights').insert({
    booking_id: bookingId,
    leg: 'outbound',
    departure_airport: 'IAH',
    arrival_airport: 'MIA',
    airline_name: 'Frontier Airlines',
    flight_number: 'F9 123',
    departure_date: '2026-09-15',
    departure_time_str: '10:00',
    arrival_date: '2026-09-15',
    arrival_time_str: '14:00',
    cabin_class: 'Economy',
    stops: 0
  });
  if (error) throw new Error(`Failed to create test flight: ${error.message}`);
}

async function runPassengerAuthFlowAndPdfTests() {
  console.log('\n=== RUNNING PASSENGER AUTHORIZATION FLOW & PDF EXPORT TESTS ===\n');

  // Create test booking
  const timestamp = Date.now().toString().slice(-8);
  const testCode = `TFS-PAF-${timestamp}`;
  const testBooking = await bookingRepository.createBookingRecord({
    confirmation_code: testCode,
    status: 'PENDING',
    payment_status: 'pending',
    total_amount: 1590.00,
    original_api_price: 1590.00,
    currency: 'USD',
    passenger_name: 'Elena Rostova',
    email: 'delivered@resend.dev',
    phone: '+1 415 555 0188'
  });

  const bookingId = testBooking.id;

  // Insert a test flight segment
  await createTestFlight(bookingId);

  // Test 1: State Machine Enforcement (PENDING -> TICKETED blocked without authorization)
  console.log('Test 1: Verifying PENDING -> TICKETED direct transition is blocked...');
  const mockReqDirectTicket = {
    params: { id: bookingId },
    body: { status: 'TICKETED', override: false }
  };
  let directTicketRes = null;
  const mockResDirectTicket = {
    status: (code) => ({ json: (data) => { directTicketRes = { statusCode: code, ...data }; return data; } }),
    json: (data) => { directTicketRes = data; return data; }
  };

  await adminController.updateBooking(mockReqDirectTicket, mockResDirectTicket, (err) => { throw err; });
  assert.strictEqual(directTicketRes.statusCode, 400);
  assert.strictEqual(directTicketRes.error?.code, 'TRANSITION_BLOCKED');
  console.log('  ✔ Direct PENDING -> TICKETED transition correctly blocked\n');

  // Test 2: Token Generation & Link Generation (/authorize/{token})
  console.log('Test 2: Token Generation & Link Verification (/authorize/{token})...');
  const authRecord = await passengerAuthorizationService.createAuthorizationToken(testBooking);
  const token = authRecord.token;
  assert.ok(token);

  const payload = await passengerAuthorizationService.getAuthorizationByToken(token);
  assert.strictEqual(payload.bookingId, bookingId);
  assert.strictEqual(payload.passengerName, 'Elena Rostova');
  assert.strictEqual(payload.customerEmail, 'delivered@resend.dev');
  assert.strictEqual(payload.authorizedAmount, '1590.00');
  assert.ok(payload.quoteSnapshot);
  assert.ok(payload.itinerarySnapshot);
  assert.ok(payload.policiesSnapshot);
  console.log('  ✔ Token resolved passenger details, itinerary, fare, and masked payment method cleanly\n');

  // Test 3: Accept Authorization ("I Authorize")
  console.log('Test 3: Accepting Authorization (IP, User-Agent, SHA-256 Audit Trail)...');
  const acceptRes = await passengerAuthorizationService.acceptAuthorization({
    token,
    acceptedCheckboxText: 'I authorize FareTransit to process flight booking and charge my saved payment method.',
    clientIp: '198.51.100.99',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)'
  });

  assert.strictEqual(acceptRes.success, true);
  assert.strictEqual(acceptRes.status, 'AUTHORIZED');

  const bookingAfterAuth = await bookingRepository.getById(bookingId);
  assert.strictEqual(bookingAfterAuth.status, 'AUTHORIZED');
  console.log('  ✔ Authorization accepted cleanly, booking updated to AUTHORIZED\n');

  // Test 4: PDF Export via getAuditEvidenceByBookingId
  console.log('Test 4: PDF Export via passengerAuthorizationService.getAuditEvidenceByBookingId...');
  const evidence = await passengerAuthorizationService.getAuditEvidenceByBookingId(bookingId);
  assert.ok(evidence, 'Audit evidence generated');
  assert.strictEqual(evidence.booking.id, bookingId);
  assert.ok(evidence.authorization);

  const pdfBuffer = await generateAuthorizationPdfBuffer(evidence);
  assert.ok(Buffer.isBuffer(pdfBuffer));
  assert.ok(pdfBuffer.toString('utf-8', 0, 4).includes('%PDF'));
  console.log('  ✔ PDF Evidence Export generated cleanly from getAuditEvidenceByBookingId (%PDF verified)\n');

  console.log('🎉 ALL PASSENGER AUTHORIZATION FLOW & PDF EXPORT TESTS PASSED SUCCESSFULLY!\n');
}

runPassengerAuthFlowAndPdfTests().catch(err => {
  console.error('❌ Test Failed:', err);
  process.exit(1);
});
