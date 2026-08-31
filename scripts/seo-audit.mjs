import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const dataRoot = path.join(repoRoot, 'frontend', 'src', 'shared', 'data');

const readJson = (name) => JSON.parse(fs.readFileSync(path.join(dataRoot, name), 'utf8'));
const pages = readJson('seoPages.json');
const content = readJson('seoContent.json');
const aliases = readJson('seoAliases.json');
const routes = readJson('routesData.json');

const errors = [];
const warnings = [];
const seenPaths = new Set();
const seenTitles = new Map();
const seenDescriptions = new Map();
const pagePaths = new Set(pages.map((page) => page.path));
const routePaths = new Set(routes.filter((route) => route?.slug).map((route) => `/routes/${route.slug}`));
const privatePrefixes = [
  '/admin', '/api', '/search', '/payment', '/pay', '/booking/', '/return-flight',
  '/authorize', '/booking-confirmed', '/my-bookings', '/signin', '/signup', '/confirmation/',
  '/car-rentals/search', '/car-rentals/results', '/hotels/results',
];

for (const page of pages) {
  if (!page.path?.startsWith('/')) errors.push(`Invalid path: ${page.path}`);
  if (seenPaths.has(page.path)) errors.push(`Duplicate SEO path: ${page.path}`);
  seenPaths.add(page.path);

  if (!page.title || !page.description || !page.pageName) {
    errors.push(`Missing metadata on ${page.path}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(page.lastmod || '')) {
    errors.push(`Missing/invalid lastmod on ${page.path}`);
  }

  if (privatePrefixes.some((prefix) => page.path === prefix || page.path.startsWith(prefix))) {
    errors.push(`Private/transactional path must not be indexable: ${page.path}`);
  }

  const titleOwner = seenTitles.get(page.title);
  if (titleOwner) errors.push(`Duplicate title on ${titleOwner} and ${page.path}: ${page.title}`);
  seenTitles.set(page.title, page.path);

  const descriptionOwner = seenDescriptions.get(page.description);
  if (descriptionOwner) errors.push(`Duplicate description on ${descriptionOwner} and ${page.path}`);
  seenDescriptions.set(page.description, page.path);

  if (page.title.length > 70) warnings.push(`Long title (${page.title.length}) on ${page.path}`);
  if (page.description.length < 70 || page.description.length > 180) {
    warnings.push(`Description length ${page.description.length} on ${page.path}`);
  }
}

for (const [contentPath, pageContent] of Object.entries(content)) {
  if (!pagePaths.has(contentPath)) errors.push(`SEO content missing registry entry: ${contentPath}`);
  if (!pageContent.heroTitle || !pageContent.heroText) errors.push(`SEO content missing hero: ${contentPath}`);
  if (!Array.isArray(pageContent.sections) || pageContent.sections.length < 2) {
    errors.push(`SEO content needs at least 2 substantive sections: ${contentPath}`);
  }
  if (!Array.isArray(pageContent.relatedLinks) || pageContent.relatedLinks.length < 2) {
    errors.push(`SEO content needs internal related links: ${contentPath}`);
  }
}

for (const [source, target] of Object.entries(aliases)) {
  if (source === target) errors.push(`Self-referencing alias: ${source}`);
  if (!pagePaths.has(target) && !routePaths.has(target)) {
    errors.push(`Alias target is not a known canonical SEO page: ${source} -> ${target}`);
  }
}

const routeSlugs = new Set();
for (const route of routes) {
  if (!route?.slug) {
    errors.push('Route entry missing slug');
    continue;
  }
  if (routeSlugs.has(route.slug)) errors.push(`Duplicate route slug: ${route.slug}`);
  routeSlugs.add(route.slug);

  if (route.seoStatus === 'noindex') continue;
  if (!route.title || !route.metaTitle || !route.metaDescription) {
    errors.push(`Indexable route missing SEO metadata: ${route.slug}`);
  }
}

if (warnings.length) {
  console.warn('\nSEO audit warnings:');
  warnings.forEach((warning) => console.warn(`- ${warning}`));
}

if (errors.length) {
  console.error('\nSEO audit failed:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`\n[SEO] Audit passed: ${pages.length} registry pages, ${Object.keys(content).length} content pages, ${routes.length} route records.`);
