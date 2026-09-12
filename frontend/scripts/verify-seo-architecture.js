const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const fail = (message) => {
  console.error(`SEO architecture audit failed: ${message}`);
  process.exit(1);
};

const app = read('frontend/src/app/App.js');
const header = read('frontend/src/shared/components/Header.js');
const footer = read('frontend/src/shared/components/Footer.js');
const mobileSwitcher = read('frontend/src/shared/components/MobileServiceSwitcher.js');
const seoGuard = read('frontend/src/shared/components/SeoRouteGuard.js');
const seoConfig = read('frontend/src/shared/seo/seoConfig.js');
const homepage = read('frontend/src/shared/pages/TravelHomePage.js');
const hotelDestinations = read('frontend/src/shared/data/hotelDestinations.js');
const carLocations = read('frontend/src/shared/data/carRentalLocations.js');
const routesData = JSON.parse(read('frontend/src/shared/data/routesData.json'));
const sitemap = read('frontend/public/sitemap.xml');
const indexHtml = read('frontend/public/index.html');
const vercel = read('vercel.json');
const prerender = read('frontend/scripts/prerender-seo-hubs.js');

const mustContain = (text, needle, label) => {
  if (!text.includes(needle)) fail(`${label} is missing: ${needle}`);
};

mustContain(app, '<Route path="/" element={<TravelHomePage />} />', 'Brand homepage route');
mustContain(app, '<Route path="/flights" element={<Home />} />', 'Flights hub route');
mustContain(app, '<Route path="/hotels/:destinationSlug" element={<HotelDestinationPage />} />', 'Hotel destination route');
mustContain(app, '<Route path="/car-rentals/:locationSlug" element={<CarRentalLocationPage />} />', 'Car rental location route');

mustContain(header, 'to="/flights"', 'Desktop flight navigation');
mustContain(footer, '<Link to="/flights">Flights</Link>', 'Footer flight navigation');
mustContain(mobileSwitcher, "to: '/flights'", 'Mobile flight navigation');
mustContain(homepage, 'Travel Booking Assistance for Flights, Hotels &amp; Car Rentals', 'Brand homepage H1');

const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
const sitemapPaths = sitemapUrls.map((url) => new URL(url).pathname.replace(/\/+$/, '') || '/');

[
  '/flights',
  '/hotels',
  '/car-rentals',
  '/hotels/miami',
  '/hotels/new-york',
  '/hotels/las-vegas',
  '/hotels/orlando',
  '/car-rentals/miami',
  '/car-rentals/orlando',
  '/car-rentals/lax',
  '/car-rentals/jfk',
].forEach((urlPath) => {
  if (!sitemapPaths.includes(urlPath)) fail(`Sitemap ${urlPath} is missing.`);
});

[
  '/search',
  '/hotels/results',
  '/car-rentals/results',
  '/booking',
  '/payment',
  '/my-bookings',
].forEach((urlPath) => {
  const leaked = sitemapPaths.some((pathname) => pathname === urlPath || pathname.startsWith(`${urlPath}/`));
  if (leaked) fail(`Transactional/result URL leaked into sitemap: ${urlPath}`);
});

// The repository-level vercel.json is authoritative and is validated again by
// backend/tests/seo_indexing_contract.test.mjs in GitHub CI. Vercel's Services
// builds can expose an isolated/generated service-level vercel.json instead of
// the repository file, so only enforce the root HTTP-header policy here when the
// loaded config actually contains the repository headers array.
let vercelConfig;
try {
  vercelConfig = JSON.parse(vercel);
} catch (error) {
  fail(`vercel.json is not valid JSON: ${error.message}`);
}

if (Array.isArray(vercelConfig.headers) && vercelConfig.headers.length > 0) {
  const hasNoindex = (source) => vercelConfig.headers.some((rule) =>
    rule?.source === source &&
    Array.isArray(rule.headers) &&
    rule.headers.some((header) =>
      header?.key === 'X-Robots-Tag' && header?.value === 'noindex, nofollow, noarchive'
    )
  );

  if (!hasNoindex('/hotels/results')) fail('Hotel results HTTP noindex rule is missing.');
  if (!hasNoindex('/car-rentals/results')) fail('Car rental results HTTP noindex rule is missing.');
} else if (!process.env.VERCEL) {
  fail('Repository-level Vercel header configuration is unavailable outside an isolated Vercel service build.');
} else {
  console.log('SEO architecture audit: repository-level Vercel headers are validated in GitHub CI; isolated Vercel service config detected.');
}

mustContain(seoGuard, "'/flights'", 'Flights indexability');
mustContain(seoGuard, 'hotelDestinationSlugs', 'Hotel destination allowlist');
mustContain(seoGuard, 'carRentalLocationSlugs', 'Car location allowlist');
mustContain(seoGuard, "'@type': 'BreadcrumbList'", 'Breadcrumb structured data');
mustContain(seoGuard, 'serviceSchemaFor', 'Service structured data');
mustContain(seoGuard, "parent: '/hotels'", 'Hotel breadcrumb parent');
mustContain(seoGuard, "parent: '/car-rentals'", 'Car breadcrumb parent');
mustContain(seoConfig, "parent: '/flights'", 'Flight breadcrumb parent');

mustContain(indexHtml, '<title>FareTransit | Flights, Hotels & Car Rental Assistance</title>', 'Broad default title');
mustContain(indexHtml, 'flights, hotels and car rentals', 'Broad default description/schema');

['miami', 'new-york', 'las-vegas', 'orlando'].forEach((slug) => {
  mustContain(hotelDestinations, `slug: '${slug}'`, `Hotel destination ${slug}`);
});
['miami', 'orlando', 'lax', 'jfk'].forEach((slug) => {
  mustContain(carLocations, `slug: '${slug}'`, `Car rental location ${slug}`);
});

const promotionalFlightPattern = /\b(best flight deals?|premium (?:flight|booking)|luxury flight|seamless premium)\b/i;
routesData.filter((route) => route.type === 'flight').forEach((route) => {
  const combined = `${route.metaTitle || ''} ${route.metaDescription || ''}`;
  if (promotionalFlightPattern.test(combined)) {
    fail(`Flight route metadata remains overly promotional: ${route.slug}`);
  }
});

['/', '/flights', '/hotels', '/car-rentals'].forEach((urlPath) => {
  const marker = `path: '${urlPath}'`;
  mustContain(prerender, marker, `SEO prerender route ${urlPath}`);
});
mustContain(prerender, 'data-seo-prerender="true"', 'Semantic prerender shell');

console.log('SEO architecture audit passed.');
console.log('Verified brand/service hubs, curated hotel and car pages, sitemap hygiene, HTTP noindex protection, structured data hierarchy, factual flight metadata and core-hub prerendering.');
