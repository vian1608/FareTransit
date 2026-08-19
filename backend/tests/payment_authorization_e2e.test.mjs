/**
 * payment_authorization_e2e.test.mjs
 * End-to-end integration tests for payment authorization splits persistence.
 */

import assert from 'assert/strict';
import { bookingRepository } from '../src/modules/bookings/booking.repository.mjs';
import supabase from '../src/integrations/supabase/supabase.client.mjs';

async function cleanup(bookingId) {
  if (!bookingId) return;
  try {
    await supabase.from('payment_authorization_splits').delete().eq('booking_id', bookingId);
  } catch (e) {}
  await supabase.from('passenger_authorizations').delete().eq('booking_id', bookingId);
  await supabase.from('booking_itinerary_segments').delete().eq('booking_id', bookingId);
  await supabase.from('flights').delete().eq('booking_id', bookingId);
  await supabase.from('payments').delete().eq('booking_id', bookingId);
  await supabase.from('contacts').delete().eq('booking_id', bookingId);
  await supabase.from('travellers').delete().eq('booking_id', bookingId);
  await supabase.from('bookings').delete().eq('id', bookingId);
}

async function createTestBooking(overrides = {}) {
  const code = `TP${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2,4).toUpperCase()}`.slice(0, 18);
  const { data, error } = await supabase
    .from('bookings')
    .insert({
      confirmation_code: code,
      status: 'PENDING',
      payment_status: 'pending',
      total_amount: 500.00,
      customer_price: 500.00,
      currency: 'USD',
      passenger_name: 'Test Passenger',
      email: 'test@example.com',
      phone: '+1 555-000-0001',
      ...overrides
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to create test booking: ${error.message}`);
  return data;
}

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

async function getFlightCount(bookingId) {
  const { count } = await supabase
    .from('flights')
    .select('*', { count: 'exact', head: true })
    .eq('booking_id', bookingId);
  return count || 0;
}

const results = { passed: 0, failed: 0, errors: [] };

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    results.passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     ${err.message}`);
    results.failed++;
    results.errors.push({ name, error: err.message });
  }
}

const SPLITS_170 = [
  { merchantName: 'FareTransit LLC', amount: 50.00, currency: 'USD' },
  { merchantName: 'Frontier Airline', amount: 120.00, currency: 'USD' }
];

