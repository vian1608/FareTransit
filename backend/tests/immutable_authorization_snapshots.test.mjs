import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

import assert from 'assert';
import passengerAuthorizationService from '../src/modules/authorizations/passenger-authorization.service.mjs';
import bookingRepository from '../src/modules/bookings/booking.repository.mjs';
import { generateAuthorizationPdfBuffer } from '../src/modules/authorizations/authorization-pdf.service.mjs';

async function runImmutableAuthorizationSnapshotTests() {
  console.log('=== RUNNING IMMUTABLE AUTHORIZATION SNAPSHOT TESTS ===\n');

  const testId = '77cc88dd-99ee-00ff-11aa-223344556677';
  const initialBooking = {
    id: testId,
    confirmation_code: 'TFS-2026-SNAP99',
    passenger_name: 'Marcus Vance',
    email: 'marcus.vance@example.com',
    phone: '+1 415-555-0155',
    customer_price: 1500.00,
    total_amount: 1500.00,
    currency: 'USD',
    status: 'PENDING',
    payment_status: 'pending',
    airline_name: 'Delta Air Lines',
    itinerary_segments: [
      {
        journey_direction: 'outbound',
        segment_sequence: 1,
        carrier_name: 'Delta Air Lines',
        carrier_code: 'DL',
        flight_number: 'DL 120',
        origin_airport: 'JFK',
        destination_airport: 'CDG',
        departure_date: '2026-11-15',
        departure_time: '19:30',
        arrival_date: '2026-11-16',
        arrival_time: '09:00'
      }
    ],
    payment_splits: [
      { merchant_name: 'Delta Air Lines', amount: 1200.00, currency: 'USD' },
      { merchant_name: 'FareTransit LLC', amount: 300.00, currency: 'USD' }
    ]
  };

  await bookingRepository.createBookingRecord(initialBooking);
  await bookingRepository.saveItinerarySegments(testId, initialBooking.itinerary_segments);
  await bookingRepository.savePaymentSplits(testId, initialBooking.payment_splits);

  // Step 1: Create single-use token
  console.log('Step 1: Create 24-hour authorization token & snapshot payload...');
  const tokenRecord = await passengerAuthorizationService.createAuthorizationToken(testId);
  assert.ok(tokenRecord.token, 'Token generated');

  // Step 2: Customer clicks "I Authorize" — creates frozen immutable authorization_snapshot
  console.log('\nStep 2: Customer accepts authorization ("I Authorize")...');
  const clientIp = '198.51.100.99';
  const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';
  const consentText = 'I confirm that the passenger names, itinerary, dates, fare, fees and contact information shown above are correct.';

  const acceptResult = await passengerAuthorizationService.acceptAuthorization({
    token: tokenRecord.token,
    clientIp,
    userAgent,
    acceptedCheckboxText: consentText
  });
  assert.strictEqual(acceptResult.status, 'AUTHORIZED');
  console.log('✔ Step 2 Passed: Authorization accepted cleanly. Created frozen authorization_snapshot.');

  // Step 3: Fetch audit evidence BEFORE mutable modification
  console.log('\nStep 3: Export audit evidence snapshot...');
  const evidenceBefore = await passengerAuthorizationService.getAuditEvidenceByBookingId(testId);
  assert.strictEqual(evidenceBefore.passengerName, 'Marcus Vance');
  assert.strictEqual(evidenceBefore.clientIp, '198.51.100.99');
  assert.ok(evidenceBefore.authorization_snapshot, 'authorization_snapshot must exist');
  assert.strictEqual(evidenceBefore.authorization_snapshot.passenger_name, 'Marcus Vance');

  // Step 4: MUTABLE BOOKING MODIFICATION (Admin changes booking price & passenger name after authorization)
  console.log('\nStep 4: Mutate booking record (Admin changes booking passenger name & price)...');
  await bookingRepository.updateStatus(testId, {
    passenger_name: 'MODIFIED_NAME_HACKER',
    total_amount: 9999.00
  });

  // Step 5: Verify Evidence Export & PDF STILL RENDER FROZEN SNAPSHOT DATA (Immutability Check)
  console.log('\nStep 5: Verify evidence export & PDF immutability against booking modifications...');
  const evidenceAfter = await passengerAuthorizationService.getAuditEvidenceByBookingId(testId);

  assert.strictEqual(evidenceAfter.passengerName, 'Marcus Vance', 'Evidence export MUST preserve frozen snapshot passenger name!');
  assert.strictEqual(evidenceAfter.authorization_snapshot.passenger_name, 'Marcus Vance');
  assert.strictEqual(evidenceAfter.authorizedAmount, '1500.00', 'Evidence export MUST preserve frozen snapshot amount!');
  console.log('✔ Step 5a Passed: Audit evidence export uses frozen snapshot data exclusively (unaffected by mutable booking changes)');

  // Step 6: PDF Generation Buffer Check
  console.log('\nStep 6: Generate Authorization PDF buffer from frozen snapshot evidence...');
  const pdfBuffer = await generateAuthorizationPdfBuffer(evidenceAfter);
  assert.ok(pdfBuffer instanceof Buffer, 'PDF buffer generated');
  assert.ok(pdfBuffer.length > 1000, 'PDF buffer contains content');
  console.log(`✔ Step 6 Passed: PDF buffer generated cleanly from frozen snapshot (${pdfBuffer.length} bytes)`);

  console.log('\n🎉 ALL IMMUTABLE AUTHORIZATION SNAPSHOT TESTS PASSED SUCCESSFULLY!\n');
}

runImmutableAuthorizationSnapshotTests().catch(err => {
  console.error('❌ Immutable Authorization Snapshot Test Failed:', err);
  process.exit(1);
});
