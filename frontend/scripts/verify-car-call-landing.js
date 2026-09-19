const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const fail = (message) => {
  console.error(`Car call landing verification failed: ${message}`);
  process.exit(1);
};

const app = read('frontend/src/app/App.js');
const page = read('frontend/src/features/cars/pages/CarRentalCallLandingPage.js');
const css = read('frontend/src/features/cars/pages/CarRentalCallLandingPage.css');
const brands = read('frontend/src/features/cars/config/carCallLandingBrands.js');
const phone = read('frontend/src/shared/constants/supportContact.js');
const index = read('frontend/public/index.html');

const expectedBrands = ['hertz', 'avis', 'budget', 'enterprise', 'national', 'dollar', 'alamo', 'sixt', 'thrifty'];
for (const brand of expectedBrands) {
  if (!brands.includes(`${brand}: Object.freeze`)) fail(`missing whitelisted brand: ${brand}`);
}

if (!app.includes('<Route path="/car-rental/call-now" element={<CarRentalCallLandingPage />} />')) fail('paid-search route is missing');
if (!page.includes("resolveCarCallBrand(params.get('brand'))")) fail('brand query parameter is not passed through the whitelist resolver');
if (!brands.includes("return CAR_CALL_BRANDS[normalized] || null")) fail('invalid brand parameters do not safely fall back to generic');
if (!brands.includes("CAR_CALL_LANDING_CANONICAL = 'https://www.faretransit.com/car-rental/call-now'")) fail('clean canonical URL is missing');
if (!page.includes('<link rel="canonical" href={CAR_CALL_LANDING_CANONICAL} />')) fail('page canonical tag is missing');
if (!page.includes('noindex, follow, noarchive')) fail('paid landing robots directive is missing');

if (!phone.includes("SUPPORT_PHONE_TEL = '+18887808855'")) fail('canonical support phone is not +18887808855');
if (!phone.includes("SUPPORT_PHONE_DISPLAY = '+1 (888) 780-8855'")) fail('display phone is inconsistent');
if (!page.includes('href={SUPPORT_PHONE_HREF}')) fail('call CTA does not use the shared tel constant');
if (!page.includes('data-support-phone-text="true"')) fail('Google forwarding-number text marker is missing');
if (!index.includes('fareTransitReplacePhoneText')) fail('Google forwarding-number DOM-safe replacement is missing');
if (index.includes("link.textContent = text.replace")) fail('legacy forwarding-number logic still destroys CTA markup');

for (const eventName of ['landing_page_view', 'phone_click', 'contact_click']) {
  if (!page.includes(`'${eventName}'`)) fail(`missing analytics event: ${eventName}`);
}
for (const param of ['utm_campaign', 'utm_content', 'utm_term', 'gclid', 'gbraid', 'wbraid']) {
  if (!page.includes(param)) fail(`tracking parameter not captured: ${param}`);
}

if (!css.includes('env(safe-area-inset-bottom')) fail('mobile safe-area support is missing');
if (!css.includes('.car-call-sticky')) fail('mobile sticky call CTA styles are missing');
if (!page.includes('placement="mobile-sticky"')) fail('mobile sticky CTA is missing from the page');
if (!page.includes('FareTransit is an independent travel reservation assistance service')) fail('independent-service disclosure is missing');
if (!brands.includes('is not affiliated with')) fail('brand non-affiliation disclosure is missing');
if (page.includes('Contact Us')) fail('paid page contains the competing Contact Us CTA');
if (page.includes('MobileServiceSwitcher')) fail('paid page contains unrelated service navigation');
if (page.includes('<img') || /logo:\s*['"]https?:\/\//.test(page)) fail('paid page must not use competitor logos');
if (!css.includes('body.car-call-landing-active .header') || !css.includes('body.car-call-landing-active .footer')) fail('normal site chrome is not suppressed on the focused paid landing page');

const prohibitedClaims = [
  'guaranteed lowest price',
  'guaranteed savings',
  'official hertz',
  'official avis',
  'official enterprise',
  'authorized hertz partner',
];
const combined = `${page}\n${brands}`.toLowerCase();
for (const claim of prohibitedClaims) {
  if (combined.includes(claim)) fail(`unsupported claim present: ${claim}`);
}

console.log(`Car call landing verification passed for ${expectedBrands.length} supported brand variants plus generic fallback.`);
