const fs = require('fs');
const path = require('path');

const BUILD_DIR = path.resolve(__dirname, '..', 'build');
const INDEX_FILE = path.join(BUILD_DIR, 'index.html');
const ORIGIN = 'https://www.faretransit.com';

const pages = [
  {
    path: '/',
    title: 'FareTransit | Flights, Hotels & Car Rental Assistance',
    description: 'Plan flights, hotels and car rentals with clear travel information and real human reservation assistance from FareTransit.',
    h1: 'Travel Booking Assistance for Flights, Hotels & Car Rentals',
    lead: 'Compare travel options and move from planning to a clear reservation request with real human support.',
  },
  {
    path: '/flights',
    title: 'Flight Booking & Reservation Assistance | FareTransit',
    description: 'Compare flight options, routes, connections and travel times, with FareTransit specialists available to help with reservations, changes and cancellations.',
    h1: 'Flight Booking Assistance With Real Human Support',
    lead: 'Compare flight schedules, connections, cabin choices and reservation details before you continue.',
  },
  {
    path: '/hotels',
    title: 'Hotel Booking & Reservation Assistance | FareTransit',
    description: 'Search hotels and resorts by destination, dates and guests, then request reservation assistance from FareTransit for the stay that fits your trip.',
    h1: 'Find Hotels and Get Reservation Assistance',
    lead: 'Search stays by destination and dates, compare practical details, and submit the property you want for a trackable request.',
  },
  {
    path: '/car-rentals',
    title: 'Car Rental Booking Assistance | FareTransit',
    description: 'Explore airport and city car rental options, vehicle categories and major rental brands with personal reservation assistance from FareTransit.',
    h1: 'Find the Right Rental Car for Your Trip',
    lead: 'Review pickup options, vehicle categories and trip needs, then contact FareTransit for rental booking assistance.',
  },
];

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function replaceOrInsertMeta(html, attribute, key, value) {
  const safe = escapeHtml(value);
  const re = new RegExp(`<meta[^>]*${attribute}=["']${key}["'][^>]*>`, 'i');
  const tag = `<meta ${attribute}="${key}" content="${safe}" />`;
  return re.test(html) ? html.replace(re, tag) : html.replace('</head>', `  ${tag}\n</head>`);
}

function setCanonical(html, canonicalUrl) {
  const canonicalRe = /<link[^>]*rel=["']canonical["'][^>]*>/ig;
  const withoutExisting = html.replace(canonicalRe, '');
  return withoutExisting.replace('</head>', `  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />\n</head>`);
}

function setRootShell(html, page) {
  const shell = `<div id="root"><main data-seo-prerender="true" style="min-height:60vh;padding:5rem 8%;background:#f8fafc;color:#0f172a;font-family:Inter,Arial,sans-serif"><p style="font-weight:800;text-transform:uppercase;letter-spacing:.12em;color:#8b1538">FareTransit</p><h1 style="max-width:900px;font-size:clamp(2.2rem,5vw,4.2rem);line-height:1.05;margin:.5rem 0 1rem">${escapeHtml(page.h1)}</h1><p style="max-width:760px;font-size:1.1rem;line-height:1.7;color:#475569">${escapeHtml(page.lead)}</p><nav aria-label="Travel services" style="display:flex;gap:1rem;flex-wrap:wrap;margin-top:1.5rem"><a href="/flights">Flights</a><a href="/hotels">Hotels</a><a href="/car-rentals">Car Rentals</a></nav></main></div>`;
  const rootRe = /<div id=["']root["']><\/div>/i;
  if (!rootRe.test(html)) {
    throw new Error('Could not find the CRA root element while generating SEO prerender output.');
  }
  return html.replace(rootRe, shell);
}

function renderPage(template, page) {
  const canonicalUrl = page.path === '/' ? `${ORIGIN}/` : `${ORIGIN}${page.path}`;
  let html = template.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(page.title)}</title>`);
  html = replaceOrInsertMeta(html, 'name', 'description', page.description);
  html = replaceOrInsertMeta(html, 'property', 'og:title', page.title);
  html = replaceOrInsertMeta(html, 'property', 'og:description', page.description);
  html = replaceOrInsertMeta(html, 'property', 'og:url', canonicalUrl);
  html = replaceOrInsertMeta(html, 'name', 'twitter:title', page.title);
  html = replaceOrInsertMeta(html, 'name', 'twitter:description', page.description);
  html = setCanonical(html, canonicalUrl);
  html = setRootShell(html, page);
  return html;
}

if (!fs.existsSync(INDEX_FILE)) {
  console.error('SEO prerender failed: build/index.html was not found.');
  process.exit(1);
}

const template = fs.readFileSync(INDEX_FILE, 'utf8');

for (const page of pages) {
  const html = renderPage(template, page);
  if (page.path === '/') {
    fs.writeFileSync(INDEX_FILE, html);
    continue;
  }

  const outputDir = path.join(BUILD_DIR, page.path.replace(/^\//, ''));
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'index.html'), html);
}

console.log('SEO prerender complete for /, /flights, /hotels and /car-rentals.');
