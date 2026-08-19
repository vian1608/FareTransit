import assert from 'node:assert';
import { bookingRepository } from '../src/modules/bookings/booking.repository.mjs';
import { sendBookingRequestReceivedEmail, sendPassengerAuthorizationEmail } from '../src/integrations/resend/resend.service.mjs';
import { generateAuthorizationPdfBuffer } from '../src/modules/authorizations/authorization-pdf.service.mjs';
import { PAYMENT_OPERATIONAL_STATES } from '../src/modules/bookings/booking.constants.mjs';

async function runPaymentAndEmailTests() {
  console.log('\n=== RUNNING PAYMENT ACCORDION & EMAIL FLOW TESTS ===\n');

  // Test 1: Verify exact 5 operational payment states definition
  console.log('Test 1: Verifying exact 5 payment operational states definition...');
  assert.strictEqual(PAYMENT_OPERATIONAL_STATES.length, 5);
  assert.deepStrictEqual(PAYMENT_OPERATIONAL_STATES, ['PENDING', 'PROCESSING', 'PAID', 'FAILED', 'REFUNDED']);
  console.log('  ✔ Exact 5 payment operational states defined\n');

  // Create a test booking
  const timestamp = Date.now().toString().slice(-8);
  const testCode = `TFS-P-${timestamp}`;
  const testBooking = await bookingRepository.createBookingRecord({
    confirmation_code: testCode,
    status: 'PENDING',
    payment_status: 'pending',
    total_amount: 549.99,
    original_api_price: 549.99,
    currency: 'USD',
    passenger_name: 'Sophia Martinez',
    email: 'delivered@resend.dev',
    phone: '+1 213 555 0199'
  });


  const bookingId = testBooking.id;

  await bookingRepository.saveItinerarySegments(bookingId, [
    {
      journey_direction: 'outbound',
      segment_sequence: 1,
      marketing_carrier_code: 'UA',
      flight_number: 'UA 100',
      origin_airport: 'LAX',
      destination_airport: 'MIA',
      departure_date: '2026-10-01',
      departure_time: '08:00 AM'
    }
  ]);

  await bookingRepository.savePaymentSplits(bookingId, [
    { merchant_name: 'FareTransit LLC', amount: 149.99, currency: 'USD' },
    { merchant_name: 'United Airlines', amount: 400.00, currency: 'USD' }
  ]);

  // Test 2: Idempotent Booking Request Email Dispatch

  console.log('Test 2: Testing sendBookingRequestReceivedEmail idempotency...');
  const firstEmailRes = await sendBookingRequestReceivedEmail(bookingId);
  assert.strictEqual(firstEmailRes.success, true);

  const updatedAfterFirst = await bookingRepository.getById(bookingId);
  assert.strictEqual(updatedAfterFirst.booking_request_email_status, 'SENT');

  // Call second time without force flag -> should skip duplicate dispatch
  const secondEmailRes = await sendBookingRequestReceivedEmail(bookingId);
  assert.strictEqual(secondEmailRes.success, true);
  assert.strictEqual(secondEmailRes.skipped, true);
  console.log('  ✔ Idempotent booking request email dispatch verified\n');

  // Test 3: Missing Passenger Email Validation
  console.log('Test 3: Testing missing passenger email error handling...');
  const noEmailBooking = await bookingRepository.createBookingRecord({
    confirmation_code: `TFS-NE-${timestamp}`,
    status: 'PENDING',
    payment_status: 'pending',
    total_amount: 299.00,
    email: null,
    passenger_name: 'No Email Traveller'
  });


  await bookingRepository.saveItinerarySegments(noEmailBooking.id, [
    {
      journey_direction: 'outbound',
      segment_sequence: 1,
      marketing_carrier_code: 'UA',
      airline_name: 'United Airlines',
      flight_number: 'UA 100',
      origin_airport: 'LAX',
      destination_airport: 'ORD',
      departure_date: '2026-11-10',
      departure_time: '08:00 AM'
    }
  ]);

  const authNoEmailRes = await sendPassengerAuthorizationEmail(noEmailBooking.id);

  assert.strictEqual(authNoEmailRes.success, false);
  assert.strictEqual(authNoEmailRes.error, 'This booking does not have a valid passenger email address.');
  console.log('  ✔ Missing email correctly rejected with sanitized admin error message\n');

  // Test 4: Passenger Authorization Email Dispatch & 24-hr Token
  console.log('Test 4: Testing sendPassengerAuthorizationEmail dispatch & token generation...');
  const authRes = await sendPassengerAuthorizationEmail(bookingId);
  assert.strictEqual(authRes.success, true);
  assert.ok(authRes.emailId);
  assert.ok(authRes.authUrl.includes('https://www.faretransit.com/authorize/'));

  const updatedAfterAuth = await bookingRepository.getById(bookingId);
  assert.strictEqual(updatedAfterAuth.status, 'AWAITING_AUTHORIZATION');
  assert.strictEqual(updatedAfterAuth.authorization_email_status, 'SENT');
  assert.ok(updatedAfterAuth.authorization_expires_at);
  console.log('  ✔ Passenger authorization email dispatched cleanly & token created\n');

  // Test 5: PDF Evidence Export Generation
  console.log('Test 5: Testing PDF Evidence Export Generation...');
  const evidenceMock = {
    allowFallback: true,
    evidenceId: `EVID_${testCode}`,
    confirmationCode: testCode,
    passengerName: 'Sophia Martinez',
    customerEmail: 'sophia.martinez@example.com',
    authorizedAmount: 549.99,
    currency: 'USD',
    cardBrand: 'Visa',
    cardLast4: '4242',
    authorizationWording: 'Passenger confirmed itinerary and authorized payment of $549.99.',
    authorization: {
      status: 'ACCEPTED',
      acceptedAt: new Date().toISOString(),
      clientIp: '198.51.100.22',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      textHash: '8f92a09c21...',
      tokenId: 'TOK-998811'
    },
    itinerarySnapshot: {
      outboundSegments: [
        { carrier_name: 'Delta Air Lines', flight_number: 'DL-120', origin_airport: 'ATL', destination_airport: 'LAX', departure_date: '2026-08-10', departure_time: '08:00', arrival_date: '2026-08-10', arrival_time: '10:30', cabin: 'Economy' }
      ]
    },
    auditTrail: [
      { timestamp: new Date().toISOString(), eventType: 'AUTHORIZATION_REQUESTED', actor: 'Admin', details: 'Authorization email sent' }
    ]
  };

  const pdfBuffer = await generateAuthorizationPdfBuffer(evidenceMock);
  assert.ok(Buffer.isBuffer(pdfBuffer));
  assert.ok(pdfBuffer.length > 500);
  assert.strictEqual(pdfBuffer.toString('utf8', 0, 4), '%PDF');
  console.log('  ✔ PDF Authorization Evidence generated cleanly (%PDF binary stream verified)\n');

  console.log('🎉 ALL PAYMENT ACCORDION & EMAIL FLOW TESTS PASSED SUCCESSFULLY!\n');
}

runPaymentAndEmailTests().catch((err) => {
  console.error('❌ Payment Accordion & Email Flow Test Failed:', err);
  process.exit(1);
});
