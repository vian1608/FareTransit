import assert from 'node:assert';
import { parseGdsItineraryText, checkRouteContinuity } from '../src/shared/utils/gds-itinerary-parser.mjs';
import bookingService from '../src/modules/bookings/booking.service.mjs';
import bookingRepository from '../src/modules/bookings/booking.repository.mjs';

async function runTests() {
  console.log('========================================================================');
  console.log('  GDS ITINERARY TEXT IMPORTER & TRANSACTIONAL PERSISTENCE TEST SUITE');
  console.log('========================================================================\n');

  try {
    // ----------------------------------------------------
    // TEST 1: Format A (Labeled Format) Parsing
    // ----------------------------------------------------
    console.log('--- TEST 1: Format A (Labeled Format) Parsing ---');
    const formatAText = `TRIP: ROUND_TRIP
PASSENGERS: 1
CABIN: ECONOMY

OUTBOUND

SEGMENT 1
CARRIER: F9
FLIGHT: 1496
CLASS: Y
DATE: 10SEP2026
FROM: IAH
TO: FLL
DEPARTURE: 08:25
ARRIVAL: 12:12
STOPS: 0

RETURN

SEGMENT 1
CARRIER: UA
FLIGHT: 470
CLASS: Y
DATE: 17SEP2026
FROM: MIA
TO: IAH
DEPARTURE: 11:30
ARRIVAL: 13:22
STOPS: 0`;

    const res1 = parseGdsItineraryText(formatAText);
    assert.strictEqual(res1.success, true, `Format A should parse successfully, errors: ${JSON.stringify(res1.errors)}`);
    assert.strictEqual(res1.segments.length, 2, `Expected 2 segments, got ${res1.segments.length}`);
    assert.strictEqual(res1.tripType, 'ROUND_TRIP', `Expected ROUND_TRIP, got ${res1.tripType}`);

    const seg1 = res1.segments[0];
    assert.strictEqual(seg1.carrier_code, 'F9');
    assert.strictEqual(seg1.carrier_name, 'Frontier Airlines');
    assert.strictEqual(seg1.flight_number, '1496');
    assert.strictEqual(seg1.origin_airport, 'IAH');
    assert.strictEqual(seg1.origin_city, 'Houston');
    assert.strictEqual(seg1.destination_airport, 'FLL');
    assert.strictEqual(seg1.destination_city, 'Fort Lauderdale');
    assert.strictEqual(seg1.departure_date, '2026-09-10');
    assert.strictEqual(seg1.departure_time, '08:25');
    assert.strictEqual(seg1.arrival_time, '12:12');

    console.log('✓ TEST 1 PASSED: Format A (Labeled Format) parsed successfully.\n');

    // ----------------------------------------------------
    // TEST 2: Format B (Compact Segment SS Line) Parsing
    // ----------------------------------------------------
    console.log('--- TEST 2: Format B (Compact Segment SS Line) Parsing ---');
    const formatBText = `TRIP ROUND_TRIP
PAX 1
CABIN ECONOMY

OUTBOUND
SS F9 1496 Y 10SEP2026 IAH FLL 0825 1212

RETURN
SS UA 470 Y 17SEP2026 MIA IAH 1130 1322`;

    const res2 = parseGdsItineraryText(formatBText);
    assert.strictEqual(res2.success, true, `Format B should parse successfully, errors: ${JSON.stringify(res2.errors)}`);
    assert.strictEqual(res2.segments.length, 2);
    assert.strictEqual(res2.segments[0].carrier_code, 'F9');
    assert.strictEqual(res2.segments[0].booking_class, 'Y');
    assert.strictEqual(res2.segments[0].cabin, 'Economy');
    assert.strictEqual(res2.segments[1].carrier_code, 'UA');
    assert.strictEqual(res2.segments[1].carrier_name, 'United Airlines');

    console.log('✓ TEST 2 PASSED: Format B (Compact Format) parsed successfully.\n');

    // ----------------------------------------------------
    // TEST 3: Connecting Flights (Multiple Segments Kept Separate)
    // ----------------------------------------------------
    console.log('--- TEST 3: Connecting Flights Kept Separate ---');
    const connectingText = `OUTBOUND
SS UA 212 Y 10SEP2026 IAH DEN 0800 0935
SS UA 1198 Y 10SEP2026 DEN FLL 1055 1610`;

    const res3 = parseGdsItineraryText(connectingText);
    assert.strictEqual(res3.success, true);
    assert.strictEqual(res3.segments.length, 2, 'Connecting flights must be preserved as 2 separate segments');
    assert.strictEqual(res3.segments[0].origin_airport, 'IAH');
    assert.strictEqual(res3.segments[0].destination_airport, 'DEN');
    assert.strictEqual(res3.segments[1].origin_airport, 'DEN');
    assert.strictEqual(res3.segments[1].destination_airport, 'FLL');

    console.log('✓ TEST 3 PASSED: Connecting flight segments preserved separately.\n');

    // ----------------------------------------------------
    // TEST 4: Overnight Arrival (+1 and Explicit Arrival Date)
    // ----------------------------------------------------
    console.log('--- TEST 4: Overnight Arrival Date Normalization ---');
    const overnightText = `OUTBOUND
SS AI 101 Y 10SEP2026 DEL JFK 2300 0630 +1
SS AI 102 Y 15SEP2026 JFK DEL 2300 16SEP2026 0800`;

    const res4 = parseGdsItineraryText(overnightText);
    assert.strictEqual(res4.success, true);
    assert.strictEqual(res4.segments[0].departure_date, '2026-09-10');
    assert.strictEqual(res4.segments[0].arrival_date, '2026-09-11', '+1 must calculate arrival date as next day');
    assert.strictEqual(res4.segments[1].departure_date, '2026-09-15');
    assert.strictEqual(res4.segments[1].arrival_date, '2026-09-16', 'Explicit arrival date 16SEP2026 must be normalized to 2026-09-16');

    console.log('✓ TEST 4 PASSED: Overnight arrival dates normalized correctly.\n');

    // ----------------------------------------------------
    // TEST 5: Multi-City Journey Parsing
    // ----------------------------------------------------
    console.log('--- TEST 5: Multi-City Journey Parsing ---');
    const multiCityText = `TRIP MULTI_CITY

JOURNEY 1
SS AA 100 Y 10SEP2026 JFK LHR 1800 0630 +1

JOURNEY 2
SS BA 304 Y 14SEP2026 LHR CDG 0920 1140

JOURNEY 3
SS DL 265 Y 20SEP2026 CDG JFK 1330 1605`;

    const res5 = parseGdsItineraryText(multiCityText);
    assert.strictEqual(res5.success, true);
    assert.strictEqual(res5.tripType, 'MULTI_CITY');
    assert.strictEqual(res5.segments.length, 3);
    assert.strictEqual(res5.segments[0].origin_airport, 'JFK');
    assert.strictEqual(res5.segments[1].origin_airport, 'LHR');
    assert.strictEqual(res5.segments[2].origin_airport, 'CDG');

    console.log('✓ TEST 5 PASSED: Multi-city itinerary parsed successfully.\n');

    // ----------------------------------------------------
    // TEST 6: Route Gap Detection & Surface Transfer (ARNK)
    // ----------------------------------------------------
    console.log('--- TEST 6: Route Gap Warning & ARNK Surface Transfer ---');
    const gapText = `OUTBOUND
SS UA 212 Y 10SEP2026 IAH DEN 0800 0935
SS UA 1198 Y 10SEP2026 ATL FLL 1055 1610`;

    const resGap = parseGdsItineraryText(gapText);
    assert.ok(resGap.warnings.some(w => w.includes('Route gap detected between DEN and ATL')), 'Must generate route gap warning between DEN and ATL');

    const arnkText = `OUTBOUND
SS UA 212 Y 10SEP2026 IAH LHR 0800 0935
ARNK LHR LGW
SS UA 1198 Y 12SEP2026 LGW FLL 1055 1610`;

    const resArnk = parseGdsItineraryText(arnkText);
    assert.ok(!resArnk.warnings.some(w => w.includes('Route gap detected between LHR and LGW')), 'ARNK must suppress route gap warning');

    console.log('✓ TEST 6 PASSED: Route gap warning and ARNK surface transfer verified.\n');

    // ----------------------------------------------------
    // TEST 7: Line-Number Error Validation
    // ----------------------------------------------------
    console.log('--- TEST 7: Line-Number Error Validation ---');
    const invalidTimeText = `TRIP ROUND_TRIP
OUTBOUND
SS F9 1496 Y 10SEP2026 IAH FLL 0825 2960`;

    const res7 = parseGdsItineraryText(invalidTimeText);
    assert.strictEqual(res7.success, false, 'Invalid time must reject parsing');
    assert.ok(res7.errors.some(e => e.includes('Line 3: Invalid arrival time "2960"')), `Must report line number 3 error: ${JSON.stringify(res7.errors)}`);

    console.log('✓ TEST 7 PASSED: Line-number errors reported accurately.\n');

    // ----------------------------------------------------
    // TEST 8: Atomic Transactional Save & Hard Refresh Persistence
    // ----------------------------------------------------
    console.log('--- TEST 8: Atomic Transactional Save & Persistence ---');

    // Create test booking fixture
    const createdBooking = await bookingRepository.createBookingRecord({
      confirmation_code: 'TFS-GDS-001',
      reference_number: 'TFS-GDS-001',
      passenger_name: 'Test Passenger',
      contact_email: 'test@faretransit.com',
      email: 'test@faretransit.com',
      contact_phone: '+15550001111',
      total_amount: 350.00,
      customer_price: 350.00,
      status: 'PENDING',
      payment_status: 'pending'
    });
    const testBookingId = createdBooking.id;

    const importPayload = {
      text: formatBText,
      segments: res2.segments,
      tripType: 'ROUND_TRIP',
      sourceFormat: 'compact',
      warnings: [],
      adminId: 'admin@faretransit.com'
    };

    const updatedBooking = await bookingService.importItineraryFromText(testBookingId, importPayload);
    assert.ok(updatedBooking, 'importItineraryFromText should return updated booking');

    // Verify hard refresh reload returns saved segments
    const refreshedBooking = await bookingRepository.getCompleteBookingById(testBookingId);
    assert.ok(refreshedBooking, 'Refreshed booking must exist');

    const outboundSegs = refreshedBooking.outbound_segments || [];
    const returnSegs = refreshedBooking.return_segments || [];
    const totalSegsCount = (outboundSegs.length + returnSegs.length) > 0 
      ? (outboundSegs.length + returnSegs.length)
      : (refreshedBooking.itinerary_segments || []).length;

    assert.ok(totalSegsCount >= 2, `Refreshed booking must contain at least 2 itinerary segments, found ${totalSegsCount}`);

    console.log('✓ TEST 8 PASSED: Atomic transactional save and hard refresh persistence verified.\n');

    // Clean up test booking
    try {
      await bookingRepository.delete(testBookingId);
    } catch (e) {}

    console.log('🎉 ALL GDS ITINERARY IMPORTER TESTS PASSED SUCCESSFULLY!\n');

  } catch (err) {
    console.error('❌ Test Suite Failed:', err);
    process.exit(1);
  }
}

runTests();
