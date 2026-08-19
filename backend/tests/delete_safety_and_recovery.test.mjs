import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

import assert from 'assert';
import bookingRepository from '../src/modules/bookings/booking.repository.mjs';
import adminController from '../src/modules/admin/admin.controller.mjs';
import env from '../src/config/env.mjs';

async function runDeleteSafetyAndRecoveryTests() {
  console.log('=== RUNNING DELETE SAFETY & RECOVERY TESTS ===\n');

  const testId = '44dd55ee-66ff-77aa-88bb-990011223344';
  const initialBooking = {
    id: testId,
    confirmation_code: 'TFS-2026-DELRECOV',
    passenger_name: 'Vincent Cassel',
    email: 'vincent@example.com',
    phone: '+1 415-555-0444',
    customer_price: 3500.00,
    total_amount: 3500.00,
    currency: 'USD',
    status: 'PENDING',
    payment_status: 'pending',
    airline_name: 'Air France',
    airline_code: 'AF',
    itinerary_segments: [
      {
        journey_direction: 'outbound',
        segment_sequence: 1,
        carrier_name: 'Air France',
        carrier_code: 'AF',
        flight_number: 'AF 084',
        origin_airport: 'CDG',
        destination_airport: 'JFK',
        departure_date: '2027-01-05',
        departure_time: '11:00',
        arrival_date: '2027-01-05',
        arrival_time: '13:30'
      }
    ]
  };

  const createdBooking = await bookingRepository.createBookingRecord(initialBooking);
  const realId = createdBooking?.id || testId;
  await bookingRepository.saveItinerarySegments(realId, initialBooking.itinerary_segments);

  // ----------------------------------------------------
  // TEST SECTION 1: PASSWORD VALIDATION & SAFETY GUARDS
  // ----------------------------------------------------
  console.log('--- TEST SECTION 1: PASSWORD VALIDATION & SAFETY GUARDS ---');

  const createMockRes = () => {
    const res = { statusCode: 200, body: null };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (data) => { res.body = data; return res; };
    return res;
  };

  // Test 1a: Attempting delete without password MUST fail with 400 PASSWORD_REQUIRED
  console.log('Test 1a: Deleting without admin password...');
  const reqNoPass = { params: { bookingId: realId }, body: {} };
  const resNoPass = createMockRes();
  await adminController.deleteBooking(reqNoPass, resNoPass, () => {});
  assert.strictEqual(resNoPass.statusCode, 400);
  assert.strictEqual(resNoPass.body.error.code, 'PASSWORD_REQUIRED');
  console.log('✔ Test 1a Passed: Deletion without password correctly blocked with 400 PASSWORD_REQUIRED.');

  // Test 1b: Attempting delete with wrong password MUST fail with 401 INVALID_PASSWORD
  console.log('\nTest 1b: Deleting with invalid admin password...');
  const reqWrongPass = { params: { bookingId: realId }, body: { adminPassword: 'WRONG_PASSWORD_999' } };
  const resWrongPass = createMockRes();
  await adminController.deleteBooking(reqWrongPass, resWrongPass, () => {});
  assert.strictEqual(resWrongPass.statusCode, 401);
  assert.strictEqual(resWrongPass.body.error.code, 'INVALID_PASSWORD');
  console.log('✔ Test 1b Passed: Deletion with wrong password correctly blocked with 401 INVALID_PASSWORD.');

  // ----------------------------------------------------
  // TEST SECTION 2: SOFT DELETE & AUDIT LOGGING
  // ----------------------------------------------------
  console.log('\n--- TEST SECTION 2: SOFT DELETE & AUDIT LOGGING ---');

  // Test 2a: Valid Soft Delete
  console.log('Test 2a: Performing valid soft delete...');
  const validAdminPassword = env.adminPassword || 'admin123';
  const reqValid = {
    params: { bookingId: realId },
    body: { adminPassword: validAdminPassword, reason: 'Testing soft delete' },
    user: { email: 'admin_deleter@faretransit.com' },
    headers: {}
  };
  const resValid = createMockRes();
  await adminController.deleteBooking(reqValid, resValid, () => {});

  assert.strictEqual(resValid.body.success, true);
  assert.ok(resValid.body.deletedAt, 'Must record deletedAt timestamp');
  console.log('✔ Test 2a Passed: Booking soft-deleted cleanly.');

  // Test 2b: Verify Relational Integrity & Audit Logging after Soft Delete
  console.log('\nTest 2b: Verifying relational data preservation & BOOKING_SOFT_DELETED audit log...');
  const softDeletedBooking = await bookingRepository.getById(realId);
  const relations = await bookingRepository.getRelations(realId);
  const auditLogs = await bookingRepository.getAuditLogsForBooking(realId);

  assert.strictEqual(softDeletedBooking.status, 'CANCELLED', 'Soft-deleted booking status must be CANCELLED');
  assert.ok(softDeletedBooking.deleted_at, 'deleted_at timestamp must be set');
  assert.ok(relations.itinerarySegments.length > 0 || softDeletedBooking.itinerary_segments.length > 0, 'Relational flight segments MUST be preserved after soft delete');
  assert.ok(auditLogs.some(a => a.action === 'BOOKING_SOFT_DELETED'), 'Audit trail must contain BOOKING_SOFT_DELETED action');
  console.log('✔ Test 2b Passed: Relational records preserved and BOOKING_SOFT_DELETED audit log recorded.');

  // ----------------------------------------------------
  // TEST SECTION 3: RECOVERY & RESTORE ROUTINE
  // ----------------------------------------------------
  console.log('\n--- TEST SECTION 3: RECOVERY & RESTORE ROUTINE ---');

  // Test 3: Restoring Soft-Deleted Booking
  console.log('Test 3: Restoring soft-deleted booking via restoreBooking...');
  const reqRestore = {
    params: { bookingId: realId },
    user: { email: 'admin_restorer@faretransit.com' },
    headers: {}
  };
  const resRestore = createMockRes();
  await adminController.restoreBooking(reqRestore, resRestore, () => {});

  assert.strictEqual(resRestore.body.success, true);
  assert.ok(resRestore.body.restoredAt, 'Must return restoredAt timestamp');

  const restoredBooking = await bookingRepository.getById(realId);
  const updatedLogs = await bookingRepository.getAuditLogsForBooking(realId);

  assert.strictEqual(restoredBooking.status, 'PENDING', 'Restored booking status must be active PENDING');
  assert.strictEqual(restoredBooking.deleted_at, null, 'deleted_at must be cleared to null');
  assert.ok(updatedLogs.some(a => a.action === 'BOOKING_RESTORED'), 'Audit trail must contain BOOKING_RESTORED action');

  console.log('✔ Test 3 Passed: Soft-deleted booking successfully restored to active state with BOOKING_RESTORED audit log.');

  console.log('\n🎉 ALL DELETE SAFETY & RECOVERY TESTS PASSED SUCCESSFULLY!\n');
}

runDeleteSafetyAndRecoveryTests().catch(err => {
  console.error('❌ Delete Safety & Recovery Test Failed:', err);
  process.exit(1);
});
