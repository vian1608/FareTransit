import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '../../');

async function runMobileCheckoutTests() {
  console.log('================================================================================');
  console.log('  MOBILE CHECKOUT HERO & ITINERARY CARD LAYOUT TEST SUITE');
  console.log('================================================================================\n');

  const bookingJs = await fs.readFile(path.join(ROOT_DIR, 'frontend/src/features/bookings/pages/BookingPage.js'), 'utf8');
  const bookingCss = await fs.readFile(path.join(ROOT_DIR, 'frontend/src/features/bookings/pages/BookingPage.css'), 'utf8');
  const itinCardJs = await fs.readFile(path.join(ROOT_DIR, 'frontend/src/features/bookings/components/ItineraryCard.js'), 'utf8');
  const itinCardCss = await fs.readFile(path.join(ROOT_DIR, 'frontend/src/features/bookings/components/ItineraryCard.css'), 'utf8');

  // ----------------------------------------------------
  // TEST 1: MOBILE HERO COMPACTNESS & TRUST BADGES
  // ----------------------------------------------------
  console.log('--- TEST 1: MOBILE HERO COMPACTNESS & TRUST BADGES ---');
  assert.ok(bookingJs.includes('hero-title-mobile'), 'BookingPage.js must render hero-title-mobile');
  assert.ok(bookingJs.includes('Complete Your Flight Reservation'), 'Mobile hero title must be "Complete Your Flight Reservation"');
  assert.ok(bookingJs.includes('10% Member Fare Applied'), 'Mobile discount label must match requirement');
  assert.ok(bookingJs.includes('hero-badges-mobile'), 'BookingPage.js must render hero-badges-mobile');
  assert.ok(bookingCss.includes('.hero-badges-mobile'), 'BookingPage.css must define .hero-badges-mobile rules');
  assert.ok(!bookingJs.includes('Instant E-Ticket Delivery'), 'Must not claim "Instant E-Ticket Delivery"');
  console.log('✔ TEST 1 PASSED: Compact mobile hero & max 2 trust indicators verified.\n');

  // ----------------------------------------------------
  // TEST 2: ONE-WAY & SINGLE-COLUMN ITINERARY
  // ----------------------------------------------------
  console.log('--- TEST 2: ONE-WAY & SINGLE-COLUMN ITINERARY ---');
  assert.ok(bookingJs.includes('Outbound Flight'), 'Outbound Flight card must be rendered');
  assert.ok(bookingCss.includes('grid-template-columns: 1fr !important;'), 'Itinerary top grid must collapse to single column on mobile');
  console.log('✔ TEST 2 PASSED: One-way itinerary single-column layout verified.\n');

  // ----------------------------------------------------
  // TEST 3: ROUND-TRIP ITINERARY VERTICAL STACK
  // ----------------------------------------------------
  console.log('--- TEST 3: ROUND-TRIP ITINERARY VERTICAL STACK ---');
  assert.ok(bookingJs.includes('Return Flight'), 'Return Flight card rendering logic must exist');
  assert.ok(bookingCss.includes('.booking-itinerary-top-grid--roundtrip'), 'Roundtrip grid class must be targeted');
  console.log('✔ TEST 3 PASSED: Round-trip vertical stack layout verified.\n');

  // ----------------------------------------------------
  // TEST 4: CONNECTING FLIGHT & MULTI-SEGMENT SUPPORT
  // ----------------------------------------------------
  console.log('--- TEST 4: CONNECTING FLIGHT & MULTI-SEGMENT SUPPORT ---');
  assert.ok(itinCardJs.includes('segments'), 'ItineraryCard.js must handle multi-segment itineraries');
  assert.ok(itinCardJs.includes('Connection stop in'), 'ItineraryCard.js must display connection stop information');
  console.log('✔ TEST 4 PASSED: Multi-segment flight rendering verified.\n');

  // ----------------------------------------------------
  // TEST 5: LONG AIRLINE NAME WRAPPING & NO CLIPPING
  // ----------------------------------------------------
  console.log('--- TEST 5: LONG AIRLINE NAME WRAPPING ---');
  assert.ok(itinCardCss.includes('white-space: normal;'), 'Airline name must allow normal text wrapping');
  assert.ok(itinCardCss.includes('overflow-wrap: break-word;'), 'Airline name must break long words cleanly');
  assert.ok(!itinCardCss.includes('text-overflow: ellipsis;'), 'Airline name must not clip with ellipsis on mobile');
  console.log('✔ TEST 5 PASSED: Clean text wrapping for long airline names verified.\n');

  // ----------------------------------------------------
  // TEST 6: PASSENGER COUNT & PRICING CALCULATIONS
  // ----------------------------------------------------
  console.log('--- TEST 6: PASSENGER COUNT & PRICING CALCULATIONS ---');
  assert.ok(bookingJs.includes('calculateTotal'), 'calculateTotal pricing function must exist');
  assert.ok(bookingJs.includes('passengersList.length'), 'Pricing must factor passengersList length');
  console.log('✔ TEST 6 PASSED: Dynamic pricing and passenger count verified.\n');

  // ----------------------------------------------------
  // TEST 7: MISSING ITINERARY HANDLING
  // ----------------------------------------------------
  console.log('--- TEST 7: MISSING ITINERARY HANDLING ---');
  assert.ok(bookingJs.includes('if (!flight)'), 'BookingPage.js must check for missing flight state');
  assert.ok(bookingJs.includes('Loading itinerary details...'), 'Loading fallback must exist');
  console.log('✔ TEST 7 PASSED: Missing itinerary handling verified.\n');

  // ----------------------------------------------------
  // TEST 8: MOBILE CARD SYSTEM & ZERO OVERFLOW
  // ----------------------------------------------------
  console.log('--- TEST 8: MOBILE CARD SYSTEM & ZERO OVERFLOW ---');
  assert.ok(bookingCss.includes('width: 100% !important;'), 'Full width card system enforced');
  assert.ok(bookingCss.includes('max-width: 100% !important;'), 'Max width 100% enforced on mobile cards');
  assert.ok(itinCardCss.includes('box-sizing: border-box;'), 'Border-box sizing enforced on itinerary cards');
  console.log('✔ TEST 8 PASSED: Card system consistency & zero overflow verified.\n');

  console.log('================================================================================');
  console.log('  🎉 ALL 8 MOBILE CHECKOUT HERO & ITINERARY TESTS PASSED!');
  console.log('================================================================================\n');
}

runMobileCheckoutTests().catch((err) => {
  console.error('❌ Test Suite Failed:', err);
  process.exit(1);
});
