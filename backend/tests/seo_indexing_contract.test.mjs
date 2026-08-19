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
const footer = read('frontend', 'src', 'shared', 'components', 'Footer.js');
const routeDispatcher = read('frontend', 'src', 'features', 'flights', 'pages', 'RouteDispatcher.js');
const airlineAction = read('frontend', 'src', 'features', 'flights', 'pages', 'AirlineActionPage.js');
const vercel = read('vercel.json');

assert.match(sitemap, /https:\/\/www\.faretransit\.com\//);
assert.doesNotMatch(sitemap, /<loc>https:\/\/faretransit\.com/);
assert.match(robots, /Sitemap: https:\/\/www\.faretransit\.com\/sitemap\.xml/);
assert.doesNotMatch(indexHtml, /<link rel="canonical"/);
assert.doesNotMatch(indexHtml, /<meta property="og:url"/);
assert.match(seoGuard, /https:\/\/www\.faretransit\.com/);
assert.match(seoGuard, /<link rel="canonical" href=\{canonicalUrl\}/);
assert.match(seoGuard, /<meta property="og:url" content=\{canonicalUrl\}/);

const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
const sitemapPaths = locs.map((url) => new URL(url).pathname.replace(/\/+$/, '') || '/');
const privatePaths = [
  '/admin', '/search', '/payment', '/booking', '/authorize', '/confirmation',
  '/booking-confirmed', '/my-bookings', '/signin', '/signup', '/return-flight',
  '/car-rentals/search', '/car-rentals/results'
];
for (const privatePath of privatePaths) {
  const leaked = sitemapPaths.some((pathname) => pathname === privatePath || pathname.startsWith(`${privatePath}/`));
  assert.equal(leaked, false, `Private path leaked into sitemap: ${privatePath}`);
}

assert.ok(locs.length >= 20, 'Sitemap should expose the core SEO landing/content pages.');
assert.equal(new Set(locs).size, locs.length, 'Sitemap contains duplicate URLs.');
assert.ok(locs.every((url) => url.startsWith('https://www.faretransit.com/')), 'Every sitemap URL must use the canonical www HTTPS origin.');

assert.doesNotMatch(robots, /Disallow: \/search/);
assert.doesNotMatch(robots, /Disallow: \/booking/);
assert.match(robots, /Disallow: \/admin\//);
assert.match(robots, /Disallow: \/api\//);

assert.match(app, /import SeoRouteGuard/);
assert.match(app, /import NotFoundPage/);
assert.match(app, /<Route path="\*" element={<NotFoundPage \/>} \/>/);
assert.doesNotMatch(app, /<Route path="\*" element={<Navigate to="\/" replace \/>} \/>/);
assert.match(seoGuard, /noindex, nofollow, noarchive/);
assert.match(seoGuard, /INDEXABLE_EXACT/);
assert.match(seoGuard, /VALID_ROUTE_PATHS/);
assert.match(seoGuard, /routesData/);
assert.match(seoGuard, /'@type': 'WebPage'/);
assert.match(seoGuard, /'@type': 'BreadcrumbList'/);
assert.match(seoGuard, /isPartOf: \{ '@id': `\$\{CANONICAL_ORIGIN\}\/\#website` \}/);
assert.doesNotMatch(seoGuard, /INDEXABLE_PREFIXES/);
assert.doesNotMatch(seoGuard, /startsWith\('\/book\/'\)/);
assert.doesNotMatch(seoGuard, /startsWith\('\/changes\/'\)/);
assert.doesNotMatch(seoGuard, /startsWith\('\/cancellation\/'\)/);

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

const vercelConfig = JSON.parse(vercel);
const canonicalHostRedirect = (vercelConfig.redirects || []).find((rule) =>
  Array.isArray(rule.has) && rule.has.some((condition) => condition.type === 'host' && condition.value === 'faretransit.com')
);
assert.ok(canonicalHostRedirect, 'Missing non-www to www host redirect.');
assert.equal(canonicalHostRedirect.destination, 'https://www.faretransit.com/:path*');
assert.equal(canonicalHostRedirect.permanent, true);

const noindexHeaderRules = (vercelConfig.headers || []).filter((rule) =>
  (rule.headers || []).some((header) => header.key === 'X-Robots-Tag' && header.value.includes('noindex'))
);
assert.ok(noindexHeaderRules.length >= 10, 'Expected private admin/transaction routes to have X-Robots-Tag noindex protection.');

console.log(`SEO indexing contract passed (${locs.length} canonical sitemap URLs; crawl-priority internal links and structured data verified).`);
