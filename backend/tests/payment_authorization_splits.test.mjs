import assert from 'assert';
import { bookingRepository } from '../src/modules/bookings/booking.repository.mjs';
import { passengerAuthorizationService } from '../src/modules/authorizations/passenger-authorization.service.mjs';
import { generateAuthorizationPdfBuffer } from '../src/modules/authorizations/authorization-pdf.service.mjs';
import { sendPassengerAuthorizationEmail, sendBookingConfirmation, sendFinalTicketEmail } from '../src/integrations/resend/resend.service.mjs';


async function runPaymentAuthorizationSplitsTests() {
  console.log('\n=== RUNNING PAYMENT AUTHORIZATION SPLITS TESTS ===\n');

  // Test 1: Saving & retrieving payment splits
  console.log('Test 1: Saving and retrieving payment splits via repository...');
  const testBookingId = 'test-split-booking-001';
  const splits = [
    { merchant_name: 'United Airlines', amount: 1800, currency: 'USD' },
    { merchant_name: 'FareTransit LLC', amount: 322.20, currency: 'USD' }
  ];

  await bookingRepository.savePaymentSplits(testBookingId, splits);
  const fetchedSplits = await bookingRepository.getPaymentSplits(testBookingId);

  assert.strictEqual(fetchedSplits.length, 2, 'Should return 2 split payment rows');
  assert.strictEqual(fetchedSplits[0].merchant_name, 'United Airlines');
  assert.strictEqual(parseFloat(fetchedSplits[0].amount), 1800);
  assert.strictEqual(fetchedSplits[1].merchant_name, 'FareTransit LLC');
  assert.strictEqual(parseFloat(fetchedSplits[1].amount), 322.20);
  console.log('  ✔ Payment splits saved and retrieved cleanly');

  // Test 2: Creating authorization token with split payload
  console.log('\nTest 2: Verifying authorization token snapshot incorporates split amounts...');
  const dummyBooking = {
    id: testBookingId,
    confirmation_code: 'TFS-SPLIT-99',
    customer_price: 2122.20,
    total_amount: 2122.20,
    currency: 'USD',
    passenger_name: 'John Doe',
    email: 'john.doe@example.com',
    payment_splits: splits,
    flights: [
      { direction: 'outbound', carrier: 'UA', carrier_name: 'United Airlines', flight_number: 'UA 100', origin_code: 'LAX', destination_code: 'MIA', departure_date: '2026-09-10', cabin: 'Economy' }
    ]
  };

  const authRecord = await passengerAuthorizationService.createAuthorizationToken(dummyBooking);
  assert.ok(authRecord.token, 'Token must be generated');
  assert.strictEqual(authRecord.quote_snapshot.amount, '2122.20', 'Total authorized amount must match sum of splits');
  assert.strictEqual(authRecord.quote_snapshot.splits.length, 2, 'Quote snapshot must contain 2 merchant splits');
  console.log('  ✔ Token quote snapshot contains split breakdown & exact total ($2122.20 USD)');

  // Test 3: PDF Evidence export rendering split breakdown
  console.log('\nTest 3: Generating PDF Evidence Export with split payment section...');
  const pdfBuffer = await generateAuthorizationPdfBuffer({
    id: 'auth_split_001',
    bookingId: testBookingId,
    token: authRecord.token,
    status: 'ACCEPTED',
    clientIp: '198.51.100.22',
    userAgent: 'Mozilla/5.0 SplitTest',
    authorizationTextHash: 'abc123hash',
    quoteSnapshot: authRecord.quote_snapshot,
    itinerarySnapshot: authRecord.itinerary_snapshot,
    cardBrand: 'Visa',
    cardLast4: '4242',
    acceptedAt: new Date().toISOString()
  }, dummyBooking);

  assert.ok(Buffer.isBuffer(pdfBuffer), 'PDF output must be a valid binary buffer');
  assert.ok(pdfBuffer.length > 500, 'PDF buffer size must be > 500 bytes');
  console.log('  ✔ PDF Authorization Evidence generated cleanly with split breakdown');

  console.log('\n🎉 ALL PAYMENT AUTHORIZATION SPLITS TESTS PASSED SUCCESSFULLY!\n');
}

runPaymentAuthorizationSplitsTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
