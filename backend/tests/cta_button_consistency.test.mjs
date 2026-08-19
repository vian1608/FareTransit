import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '../../');

async function runCtaConsistencyTests() {
  console.log('================================================================================');
  console.log('  STANDARDIZED CTA BUTTON CONSISTENCY AUTOMATED TEST SUITE');
  console.log('================================================================================\n');

  // ----------------------------------------------------
  // TEST 1: REUSABLE COMPONENT & CSS DEFINITION
  // ----------------------------------------------------
  console.log('--- TEST 1: REUSABLE COMPONENT & CSS DEFINITIONS ---');
  const componentPath = path.join(ROOT_DIR, 'frontend/src/shared/components/LandingCtaSection.js');
  const cssPath = path.join(ROOT_DIR, 'frontend/src/shared/components/LandingCtaSection.css');

  const componentContent = await fs.readFile(componentPath, 'utf8');
  const cssContent = await fs.readFile(cssPath, 'utf8');

  assert.ok(componentContent.includes('function LandingCtaSection'), 'LandingCtaSection component must exist');
  assert.ok(cssContent.includes('height: 72px;'), 'Button height 72px required in CSS');
  assert.ok(cssContent.includes('min-width: 280px;'), 'Button min-width 280px required in CSS');
  assert.ok(cssContent.includes('padding: 0 40px;'), 'Button padding 0 40px required in CSS');
  assert.ok(cssContent.includes('border-radius: 14px;'), 'Button border-radius 14px required in CSS');
  assert.ok(cssContent.includes('font-size: 20px;'), 'Button font-size 20px required in CSS');
  assert.ok(cssContent.includes('font-weight: 600;'), 'Button font-weight 600 required in CSS');
  assert.ok(cssContent.includes('gap: 24px;'), 'Actions container gap 24px required in CSS');
  assert.ok(cssContent.includes('background-color: #8b1538;'), 'Secondary button burgundy background required');
  assert.ok(cssContent.includes('background-color: #ffffff;'), 'Primary button white background required');
  console.log('✔ TEST 1 PASSED: Component and CSS specifications verified.\n');

  // ----------------------------------------------------
  // TEST 2: MOBILE RESPONSIVE STACKING
  // ----------------------------------------------------
  console.log('--- TEST 2: MOBILE RESPONSIVE STACKING ---');
  assert.ok(cssContent.includes('@media (max-width: 768px)'), 'Mobile media query must exist');
  assert.ok(cssContent.includes('flex-direction: column;'), 'Actions container flex-direction column on mobile required');
  assert.ok(cssContent.includes('width: 100%;'), 'Full width buttons on mobile required');
  console.log('✔ TEST 2 PASSED: Mobile responsiveness verified.\n');

  // ----------------------------------------------------
  // TEST 3: INTEGRATION ON /travel-assistance
  // ----------------------------------------------------
  console.log('--- TEST 3: INTEGRATION ON /travel-assistance ---');
  const taPath = path.join(ROOT_DIR, 'frontend/src/features/flights/pages/TravelAssistancePage.js');
  const taContent = await fs.readFile(taPath, 'utf8');
  assert.ok(taContent.includes("import LandingCtaSection from '../../../shared/components/LandingCtaSection'"), 'LandingCtaSection must be imported in TravelAssistancePage');
  assert.ok(taContent.includes('primaryText="Search Flights"') || taContent.includes('primaryText="Get Travel Assistance"'), 'Primary text on TravelAssistancePage must match');
  console.log('✔ TEST 3 PASSED: /travel-assistance integration verified.\n');

  // ----------------------------------------------------
  // TEST 4: INTEGRATION ON /booking-for-parents
  // ----------------------------------------------------
  console.log('--- TEST 4: INTEGRATION ON /booking-for-parents ---');
  const bfpPath = path.join(ROOT_DIR, 'frontend/src/features/flights/pages/BookingForParentsPage.js');
  const bfpContent = await fs.readFile(bfpPath, 'utf8');
  assert.ok(bfpContent.includes("import LandingCtaSection from '../../../shared/components/LandingCtaSection'"), 'LandingCtaSection must be imported in BookingForParentsPage');
  assert.ok(bfpContent.includes('primaryText="Search Flights"') || bfpContent.includes('primaryText="Find Flight Options"'), 'Primary text on BookingForParentsPage must match');
  console.log('✔ TEST 4 PASSED: /booking-for-parents integration verified.\n');

  // ----------------------------------------------------
  // TEST 5: INTEGRATION ON /urgent-travel
  // ----------------------------------------------------
  console.log('--- TEST 5: INTEGRATION ON /urgent-travel ---');
  const utPath = path.join(ROOT_DIR, 'frontend/src/features/flights/pages/UrgentTravelPage.js');
  const utContent = await fs.readFile(utPath, 'utf8');
  assert.ok(utContent.includes("import LandingCtaSection from '../../../shared/components/LandingCtaSection'"), 'LandingCtaSection must be imported in UrgentTravelPage');
  assert.ok(utContent.includes('primaryText="Search Flights"') || utContent.includes('primaryText="Request Urgent Travel Help"'), 'Primary text on UrgentTravelPage must match');
  console.log('✔ TEST 5 PASSED: /urgent-travel integration verified.\n');

  console.log('================================================================================');
  console.log('  🎉 ALL STANDARDIZED CTA BUTTON CONSISTENCY TESTS PASSED!');
  console.log('================================================================================\n');
}

runCtaConsistencyTests().catch(err => {
  console.error('❌ Test Suite Failed:', err);
  process.exit(1);
});
