import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

import assert from 'assert';
import bookingRepository from '../src/modules/bookings/booking.repository.mjs';
import { BOOKING_STATUSES } from '../src/modules/bookings/booking.constants.mjs';
import { adminController } from '../src/modules/admin/admin.controller.mjs';

async function runBookingStatusFlowTests() {
  console.log('=== RUNNING CANONICAL BOOKING STATUS FLOW TESTS ===\n');

  const testBookingId = '8744e915-a566-41ea-a79a-fe2163bcaf31';

  // Test 1: Verify all 9 canonical statuses exist in BOOKING_STATUSES array
  console.log('Test 1: Verifying canonical BOOKING_STATUSES array definition...');
  const expectedStatuses = [
    'PENDING',
    'AWAITING_AUTHORIZATION',
    'AUTHORIZED',
    'REAUTHORIZATION_REQUIRED',
    'READY_FOR_TICKETING',
    'TICKETED',
    'DONE',
    'FAILED',
    'CANCELLED'
  ];
  assert.deepStrictEqual(BOOKING_STATUSES, expectedStatuses);
  console.log('✔ Test 1 Passed: Exact 9 canonical status values defined');

  // Test 2: Invalid status rejection
  console.log('\nTest 2: Rejecting unsupported status strings with HTTP 400...');
  const mockReqInvalid = {
    params: { id: testBookingId },
    body: { status: 'INVALID_STATUS_XYZ' }
  };
  let responseInvalid = null;
  const mockResInvalid = {
    status: (s) => ({ json: (d) => { responseInvalid = { statusCode: s, ...d }; return d; } }),
    json: (d) => { responseInvalid = d; return d; }
  };

  await adminController.updateBooking(mockReqInvalid, mockResInvalid, (err) => { throw err; });
  assert.strictEqual(responseInvalid.statusCode, 400);
  assert.strictEqual(responseInvalid.error?.code, 'INVALID_STATUS');
  console.log('✔ Test 2 Passed: Invalid status correctly rejected with HTTP 400');

  // Test 3: Sequential update through all 9 canonical statuses with override flag
  console.log('\nTest 3: Sequential status updates for all 9 canonical values...');
  for (const statusVal of expectedStatuses) {
    const mockReq = {
      params: { id: testBookingId },
      body: { status: statusVal, override: true, reason: `Testing transition to ${statusVal}` }
    };
    let responseData = null;
    const mockRes = {
      json: (d) => { responseData = d; return d; },
      status: (s) => ({ json: (d) => { responseData = { statusCode: s, ...d }; return d; } })
    };

    await adminController.updateBooking(mockReq, mockRes, (err) => { throw err; });
    assert.strictEqual(responseData.success, true, `Update to ${statusVal} should succeed`);
    assert.strictEqual(responseData.data.status, statusVal, `Database status must be ${statusVal}`);
    console.log(`  ✔ Successfully set status to '${statusVal}' and persisted to database`);
  }

  console.log('\n🎉 ALL CANONICAL BOOKING STATUS FLOW TESTS PASSED SUCCESSFULLY!\n');
}

runBookingStatusFlowTests().catch(err => {
  console.error('❌ Booking Status Flow Test Failed:', err);
  process.exit(1);
});
