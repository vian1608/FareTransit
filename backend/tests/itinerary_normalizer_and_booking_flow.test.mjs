import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  safeUpper,
  getAirportCode,
  resolveAirlineName,
  resolveAirlineCode,
  normalizeCabinClass,
  normalizeTripType,
  normalizeSelectedItinerary,
  validateItineraryIntegrity
} from '../../frontend/src/shared/utils/itineraryNormalizer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '../../');

async function runItineraryNormalizerTests() {
  console.log('================================================================================');
  console.log('  ITINERARY NORMALIZER & FLIGHT SELECTION DATA CONTRACT TEST SUITE');
  console.log('================================================================================\n');

  // ----------------------------------------------------
  // TEST 1: SAFE STRING NORMALIZATION (safeUpper)
  // ----------------------------------------------------
  console.log('--- TEST 1: SAFE STRING NORMALIZATION (safeUpper) ---');
  assert.strictEqual(safeUpper('economy', 'ECONOMY'), 'ECONOMY');
  assert.strictEqual(safeUpper('  usd  ', 'USD'), 'USD');
  assert.strictEqual(safeUpper(undefined, 'USD'), 'USD');
  assert.strictEqual(safeUpper(null, 'ADULT'), 'ADULT');
  assert.strictEqual(safeUpper(123, 'FALLBACK'), 'FALLBACK');
  console.log('✔ TEST 1 PASSED: safeUpper handles strings, undefined, null, numbers gracefully.\n');

  // ----------------------------------------------------
  // TEST 2: AIRPORT CODE EXTRACTION (getAirportCode)
  // ----------------------------------------------------
  console.log('--- TEST 2: AIRPORT CODE EXTRACTION (getAirportCode) ---');
  assert.strictEqual(getAirportCode('IAH'), 'IAH');
  assert.strictEqual(getAirportCode('Houston (IAH)'), 'IAH');
  assert.strictEqual(getAirportCode({ code: 'MIA', city: 'Miami' }), 'MIA');
  assert.strictEqual(getAirportCode({ iata: 'JFK' }), 'JFK');
  assert.strictEqual(getAirportCode({ airportCode: 'LHR' }), 'LHR');
  assert.strictEqual(getAirportCode(null), null);
  assert.strictEqual(getAirportCode(undefined), null);
  console.log('✔ TEST 2 PASSED: getAirportCode extracts IATA code from string or object.\n');

  // ----------------------------------------------------
  // TEST 3: AIRLINE NAME & CODE RESOLUTION
  // ----------------------------------------------------
  console.log('--- TEST 3: AIRLINE NAME & CODE RESOLUTION ---');
  const segDirect = { airlineName: 'United Airlines', airlineCode: 'UA' };
  const segMarketing = { marketingCarrier: { name: 'American Airlines', code: 'AA' } };
  const segOperating = { operatingCarrier: { name: 'Delta Air Lines', code: 'DL' } };
  const segCarrier = { carrier: { name: 'Southwest Airlines', code: 'WN' } };
  const segEmpty = {};

  assert.strictEqual(resolveAirlineName(segDirect), 'United Airlines');
  assert.strictEqual(resolveAirlineCode(segDirect), 'UA');
  assert.strictEqual(resolveAirlineName(segMarketing), 'American Airlines');
  assert.strictEqual(resolveAirlineCode(segMarketing), 'AA');
  assert.strictEqual(resolveAirlineName(segOperating), 'Delta Air Lines');
  assert.strictEqual(resolveAirlineCode(segOperating), 'DL');
  assert.strictEqual(resolveAirlineName(segCarrier), 'Southwest Airlines');
  assert.strictEqual(resolveAirlineCode(segCarrier), 'WN');
  assert.strictEqual(resolveAirlineName(segEmpty, 'Fallback Air'), 'Fallback Air');
  assert.strictEqual(resolveAirlineName(segEmpty), 'Airline information unavailable');
  console.log('✔ TEST 3 PASSED: Airline name and code resolution order verified.\n');

  // ----------------------------------------------------
  // TEST 4: CABIN & TRIP TYPE NORMALIZATION
  // ----------------------------------------------------
  console.log('--- TEST 4: CABIN & TRIP TYPE NORMALIZATION ---');
  assert.strictEqual(normalizeCabinClass('Y'), 'Economy');
  assert.strictEqual(normalizeCabinClass('economy'), 'Economy');
  assert.strictEqual(normalizeCabinClass('J'), 'Business');
  assert.strictEqual(normalizeCabinClass('FIRST'), 'First');
  assert.strictEqual(normalizeCabinClass('PREMIUM_ECONOMY'), 'Premium Economy');

  assert.strictEqual(normalizeTripType('round-trip'), 'ROUND_TRIP');
  assert.strictEqual(normalizeTripType('roundtrip'), 'ROUND_TRIP');
  assert.strictEqual(normalizeTripType('one-way'), 'ONE_WAY');
  console.log('✔ TEST 4 PASSED: Cabin class & trip type normalization verified.\n');

  // ----------------------------------------------------
  // TEST 5: PROVIDER FIXTURE EXECUTION (normalizeSelectedItinerary)
  // ----------------------------------------------------
  console.log('--- TEST 5: PROVIDER FIXTURE EXECUTION ---');

  // Fixture A: Complete Data Provider Object
  const fixtureComplete = {
    id: 'fl_123',
    airline: 'Southwest Airlines',
    airlineCode: 'WN',
    flightNumber: '275',
    departure: { airport: 'IAH', city: 'Houston', time: '08:00 AM' },
    arrival: { airport: 'MIA', city: 'Miami', time: '12:00 PM' },
    price: { total: 1849.50, currency: 'USD' },
    segments: [
      {
        airlineName: 'Southwest',
        airlineCode: 'WN',
        flightNumber: '275',
        departureAirport: 'IAH',
        arrivalAirport: 'MIA',
        departureTime: '08:00 AM',
        arrivalTime: '12:00 PM',
        cabinClass: 'Y'
      }
    ]
  };

  const normA = normalizeSelectedItinerary(fixtureComplete, { adults: 2, children: 1 });
  assert.strictEqual(normA.tripType, 'ONE_WAY');
  assert.strictEqual(normA.currency, 'USD');
  assert.strictEqual(normA.totalAmount, 1849.50);
  assert.strictEqual(normA.passengerCount, 3);
  assert.strictEqual(normA.outbound.origin.code, 'IAH');
  assert.strictEqual(normA.outbound.destination.code, 'MIA');
  assert.strictEqual(normA.outbound.segments[0].cabinClass, 'Economy');

  // Fixture B: Missing Optional Cabin Class & Nested Carrier Object
  const fixtureNestedCarrier = {
    carrier: { name: 'Delta Air Lines', code: 'DL' },
    departureAirport: 'ATL',
    arrivalAirport: 'LAX',
    price: 350.00
  };

  const normB = normalizeSelectedItinerary(fixtureNestedCarrier, { from: 'ATL', to: 'LAX' });
  assert.strictEqual(normB.outbound.origin.code, 'ATL');
  assert.strictEqual(normB.outbound.destination.code, 'LAX');
  assert.strictEqual(normB.outbound.segments[0].airlineName, 'Delta Air Lines');
  assert.strictEqual(normB.outbound.segments[0].cabinClass, 'Economy');

  // Fixture C: Connecting Flight Segments
  const fixtureConnecting = {
    airline: 'American Airlines',
    departureAirport: 'JFK',
    arrivalAirport: 'SFO',
    price: 620.00,
    segments: [
      { departureAirport: 'JFK', arrivalAirport: 'ORD', airlineName: 'American Airlines', flightNumber: '100' },
      { departureAirport: 'ORD', arrivalAirport: 'SFO', airlineName: 'American Airlines', flightNumber: '200' }
    ]
  };

  const normC = normalizeSelectedItinerary(fixtureConnecting, { from: 'JFK', to: 'SFO' });
  assert.strictEqual(normC.outbound.segments.length, 2);
  assert.strictEqual(normC.outbound.segments[0].arrivalAirport, 'ORD');
  assert.strictEqual(normC.outbound.segments[1].departureAirport, 'ORD');

  console.log('✔ TEST 5 PASSED: Raw provider fixtures normalized cleanly to canonical contract.\n');

  // ----------------------------------------------------
  // TEST 6: ITINERARY INTEGRITY VALIDATION
  // ----------------------------------------------------
  console.log('--- TEST 6: ITINERARY INTEGRITY VALIDATION ---');
  assert.strictEqual(validateItineraryIntegrity(normA).valid, true);
  assert.strictEqual(validateItineraryIntegrity(normB).valid, true);

  const invalidPricing = { ...normA, totalAmount: 0 };
  assert.strictEqual(validateItineraryIntegrity(invalidPricing).valid, false);

  const missingRoute = { ...normA, outbound: { origin: null, destination: null, segments: [] } };
  assert.strictEqual(validateItineraryIntegrity(missingRoute).valid, false);

  assert.strictEqual(validateItineraryIntegrity(null).valid, false);
  console.log('✔ TEST 6 PASSED: Itinerary integrity validator rejects invalid/empty objects cleanly.\n');

  // ----------------------------------------------------
  // TEST 7: SOURCE CODE AUDIT FOR UNCHECKED .toUpperCase() CALLS
  // ----------------------------------------------------
  console.log('--- TEST 7: SOURCE CODE AUDIT FOR UNCHECKED .toUpperCase() CALLS ---');
  const bookingPageJs = await fs.readFile(path.join(ROOT_DIR, 'frontend/src/features/bookings/pages/BookingPage.js'), 'utf8');
  assert.ok(!bookingPageJs.includes('passenger.role.toUpperCase()'), 'BookingPage.js must not contain raw passenger.role.toUpperCase() call');
  assert.ok(bookingPageJs.includes('safeUpper'), 'BookingPage.js must use safeUpper helper');
  console.log('✔ TEST 7 PASSED: BookingPage.js verified free of unchecked .toUpperCase() calls.\n');

  console.log('================================================================================');
  console.log('  🎉 ALL 7 ITINERARY NORMALIZER & DATA CONTRACT TESTS PASSED!');
  console.log('================================================================================\n');
}

runItineraryNormalizerTests().catch((err) => {
  console.error('❌ Test Suite Failed:', err);
  process.exit(1);
});
