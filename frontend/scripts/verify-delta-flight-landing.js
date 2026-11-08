const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const page = read('frontend/src/features/flights/pages/DeltaBookingLandingPage.js');
const css = read('frontend/src/features/flights/pages/DeltaBookingLandingPage.css');
const app = read('frontend/src/app/App.js');
const header = read('frontend/src/shared/components/Header.js');
const guard = read('frontend/src/shared/components/SeoRouteGuard.js');
const seo = read('frontend/src/shared/seo/seoConfig.js');
const sitemap = read('frontend/public/sitemap.xml');
const prerender = read('frontend/scripts/prerender-seo-hubs.js');
const contact = read('frontend/src/shared/constants/supportContact.js');

function mustContain(source, needle, label) {
  assert.ok(source.includes(needle), `${label} must include ${needle}`);
}

mustContain(app, 'path="/flights/delta" element={<DeltaBookingLandingPage />}', 'Delta route');
mustContain(guard, "'/flights/delta'", 'Indexability allowlist');
mustContain(seo, "'/flights/delta': {", 'Delta SEO definition');
mustContain(seo, 'Delta Flight Booking Assistance | Fare Transit', 'Delta page title');
mustContain(seo, "parent: '/flights'", 'Flight SEO parent');
mustContain(sitemap, '<loc>https://www.faretransit.com/flights/delta</loc>', 'XML sitemap');
mustContain(prerender, "path: '/flights/delta'", 'Static prerender registration');
mustContain(prerender, "page.deltaCallLanding", 'Static prerender call landing');

mustContain(contact, "SUPPORT_PHONE_TEL = '+18887808855'", 'Business telephone');
mustContain(page, "href={SUPPORT_PHONE_HREF}", 'Campaign telephone link');
mustContain(page, 'Looking to Book a', 'Hero H1');
mustContain(page, 'is not affiliated with or endorsed by Delta Air Lines', 'Business disclosure');
mustContain(page, 'New Flight Reservations Only', 'New-reservations scope');
mustContain(page, 'https://www.delta.com/us/en/need-help/overview', 'Official support link');
mustContain(page, '<Link to="/terms">', 'Terms link');
mustContain(page, '<Link to="/privacy-policy">', 'Privacy link');
mustContain(page, '<Link to="/refund-policy">', 'Refund policy link');
mustContain(page, '<Link to="/contact">', 'Contact link');
mustContain(page, "trackEvent('delta_flight_phone_click'", 'Non-conversion call-click analytics');
mustContain(page, "analytics.trackSeoPageView(PAGE_ID)", 'Page-view analytics');
mustContain(page, 'placement="mobile_sticky"', 'Distinct sticky click attribution');
assert.ok(!page.includes('trackLeadConversion'), 'Phone taps must not count as confirmed leads');
assert.ok(!page.includes("gtag('event', 'conversion'"), 'Phone taps must not emit Ads conversions');
assert.equal((page.match(/<h1\b/g) || []).length, 1, 'Landing component must have one H1');
mustContain(header, 'isDeltaLanding ? <span className="logo-heading">', 'Single H1 brand treatment');

for (const question of [
  'Can Fare Transit help me find available Delta flights?',
  'Can I inquire about one-way and round-trip flights?',
  'Can I book flights for multiple passengers?',
  'Are prices guaranteed?',
  'Are there any additional booking or service fees?',
  'Is Fare Transit affiliated with Delta Air Lines?',
]) {
  mustContain(page, question, 'FAQ');
}

mustContain(css, 'dfl-mobile-sticky', 'Mobile CTA styling');
mustContain(css, 'prefers-reduced-motion', 'Reduced-motion styles');
mustContain(css, 'focus-visible', 'Keyboard focus styles');
mustContain(css, 'grid-template-columns: 1fr', 'Narrow viewport layout');

console.log('Delta flight landing structural, SEO, phone and tracking checks passed.');
