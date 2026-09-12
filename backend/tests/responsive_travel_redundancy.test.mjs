import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '../../');

async function read(relativePath) {
  return fs.readFile(path.join(ROOT_DIR, relativePath), 'utf8');
}

async function run() {
  const heroSlider = await read('frontend/src/shared/components/HeroSlider.js');
  const header = await read('frontend/src/shared/components/Header.js');
  const productSearchCard = await read('frontend/src/shared/components/ProductSearchCard.js');
  const productSearchCss = await read('frontend/src/shared/components/ProductSearchCard.css');
  const supportCta = await read('frontend/src/shared/components/SupportCallCTA.js');
  const supportLayer = await read('frontend/src/shared/components/SupportCallLayer.js');
  const supportCss = await read('frontend/src/shared/components/SupportCallCTA.css');
  const carPage = await read('frontend/src/features/cars/pages/CarRentalsHomePage.js');
  const responsiveGuardrails = await read('frontend/src/shared/styles/ResponsiveTravelRedundancy.css');
  const index = await read('frontend/src/index.js');

  assert.ok(
    !heroSlider.includes("import ServiceNav") && !heroSlider.includes('<ServiceNav'),
    'Product navigation must not be duplicated inside the hero when the global header already owns navigation'
  );

  assert.ok(
    !header.includes('header-mobile-call') && !header.includes('SUPPORT_PHONE_HREF'),
    'Mobile header must stay clean: brand plus hamburger, without a second persistent Call Now control'
  );

  assert.ok(
    productSearchCard.includes('product-search-card__support') &&
      productSearchCard.includes('primary={primaryCallSupport}'),
    'Search pages must expose one identifiable inline phone assistance point'
  );

  assert.ok(
    productSearchCss.includes('#inquiry .search-tabs-header .tab-btn:nth-child(2)') &&
      productSearchCss.includes('display: none !important;'),
    'The legacy Car Rentals tab inside the Flights card must stay hidden because product navigation belongs in the header'
  );

  assert.ok(
    productSearchCss.includes('.product-search-card__support') &&
      productSearchCss.includes('grid-row: 3;'),
    'On mobile, product support must flow below the search form instead of competing with form controls'
  );

  assert.ok(
    supportCta.includes('data-support-call-inline') &&
      supportCta.includes('data-support-call-primary'),
    'Inline and primary phone CTAs must be marked for viewport-aware sticky behavior'
  );

  assert.ok(
    supportLayer.includes('useStickySupportVisibility') &&
      supportLayer.includes('[data-support-call-inline="true"]') &&
      supportLayer.includes('[data-support-call-primary="true"]') &&
      supportLayer.includes('primaryHasBeenPassed') &&
      supportLayer.includes('!anyInlineVisible'),
    'Sticky phone assistance must appear only after the primary inline CTA is passed and no inline CTA is visible'
  );

  assert.ok(
    supportCss.includes('.support-call-cta--flight-search-portal') &&
      supportCss.includes('position: static;') &&
      supportCss.includes('.support-call-sticky') &&
      supportCss.includes('left: 0;') &&
      supportCss.includes('right: 0;'),
    'Mobile flight support must flow below the form, while sticky support uses a full-width bottom bar'
  );

  assert.ok(
    carPage.includes('data-support-call-primary={primary ? \'true\' : undefined}') &&
      !carPage.includes('className="car-mobile-cta"'),
    'Car Rentals must use its hero CTA as the primary support point and must not ship a second custom mobile call bar'
  );

  assert.ok(
    responsiveGuardrails.includes('.hero-slider .service-nav') &&
      responsiveGuardrails.includes('.header-mobile-call') &&
      responsiveGuardrails.includes('.car-mobile-cta') &&
      responsiveGuardrails.includes('.car-rentals-home-page') &&
      responsiveGuardrails.includes('padding-bottom: 0 !important;'),
    'Responsive guardrails must prevent legacy duplicate navigation/CTA surfaces and old car mobile spacing from resurfacing'
  );

  assert.ok(
    index.includes("import './shared/styles/ResponsiveTravelRedundancy.css';"),
    'Responsive travel redundancy guardrails must load globally'
  );

  console.log('Responsive travel navigation and phone CTA redundancy contract passed.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
