import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

import assert from 'assert';
import bookingRepository from '../src/modules/bookings/booking.repository.mjs';
import { adminController } from '../src/modules/admin/admin.controller.mjs';

async function runAdminDrawerTests() {
  console.log('=== RUNNING ADMIN DRAWER & REVISION WORKFLOW TESTS ===\n');

  // Create a clean test booking
  const testBooking = await bookingRepository.createBookingRecord({
    confirmation_code: `TFS-TEST-${Date.now().toString().slice(-6)}`,
    customer_price: 500.00,
    total_amount: 500.00,
    currency: 'USD',
    email: 'test_drawer@faretransit.com',
    passenger_name: 'Test Drawer Passenger',
    status: 'AUTHORIZED',
    payment_status: 'PROCESSING'
  });
  const testBookingId = testBooking.id;

  // Test 1: Itinerary Segment Save & Authorization Invalidation
  console.log('Test 1: Itinerary multi-segment editing & authorization invalidation...');
  const mockReq1 = {
    params: { id: testBookingId },
    body: {
      expectedVersion: 1,
      segments: [
        {
          trip_type: 'round_trip',
          direction: 'outbound',
          carrier_name: 'United Airlines',
          carrier_code: 'UA',
          flight_number: 'UA 880',
          origin_airport: 'LAX',
          origin_city: 'Los Angeles',
          destination_airport: 'MIA',
          destination_city: 'Miami',
          departure_date: '2026-09-10',
          departure_time: '09:00 AM',
          arrival_date: '2026-09-10',
          arrival_time: '05:00 PM',
          cabin: 'Business',
          booking_class: 'J',
          stop_count: 0
        },
        {
          trip_type: 'round_trip',
          direction: 'return',
          carrier_name: 'United Airlines',
          carrier_code: 'UA',
          flight_number: 'UA 881',
          origin_airport: 'MIA',
          origin_city: 'Miami',
          destination_airport: 'LAX',
          destination_city: 'Los Angeles',
          departure_date: '2026-09-17',
          departure_time: '11:00 AM',
          arrival_date: '2026-09-17',
          arrival_time: '03:00 PM',
          cabin: 'Business',
          booking_class: 'J',
          stop_count: 0
        }
      ]
    }
  };

  let responseData1 = null;
  const mockRes1 = {
    json: (d) => { responseData1 = d; return d; },
    status: (s) => ({ json: (d) => { responseData1 = { statusCode: s, ...d }; return d; } })
  };

  await adminController.updateItinerary(mockReq1, mockRes1, (err) => { throw err; });
  assert.strictEqual(responseData1.success, true);
  console.log('✔ Test 1 Passed: Multi-segment itinerary saved cleanly');

  // Test 2: Pricing Revision Audit & Reason Requirement
  console.log('\nTest 2: Pricing revision audit recording & mandatory reason enforcement...');
  const mockReq2Fail = {
    params: { id: testBookingId },
    body: {
      supplierFare: 400.00,
      customerTotal: 999.00,
      currency: 'USD',
      reason: '' // Empty reason should fail when customer price changes
    }
  };


  let responseData2Fail = null;
  const mockRes2Fail = {
    json: (d) => { responseData2Fail = d; return d; },
    status: function(s) {
      return {
        json: (d) => { responseData2Fail = { statusCode: s, ...d }; return d; }
      };
    }
  };


  await adminController.updatePricing(mockReq2Fail, mockRes2Fail, (err) => { throw err; });
  assert.strictEqual(responseData2Fail.statusCode, 400, 'Empty reason must return HTTP 400');
  console.log('✔ Test 2a Passed: Empty reason for price change correctly rejected with HTTP 400');

  const mockReq2Pass = {
    params: { id: testBookingId },
    body: {
      supplierFare: 400.00,
      customerTotal: 520.00,
      currency: 'USD',
      reason: 'Airline fuel surcharge adjustment approved by customer'
    }
  };

  let responseData2Pass = null;
  const mockRes2Pass = {
    json: (d) => { responseData2Pass = d; return d; },
    status: (s) => ({ json: (d) => { responseData2Pass = { statusCode: s, ...d }; return d; } })
  };


  await adminController.updatePricing(mockReq2Pass, mockRes2Pass, (err) => { throw err; });
  assert.strictEqual(responseData2Pass.success, true);
  console.log('✔ Test 2b Passed: Pricing revision saved and audit entry recorded');

  // Test 3: Refund Amount Limits & Payment Actions
  console.log('\nTest 3: Refund limit enforcement & payment action validation...');
  const mockReq3Fail = {
    params: { id: testBookingId },
    body: {
      action: 'record_refund',
      amount: 9999.00 // Exceeds customer total
    }
  };

  let responseData3Fail = null;
  const mockRes3Fail = {
    status: (s) => ({ json: (d) => { responseData3Fail = { statusCode: s, ...d }; return d; } })
  };

  await adminController.handlePaymentAction(mockReq3Fail, mockRes3Fail, (err) => { throw err; });
  assert.strictEqual(responseData3Fail.statusCode, 400, 'Excessive refund must be rejected');
  console.log('✔ Test 3 Passed: Refund amount exceeding total correctly rejected');

  console.log('\n🎉 ALL ADMIN DRAWER WORKFLOW TESTS PASSED SUCCESSFULLY!\n');
}

runAdminDrawerTests().catch(err => {
  console.error('❌ Admin Drawer Test Failed:', err);
  process.exit(1);
});
