const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const fail = (message) => {
  console.error(`Responsive travel redundancy audit failed: ${message}`);
  process.exit(1);
};

const hero = read('frontend/src/shared/components/HeroSlider.js');
const header = read('frontend/src/shared/components/Header.js');
const productCard = read('frontend/src/shared/components/ProductSearchCard.js');
const productCss = read('frontend/src/shared/components/ProductSearchCard.css');
const supportLayer = read('frontend/src/shared/components/SupportCallLayer.js');
const supportCta = read('frontend/src/shared/components/SupportCallCTA.js');
const supportCss = read('frontend/src/shared/components/SupportCallCTA.css');
const carPage = read('frontend/src/features/cars/pages/CarRentalsHomePage.js');
const guardrails = read('frontend/src/shared/styles/ResponsiveTravelRedundancy.css');
const index = read('frontend/src/index.js');

if (hero.includes('import ServiceNav') || hero.includes('<ServiceNav')) {
  fail('HeroSlider still renders duplicate product navigation.');
}
if (header.includes('header-mobile-call') || header.includes('SUPPORT_PHONE_HREF')) {
  fail('Header still contains the duplicate mobile Call Now control.');
}
if (!productCard.includes('product-search-card__support') || !productCard.includes('primary={primaryCallSupport}')) {
  fail('Product search pages do not expose a primary inline call-support anchor.');
}
if (!productCss.includes('#inquiry .search-tabs-header .tab-btn:nth-child(2)') || !productCss.includes('grid-row: 3;')) {
  fail('Flights legacy car tab or mobile below-form support ordering is missing.');
}
if (!supportCta.includes('data-support-call-inline') || !supportCta.includes('data-support-call-primary')) {
  fail('SupportCallCTA is missing viewport markers.');
}
if (!supportLayer.includes('useStickySupportVisibility') || !supportLayer.includes('primaryHasBeenPassed') || !supportLayer.includes('!anyInlineVisible')) {
  fail('Sticky call CTA is not gated by primary-inline visibility.');
}
if (!supportCss.includes('position: static;') || !supportCss.includes('.support-call-sticky')) {
  fail('Responsive flight inline/sticky CTA rules are incomplete.');
}
if (carPage.includes('className="car-mobile-cta"') || !carPage.includes('data-support-call-primary')) {
  fail('Car Rentals still has a second fixed mobile CTA or lacks a primary hero CTA marker.');
}
if (!guardrails.includes('.hero-slider .service-nav') || !guardrails.includes('.header-mobile-call') || !guardrails.includes('.car-mobile-cta')) {
  fail('Legacy duplicate-surface guardrails are incomplete.');
}
if (!index.includes("import './shared/styles/ResponsiveTravelRedundancy.css';")) {
  fail('Responsive redundancy guardrails are not loaded globally.');
}

console.log('Responsive travel redundancy audit passed.');
console.log('Verified one global product navigation, viewport-aware call support, and clean mobile CTA handoff.');
