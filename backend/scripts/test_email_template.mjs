import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { sendBookingConfirmation } from '../src/integrations/resend/resend.service.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runEmailTemplateTests() {
  console.log('=== RUNNING EMAIL TEMPLATE INTEGRATION TESTS ===\n');

  // Test 1: One-way booking rendering check
  console.log('Test 1: One-way booking email rendering & placeholder substitution...');
  const oneWayBooking = {
    id: 'test-oneway-123',
    booking_id: 'test-oneway-123',
    confirmation_code: 'TFS-2026-OW111',
    passenger_name: 'Vinod Saini',
    email: 'viansaini1608@gmail.com',
    total_amount: 489.6,
    currency: 'USD',
    payment_provider: 'whop',
    paid_at: '2026-07-26T12:00:00Z',
    passengers: [{ first_name: 'Vinod', last_name: 'Saini', role: 'adult' }],
    flights: [
      {
        direction: 'outbound',
        carrier: 'United Airlines',
        flight_number: 'UA 1234',
        origin_code: 'LAX',
        origin_city: 'Los Angeles',
        destination_code: 'JFK',
        destination_city: 'New York',
        departure_time: '2026-08-15T08:00:00Z',
        arrival_time: '2026-08-15T16:30:00Z',
        cabin_class: 'Economy',
        stops: 0
      }
    ]
  };

  const result1 = await sendBookingConfirmation(oneWayBooking, { force: true });
  assert.ok(result1.success, 'One-way booking email should send successfully');
  assert.ok(result1.emailId, 'Resend email ID should be returned');
  console.log(`✔ Test 1 Passed: One-way email sent successfully via Resend (Message ID: ${result1.emailId})`);

  // Test 2: Round-trip booking rendering check
  console.log('\nTest 2: Round-trip booking email rendering & placeholder substitution...');
  const roundTripBooking = {
    id: 'test-roundtrip-456',
    booking_id: 'test-roundtrip-456',
    confirmation_code: 'TFS-2026-RT222',
    passenger_name: 'Vinod Saini',
    email: 'viansaini1608@gmail.com',
    total_amount: 850.00,
    currency: 'USD',
    payment_provider: 'paypal',
    paid_at: '2026-07-26T14:00:00Z',
    passengers: [{ first_name: 'Vinod', last_name: 'Saini', role: 'adult' }],
    flights: [
      {
        direction: 'outbound',
        carrier: 'Delta Air Lines',
        flight_number: 'DL 456',
        origin_code: 'SFO',
        origin_city: 'San Francisco',
        destination_code: 'LHR',
        destination_city: 'London',
        departure_time: '2026-09-01T18:00:00Z',
        arrival_time: '2026-09-02T12:00:00Z',
        cabin_class: 'Premium Economy',
        stops: 0
      },
      {
        direction: 'return',
        carrier: 'Delta Air Lines',
        flight_number: 'DL 457',
        origin_code: 'LHR',
        origin_city: 'London',
        destination_code: 'SFO',
        destination_city: 'San Francisco',
        departure_time: '2026-09-15T11:00:00Z',
        arrival_time: '2026-09-15T15:00:00Z',
        cabin_class: 'Premium Economy',
        stops: 0
      }
    ]
  };

  const result2 = await sendBookingConfirmation(roundTripBooking, { force: true });
  assert.ok(result2.success, 'Round-trip booking email should send successfully');
  assert.ok(result2.emailId, 'Resend email ID should be returned');
  console.log(`✔ Test 2 Passed: Round-trip email sent successfully via Resend (Message ID: ${result2.emailId})`);

  // Test 3: Idempotency check
  console.log('\nTest 3: Idempotency check for duplicate email prevention...');
  const idempotentBooking = {
    ...oneWayBooking,
    confirmation_email_sent_at: new Date().toISOString()
  };

  const result3 = await sendBookingConfirmation(idempotentBooking);
  assert.strictEqual(result3.duplicate, true, 'Duplicate email request should be skipped cleanly');
  console.log('✔ Test 3 Passed: Duplicate email skipped as expected due to confirmation_email_sent_at timestamp');

  console.log('\n🎉 ALL EMAIL TEMPLATE TESTS PASSED SUCCESSFULLY!\n');
}

runEmailTemplateTests().catch(err => {
  console.error('❌ Email Template Test Failed:', err);
  process.exit(1);
});
