import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingRepository } from '../src/modules/bookings/booking.repository.mjs';
import env from '../src/config/env.mjs';

test('Password-Protected Transactional Delete Booking Test Suite', async (t) => {
  let testBookingId = null;
  let testPublicCode = null;

  await t.test('0. Setup: Create test booking record with relations', async () => {
    const randomCode = `TFS-DEL-${Math.floor(100000 + Math.random() * 900000)}`;
    const created = await bookingRepository.createBookingRecord({
      confirmation_code: randomCode,
      status: 'PENDING',
      payment_status: 'pending',
      total_amount: 899.99,
      passenger_name: 'Delete Verification User',
      email: 'delete_test@faretransit.com'
    });

    assert.ok(created, 'Booking creation failed');
    testBookingId = created.id;
    testPublicCode = created.confirmation_code;

    // Attach payment splits to test dependency deletion
    await bookingRepository.savePaymentSplits(testBookingId, [
      { merchantName: 'Delta Air Lines', amount: 700.00, currency: 'USD' },
      { merchantName: 'FareTransit LLC', amount: 199.99, currency: 'USD' }
    ]);
  });

  await t.test('1. Transactional deletion of booking and all dependencies', async () => {
    const res = await bookingRepository.deleteBookingTransactional(testBookingId, 'admin@faretransit.com', '127.0.0.1');

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.deletedBookingId, testBookingId);
    assert.strictEqual(res.confirmationCode, testPublicCode);
  });

  await t.test('2. Re-fetching deleted booking returns null', async () => {
    const fetchedById = await bookingRepository.getCompleteBookingById(testBookingId);
    assert.strictEqual(fetchedById, null, 'Deleted booking should not be returned by ID');

    const fetchedByCode = await bookingRepository.getCompleteBookingById(testPublicCode);
    assert.strictEqual(fetchedByCode, null, 'Deleted booking should not be returned by confirmation code');
  });

  await t.test('3. Audit log entry generation', async () => {
    const logEntry = await bookingRepository.logAdminActivity({
      action: 'BOOKING_DELETED',
      bookingReference: testPublicCode,
      deletedBy: 'admin@faretransit.com',
      ipAddress: '127.0.0.1'
    });

    assert.strictEqual(logEntry.action, 'BOOKING_DELETED');
    assert.strictEqual(logEntry.booking_reference, testPublicCode);
    assert.strictEqual(logEntry.deleted_by, 'admin@faretransit.com');
  });
});
