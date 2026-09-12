const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const fail = (message) => {
  console.error(`Responsive travel redundancy audit failed: ${message}`);
  process.exit(1);
};

const hero = read('frontend/src/shared/components/HeroSlider.js');
const mobileSwitcher = read('frontend/src/shared/components/MobileServiceSwitcher.js');
const mobileSwitcherCss = read('frontend/src/shared/components/MobileServiceSwitcher.css');
const header = read('frontend/src/shared/components/Header.js');
const productCard = read('frontend/src/shared/components/ProductSearchCard.js');
const productCss = read('frontend/src/shared/components/ProductSearchCard.css');
const supportLayer = read('frontend/src/shared/components/SupportCallLayer.js');
const supportCta = read('frontend/src/shared/components/SupportCallCTA.js');
const supportCss = read('frontend/src/shared/components/SupportCallCTA.css');
const carPage = read('frontend/src/features/cars/pages/CarRentalsHomePage.js');
const carCss = read('frontend/src/features/cars/pages/CarRentalsHomePage.css');
const hotelPage = read('frontend/src/features/hotels/pages/HotelSearchPage.js');
const guardrails = read('frontend/src/shared/styles/ResponsiveTravelRedundancy.css');
const index = read('frontend/src/index.js');

if (hero.includes('import ServiceNav') || hero.includes('<ServiceNav')) {
  fail('HeroSlider still renders the legacy desktop duplicate product navigation.');
}
if (!hero.includes('MobileServiceSwitcher') || !hero.includes('active={serviceNavActive}')) {
  fail('HeroSlider is missing the approved mobile-only travel service switcher.');
}
if (!mobileSwitcher.includes("label: 'Flights'") || !mobileSwitcher.includes("label: 'Hotels'") || !mobileSwitcher.includes("label: 'Car Rentals'")) {
  fail('Mobile travel switcher is missing Flights, Hotels, or Car Rentals.');
}
if (!mobileSwitcher.includes('aria-current') || !mobileSwitcher.includes('mobile-service-switcher__item--active')) {
  fail('Mobile travel switcher does not expose an accessible active state.');
}
if (!mobileSwitcherCss.includes('.mobile-service-switcher {\n  display: none;') || !mobileSwitcherCss.includes('@media (max-width: 767px)')) {
  fail('Mobile travel switcher must stay hidden on desktop and appear only on mobile.');
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
if (!carPage.includes("import MobileServiceSwitcher") || !carPage.includes('<MobileServiceSwitcher active="cars" />')) {
  fail('Car Rentals is missing the shared mobile-only travel service switcher.');
}
if ((hotelPage.match(/id: 'hotel-search-/g) || []).length !== 4) {
  fail('Hotel hero must expose four slides to match the Flights carousel.');
}
if (!productCss.includes('border-top-left-radius: 22px !important') || !productCss.includes('border-top-right-radius: 22px !important')) {
  fail('Flights mobile search card is missing explicit rounded top corners.');
}
if (!carCss.includes('height: 380px;') || !carCss.includes('margin: auto 0 0.2rem;') || !carCss.includes('flex: 0 0 36%;')) {
  fail('Car Rentals mobile hero is missing the compact shared-layout alignment rules.');
}
if (!carCss.includes('scroll-snap-type: x mandatory') || !carCss.includes('overflow-x: auto') || !carCss.includes('flex: 0 0 min(78vw, 280px)')) {
  fail('Car Rentals mobile vehicle categories must remain a horizontal swipe slider.');
}
if (!guardrails.includes('.hero-slider .service-nav') || !guardrails.includes('.header-mobile-call') || !guardrails.includes('.car-mobile-cta')) {
  fail('Legacy duplicate-surface guardrails are incomplete.');
}
if (!index.includes("import './shared/styles/ResponsiveTravelRedundancy.css';")) {
  fail('Responsive redundancy guardrails are not loaded globally.');
}

console.log('Responsive travel redundancy audit passed.');
console.log('Verified desktop single navigation, mobile-only travel switching on Flights/Hotels/Car Rentals, viewport-aware call support, and clean mobile CTA handoff.');
