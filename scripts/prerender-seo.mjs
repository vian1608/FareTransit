import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const frontendRoot = path.join(repoRoot, 'frontend');
const buildRoot = path.join(frontendRoot, 'build');
const dataRoot = path.join(frontendRoot, 'src', 'shared', 'data');
const origin = 'https://www.faretransit.com';

const readJson = (name) => JSON.parse(fs.readFileSync(path.join(dataRoot, name), 'utf8'));
const pages = readJson('seoPages.json');
const routes = readJson('routesData.json');
const aliases = readJson('seoAliases.json');
const aliasSources = new Set(Object.keys(aliases));

const sourceIndex = path.join(buildRoot, 'index.html');
if (!fs.existsSync(sourceIndex)) {
  throw new Error('frontend/build/index.html is missing. Run the React build before prerendering SEO pages.');
}

const template = fs.readFileSync(sourceIndex, 'utf8');

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const removeTag = (html, pattern) => html.replace(pattern, '');

function injectSeo(html, page) {
  const canonicalUrl = `${origin}${page.path === '/' ? '/' : page.path}`;
  const ogType = page.type === 'Article' ? 'article' : 'website';

  let result = html;
  result = removeTag(result, /<title>.*?<\/title>/i);
  result = removeTag(result, /<meta\s+name="description"[^>]*>/i);
  result = removeTag(result, /<meta\s+name="robots"[^>]*>/i);
  result = removeTag(result, /<meta\s+name="googlebot"[^>]*>/i);
  result = removeTag(result, /<meta\s+property="og:title"[^>]*>/i);
  result = removeTag(result, /<meta\s+property="og:description"[^>]*>/i);
  result = removeTag(result, /<meta\s+property="og:url"[^>]*>/i);
  result = removeTag(result, /<meta\s+property="og:type"[^>]*>/i);
  result = removeTag(result, /<link\s+rel="canonical"[^>]*>/i);

  const tags = [
    `<title>${escapeHtml(page.title)}</title>`,
    `<meta name="description" content="${escapeHtml(page.description)}">`,
    '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">',
    '<meta name="googlebot" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">',
    `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">`,
    `<meta property="og:type" content="${ogType}">`,
    '<meta property="og:site_name" content="FareTransit">',
    `<meta property="og:title" content="${escapeHtml(page.title)}">`,
    `<meta property="og:description" content="${escapeHtml(page.description)}">`,
    `<meta property="og:url" content="${escapeHtml(canonicalUrl)}">`,
    '<meta name="twitter:card" content="summary">',
    `<meta name="twitter:title" content="${escapeHtml(page.title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(page.description)}">`,
  ].join('');

  return result.replace('</head>', `${tags}</head>`);
}

const targets = new Map();
for (const page of pages) targets.set(page.path, page);
for (const route of routes) {
  if (!route?.slug || route?.seoStatus === 'noindex') continue;
  const routePath = `/routes/${route.slug}`;
  if (aliasSources.has(routePath)) continue;
  targets.set(routePath, {
    path: routePath,
    title: route.metaTitle || route.title,
    pageName: route.title,
    description: route.metaDescription,
    type: 'Service',
    lastmod: route.reviewedAt || '2026-08-31',
  });
}

for (const page of targets.values()) {
  const html = injectSeo(template, page);
  if (page.path === '/') {
    fs.writeFileSync(sourceIndex, html, 'utf8');
    continue;
  }

  const destinationDir = path.join(buildRoot, ...page.path.split('/').filter(Boolean));
  fs.mkdirSync(destinationDir, { recursive: true });
  fs.writeFileSync(path.join(destinationDir, 'index.html'), html, 'utf8');
}

console.log(`[SEO] Prerendered metadata for ${targets.size} canonical pages.`);
