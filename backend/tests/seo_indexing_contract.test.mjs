import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(repoRoot, ...parts), 'utf8');

const sitemap = read('frontend', 'public', 'sitemap.xml');
const robots = read('frontend', 'public', 'robots.txt');
const indexHtml = read('frontend', 'public', 'index.html');
const app = read('frontend', 'src', 'app', 'App.js');
const seoGuard = read('frontend', 'src', 'shared', 'components', 'SeoRouteGuard.js');
const seoConfig = read('frontend', 'src', 'shared', 'seo', 'seoConfig.js');
const footer = read('frontend', 'src', 'shared', 'components', 'Footer.js');
const routeDispatcher = read('frontend', 'src', 'features', 'flights', 'pages', 'RouteDispatcher.js');
const airlineAction = read('frontend', 'src', 'features', 'flights', 'pages', 'AirlineActionPage.js');
const hotelDestinations = read('frontend', 'src', 'shared', 'data', 'hotelDestinations.js');
const carRentalLocations = read('frontend', 'src', 'shared', 'data', 'carRentalLocations.js');
const carRentalAirports = JSON.parse(read('frontend', 'src', 'shared', 'data', 'carRentalAirports.json'));
const vercel = read('vercel.json');

assert.match(sitemap, /https:\/\/www\.faretransit\.com\//);
assert.doesNotMatch(sitemap, /<loc>https:\/\/faretransit\.com/);
assert.match(robots, /Sitemap: https:\/\/www\.faretransit\.com\/sitemap\.xml/);
assert.doesNotMatch(indexHtml, /<link rel="canonical"/);
assert.doesNotMatch(indexHtml, /<meta property="og:url"/);
assert.match(seoConfig, /CANONICAL_ORIGIN\s*=\s*'https:\/\/www\.faretransit\.com'/);
assert.match(seoGuard, /import \{ CANONICAL_ORIGIN, getCoreSeo, serviceSchemaFor \} from '\.\.\/seo\/seoConfig'/);
assert.match(seoGuard, /<link rel="canonical" href=\{canonicalUrl\}/);
assert.match(seoGuard, /<meta property="og:url" content=\{canonicalUrl\}/);

const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
const sitemapPaths = locs.map((url) => new URL(url).pathname.replace(/\/+$/, '') || '/');
const privatePaths = [
  '/admin', '/search', '/payment', '/booking', '/authorize', '/confirmation',
  '/booking-confirmed', '/my-bookings', '/reservation', '/signin', '/signup', '/return-flight',
  '/hotels/results', '/car-rentals/search', '/car-rentals/results'
];
for (const privatePath of privatePaths) {
  const leaked = sitemapPaths.some((pathname) => pathname === privatePath || pathname.startsWith(`${privatePath}/`));
  assert.equal(leaked, false, `Private path leaked into sitemap: ${privatePath}`);
}

assert.ok(locs.length >= 35, 'Sitemap should expose core SEO pages plus the first-wave airport landing pages.');
assert.equal(new Set(locs).size, locs.length, 'Sitemap contains duplicate URLs.');
assert.ok(locs.every((url) => url.startsWith('https://www.faretransit.com/')), 'Every sitemap URL must use the canonical www HTTPS origin.');
for (const requiredPath of [
  '/flights', '/hotels', '/car-rentals', '/car-rental/airport',
  '/hotels/miami', '/hotels/new-york', '/hotels/las-vegas', '/hotels/orlando',
  '/car-rentals/miami', '/car-rentals/orlando',
  '/car-rental/airport/mco', '/car-rental/airport/mia', '/car-rental/airport/fll',
  '/car-rental/airport/dfw', '/car-rental/airport/lax', '/car-rental/airport/las',
  '/car-rental/airport/jfk', '/car-rental/airport/ewr', '/car-rental/airport/ord',
  '/car-rental/airport/atl', '/car-rental/airport/den', '/car-rental/airport/sfo',
  '/car-rental/airport/bos', '/car-rental/airport/sea', '/car-rental/airport/iah'
]) {
  assert.ok(sitemapPaths.includes(requiredPath), `Sitemap is missing SEO path ${requiredPath}`);
}
assert.equal(sitemapPaths.includes('/car-rentals/lax'), false, 'Legacy LAX path should not remain in the canonical sitemap.');
assert.equal(sitemapPaths.includes('/car-rentals/jfk'), false, 'Legacy JFK path should not remain in the canonical sitemap.');

assert.doesNotMatch(robots, /Disallow: \/search/);
assert.doesNotMatch(robots, /Disallow: \/booking/);
assert.match(robots, /Disallow: \/admin\//);
assert.match(robots, /Disallow: \/api\//);

assert.match(app, /import SeoRouteGuard/);
assert.match(app, /import NotFoundPage/);
assert.match(app, /<Route path="\*" element={<NotFoundPage \/>} \/>/);
assert.doesNotMatch(app, /<Route path="\*" element={<Navigate to="\/" replace \/>} \/>/);
assert.match(app, /<Route path="\/" element={<TravelHomePage \/>} \/>/);
assert.match(app, /<Route path="\/flights" element={<Home \/>} \/>/);
assert.match(app, /<Route path="\/hotels\/:destinationSlug" element={<HotelDestinationPage \/>} \/>/);
assert.match(app, /<Route path="\/car-rentals\/:locationSlug" element={<CarRentalLocationPage \/>} \/>/);
assert.match(app, /<Route path="\/car-rental\/airport" element={<CarRentalAirportHubPage \/>} \/>/);
assert.match(app, /<Route path="\/car-rental\/airport\/:airportCode" element={<CarRentalAirportPage \/>} \/>/);

assert.match(seoGuard, /noindex, nofollow, noarchive/);
assert.match(seoGuard, /INDEXABLE_EXACT/);
assert.match(seoGuard, /VALID_ROUTE_PATHS/);
assert.match(seoGuard, /VALID_HOTEL_PATHS/);
assert.match(seoGuard, /VALID_CAR_PATHS/);
assert.match(seoGuard, /VALID_AIRPORT_PATHS/);
assert.match(seoGuard, /routesData/);
assert.match(seoGuard, /'@type': 'WebPage'/);
assert.match(seoGuard, /'@type': 'BreadcrumbList'/);
assert.match(seoGuard, /serviceSchemaFor/);
assert.match(seoGuard, /isPartOf: \{ '@id': `\$\{CANONICAL_ORIGIN\}\/\#website` \}/);
assert.match(seoGuard, /Airport Car Rentals/);
assert.doesNotMatch(seoGuard, /INDEXABLE_PREFIXES/);
assert.doesNotMatch(seoGuard, /startsWith\('\/book\/'\)/);
assert.doesNotMatch(seoGuard, /startsWith\('\/changes\/'\)/);
assert.doesNotMatch(seoGuard, /startsWith\('\/cancellation\/'\)/);

for (const slug of ['miami', 'new-york', 'las-vegas', 'orlando']) {
  assert.match(hotelDestinations, new RegExp(`slug:\\s*['\"]${slug}['\"]`));
}
for (const slug of ['miami', 'orlando', 'lax', 'jfk']) {
  assert.match(carRentalLocations, new RegExp(`slug:\\s*['\"]${slug}['\"]`));
}

const expectedAirportCodes = ['mco','mia','fll','dfw','lax','las','jfk','ewr','ord','atl','den','sfo','bos','sea','iah'];
assert.equal(carRentalAirports.length, expectedAirportCodes.length, 'Airport SEO data should contain the curated first-wave market set only.');
for (const code of expectedAirportCodes) {
  const airport = carRentalAirports.find((item) => item.code === code);
  assert.ok(airport, `Missing airport SEO data for ${code.toUpperCase()}`);
  assert.ok(airport.title && airport.description && airport.intro && airport.pickup && airport.vehicle && airport.oneWay && airport.weekly, `${code.toUpperCase()} airport content is incomplete.`);
  assert.ok(Array.isArray(airport.faqs) && airport.faqs.length >= 3, `${code.toUpperCase()} airport FAQs are incomplete.`);
}

const crawlPriorityLinks = [
  '/travel-assistance',
  '/booking-for-parents',
  '/urgent-travel',
  '/senior-travel/flight-deals',
  '/flight-nyc-to-mia',
  '/flight-lax-to-jfk',
  '/routes/flight-nyc-to-lon',
  '/routes/flight-lax-to-tokyo',
  '/train-nyc-to-dc',
  '/train-boston-to-nyc',
  '/hotels/miami',
  '/hotels/new-york',
  '/car-rentals/miami',
  '/car-rental/airport',
  '/car-rental/airport/dfw',
  '/car-rental/airport/jfk',
  '/car-rental/airport/mco',
];
for (const pathname of crawlPriorityLinks) {
  assert.match(footer, new RegExp(`to=["']${pathname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`), `Missing crawlable footer link for ${pathname}`);
}

assert.match(routeDispatcher, /NotFoundPage/);
assert.doesNotMatch(routeDispatcher, /Navigate to="\/"/);
assert.match(airlineAction, /airlinesData/);
assert.match(airlineAction, /if \(!config \|\| !airline\)/);
assert.match(airlineAction, /<NotFoundPage \/>/);

assert.match(indexHtml, /name="google-site-verification"/);
assert.match(indexHtml, /name="robots" content="index, follow/);
assert.match(indexHtml, /"@type": "TravelAgency"/);
assert.match(indexHtml, /"@type": "WebSite"/);
assert.match(indexHtml, /"legalName": "FareTransit LLC"/);
assert.match(indexHtml, /"@type": "PostalAddress"/);
assert.match(indexHtml, /"addressLocality": "Casper"/);
assert.match(indexHtml, /Flights, Hotels & Car Rental Assistance/);

const vercelConfig = JSON.parse(vercel);
const canonicalHostRedirect = (vercelConfig.redirects || []).find((rule) =>
  Array.isArray(rule.has) && rule.has.some((condition) => condition.type === 'host' && condition.value === 'faretransit.com')
);
assert.ok(canonicalHostRedirect, 'Missing non-www to www host redirect.');
assert.equal(canonicalHostRedirect.destination, 'https://www.faretransit.com/:path*');
assert.equal(canonicalHostRedirect.permanent, true);

const legacyLaxRedirect = (vercelConfig.redirects || []).find((rule) => rule.source === '/car-rentals/lax');
assert.equal(legacyLaxRedirect?.destination, 'https://www.faretransit.com/car-rental/airport/lax');
assert.equal(legacyLaxRedirect?.permanent, true);
const legacyJfkRedirect = (vercelConfig.redirects || []).find((rule) => rule.source === '/car-rentals/jfk');
assert.equal(legacyJfkRedirect?.destination, 'https://www.faretransit.com/car-rental/airport/jfk');
assert.equal(legacyJfkRedirect?.permanent, true);

const noindexHeaderRules = (vercelConfig.headers || []).filter((rule) =>
  (rule.headers || []).some((header) => header.key === 'X-Robots-Tag' && header.value.includes('noindex'))
);
assert.ok(noindexHeaderRules.length >= 13, 'Expected private admin/transaction routes to have X-Robots-Tag noindex protection.');
for (const protectedSource of ['/hotels/results', '/car-rentals/results', '/reservation/:path*', '/car-authorization.html', '/admin-car-reservations.html']) {
  assert.ok(
    noindexHeaderRules.some((rule) => rule.source === protectedSource),
    `${protectedSource} must have HTTP noindex protection.`
  );
}

console.log(`SEO indexing contract passed (${locs.length} canonical sitemap URLs; airport-first car rental SEO, destination pages, crawl-priority internal links and structured data verified).`);
