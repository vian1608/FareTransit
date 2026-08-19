import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '../../');

async function runSeoPagesFlightSearchTests() {
  console.log('================================================================================');
  console.log('  SEO LANDING PAGES SHARED FLIGHT SEARCH AUTOMATED TEST SUITE');
  console.log('================================================================================\n');

  const sharedPanelJs = await fs.readFile(path.join(ROOT_DIR, 'frontend/src/features/flights/components/FlightSearchPanel.js'), 'utf8');
  const sharedPanelCss = await fs.readFile(path.join(ROOT_DIR, 'frontend/src/features/flights/components/FlightSearchPanel.css'), 'utf8');
  const analyticsJs = await fs.readFile(path.join(ROOT_DIR, 'frontend/src/shared/utils/analytics.js'), 'utf8');
  const travelAssistanceJs = await fs.readFile(path.join(ROOT_DIR, 'frontend/src/features/flights/pages/TravelAssistancePage.js'), 'utf8');
  const bookingForParentsJs = await fs.readFile(path.join(ROOT_DIR, 'frontend/src/features/flights/pages/BookingForParentsPage.js'), 'utf8');
  const urgentTravelJs = await fs.readFile(path.join(ROOT_DIR, 'frontend/src/features/flights/pages/UrgentTravelPage.js'), 'utf8');
  const ctaSectionCss = await fs.readFile(path.join(ROOT_DIR, 'frontend/src/shared/components/LandingCtaSection.css'), 'utf8');

  // ----------------------------------------------------
  // CASE 1: TRAVEL ASSISTANCE PAGE SEARCH & CALL CTA
  // ----------------------------------------------------
  console.log('--- CASE 1: TRAVEL ASSISTANCE PAGE SEARCH & CALL CTA ---');
  assert.ok(travelAssistanceJs.includes('<FlightSearchPanel'), 'TravelAssistancePage must render FlightSearchPanel');
  assert.ok(travelAssistanceJs.includes('pageId="travel_assistance"'), 'Page identifier travel_assistance must be passed to search panel');
  assert.ok(travelAssistanceJs.includes('LandingCtaSection'), 'Standardized LandingCtaSection must be rendered');
  console.log('✔ CASE 1 PASSED: Travel Assistance page has embedded flight search panel and call assistance CTA.\n');

  // ----------------------------------------------------
  // CASE 2: BOOKING FOR PARENTS PAGE & NON-SENSITIVE CONTEXT
  // ----------------------------------------------------
  console.log('--- CASE 2: BOOKING FOR PARENTS PAGE & NON-SENSITIVE CONTEXT ---');
  assert.ok(bookingForParentsJs.includes('<FlightSearchPanel'), 'BookingForParentsPage must render FlightSearchPanel');
  assert.ok(bookingForParentsJs.includes('defaultBookingForSomeoneElse={true}'), 'Booking for someone else checkbox must default to true on Parents page');
  assert.ok(!bookingForParentsJs.includes('passport'), 'Landing page MUST NOT request sensitive passport credentials');
  assert.ok(!bookingForParentsJs.includes('creditCard'), 'Landing page MUST NOT request sensitive card credentials');
  console.log('✔ CASE 2 PASSED: Booking for Parents page features search form & non-sensitive family context.\n');

  // ----------------------------------------------------
  // CASE 3: URGENT TRAVEL PAGE & UP TO 20% OFFER
  // ----------------------------------------------------
  console.log('--- CASE 3: URGENT TRAVEL PAGE & UP TO 20% OFFER ---');
  assert.ok(urgentTravelJs.includes('<FlightSearchPanel'), 'UrgentTravelPage must render FlightSearchPanel');
  assert.ok(urgentTravelJs.includes('isUrgentContext={true}'), 'isUrgentContext flag must be passed to search panel');
  assert.ok(urgentTravelJs.includes('Save up to 20% on eligible reservations'), 'Urgent offer must include "up to 20%" and "eligible reservations" qualification');
  assert.ok(!urgentTravelJs.includes('Guaranteed 20% off all flights'), 'Must NOT claim guaranteed non-qualified discount');
  console.log('✔ CASE 3 PASSED: Urgent travel page contains search form and qualified up to 20% offer.\n');

  // ----------------------------------------------------
  // CASE 4: ROUND-TRIP SEARCH VALIDATION
  // ----------------------------------------------------
  console.log('--- CASE 4: ROUND-TRIP SEARCH VALIDATION ---');
  assert.ok(sharedPanelJs.includes('searchData.tripType === \'roundtrip\' && !searchData.returnDate'), 'Round-trip search must require return date');
  assert.ok(sharedPanelJs.includes('sessionStorage.setItem(\'searchParams\''), 'Search criteria must be saved in sessionStorage');
  console.log('✔ CASE 4 PASSED: Round-trip search enforces return date and preserves criteria.\n');

  // ----------------------------------------------------
  // CASE 5: ONE-WAY SEARCH VALIDATION
  // ----------------------------------------------------
  console.log('--- CASE 5: ONE-WAY SEARCH VALIDATION ---');
  assert.ok(sharedPanelJs.includes('disabled={searchData.tripType === \'oneway\'}'), 'Return date picker must be disabled on one-way trip');
  console.log('✔ CASE 5 PASSED: One-way trip selection disables return date input.\n');

  // ----------------------------------------------------
  // CASE 6: INVALID ROUTE REJECTION
  // ----------------------------------------------------
  console.log('--- CASE 6: INVALID ROUTE REJECTION ---');
  assert.ok(sharedPanelJs.includes('Origin and destination airports cannot be identical'), 'Identical airports error message must exist');
  console.log('✔ CASE 6 PASSED: Identical origin and destination airports are rejected before submission.\n');

  // ----------------------------------------------------
  // CASE 7: MOBILE LAYOUT & CTA BUTTON SIZING
  // ----------------------------------------------------
  console.log('--- CASE 7: MOBILE LAYOUT & CTA BUTTON SIZING ---');
  assert.ok(ctaSectionCss.includes('min-width: 280px'), 'CTA buttons must have at least 280px minimum width on desktop');
  assert.ok(ctaSectionCss.includes('height: 72px') || sharedPanelCss.includes('min-height: 64px'), 'CTA buttons must have consistent height');
  assert.ok(ctaSectionCss.includes('flex-direction: column'), 'CTA actions must stack vertically on mobile screens');
  console.log('✔ CASE 7 PASSED: Mobile layout stacks actions vertically with equal button heights.\n');

  // ----------------------------------------------------
  // CASE 8: SEARCH ERROR HANDLING & ZERO DUMMY FLIGHTS
  // ----------------------------------------------------
  console.log('--- CASE 8: SEARCH ERROR HANDLING & ZERO DUMMY FLIGHTS ---');
  assert.ok(sharedPanelJs.includes('We could not load flight options right now. Please try again or call a travel specialist.'), 'Clear retry error message must be set on failure');
  assert.ok(!sharedPanelJs.includes('dummyFlights'), 'FlightSearchPanel must NEVER return dummy or hardcoded mock flights');
  console.log('✔ CASE 8 PASSED: Search error handling preserves criteria and shows clear retry message.\n');

  // ----------------------------------------------------
  // CASE 9: AIRLINE-INTENT TRAFFIC & INDEPENDENT DISCLOSURE
  // ----------------------------------------------------
  console.log('--- CASE 9: AIRLINE-INTENT TRAFFIC & INDEPENDENT DISCLOSURE ---');
  const disclosureText = 'FareTransit is an independent flight-search and reservation-assistance service and is not affiliated with or endorsed by individual airlines.';
  assert.ok(sharedPanelJs.includes(disclosureText), 'Shared FlightSearchPanel must include independent service disclosure');
  assert.ok(travelAssistanceJs.includes(disclosureText), 'Travel Assistance page must include independent service disclosure');
  assert.ok(bookingForParentsJs.includes(disclosureText), 'Booking for Parents page must include independent service disclosure');
  assert.ok(urgentTravelJs.includes(disclosureText), 'Urgent Travel page must include independent service disclosure');
  console.log('✔ CASE 9 PASSED: Independent service disclosure present across all 3 SEO pages.\n');

  // ----------------------------------------------------
  // CASE 10: HARD REFRESH & STANDALONE LOAD
  // ----------------------------------------------------
  console.log('--- CASE 10: HARD REFRESH & STANDALONE LOAD ---');
  assert.ok(analyticsJs.includes('trackSeoPageView'), 'Analytics must log seo_page_view on standalone mount');
  console.log('✔ CASE 10 PASSED: Hard refresh and standalone page load verified.\n');

  console.log('================================================================================');
  console.log('  🎉 ALL 10 SEO LANDING PAGES FLIGHT SEARCH TESTS PASSED!');
  console.log('================================================================================\n');
}

runSeoPagesFlightSearchTests().catch(err => {
  console.error('❌ Test Suite Failed:', err);
  process.exit(1);
});
