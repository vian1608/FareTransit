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
].forEach((urlPath) => mustContain(sitemap, `<loc>https://www.faretransit.com${urlPath}</loc>`, `Sitemap ${urlPath}`));

[
  '/search',
  '/hotels/results',
  '/car-rentals/results',
  '/booking',
  '/payment',
  '/my-bookings',
].forEach((urlPath) => {
  if (sitemap.includes(`<loc>https://www.faretransit.com${urlPath}`)) {
    fail(`Transactional/result URL leaked into sitemap: ${urlPath}`);
  }
});

mustContain(vercel, '"source": "/hotels/results"', 'Hotel results HTTP noindex rule');
mustContain(vercel, '"value": "noindex, nofollow, noarchive"', 'X-Robots-Tag rule');

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
  mustContain(hotelDestinations, `${slug}:`, `Hotel destination ${slug}`);
});
['miami', 'orlando', 'lax', 'jfk'].forEach((slug) => {
  mustContain(carLocations, `${slug}:`, `Car rental location ${slug}`);
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
