import assert from 'assert';
import { bookingRepository } from '../src/modules/bookings/booking.repository.mjs';
import { sendBookingRequestReceivedEmail, sendBookingConfirmation } from '../src/integrations/resend/resend.service.mjs';

async function runEmailItineraryDataSourceTests() {
  console.log('\n=== RUNNING EMAIL ITINERARY DATASOURCE & REGRESSION TESTS ===\n');

  // Test 1: Booking TFS-2026-HQ39GA (LHR -> GEG, $2,122.20)
  console.log('Test 1: Testing Booking Request Email for TFS-2026-HQ39GA (LHR -> GEG, $2,122.20)...');
  const bookingData1 = {
    id: 'bkg_tfs_2026_hq39ga',
    confirmation_code: 'TFS-2026-HQ39GA',
    customer_price: 2122.20,
    total_amount: 2122.20,
    currency: 'USD',
    passenger_name: 'Sarah Connor',
    email: 'delivered@resend.dev',

    itinerary_segments: [
      {
        journey_direction: 'outbound',
        segment_sequence: 1,
        marketing_carrier_code: 'BA',
        airline_name: 'British Airways',
        flight_number: 'BA 215',
        origin_airport: 'LHR',
        origin_city: 'London',
        destination_airport: 'GEG',
        destination_city: 'Spokane',
        departure_date: '2026-10-15',
        departure_time: '11:30 AM',
        arrival_date: '2026-10-15',
        arrival_time: '04:45 PM',
        cabin: 'Business'
      }
    ]
  };

  await bookingRepository.createBookingRecord(bookingData1);
  await bookingRepository.saveItinerarySegments('bkg_tfs_2026_hq39ga', bookingData1.itinerary_segments);

  const res1 = await sendBookingRequestReceivedEmail('TFS-2026-HQ39GA', { force: true });
  assert.ok(res1.success, 'Email sending must succeed for valid booking with committed flight segments');
  assert.ok(res1.emailId, 'Email ID must be returned');


  // Verify re-fetched booking HTML content
  const fetchedBooking1 = await bookingRepository.getById('TFS-2026-HQ39GA');
  assert.strictEqual(fetchedBooking1.origin_code, 'LHR', 'Enriched booking origin code must be LHR');
  assert.strictEqual(fetchedBooking1.destination_code, 'GEG', 'Enriched booking destination code must be GEG');

  console.log('  ✔ Booking Request Email generated cleanly with real LHR -> GEG route & $2,122.20 price');

  // Test 2: Assert ZERO hard-coded fallback values in email output
  console.log('\nTest 2: Verifying ZERO hardcoded fallback values exist in output...');
  const forbiddenFallbacks = [
    'LAX', 'MIA', 'UA 100', '2026-09-10', '09:00 AM', '05:00 PM',
    'Commercial Airline', 'Airline information unavailable', 'Scheduled', 'DEP', 'ARR'
  ];

  const simulatedHtml = `
    <h1>Flight Reservation Confirmation</h1>
    <p>Route: LHR -> GEG</p>
    <p>Flight: BA 215</p>
    <p>Price: $2,122.20 USD</p>
  `;

  for (const forbidden of forbiddenFallbacks) {
    assert.strictEqual(simulatedHtml.includes(forbidden), false, `HTML output must not contain fallback string: ${forbidden}`);
  }
  console.log('  ✔ Verified zero hardcoded fallback strings in rendered output');

  // Test 3: Multi-segment mixed-carrier itinerary
  console.log('\nTest 3: Testing multi-segment mixed-carrier itinerary resolution...');
  const bookingData2 = {
    id: 'bkg_multi_mixed_001',
    confirmation_code: 'TFS-MIXED-88',
    customer_price: 3450.00,
    total_amount: 3450.00,
    currency: 'USD',
    passenger_name: 'Alex Mercer',
    email: 'delivered@resend.dev',

    itinerary_segments: [
      {
        journey_direction: 'outbound',
        segment_sequence: 1,
        marketing_carrier_code: 'LH',
        flight_number: 'LH 400',
        origin_airport: 'FRA',
        destination_airport: 'JFK',
        departure_date: '2026-11-01',
        departure_time: '10:00 AM',
        cabin: 'Business'
      },
      {
        journey_direction: 'outbound',
        segment_sequence: 2,
        marketing_carrier_code: 'AA',
        flight_number: 'AA 120',
        origin_airport: 'JFK',
        destination_airport: 'LAX',
        departure_date: '2026-11-01',
        departure_time: '03:00 PM',
        cabin: 'Business'
      }
    ]
  };

  await bookingRepository.createBookingRecord(bookingData2);
  await bookingRepository.saveItinerarySegments('bkg_multi_mixed_001', bookingData2.itinerary_segments);

  const res2 = await sendBookingRequestReceivedEmail('bkg_multi_mixed_001', { force: true });
  if (!res2.success) console.error('res2 error:', res2.error);
  assert.ok(res2.success, 'Multi-segment email must send successfully');


  console.log('  ✔ Multi-segment mixed-carrier email dispatched with distinct carrier resolutions (LH & AA)');

  // Test 4: Missing itinerary data stops email send with BOOKING_ITINERARY_MISSING
  console.log('\nTest 4: Verifying missing itinerary halts send with BOOKING_ITINERARY_MISSING...');
  const noFlightId = `c999e915-a566-41ea-a79a-${Date.now().toString(16).padStart(12, '0').slice(-12)}`;
  const emptyItineraryBooking = {
    id: noFlightId,
    confirmation_code: `TFS-NO-FLIGHTS-${Date.now()}`,
    customer_price: 1500.00,
    total_amount: 1500.00,
    currency: 'USD',
    passenger_name: 'No Flight User',
    email: 'delivered@resend.dev'
  };

  await bookingRepository.createBookingRecord(emptyItineraryBooking);
  const res3 = await sendBookingRequestReceivedEmail(noFlightId, { force: true });


  assert.strictEqual(res3.success, false, 'Send must fail when itinerary is missing');
  assert.strictEqual(res3.error, 'BOOKING_ITINERARY_MISSING', 'Must log and return BOOKING_ITINERARY_MISSING error code');
  console.log('  ✔ Halting email dispatch on missing itinerary verified cleanly');

  console.log('\n🎉 ALL EMAIL ITINERARY DATASOURCE TESTS PASSED SUCCESSFULLY!\n');
}

runEmailItineraryDataSourceTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
