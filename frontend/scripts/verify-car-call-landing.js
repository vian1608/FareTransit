const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const app = read('src/app/App.js');
const page = read('src/features/cars/pages/CarRentalCallLandingPage.js');
const css = read('src/features/cars/pages/CarRentalCallLandingPage.css');
const config = read('src/features/cars/data/carRentalCallLandingConfig.js');
const analytics = read('src/features/cars/utils/carCallLandingAnalytics.js');
const header = read('src/shared/components/Header.js');
const footer = read('src/shared/components/Footer.js');
const callLayer = read('src/shared/components/SupportCallLayer.js');
const seoGuard = read('src/shared/components/SeoRouteGuard.js');
const publicIndex = read('public/index.html');
const supportContact = read('src/shared/constants/supportContact.js');

assert.match(app, /path="\/car-rental\/call-now"/);
assert.match(app, /CarRentalCallLandingPage/);

for (const brand of ['hertz', 'avis', 'budget', 'enterprise', 'national', 'dollar', 'alamo', 'sixt', 'thrifty']) {
  assert.match(config, new RegExp(`\\b${brand}:`), `Missing supported brand: ${brand}`);
}
assert.match(config, /hasOwnProperty\.call\(CAR_RENTAL_BRANDS, key\)/);
assert.match(config, /CAR_CALL_LANDING_CANONICAL/);
for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'gbraid', 'wbraid']) {
  assert.match(config, new RegExp(`'${key}'`), `Missing attribution key: ${key}`);
}

assert.match(page, /Need a car today\?/);
assert.match(page, /data-paid-car-call="true"/);
assert.match(page, /locationLabel="mobile-sticky"/);
assert.match(page, /data-phone-display="true"/);
assert.match(page, /noindex, follow, noarchive/);
assert.doesNotMatch(page, /dangerouslySetInnerHTML/);
assert.doesNotMatch(page, /upload\.wikimedia|Hertz_Car_Rental_logo|Avis_logo|Budget_logo|Enterprise_Rent-A-Car/);

assert.match(css, /safe-area-inset-bottom/);
assert.match(css, /\.car-call-mobile-sticky/);
assert.match(css, /min-height:\s*58px/);
assert.match(css, /:focus-visible/);

for (const eventName of ['landing_page_view', 'phone_click', 'contact_click']) {
  assert.match(page, new RegExp(`'${eventName}'`), `Missing analytics event: ${eventName}`);
}
assert.match(analytics, /send_to:\s*GA4_MEASUREMENT_ID/);
assert.match(analytics, /sessionStorage/);
assert.match(analytics, /page_location/);
assert.match(analytics, /brand:/);

assert.match(header, /isPaidCarCallLanding/);
assert.match(header, /data-call-location="header"/);
assert.match(footer, /isPaidCarCallLanding/);
assert.match(footer, /Independent travel reservation assistance service/);
assert.match(callLayer, /isDedicatedCarCallLanding/);
assert.match(callLayer, /!isDedicatedCarCallLanding && isTravelJourneyPath/);

assert.match(seoGuard, /PPC_NO_INDEX_EXACT/);
assert.match(seoGuard, /'\/car-rental\/call-now'/);
assert.match(seoGuard, /'noindex, follow, noarchive'/);
assert.match(seoGuard, /\(indexable \|\| paidLanding\).*canonical/);

assert.match(supportContact, /SUPPORT_PHONE_TEL = '\+18887808855'/);
assert.match(supportContact, /SUPPORT_PHONE_DISPLAY = '\+1 \(888\) 780-8855'/);
assert.match(publicIndex, /phone_conversion_number': '\+1 \(888\) 780-8855'/);
assert.match(publicIndex, /data-faretransit-phone/);
assert.match(publicIndex, /data-phone-display/);
assert.match(publicIndex, /fareTransitReplacePhoneText/);
assert.match(publicIndex, /G-TBWQGCGY6B/);

console.log('Paid car-rental call landing regression contract: PASS');
