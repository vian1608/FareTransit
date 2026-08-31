import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const frontendRoot = path.join(repoRoot, 'frontend');
const dataRoot = path.join(frontendRoot, 'src', 'shared', 'data');
const publicRoot = path.join(frontendRoot, 'public');
const origin = 'https://www.faretransit.com';

const readJson = (fileName) => JSON.parse(fs.readFileSync(path.join(dataRoot, fileName), 'utf8'));

const seoPages = readJson('seoPages.json');
const routesData = readJson('routesData.json');
const aliases = readJson('seoAliases.json');

const aliasSources = new Set(Object.keys(aliases));
const urls = new Map();

for (const page of seoPages) {
  if (!page?.path || !page?.lastmod) continue;
  urls.set(page.path, { path: page.path, lastmod: page.lastmod });
}

for (const route of routesData) {
  if (!route?.slug || route?.seoStatus === 'noindex') continue;
  const routePath = `/routes/${route.slug}`;
  if (aliasSources.has(routePath)) continue;
  urls.set(routePath, {
    path: routePath,
    lastmod: route.reviewedAt || '2026-08-31',
  });
}

const sortedUrls = [...urls.values()].sort((a, b) => {
  if (a.path === '/') return -1;
  if (b.path === '/') return 1;
  return a.path.localeCompare(b.path);
});

const escapeXml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...sortedUrls.flatMap((entry) => [
    '  <url>',
    `    <loc>${escapeXml(`${origin}${entry.path === '/' ? '/' : entry.path}`)}</loc>`,
    `    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`,
    '  </url>',
  ]),
  '</urlset>',
  '',
].join('\n');

const robots = [
  'User-agent: *',
  'Allow: /',
  'Disallow: /admin',
  'Disallow: /admin/',
  'Disallow: /api/',
  '',
  `Sitemap: ${origin}/sitemap.xml`,
  '',
].join('\n');

fs.writeFileSync(path.join(publicRoot, 'sitemap.xml'), sitemap, 'utf8');
fs.writeFileSync(path.join(publicRoot, 'robots.txt'), robots, 'utf8');

console.log(`[SEO] Generated sitemap with ${sortedUrls.length} canonical URLs.`);
console.log('[SEO] Generated robots.txt.');
