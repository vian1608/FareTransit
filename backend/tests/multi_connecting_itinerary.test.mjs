import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

import assert from 'assert';
import bookingRepository from '../src/modules/bookings/booking.repository.mjs';
import { adminController } from '../src/modules/admin/admin.controller.mjs';

async function runMultiConnectingItineraryTests() {
  console.log('=== RUNNING MULTI-CONNECTING ITINERARY & JOURNEY TESTS ===\n');

  const testBookingId = '8744e915-a566-41ea-a79a-fe2163bcaf31';

  // Test 1: Nonstop One-Way
  console.log('Test 1: Nonstop One-Way Journey...');
  const nonstopOneWay = [
    {
      trip_type: 'one_way',
      journey_direction: 'outbound',
      segment_sequence: 1,
      carrier_name: 'Delta Air Lines',
      carrier_code: 'DL',
      flight_number: 'DL 101',
      origin_airport: 'ATL',
      origin_city: 'Atlanta',
      destination_airport: 'MIA',
      destination_city: 'Miami',
      departure_date: '2026-08-10',
      departure_time: '08:00 AM',
      arrival_date: '2026-08-10',
      arrival_time: '10:00 AM',
      cabin: 'Economy'
    }
  ];

  await bookingRepository.saveItinerarySegments(testBookingId, nonstopOneWay);
  let enriched = await bookingRepository.getById(testBookingId);
  assert.strictEqual(enriched.outbound_segments.length, 1);
  assert.strictEqual(enriched.return_segments.length, 0);
  assert.strictEqual(enriched.outbound_segments[0].origin_airport, 'ATL');
  assert.strictEqual(enriched.outbound_segments[0].destination_airport, 'MIA');
  console.log('  ✔ Nonstop One-Way saved and enriched cleanly');

  // Test 2: Nonstop Round-Trip
  console.log('\nTest 2: Nonstop Round-Trip Journey...');
  const nonstopRoundTrip = [
    ...nonstopOneWay,
    {
      trip_type: 'round_trip',
      journey_direction: 'return',
      segment_sequence: 1,
      carrier_name: 'Delta Air Lines',
      carrier_code: 'DL',
      flight_number: 'DL 202',
      origin_airport: 'MIA',
      origin_city: 'Miami',
      destination_airport: 'ATL',
      destination_city: 'Atlanta',
      departure_date: '2026-08-17',
      departure_time: '05:00 PM',
      arrival_date: '2026-08-17',
      arrival_time: '07:00 PM',
      cabin: 'Economy'
    }
  ];

  await bookingRepository.saveItinerarySegments(testBookingId, nonstopRoundTrip);
  enriched = await bookingRepository.getById(testBookingId);
  assert.strictEqual(enriched.outbound_segments.length, 1);
  assert.strictEqual(enriched.return_segments.length, 1);
  assert.strictEqual(enriched.return_segments[0].origin_airport, 'MIA');
  assert.strictEqual(enriched.return_segments[0].destination_airport, 'ATL');
  console.log('  ✔ Nonstop Round-Trip saved and enriched cleanly');

  // Test 3: Two-Segment Outbound with Nonstop Return
  console.log('\nTest 3: Two-Segment Outbound with Nonstop Return...');
  const connectingOutbound = [
    {
      trip_type: 'round_trip',
      journey_direction: 'outbound',
      segment_sequence: 1,
      carrier_name: 'American Airlines',
      carrier_code: 'AA',
      flight_number: 'AA 501',
      origin_airport: 'ATL',
      origin_city: 'Atlanta',
      destination_airport: 'DFW',
      destination_city: 'Dallas/Fort Worth',
      departure_date: '2026-08-10',
      departure_time: '07:00 AM',
      arrival_date: '2026-08-10',
      arrival_time: '08:35 AM',
      cabin: 'Business'
    },
    {
      trip_type: 'round_trip',
      journey_direction: 'outbound',
      segment_sequence: 2,
      carrier_name: 'American Airlines',
      carrier_code: 'AA',
      flight_number: 'AA 602',
      origin_airport: 'DFW',
      origin_city: 'Dallas/Fort Worth',
      destination_airport: 'LAX',
      destination_city: 'Los Angeles',
      departure_date: '2026-08-10',
      departure_time: '10:15 AM',
      arrival_date: '2026-08-10',
      arrival_time: '11:45 AM',
      cabin: 'Business'
    },
    {
      trip_type: 'round_trip',
      journey_direction: 'return',
      segment_sequence: 1,
      carrier_name: 'American Airlines',
      carrier_code: 'AA',
      flight_number: 'AA 703',
      origin_airport: 'LAX',
      origin_city: 'Los Angeles',
      destination_airport: 'ATL',
      destination_city: 'Atlanta',
      departure_date: '2026-08-18',
      departure_time: '01:00 PM',
      arrival_date: '2026-08-18',
      arrival_time: '08:15 PM',
      cabin: 'Business'
    }
  ];

  await bookingRepository.saveItinerarySegments(testBookingId, connectingOutbound);
  enriched = await bookingRepository.getById(testBookingId);
  assert.strictEqual(enriched.outbound_segments.length, 2);
  assert.strictEqual(enriched.return_segments.length, 1);
  assert.strictEqual(enriched.outbound_segments[0].destination_airport, enriched.outbound_segments[1].origin_airport);
  console.log('  ✔ Two-segment connecting outbound saved and verified for continuity (ATL → DFW → LAX)');

  // Test 4: Nonstop Outbound with Three-Segment Return
  console.log('\nTest 4: Nonstop Outbound with Three-Segment Return...');
  const threeSegmentReturn = [
    nonstopOneWay[0],
    {
      trip_type: 'round_trip',
      journey_direction: 'return',
      segment_sequence: 1,
      carrier_name: 'United Airlines',
      carrier_code: 'UA',
      flight_number: 'UA 111',
      origin_airport: 'MIA',
      origin_city: 'Miami',
      destination_airport: 'CLT',
      destination_city: 'Charlotte',
      departure_date: '2026-08-20',
      departure_time: '06:00 AM',
      arrival_date: '2026-08-20',
      arrival_time: '08:00 AM',
      cabin: 'Economy'
    },
    {
      trip_type: 'round_trip',
      journey_direction: 'return',
      segment_sequence: 2,
      carrier_name: 'United Airlines',
      carrier_code: 'UA',
      flight_number: 'UA 222',
      origin_airport: 'CLT',
      origin_city: 'Charlotte',
      destination_airport: 'ORD',
      destination_city: 'Chicago',
      departure_date: '2026-08-20',
      departure_time: '09:30 AM',
      arrival_date: '2026-08-20',
      arrival_time: '11:00 AM',
      cabin: 'Economy'
    },
    {
      trip_type: 'round_trip',
      journey_direction: 'return',
      segment_sequence: 3,
      carrier_name: 'United Airlines',
      carrier_code: 'UA',
      flight_number: 'UA 333',
      origin_airport: 'ORD',
      origin_city: 'Chicago',
      destination_airport: 'ATL',
      destination_city: 'Atlanta',
      departure_date: '2026-08-20',
      departure_time: '01:00 PM',
      arrival_date: '2026-08-20',
      arrival_time: '04:00 PM',
      cabin: 'Economy'
    }
  ];

  await bookingRepository.saveItinerarySegments(testBookingId, threeSegmentReturn);
  enriched = await bookingRepository.getById(testBookingId);
  assert.strictEqual(enriched.outbound_segments.length, 1);
  assert.strictEqual(enriched.return_segments.length, 3);
  assert.strictEqual(enriched.return_segments[0].destination_airport, 'CLT');
  assert.strictEqual(enriched.return_segments[1].destination_airport, 'ORD');
  assert.strictEqual(enriched.return_segments[2].destination_airport, 'ATL');
  console.log('  ✔ Three-segment connecting return saved cleanly (MIA → CLT → ORD → ATL)');

  // Test 5: Open-Jaw Itinerary
  console.log('\nTest 5: Open-Jaw Itinerary (ATL → MIA outbound, FLL → ATL return)...');
  const openJaw = [
    nonstopOneWay[0],
    {
      trip_type: 'round_trip',
      journey_direction: 'return',
      segment_sequence: 1,
      carrier_name: 'Delta Air Lines',
      carrier_code: 'DL',
      flight_number: 'DL 909',
      origin_airport: 'FLL', // Fort Lauderdale instead of Miami
      origin_city: 'Fort Lauderdale',
      destination_airport: 'ATL',
      destination_city: 'Atlanta',
      departure_date: '2026-08-25',
      departure_time: '04:00 PM',
      arrival_date: '2026-08-25',
      arrival_time: '06:00 PM',
      cabin: 'Economy'
    }
  ];

  await bookingRepository.saveItinerarySegments(testBookingId, openJaw);
  enriched = await bookingRepository.getById(testBookingId);
  assert.strictEqual(enriched.outbound_segments[0].destination_airport, 'MIA');
  assert.strictEqual(enriched.return_segments[0].origin_airport, 'FLL');
  console.log('  ✔ Open-Jaw itinerary saved cleanly without error');

  // Test 6: Authorization Invalidation on Itinerary Change
  console.log('\nTest 6: Authorization Invalidation after Itinerary Modification...');
  await bookingRepository.updateBookingStatus(testBookingId, { status: 'AUTHORIZED' });
  
  const mockReqUpdate = {
    params: { id: testBookingId },
    body: {
      segments: threeSegmentReturn,
      expectedVersion: enriched.version
    }
  };

  let resData = null;
  const mockResUpdate = {
    json: (d) => { resData = d; return d; },
    status: (s) => ({ json: (d) => { resData = { statusCode: s, ...d }; return d; } })
  };

  await adminController.updateItinerary(mockReqUpdate, mockResUpdate, (err) => { throw err; });
  assert.strictEqual(resData.success, true);
  assert.strictEqual(resData.reauthorizationRequired, true);
  assert.strictEqual(resData.booking.status, 'REAUTHORIZATION_REQUIRED');
  console.log('  ✔ Active AUTHORIZED booking successfully invalidated and changed to REAUTHORIZATION_REQUIRED');

  console.log('\n🎉 ALL MULTI-CONNECTING ITINERARY TESTS PASSED SUCCESSFULLY!\n');
}

runMultiConnectingItineraryTests().catch(err => {
  console.error('❌ Multi-Connecting Itinerary Test Failed:', err);
  process.exit(1);
});