async function runAll() {
  console.log('\n🧪 Payment Authorization E2E Test Suite\n');
  console.log('──────────────────────────────────────────\n');

  // Test 1: Basic total calculation via repository (memory store + DB)
  await runTest('Split total calculated correctly ($50 + $120 = $170)', async () => {
    const booking = await createTestBooking();
    try {
      await createTestFlight(booking.id);
      const updated = await bookingRepository.updatePaymentSplitsAndTotal(
        booking.id, SPLITS_170, 'admin@test.com', 'Test'
      );
      assert.ok(updated, 'Should return updated booking');
      const newTotal = parseFloat(updated.customer_price ?? updated.total_amount ?? 0);
      assert.equal(newTotal, 170.00, `Return value customer_price should be $170, got $${newTotal}`);
    } finally { await cleanup(booking.id); }
  });

  // Test 2: Itinerary immutability
  await runTest('Flight rows unchanged after split update (itinerary immutability)', async () => {
    const booking = await createTestBooking();
    try {
      await createTestFlight(booking.id);
      const before = await getFlightCount(booking.id);
      assert.equal(before, 1, 'Should have 1 flight before update');
      await bookingRepository.updatePaymentSplitsAndTotal(
        booking.id, SPLITS_170, 'admin', 'Immutability test'
      );
      const after = await getFlightCount(booking.id);
      assert.equal(after, before, `CRITICAL: Flight count changed from ${before} to ${after}!`);
    } finally { await cleanup(booking.id); }
  });

  // Test 3: customer_price persisted in DB (core business requirement)
  await runTest('bookings.customer_price and total_amount updated in database to $170', async () => {
    const booking = await createTestBooking({ customer_price: 999.99, total_amount: 999.99 });
    try {
      await createTestFlight(booking.id);
      await bookingRepository.updatePaymentSplitsAndTotal(
        booking.id, SPLITS_170, 'admin', 'DB price test'
      );
      const { data: dbBk } = await supabase
        .from('bookings')
        .select('customer_price, total_amount')
        .eq('id', booking.id)
        .single();
      assert.ok(dbBk, 'Should fetch booking from DB');
      assert.equal(parseFloat(dbBk.customer_price), 170.00, `customer_price should be $170, got $${dbBk.customer_price}`);
      assert.equal(parseFloat(dbBk.total_amount), 170.00, `total_amount should be $170, got $${dbBk.total_amount}`);
    } finally { await cleanup(booking.id); }
  });

  // Test 4: Splits readable via repository getPaymentSplits (memory store path)
  await runTest('Payment splits readable via repository after save (memory store persistence)', async () => {
    const booking = await createTestBooking();
    try {
      await createTestFlight(booking.id);
      await bookingRepository.updatePaymentSplitsAndTotal(
        booking.id, SPLITS_170, 'admin', 'Memory persistence test'
      );
      const splits = await bookingRepository.getPaymentSplits(booking.id);
      assert.ok(Array.isArray(splits), 'getPaymentSplits should return array');
      assert.equal(splits.length, 2, `Should have 2 splits, got ${splits.length}`);
      const total = splits.reduce((s, x) => s + parseFloat(x.amount || 0), 0);
      assert.equal(Math.round(total * 100), 17000, `Split total should be $170, got $${total}`);
    } finally { await cleanup(booking.id); }
  });

  // Test 5: Validation — empty splits
  await runTest('Empty splits array throws validation error', async () => {
    const booking = await createTestBooking();
    try {
      let threw = false;
      try {
        await bookingRepository.updatePaymentSplitsAndTotal(booking.id, [], 'admin', 'Empty splits test');
      } catch (e) {
        threw = true;
        assert.ok(e.message.includes('At least one payment split'), `Wrong error: ${e.message}`);
      }
      assert.ok(threw, 'Should throw for empty splits');
    } finally { await cleanup(booking.id); }
  });

  // Test 6: Validation — negative amount
  await runTest('Negative or zero split amount throws validation error', async () => {
    const booking = await createTestBooking();
    try {
      let threw = false;
      try {
        await bookingRepository.updatePaymentSplitsAndTotal(
          booking.id, [{ merchantName: 'Bad', amount: -50, currency: 'USD' }], 'admin', 'Invalid amount'
        );
      } catch (e) {
        threw = true;
        assert.ok(e.message.includes('greater than zero'), `Wrong error: ${e.message}`);
      }
      assert.ok(threw, 'Should throw for negative amount');
    } finally { await cleanup(booking.id); }
  });

  // Test 7: Split update replaces (not appends) old splits
  await runTest('Second split update replaces first (not appends)', async () => {
    const booking = await createTestBooking();
    try {
      await createTestFlight(booking.id);
      // First save: 3 splits totaling $120
      await bookingRepository.updatePaymentSplitsAndTotal(
        booking.id,
        [
          { merchantName: 'A', amount: 30, currency: 'USD' },
          { merchantName: 'B', amount: 40, currency: 'USD' },
          { merchantName: 'C', amount: 50, currency: 'USD' }
        ],
        'admin', 'First save'
      );
      // Second save: 2 splits totaling $170
      await bookingRepository.updatePaymentSplitsAndTotal(
        booking.id, SPLITS_170, 'admin', 'Second save replaces'
      );
      const splits = await bookingRepository.getPaymentSplits(booking.id);
      assert.equal(splits.length, 2, `Should have exactly 2 splits after replace, got ${splits.length}`);
      const total = splits.reduce((s, x) => s + parseFloat(x.amount || 0), 0);
      assert.equal(Math.round(total * 100), 17000, `Total after replace should be $170, got $${total}`);
      // Also verify customer_price in DB reflects the second save
      const { data: dbBk } = await supabase.from('bookings').select('customer_price').eq('id', booking.id).single();
      assert.equal(parseFloat(dbBk.customer_price), 170.00, `customer_price should be $170 after second save`);
    } finally { await cleanup(booking.id); }
  });

  console.log('\n──────────────────────────────────────────');
  console.log(`Results: ${results.passed} passed, ${results.failed} failed\n`);

  if (results.errors.length > 0) {
    console.error('Failed tests:');
    results.errors.forEach(e => console.error(`  • ${e.name}: ${e.error}`));
    process.exit(1);
  } else {
    console.log('✅ All payment authorization tests passed!\n');
    process.exit(0);
  }
}

runAll().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
