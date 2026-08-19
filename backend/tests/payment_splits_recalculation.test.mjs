import assert from 'assert';
import { bookingRepository } from '../src/modules/bookings/booking.repository.mjs';

async function runPaymentSplitsRecalculationTests() {
  console.log('\n=== RUNNING AUTHORITATIVE PAYMENT SPLITS & RECALCULATION TESTS ===\n');

  const testBookingId = 'bkg_splits_test_77';
  const initialBooking = {
    id: testBookingId,
    confirmation_code: 'TFS-SPLITS-77',
    customer_price: 2000.00,
    total_amount: 2000.00,
    currency: 'USD',
    passenger_name: 'Jane Doe',
    email: 'jane.doe@example.com',
    status: 'AUTHORIZED',
    authorization_status: 'AUTHORIZED'
  };

  await bookingRepository.createBookingRecord(initialBooking);

  // Test 1: Add Payment Splits & Integer Cents Total Recalculation ($1803.87 + $318.33 = $2122.20)
  console.log('Test 1: Adding payment splits ($1803.87 + $318.33) and recalculating total ($2122.20)...');
  const splits1 = [
    { merchantName: 'Airline Partner', amount: 1803.87, currency: 'USD' },
    { merchantName: 'FareTransit LLC', amount: 318.33, currency: 'USD' }
  ];

  const updated1 = await bookingRepository.updatePaymentSplitsAndTotal(testBookingId, splits1, 'admin@test.com', 'Added initial splits');
  assert.strictEqual(parseFloat(updated1.customer_price), 2122.20, 'Customer price must equal exact sum $2122.20');
  assert.strictEqual(parseFloat(updated1.total_amount), 2122.20, 'Total amount must equal exact sum $2122.20');
  assert.strictEqual(updated1.payment_splits.length, 2, 'Must persist 2 split rows');
  console.log('  ✔ Integer cents recalculation verified ($1803.87 + $318.33 = $2122.20)');

  // Test 2: Automatic Reauthorization Trigger when authorized total changes
  console.log('\nTest 2: Verifying automatic REAUTHORIZATION_REQUIRED transition when authorized total changes...');
  assert.strictEqual(updated1.status, 'REAUTHORIZATION_REQUIRED', 'Booking status must transition to REAUTHORIZATION_REQUIRED when total changes');
  assert.strictEqual(updated1.authorization_status, 'REAUTHORIZATION_REQUIRED', 'Auth status must transition to REAUTHORIZATION_REQUIRED');
  console.log('  ✔ Automatic transition to REAUTHORIZATION_REQUIRED verified');

  // Test 3: Editing a split amount ($1803.87 -> $1900.00)
  console.log('\nTest 3: Editing an existing split amount...');
  const splits2 = [
    { merchantName: 'Airline Partner', amount: 1900.00, currency: 'USD' },
    { merchantName: 'FareTransit LLC', amount: 318.33, currency: 'USD' }
  ];

  const updated2 = await bookingRepository.updatePaymentSplitsAndTotal(testBookingId, splits2, 'admin@test.com', 'Edited split amount');
  assert.strictEqual(parseFloat(updated2.customer_price), 2218.33, 'Customer price must update to $2218.33');
  console.log('  ✔ Split amount update recalculates canonical booking total cleanly ($2218.33)');

  // Test 4: Deleting a split row
  console.log('\nTest 4: Deleting a split row...');
  const splits3 = [
    { merchantName: 'Airline Partner', amount: 1900.00, currency: 'USD' }
  ];

  const updated3 = await bookingRepository.updatePaymentSplitsAndTotal(testBookingId, splits3, 'admin@test.com', 'Deleted one split row');
  assert.strictEqual(updated3.payment_splits.length, 1, 'Must retain 1 split row');
  assert.strictEqual(parseFloat(updated3.customer_price), 1900.00, 'Customer price must update to $1900.00');
  console.log('  ✔ Split deletion recalculates total to $1900.00');

  // Test 5: Validation Rollback on empty merchant name or invalid amount
  console.log('\nTest 5: Verifying validation rejection on invalid split data...');
  try {
    await bookingRepository.updatePaymentSplitsAndTotal(testBookingId, [{ merchantName: '', amount: 100 }], 'admin@test.com');
    assert.fail('Should have thrown error on empty merchant name');
  } catch (err) {
    assert.ok(err.message.includes('Merchant name cannot be empty'), 'Must reject empty merchant name');
  }

  try {
    await bookingRepository.updatePaymentSplitsAndTotal(testBookingId, [{ merchantName: 'Test', amount: -50 }], 'admin@test.com');
    assert.fail('Should have thrown error on negative amount');
  } catch (err) {
    assert.ok(err.message.includes('greater than zero'), 'Must reject negative or zero amount');
  }
  console.log('  ✔ Validation rejection verified cleanly');

  // Test 6: Persistence after refresh
  console.log('\nTest 6: Verifying data persistence after re-querying repository...');
  const refreshedBooking = await bookingRepository.getById(testBookingId);
  assert.strictEqual(parseFloat(refreshedBooking.customer_price), 1900.00);
  assert.strictEqual(refreshedBooking.payment_splits.length, 1);
  console.log('  ✔ Persistence after repository re-query verified');

  console.log('\n🎉 ALL PAYMENT SPLITS RECALCULATION TESTS PASSED SUCCESSFULLY!\n');
}

runPaymentSplitsRecalculationTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
