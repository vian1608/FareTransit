const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const fail = (message) => {
  console.error(`Airport SEO verification failed: ${message}`);
  process.exit(1);
};

const airports = JSON.parse(read('frontend/src/shared/data/carRentalAirports.json'));
const app = read('frontend/src/app/App.js');
const page = read('frontend/src/features/cars/pages/CarRentalAirportPage.js');
const seoGuard = read('frontend/src/shared/components/SeoRouteGuard.js');
const sitemap = read('frontend/public/sitemap.xml');
const prerender = read('frontend/scripts/prerender-seo-hubs.js');
const footer = read('frontend/src/shared/components/Footer.js');
const vercel = JSON.parse(read('vercel.json'));

const expectedCodes = ['mco','mia','fll','dfw','lax','las','jfk','ewr','ord','atl','den','sfo','bos','sea','iah'];
const actualCodes = airports.map((airport) => airport.code);
if (airports.length !== expectedCodes.length) fail(`expected ${expectedCodes.length} first-wave airports, found ${airports.length}`);
for (const code of expectedCodes) {
  if (!actualCodes.includes(code)) fail(`missing airport data for ${code.toUpperCase()}`);
}

const requiredTextFields = ['airportCode','airportName','city','state','title','description','intro','pickup','vehicle','oneWay','weekly'];
const titleSet = new Set();
const descriptionSet = new Set();
const introSet = new Set();
for (const airport of airports) {
  for (const key of requiredTextFields) {
    if (!String(airport[key] || '').trim()) fail(`${airport.code}: missing ${key}`);
  }
  if (!Array.isArray(airport.nearby) || airport.nearby.length < 3) fail(`${airport.code}: needs at least 3 nearby trip areas`);
  if (!Array.isArray(airport.tips) || airport.tips.length < 3) fail(`${airport.code}: needs at least 3 driving tips`);
  if (!Array.isArray(airport.faqs) || airport.faqs.length < 3) fail(`${airport.code}: needs at least 3 FAQs`);
  if (!Array.isArray(airport.related) || airport.related.length < 2) fail(`${airport.code}: needs related-airport internal links`);
  if (titleSet.has(airport.title)) fail(`${airport.code}: duplicate title`);
  if (descriptionSet.has(airport.description)) fail(`${airport.code}: duplicate meta description`);
  if (introSet.has(airport.intro)) fail(`${airport.code}: duplicate intro copy`);
  titleSet.add(airport.title);
  descriptionSet.add(airport.description);
  introSet.add(airport.intro);

  const combined = JSON.stringify(airport).toLowerCase();
  for (const prohibited of ['official reservations', 'official booking', 'lowest price guaranteed', 'best price guaranteed', 'guaranteed savings']) {
    if (combined.includes(prohibited)) fail(`${airport.code}: unsupported or misleading phrase "${prohibited}"`);
  }

  const canonical = `https://www.faretransit.com/car-rental/airport/${airport.code}`;
  if (!sitemap.includes(`<loc>${canonical}</loc>`)) fail(`${airport.code}: sitemap URL missing`);
}

for (const needle of [
  '<Route path="/car-rental/airport" element={<CarRentalAirportHubPage />} />',
  '<Route path="/car-rental/airport/:airportCode" element={<CarRentalAirportPage />} />',
]) {
  if (!app.includes(needle)) fail(`App route missing: ${needle}`);
}

if (!page.includes('FareTransit is an independent comparison and reservation-assistance service')) fail('independent-service disclosure is missing');
if (!page.includes('One-way rentals')) fail('one-way section is missing');
if (!page.includes('Weekly rentals')) fail('weekly section is missing');
if (!page.includes('Frequently asked questions')) fail('airport FAQ section is missing');
if (!page.includes('data-seo-airport')) fail('airport conversion attribution marker is missing');
if (!footer.includes('to="/car-rental/airport"')) fail('footer does not link to airport rental hub');
if (!seoGuard.includes('VALID_AIRPORT_PATHS')) fail('airport allowlist missing from SEO route guard');
if (!seoGuard.includes("'/car-rental/airport'")) fail('airport hub metadata is missing');
if (!prerender.includes("require('../src/shared/data/carRentalAirports.json')")) fail('airport prerender data source is missing');
if (!prerender.includes('...airportPages')) fail('airport pages are not included in prerender output');

const redirects = Array.isArray(vercel.redirects) ? vercel.redirects : [];
const laxRedirect = redirects.find((rule) => rule.source === '/car-rentals/lax');
const jfkRedirect = redirects.find((rule) => rule.source === '/car-rentals/jfk');
if (laxRedirect?.destination !== 'https://www.faretransit.com/car-rental/airport/lax' || laxRedirect?.permanent !== true) fail('legacy LAX page must permanently redirect to airport architecture');
if (jfkRedirect?.destination !== 'https://www.faretransit.com/car-rental/airport/jfk' || jfkRedirect?.permanent !== true) fail('legacy JFK page must permanently redirect to airport architecture');

const headers = Array.isArray(vercel.headers) ? vercel.headers : [];
const hasNoindex = (source) => headers.some((rule) => rule.source === source && (rule.headers || []).some((header) => header.key === 'X-Robots-Tag' && header.value.includes('noindex')));
for (const source of ['/reservation/:path*', '/car-authorization.html', '/admin-car-reservations.html']) {
  if (!hasNoindex(source)) fail(`missing transactional noindex header for ${source}`);
}

console.log(`Airport SEO verification passed for ${airports.length} high-intent U.S. airport pages.`);
