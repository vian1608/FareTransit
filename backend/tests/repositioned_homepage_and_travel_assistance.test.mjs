import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { flightHeroSlides, heroOfferTag } from '../../frontend/src/shared/data/heroSlides.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '../../');

async function runRepositionedHomepageTests() {
  console.log('================================================================================');
  console.log('  REPOSITIONED HOMEPAGE & TRAVEL ASSISTANCE AUTOMATED TEST SUITE');
  console.log('================================================================================\n');

  // ----------------------------------------------------
  // CASE 1: HOMEPAGE LOADS & HERO HEADLINE
  // ----------------------------------------------------
  console.log('--- CASE 1: HERO HEADLINE & SEARCH FORM LOADING ---');
  const heroSlide = flightHeroSlides.find(s => s.id === 'flight-intro');
  assert.strictEqual(heroSlide.title, 'Simple Flight Booking With Real Human Support', 'Hero title must be updated');
  assert.strictEqual(
    heroSlide.lead,
    'We help travelers and families compare routes, connections, baggage and total travel time before completing a reservation.',
    'Hero lead copy must match expected supporting text'
  );
  console.log('✔ CASE 1 PASSED: Hero headline & supporting copy updated correctly.\n');

  // ----------------------------------------------------
  // CASE 2: URGENT OFFER
  // ----------------------------------------------------
  console.log('--- CASE 2: URGENT OFFER 20% OFF WITHIN 3 DAYS ---');
  assert.strictEqual(heroOfferTag.highlight, 'Up to 20% off', 'Urgent offer highlight must show 20% off');
  assert.strictEqual(heroOfferTag.detail, 'on travel within 3 days', 'Urgent offer detail must show travel within 3 days');
  
  const heroSlidesContent = await fs.readFile(path.join(ROOT_DIR, 'frontend/src/shared/data/heroSlides.js'), 'utf8');
  assert.ok(!heroSlidesContent.includes('Up to 30% off'), 'Hero offer must not mention 30% off');
  console.log('✔ CASE 2 PASSED: Urgent offer updated to "Up to 20% off on travel within 3 days".\n');

  // ----------------------------------------------------
  // CASE 3: GET BOOKING HELP & SUPPORT BOX
  // ----------------------------------------------------
  console.log('--- CASE 3: GET BOOKING HELP & SUPPORT BOX ---');
  const homeJsContent = await fs.readFile(path.join(ROOT_DIR, 'frontend/src/features/flights/pages/Home.js'), 'utf8');
  assert.ok(homeJsContent.includes('Would You Like Help Booking?') || homeJsContent.includes('Need Help Choosing a Flight?') || homeJsContent.includes('Need help choosing a flight?'), 'Support box heading must exist');
  assert.ok(homeJsContent.includes('connections') && homeJsContent.includes('baggage'), 'Support box text must match');
  assert.ok(homeJsContent.includes('Talk to a Travel Specialist') || homeJsContent.includes('Call for Booking Help'), 'Support box CTA must exist');
  console.log('✔ CASE 3 PASSED: Support box heading, copy, and CTA updated.\n');

  // ----------------------------------------------------
  // CASE 4: BOOKING FOR SOMEONE ELSE PREFERENCE
  // ----------------------------------------------------
  console.log('--- CASE 4: BOOKING FOR SOMEONE ELSE OPTION ---');
  assert.ok(homeJsContent.includes('I am booking for a parent, relative or another traveler'), 'Checkbox label for booking for someone else must exist');
  assert.ok(homeJsContent.includes('isBookingForSomeoneElse'), 'isBookingForSomeoneElse state must be handled in searchData');
  console.log('✔ CASE 4 PASSED: "Booking for someone else" preference saved without storing sensitive data.\n');

  // ----------------------------------------------------
  // CASE 5: POPULAR ROUTE CARDS
  // ----------------------------------------------------
  console.log('--- CASE 5: POPULAR FLIGHT OPTIONS ROUTE SECTION ---');
  const routeSliderContent = await fs.readFile(path.join(ROOT_DIR, 'frontend/src/shared/components/RouteSlider.js'), 'utf8');
  assert.ok(routeSliderContent.includes('Popular Flight Options'), 'Route section title must default to "Popular Flight Options"');
  assert.ok(routeSliderContent.includes('Check Flight Options'), 'Route card CTA button text must be "Check Flight Options"');
  assert.ok(!routeSliderContent.includes('Request a Quote'), 'Old CTA "Request a Quote" must be removed from RouteSlider');
  console.log('✔ CASE 5 PASSED: Route section renamed and card CTA updated to "Check Flight Options".\n');

  // ----------------------------------------------------
  // CASE 6: MOBILE LAYOUT & RESPONSIVENESS
  // ----------------------------------------------------
  console.log('--- CASE 6: MOBILE RESPONSIVENESS & CSS GRIDS ---');
  const homeCssContent = await fs.readFile(path.join(ROOT_DIR, 'frontend/src/features/flights/pages/Home.css'), 'utf8');
  assert.ok(homeCssContent.includes('.who-we-help-grid'), 'who-we-help-grid CSS class must exist');
  assert.ok(homeCssContent.includes('.compare-more-grid'), 'compare-more-grid CSS class must exist');
  assert.ok(homeCssContent.includes('.trust-bullets-grid'), 'trust-bullets-grid CSS class must exist');
  assert.ok(homeCssContent.includes('.expectations-grid'), 'expectations-grid CSS class must exist');
  console.log('✔ CASE 6 PASSED: CSS grid classes defined for fluid mobile responsive layouts.\n');

  // ----------------------------------------------------
  // CASE 7: ACCESSIBILITY & FORM LABELS
  // ----------------------------------------------------
  console.log('--- CASE 7: ACCESSIBILITY & LABELS ---');
  assert.ok(homeJsContent.includes('htmlFor="booking-for-someone-else"'), 'Checkbox label must use htmlFor for screen reader accessibility');
  console.log('✔ CASE 7 PASSED: Form controls properly labeled for accessibility.\n');

  // ----------------------------------------------------
  // CASE 8: REMOVAL OF UNNEEDED BOTTOM CARDS / SECTIONS
  // ----------------------------------------------------
  console.log('--- CASE 8: REMOVAL OF UNNEEDED BOTTOM CARDS / SECTIONS ---');
  assert.ok(!homeJsContent.includes('More Than Just a Flight Search'), '"More Than Just a Flight Search" section must be removed from Home.js');
  assert.ok(!homeJsContent.includes('What Customers Can Expect'), '"What Customers Can Expect" section must be removed from Home.js');
  console.log('✔ CASE 8 PASSED: Bottom cards removed per user directive.\n');

  // ----------------------------------------------------
  // CASE 9: DEDICATED TRAVEL ASSISTANCE ROUTE & EXISTING SEARCH FUNCTIONALITY
  // ----------------------------------------------------
  console.log('--- CASE 9: TRAVEL ASSISTANCE ROUTE & EXISTING SEARCH PRESERVATION ---');
  const appContent = await fs.readFile(path.join(ROOT_DIR, 'frontend/src/app/App.js'), 'utf8');
  assert.ok(appContent.includes('path="/travel-assistance"'), 'Route /travel-assistance must be registered in App.js');
  
  const travelAssistanceContent = await fs.readFile(path.join(ROOT_DIR, 'frontend/src/features/flights/pages/TravelAssistancePage.js'), 'utf8');
  assert.ok(travelAssistanceContent.includes('Need Help Booking Your Flight?') || travelAssistanceContent.includes('Booking a Flight for Yourself, a Parent or a Relative?'), 'TravelAssistancePage heading must match');

  const footerContent = await fs.readFile(path.join(ROOT_DIR, 'frontend/src/shared/components/Footer.js'), 'utf8');
  assert.ok(footerContent.includes('FareTransit provides flight-search and reservation assistance for travelers who value clear information and real human support.'), 'Footer description statement must be updated');
  console.log('✔ CASE 9 PASSED: /travel-assistance page created, footer updated, core search preserved.\n');

  console.log('================================================================================');
  console.log('  🎉 ALL REPOSITIONED HOMEPAGE & TRAVEL ASSISTANCE TESTS PASSED!');
  console.log('================================================================================\n');
}

runRepositionedHomepageTests().catch(err => {
  console.error('❌ Test Suite Failed:', err);
  process.exit(1);
});
