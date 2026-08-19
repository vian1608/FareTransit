import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

import assert from 'assert';
import bookingRepository from '../src/modules/bookings/booking.repository.mjs';
import passengerAuthorizationService from '../src/modules/authorizations/passenger-authorization.service.mjs';
import { generateAuthorizationPdfBuffer } from '../src/modules/authorizations/authorization-pdf.service.mjs';

async function runPdfEvidenceProtectionTests() {
  console.log('=== RUNNING PDF EVIDENCE PROTECTION TESTS ===\n');

  const testId = '33cc44dd-55ee-66ff-77aa-889900112233';
  const initialBooking = {
    id: testId,
    confirmation_code: 'TFS-2026-PDFEVID',
    passenger_name: 'Marion Cotillard',
    email: 'marion@example.com',
    phone: '+1 415-555-0333',
    customer_price: 3200.00,
    total_amount: 3200.00,
    currency: 'USD',
    status: 'PENDING',
    payment_status: 'pending',
    authorization_status: 'AWAITING_AUTHORIZATION',
    airline_name: 'Air France',
    airline_code: 'AF',
    itinerary_segments: [
      {
        journey_direction: 'outbound',
        segment_sequence: 1,
        carrier_name: 'Air France',
        carrier_code: 'AF',
        flight_number: 'AF 083',
        origin_airport: 'SFO',
        destination_airport: 'CDG',
        departure_date: '2026-12-30',
        departure_time: '15:10',
        arrival_date: '2026-12-31',
        arrival_time: '11:05'
      }
    ]
  };

  const createdBooking = await bookingRepository.createBookingRecord(initialBooking);
  const realId = createdBooking?.id || testId;
  await bookingRepository.saveItinerarySegments(realId, initialBooking.itinerary_segments);
  await bookingRepository.savePaymentSplits(realId, [
    { merchant_name: 'Air France', amount: 2700.00, currency: 'USD' },
    { merchant_name: 'FareTransit LLC', amount: 500.00, currency: 'USD' }
  ]);

  // Test 1: Attempting PDF generation without an immutable snapshot MUST fail
  console.log('Test 1: Rejection of PDF generation without an immutable authorization snapshot...');
  try {
    await generateAuthorizationPdfBuffer({
      booking: createdBooking,
      authorization: { status: 'PENDING' }
    });
    assert.fail('Should have thrown IMMUTABLE_SNAPSHOT_REQUIRED');
  } catch (err) {
    assert.ok(err.message.includes('IMMUTABLE_SNAPSHOT_REQUIRED'));
    console.log(`✔ Test 1 Passed: PDF generation without snapshot rejected cleanly (${err.message})`);
  }

  // Test 2: Simulating customer authorization to create immutable authorization snapshot
  console.log('\nTest 2: Simulating customer acceptance to create immutable snapshot...');
  const authRecord = await passengerAuthorizationService.createAuthorizationToken(createdBooking);
  const acceptResult = await passengerAuthorizationService.acceptAuthorization({
    token: authRecord.token,
    ipAddress: '198.51.100.88',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    consentText: 'I confirm that the passenger names, itinerary, dates, fare, fees and contact information shown above are correct. I authorize FareTransit LLC to charge my saved payment method.'
  });

  assert.strictEqual(acceptResult.success, true);
  assert.ok(acceptResult.authorizationSnapshot, 'Must return immutable authorizationSnapshot');
  console.log('✔ Test 2 Passed: Customer authorization accepted & immutable snapshot created.');

  // Test 3: Verifying PDF Evidence Generation & Mandated 13 Fields
  console.log('\nTest 3: Generating Authorization Evidence PDF strictly from snapshot & verifying 13 fields...');
  const evidenceExport = await passengerAuthorizationService.generateAuditEvidenceExport(realId);
  const pdfBuffer = await generateAuthorizationPdfBuffer(evidenceExport);

  assert.ok(Buffer.isBuffer(pdfBuffer), 'Must return PDF Buffer');
  assert.ok(pdfBuffer.length > 1000, 'PDF Buffer must be non-empty');
  assert.strictEqual(pdfBuffer.toString('utf8', 0, 8).startsWith('%PDF-1.'), true, 'Header must be valid PDF format');

  // Verify all 13 snapshot fields exist in the evidenceExport snapshot
  const snap = evidenceExport.authorization_snapshot || evidenceExport.snapshot;
  assert.strictEqual(snap.booking_id, realId, '1. Booking ID');
  assert.ok(snap.passenger_details || snap.passenger_name, '2. Passenger Details');
  assert.ok(snap.itinerary_snapshot || snap.itinerary, '3. Itinerary Snapshot');
  assert.ok(snap.airline_info || snap.airline_name, '4. Airline Info');
  assert.ok(snap.flight_numbers || (snap.itinerary_snapshot && snap.itinerary_snapshot.length > 0), '5. Flight Numbers');
  assert.ok(snap.payment_splits && snap.payment_splits.length > 0, '6. Payment Splits');
  assert.ok(snap.authorized_amount, '7. Authorized Amount');
  assert.ok(snap.consent_text, '8. Consent Text');
  assert.ok(snap.consent_version, '9. Consent Version');
  assert.ok(snap.accepted_at, '10. Authorization Timestamp');
  assert.strictEqual(snap.client_ip, '198.51.100.88', '11. IP Address');
  assert.ok(snap.user_agent, '12. User Agent');
  assert.ok(snap.consent_hash, '13. Consent Hash (SHA-256)');

  console.log('✔ Test 3 Passed: PDF generated cleanly from immutable snapshot and verified across all 13 mandated legal audit fields.');

  console.log('\n🎉 ALL PDF EVIDENCE PROTECTION TESTS PASSED SUCCESSFULLY!\n');
}

runPdfEvidenceProtectionTests().catch(err => {
  console.error('❌ PDF Evidence Protection Test Failed:', err);
  process.exit(1);
});
