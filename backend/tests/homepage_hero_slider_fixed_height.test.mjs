import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '../../');

async function runHomepageHeroSliderTests() {
  console.log('================================================================================');
  console.log('  HOMEPAGE HERO SLIDER FIXED HEIGHT & BUTTON REMOVAL TEST SUITE');
  console.log('================================================================================\n');

  const heroSliderJs = await fs.readFile(path.join(ROOT_DIR, 'frontend/src/shared/components/HeroSlider.js'), 'utf8');
  const heroSliderCss = await fs.readFile(path.join(ROOT_DIR, 'frontend/src/shared/components/HeroSlider.css'), 'utf8');
  const heroSlidesJs = await fs.readFile(path.join(ROOT_DIR, 'frontend/src/shared/data/heroSlides.js'), 'utf8');

  // ----------------------------------------------------
  // TEST 1: HERO BUTTON REMOVAL
  // ----------------------------------------------------
  console.log('--- TEST 1: HERO BUTTON REMOVAL ---');
  assert.ok(!heroSliderJs.includes('hero-slider__actions'), 'HeroSlider.js MUST NOT contain hero-slider__actions container');
  assert.ok(!heroSliderJs.includes('Talk to a Travel Specialist'), 'HeroSlider.js MUST NOT render "Talk to a Travel Specialist" button in hero');
  assert.ok(!heroSliderJs.includes('Search Flights</a>'), 'HeroSlider.js MUST NOT render "Search Flights" button in hero');
  console.log('✔ TEST 1 PASSED: Hero buttons and actions container completely removed.\n');

  // ----------------------------------------------------
  // TEST 2: FIXED DESKTOP, TABLET & MOBILE SLIDER HEIGHTS
  // ----------------------------------------------------
  console.log('--- TEST 2: FIXED SLIDER HEIGHT SPECIFICATIONS ---');
  assert.ok(heroSliderCss.includes('height: 490px;'), 'Desktop slider height must be 490px');
  assert.ok(heroSliderCss.includes('min-height: 490px;'), 'Desktop slider min-height must be 490px');
  assert.ok(heroSliderCss.includes('max-height: 490px;'), 'Desktop slider max-height must be 490px');
  assert.ok(heroSliderCss.includes('height: 440px;'), 'Tablet slider height must be 440px');
  assert.ok(heroSliderCss.includes('height: 480px;'), 'Mobile slider height must be 480px');
  console.log('✔ TEST 2 PASSED: Fixed heights for Desktop (490px), Tablet (440px), and Mobile (480px) verified.\n');

  // ----------------------------------------------------
  // TEST 3: LOCKED NAVIGATION CONTROLS POSITION
  // ----------------------------------------------------
  console.log('--- TEST 3: LOCKED NAVIGATION CONTROLS ---');
  assert.ok(heroSliderJs.includes('hero-slider__controls'), 'HeroSlider.js must contain hero-slider__controls');
  assert.ok(heroSliderJs.includes('fa-chevron-left'), 'Previous arrow must exist in controls');
  assert.ok(heroSliderJs.includes('fa-chevron-right'), 'Next arrow must exist in controls');
  assert.ok(heroSliderJs.includes('hero-slider__dots'), 'Dots pagination container must exist in controls');
  assert.ok(heroSliderCss.includes('position: absolute;'), 'Controls must use position: absolute to lock bottom position');
  console.log('✔ TEST 3 PASSED: Stationary navigation controls verified.\n');

  // ----------------------------------------------------
  // TEST 4: FEATURE CHIPS & MOBILE 2-CHIP RESPONSIVE FILTER
  // ----------------------------------------------------
  console.log('--- TEST 4: FEATURE CHIPS & MOBILE 2-CHIP FILTER ---');
  assert.ok(heroSliderJs.includes('Human Travel Assistance'), 'Human Travel Assistance badge preserved');
  assert.ok(heroSliderJs.includes('Clear Flight Comparison'), 'Clear Flight Comparison badge preserved');
  assert.ok(heroSliderJs.includes('Family Booking Support'), 'Family Booking Support badge preserved');
  assert.ok(heroSliderJs.includes('Secure Reservation Process'), 'Secure Reservation Process badge preserved');
  assert.ok(heroSliderJs.includes('hero-trust-badge--desktop-only'), 'HeroSlider.js must flag middle 2 chips with hero-trust-badge--desktop-only');
  assert.ok(heroSliderCss.includes('hero-trust-badge--desktop-only'), 'HeroSlider.css must hide desktop-only chips on mobile width');
  console.log('✔ TEST 4 PASSED: Required feature chips & mobile 2-chip responsive filter verified.\n');

  // ----------------------------------------------------
  // TEST 5: SHORT MOBILE SUPPORTING DESCRIPTION & UNIFIED DATA
  // ----------------------------------------------------
  console.log('--- TEST 5: SHORT MOBILE DESCRIPTION & UNIFIED SLIDE DATA ---');
  assert.ok(heroSlidesJs.includes('mobileLead:'), 'heroSlides.js must define compact mobileLead properties');
  assert.ok(heroSliderJs.includes('hero-lead-desktop'), 'HeroSlider.js must render hero-lead-desktop wrapper');
  assert.ok(heroSliderJs.includes('hero-lead-mobile'), 'HeroSlider.js must render hero-lead-mobile wrapper');
  console.log('✔ TEST 5 PASSED: Mobile short description & data-driven slides verified.\n');

  console.log('================================================================================');
  console.log('  🎉 ALL 5 HOMEPAGE HERO SLIDER TESTS PASSED!');
  console.log('================================================================================\n');
}

runHomepageHeroSliderTests().catch(err => {
  console.error('❌ Test Suite Failed:', err);
  process.exit(1);
});

