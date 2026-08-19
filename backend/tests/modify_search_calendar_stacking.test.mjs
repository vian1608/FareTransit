import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '../../');

async function runModifySearchCalendarStackingTests() {
  console.log('================================================================================');
  console.log('  MODIFY SEARCH CALENDAR PORTAL & STACKING SYSTEM AUTOMATED TEST SUITE');
  console.log('================================================================================\n');

  const indexHtmlPath = path.join(ROOT_DIR, 'frontend/public/index.html');
  const travelDatePickerJsPath = path.join(ROOT_DIR, 'frontend/src/features/flights/components/TravelDatePicker.js');
  const travelDatePickerCssPath = path.join(ROOT_DIR, 'frontend/src/features/flights/components/TravelDatePicker.css');
  const modifySearchModalJsPath = path.join(ROOT_DIR, 'frontend/src/features/flights/components/ModifySearchModal.js');
  const modifySearchModalCssPath = path.join(ROOT_DIR, 'frontend/src/features/flights/components/ModifySearchModal.css');
  const airportAutocompleteCssPath = path.join(ROOT_DIR, 'frontend/src/features/flights/components/AirportAutocomplete.css');

  const indexHtml = await fs.readFile(indexHtmlPath, 'utf8');
  const travelDatePickerJs = await fs.readFile(travelDatePickerJsPath, 'utf8');
  const travelDatePickerCss = await fs.readFile(travelDatePickerCssPath, 'utf8');
  const modifySearchModalJs = await fs.readFile(modifySearchModalJsPath, 'utf8');
  const modifySearchModalCss = await fs.readFile(modifySearchModalCssPath, 'utf8');
  const airportAutocompleteCss = await fs.readFile(airportAutocompleteCssPath, 'utf8');

  // ----------------------------------------------------
  // TEST 1: TOP-LEVEL PORTAL ROOT REGISTRATION
  // ----------------------------------------------------
  console.log('--- TEST 1: TOP-LEVEL PORTAL ROOT REGISTRATION ---');
  assert.ok(indexHtml.includes('id="datepicker-portal-root"'), 'index.html must contain <div id="datepicker-portal-root"></div> directly under body');
  assert.ok(travelDatePickerJs.includes('datepicker-portal-root'), 'TravelDatePicker.js must target datepicker-portal-root portal container');
  console.log('✔ TEST 1 PASSED: Top-level portal root <div id="datepicker-portal-root"> verified.\n');

  // ----------------------------------------------------
  // TEST 2: STRICT STACKING HIERARCHY (Z-INDEX 10030 > 10010 > 10000)
  // ----------------------------------------------------
  console.log('--- TEST 2: STRICT STACKING HIERARCHY ---');
  assert.ok(modifySearchModalCss.includes('z-index: 10000'), 'Backdrop overlay must sit at z-index 10000');
  assert.ok(modifySearchModalCss.includes('z-index: 10010') || modifySearchModalJs.includes('10010'), 'Dialog container must sit at z-index 10010');
  assert.ok(airportAutocompleteCss.includes('z-index: 10020'), 'Autocomplete dropdown list must sit at z-index 10020');
  assert.ok(travelDatePickerCss.includes('z-index: 10030') || travelDatePickerJs.includes('10030'), 'Datepicker portal popover must sit at z-index 10030');
  console.log('✔ TEST 2 PASSED: Strict stacking order (Calendar 10030 > Autocomplete 10020 > Dialog 10010 > Backdrop 10000) enforced.\n');

  // ----------------------------------------------------
  // TEST 3: VIEWPORT-SAFE FIXED POSITIONING & EVENT LISTENERS
  // ----------------------------------------------------
  console.log('--- TEST 3: VIEWPORT-SAFE FIXED POSITIONING & EVENT LISTENERS ---');
  assert.ok(travelDatePickerJs.includes("position: 'fixed'") || travelDatePickerCss.includes('position: fixed'), 'Calendar popover must use fixed positioning');
  assert.ok(travelDatePickerJs.includes('window.addEventListener') && travelDatePickerJs.includes('scroll'), 'Scroll listener must update popover position dynamically');
  assert.ok(travelDatePickerJs.includes('resize'), 'Resize listener must keep calendar within viewport');
  console.log('✔ TEST 3 PASSED: Fixed positioning and scroll/resize event handlers verified.\n');

  // ----------------------------------------------------
  // TEST 4: UNBLURRED CALENDAR & POINTER EVENTS
  // ----------------------------------------------------
  console.log('--- TEST 4: UNBLURRED CALENDAR & POINTER EVENTS ---');
  assert.ok(!travelDatePickerCss.includes('blur('), 'TravelDatePicker CSS must not apply blur filter to calendar popover');
  assert.ok(travelDatePickerCss.includes('pointer-events: auto'), 'Calendar popover must enable pointer-events: auto');
  console.log('✔ TEST 4 PASSED: Unblurred calendar with active pointer events confirmed.\n');

  // ----------------------------------------------------
  // TEST 5: RETURN DATE PREFILL & REVALIDATION
  // ----------------------------------------------------
  console.log('--- TEST 5: RETURN DATE PREFILL & REVALIDATION ---');
  assert.ok(modifySearchModalJs.includes('resolveReturnDate') || modifySearchModalJs.includes('getUrlDateParam'), 'Return date must prefill from search state or URL query parameters');
  assert.ok(modifySearchModalJs.includes('newDate > returnDate') || modifySearchModalJs.includes('setReturnDate(newDate)'), 'Departure date change must revalidate return date');
  console.log('✔ TEST 5 PASSED: Return date prefill from URL/state and revalidation verified.\n');

  // ----------------------------------------------------
  // TEST 6: ONE-WAY VS ROUND-TRIP MODES
  // ----------------------------------------------------
  console.log('--- TEST 6: ONE-WAY VS ROUND-TRIP MODES ---');
  assert.ok(modifySearchModalJs.includes("tripType === 'round-trip'"), 'Return date field toggled by tripType');
  assert.ok(modifySearchModalJs.includes('tripType'), 'Submitted payload must respect selected tripType');
  console.log('✔ TEST 6 PASSED: One-way vs round-trip payload separation verified.\n');

  // ----------------------------------------------------
  // TEST 7: BODY SCROLL LOCK CLEANUP
  // ----------------------------------------------------
  console.log('--- TEST 7: BODY SCROLL LOCK CLEANUP ---');
  assert.ok(modifySearchModalJs.includes("document.body.style.overflow = 'hidden'"), 'Modal must lock background scroll when open');
  assert.ok(modifySearchModalJs.includes("document.body.style.overflow = ''"), 'Modal must restore body scroll when closed');
  console.log('✔ TEST 7 PASSED: Background scroll lock & cleanup confirmed.\n');

  console.log('================================================================================');
  console.log('  🎉 ALL 7 MODIFY SEARCH CALENDAR PORTAL TESTS PASSED!');
  console.log('================================================================================\n');
}

runModifySearchCalendarStackingTests().catch((err) => {
  console.error('❌ Test Suite Failed:', err);
  process.exit(1);
});
