import assert from 'assert';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

import { bookingRepository } from '../src/modules/bookings/booking.repository.mjs';
import { bookingService } from '../src/modules/bookings/booking.service.mjs';
import { supabase } from '../src/config/supabase.mjs';

async function runTests() {
  console.log('================================================================================');
  console.log('  PAYMENT TRANSACTION REFERENCE & PERSISTENCE TEST SUITE');
  console.log('================================================================================\n');

  const testBookingId = randomUUID();
  const testFixture = {
    id: testBookingId,
    confirmation_code: `TFS-TEST-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
    status: 'PENDING',
    payment_status: 'pending',
    customer_price: 500.00,
    total_amount: 500.00,
    passenger_name: 'Test Vinod Saini',
    email: 'test_vinod@faretransit.com',
    phone: '+12139659727',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const sampleSegments = [
    {
      booking_id: testBookingId,
      direction: 'outbound',
      journey_direction: 'outbound',
      carrier_name: 'Frontier Airlines',
      carrier_code: 'F9',
      flight_number: 'F9 123',
      origin_airport: 'DEN',
      origin_city: 'Denver',
      destination_airport: 'MCO',
      destination_city: 'Orlando',
      departure_date: '2026-09-01',
      departure_time: '11:20',
      arrival_date: '2026-09-01',
      arrival_time: '15:45',
      cabin: 'Economy'
    }
  ];

  const samplePayment = {
    booking_id: testBookingId,
    payment_provider: 'stripe',
    payment_amount: 500.00,
    authorized_amount: 500.00,
    payment_status: 'pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const sampleSplits = [
    {
      booking_id: testBookingId,
      merchant_name: 'FareTransit LLC',
      amount: 100.00,
      currency: 'USD'
    },
    {
      booking_id: testBookingId,
      merchant_name: 'Frontier Airlines',
      amount: 400.00,
      currency: 'USD'
    }
  ];

  const testSplits = [
    { merchantName: 'FareTransit LLC', amount: 100 },
    { merchantName: 'Frontier Airlines', amount: 400 }
  ];

  try {
    // ----------------------------------------------------
    // SETUP FIXTURE
    // ----------------------------------------------------
    console.log('--- SETUP: Creating test booking fixture ---');
    await supabase.from('bookings').insert(testFixture);
    await supabase.from('booking_itinerary_segments').insert(sampleSegments);
    await supabase.from('payments').insert(samplePayment);
    await supabase.from('payment_authorization_splits').insert(sampleSplits);
    console.log('✓ Setup successfully completed.\n');

    // ----------------------------------------------------
    // TEST 1: 12-Digit Reference '221767656454'
    // ----------------------------------------------------
    console.log('--- TEST 1: Valid 12-Digit Reference is Accepted and Persisted ---');
    const res1 = await bookingService.updatePayment(testBookingId, {
      paymentState: 'PAID',
      paidAmount: 500.00,
      transactionReference: '221767656454',
      splits: testSplits,
      adminId: 'admin-test',
      reason: 'Test 1'
    });

    assert.strictEqual(res1.paymentStatus, 'paid');
    assert.strictEqual(res1.payment?.paidAmount, 500.00);
    assert.strictEqual(res1.transactionReference, '221767656454');
    console.log('✓ TEST 1 PASSED: 12-digit reference successfully updated to PAID.\n');

    // ----------------------------------------------------
    // TEST 2: Leading Zeros Preservation
    // ----------------------------------------------------
    console.log('--- TEST 2: Leading Zeros in Reference are Preserved as Strings ---');
    const res2 = await bookingService.updatePayment(testBookingId, {
      paymentState: 'PAID',
      paidAmount: 500.00,
      transactionReference: '000456789123',
      splits: testSplits,
      adminId: 'admin-test',
      reason: 'Test 2'
    });

    assert.strictEqual(res2.transactionReference, '000456789123');
    console.log('✓ TEST 2 PASSED: Leading zeros preserved as string.\n');

    // ----------------------------------------------------
    // TEST 3: Alphanumeric and Special Characters
    // ----------------------------------------------------
    console.log('--- TEST 3: Alphanumeric and Dashes/Underscores are Accepted ---');
    const res3 = await bookingService.updatePayment(testBookingId, {
      paymentState: 'PAID',
      paidAmount: 500.00,
      transactionReference: 'TXN_REF-1234_abc',
      splits: testSplits,
      adminId: 'admin-test',
      reason: 'Test 3'
    });

    assert.strictEqual(res3.transactionReference, 'TXN_REF-1234_abc');
    console.log('✓ TEST 3 PASSED: Alphanumeric reference accepted.\n');

    // ----------------------------------------------------
    // TEST 4: Missing Reference for PAID Blocks
    // ----------------------------------------------------
    console.log('--- TEST 4: Missing Reference for PAID Status Blocks Update ---');
    try {
      await bookingService.updatePayment(testBookingId, {
        paymentState: 'PAID',
        paidAmount: 500.00,
        transactionReference: '',
        splits: testSplits,
        adminId: 'admin-test',
        reason: 'Test 4'
      });
      assert.fail('Should have rejected empty transaction reference for PAID status');
    } catch (err) {
      assert.strictEqual(err.message, 'Enter a valid transaction or reference ID.');
      assert.strictEqual(err.code, 'INVALID_TRANSACTION_REFERENCE');
      console.log('✓ TEST 4 PASSED: Missing reference successfully blocked.');
    }

    // ----------------------------------------------------
    // TEST 5: Invalid Regex Ref Length / Characters Blocked
    // ----------------------------------------------------
    console.log('--- TEST 5: Too Short (3 chars) or Special Character References Blocked ---');
    try {
      await bookingService.updatePayment(testBookingId, {
        paymentState: 'PAID',
        paidAmount: 500.00,
        transactionReference: 'abc', // < 4 chars
        splits: testSplits,
        adminId: 'admin-test',
        reason: 'Test 5'
      });
      assert.fail('Should have rejected too short reference');
    } catch (err) {
      assert.strictEqual(err.message, 'Enter a valid transaction or reference ID.');
    }

    try {
      await bookingService.updatePayment(testBookingId, {
        paymentState: 'PAID',
        paidAmount: 500.00,
        transactionReference: 'txn$ref_123', // illegal character $
        splits: testSplits,
        adminId: 'admin-test',
        reason: 'Test 5b'
      });
      assert.fail('Should have rejected reference with special char');
    } catch (err) {
      assert.strictEqual(err.message, 'Enter a valid transaction or reference ID.');
      console.log('✓ TEST 5 PASSED: Invalid lengths and chars successfully blocked.\n');
    }

    // ----------------------------------------------------
    // TEST 6: Paid Amount Must Be > 0
    // ----------------------------------------------------
    console.log('--- TEST 6: Paid Amount Must Be Greater Than Zero for PAID ---');
    try {
      await bookingService.updatePayment(testBookingId, {
        paymentState: 'PAID',
        paidAmount: 0.00,
        transactionReference: '221767656454',
        splits: testSplits,
        adminId: 'admin-test',
        reason: 'Test 6'
      });
      assert.fail('Should have rejected 0 paid amount for PAID status');
    } catch (err) {
      assert.strictEqual(err.message, 'Paid amount must be greater than zero.');
      assert.strictEqual(err.code, 'INVALID_PAID_AMOUNT');
      console.log('✓ TEST 6 PASSED: Non-positive paidAmount successfully blocked.\n');
    }

    // ----------------------------------------------------
    // TEST 7: Hard Refresh (Read back from database)
    // ----------------------------------------------------
    console.log('--- TEST 7: Database Read-After-Write Consistency Verification ---');
    // Set a clean valid PAID state first
    await bookingService.updatePayment(testBookingId, {
      paymentState: 'PAID',
      paidAmount: 500.00,
      transactionReference: 'REFRESH_TEST-123',
      splits: testSplits,
      adminId: 'admin-test',
      reason: 'Setup Test 7'
    });

    const refreshed = await bookingRepository.getCompleteBookingById(testBookingId);
    assert.strictEqual(refreshed.paymentStatus, 'paid');
    assert.strictEqual(refreshed.transactionReference, 'REFRESH_TEST-123');
    console.log('✓ TEST 7 PASSED: Hard refresh reloaded transaction reference successfully.\n');

    // ----------------------------------------------------
    // TEST 8: Safety Verification — Core Booking Fields Unchanged
    // ----------------------------------------------------
    console.log('--- TEST 8: Core Booking Fields Remain Unchanged During Payment Save ---');
    const finalBooking = await bookingRepository.getCompleteBookingById(testBookingId);
    // passenger name must be unchanged
    assert.strictEqual(finalBooking.passenger_name, testFixture.passenger_name,
      `Passenger name mutated: expected '${testFixture.passenger_name}', got '${finalBooking.passenger_name}'`);
    // booking total_amount must still be canonical (not zero, not wrong)
    const finalTotal = parseFloat(finalBooking.customer_price || finalBooking.total_amount || finalBooking.amount || 0);
    assert.ok(finalTotal > 0, `total_amount must be positive after payment update, got ${finalTotal}`);
    // payment status must be paid (set in Test 7)
    const finalPaymentStatus = (finalBooking.payment_status || finalBooking.paymentStatus || '').toLowerCase();
    assert.strictEqual(finalPaymentStatus, 'paid', `Payment status must be 'paid', got '${finalPaymentStatus}'`);
    console.log('✓ TEST 8 PASSED: Core booking fields unchanged and payment status persisted.\n');

    console.log('🎉 ALL TRANSACTION REFERENCE SUITE TESTS PASSED SUCCESSFULLY!\n');

  } finally {
    // CLEANUP
    console.log('--- CLEANUP: Removing test fixtures ---');
    await supabase.from('payment_authorization_splits').delete().eq('booking_id', testBookingId);
    await supabase.from('payments').delete().eq('booking_id', testBookingId);
    await supabase.from('booking_itinerary_segments').delete().eq('booking_id', testBookingId);
    await supabase.from('bookings').delete().eq('id', testBookingId);
    console.log('✓ Cleanup completed.');
  }
}

runTests().catch(err => {
  console.error('❌ Test Suite Failed:', err);
  process.exit(1);
});
