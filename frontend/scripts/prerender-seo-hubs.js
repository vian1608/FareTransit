const fs = require('fs');
const path = require('path');
const airportRows = require('../src/shared/data/carRentalAirports.json');

const BUILD_DIR = path.resolve(__dirname, '..', 'build');
const INDEX_FILE = path.join(BUILD_DIR, 'index.html');
const ORIGIN = 'https://www.faretransit.com';
const SUPPORT_PHONE_DISPLAY = '+1 (888) 780-8855';
const SUPPORT_PHONE_HREF = 'tel:+18887808855';

const airportPages = airportRows.map((airport) => ({
  path: `/car-rental/airport/${airport.code}`,
  title: airport.title,
  description: airport.description,
  h1: `Car Rental at ${airport.airportName} (${airport.airportCode})`,
  lead: airport.intro,
  airportCode: airport.airportCode,
}));

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
  {
    path: '/car-rental/call-now',
    title: 'Car Rental Booking Assistance by Phone | FareTransit',
    description: 'Need a rental car in the USA? Call FareTransit for independent reservation assistance and to compare available rental rates, vehicle options and pickup locations.',
    h1: 'Need a Rental Car in the USA?',
    lead: 'Call FareTransit to compare available rental rates, vehicle options and pickup locations before you book.',
    indexable: false,
    paidCallLanding: true,
  },
  {
    path: '/car-rental/airport',
    title: 'Airport Car Rental Options Across the U.S. | FareTransit',
    description: 'Compare airport car rental planning guides for major U.S. airports, including vehicle categories, one-way rentals, weekly rentals and booking assistance.',
    h1: 'Airport Car Rental Options Across Major U.S. Airports',
    lead: 'Start with your arrival airport and compare practical pickup, vehicle, one-way and weekly rental considerations before you book.',
  },
  ...airportPages,
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
  const rootRe = /<div id=["']root["']><\/div>/i;
  if (!rootRe.test(html)) {
    throw new Error('Could not find the CRA root element while generating prerender output.');
  }

  if (page.paidCallLanding) {
    const shell = `<div id="root"><main data-paid-call-prerender="true" style="min-height:100vh;background:linear-gradient(135deg,#fff 0%,#fff6f8 65%,#fbe7ed 100%);color:#1f1720;font-family:Inter,Arial,sans-serif"><header style="background:#fff;border-bottom:1px solid #eadde2"><div style="max-width:1120px;margin:0 auto;padding:14px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px"><strong style="font-size:20px">FareTransit</strong><a href="${SUPPORT_PHONE_HREF}" style="color:#8b1538;font-weight:800;text-decoration:none">${SUPPORT_PHONE_DISPLAY}</a></div></header><section style="max-width:1120px;margin:0 auto;padding:54px 20px 64px"><p style="font-weight:800;text-transform:uppercase;letter-spacing:.13em;color:#8b1538;font-size:12px;margin:0 0 12px">Car Rental Booking Assistance</p><h1 style="max-width:780px;font-size:clamp(2.4rem,7vw,4.1rem);line-height:1.02;letter-spacing:-.045em;margin:0">${escapeHtml(page.h1)}</h1><p style="max-width:720px;font-size:1.12rem;line-height:1.65;color:#655c62;margin:20px 0 0">${escapeHtml(page.lead)}</p><p style="max-width:720px;margin:18px 0 0;padding:11px 13px;border:1px solid #edd6a2;background:#fff9e9;border-radius:10px;color:#6d5012"><strong>Need a car today?</strong> Call to check current availability.</p><a href="${SUPPORT_PHONE_HREF}" style="display:flex;align-items:center;justify-content:center;max-width:490px;min-height:76px;margin-top:24px;padding:14px 20px;border-radius:16px;background:#8b1538;color:#fff;text-decoration:none;font-size:1.2rem;font-weight:800">Call ${SUPPORT_PHONE_DISPLAY}</a><p style="font-size:13px;color:#655c62;margin:10px 0 0">Call Now to Check Rental Options</p><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px 18px;max-width:780px;margin-top:26px;color:#41383e;font-weight:650"><span>✓ Airport &amp; city rentals</span><span>✓ One-way &amp; weekly rentals</span><span>✓ Economy, SUV &amp; premium options</span><span>✓ Human booking assistance</span></div><p style="max-width:720px;color:#746a70;font-size:12px;line-height:1.55;margin-top:24px">FareTransit is an independent travel reservation assistance service.</p></section></main></div>`;
    return html.replace(rootRe, shell);
  }

  const airportNav = page.airportCode
    ? `<a href="/car-rental/airport">Airport Car Rentals</a>`
    : '';
  const shell = `<div id="root"><main data-seo-prerender="true" style="min-height:60vh;padding:5rem 8%;background:#f8fafc;color:#0f172a;font-family:Inter,Arial,sans-serif"><p style="font-weight:800;text-transform:uppercase;letter-spacing:.12em;color:#8b1538">FareTransit</p><h1 style="max-width:900px;font-size:clamp(2.2rem,5vw,4.2rem);line-height:1.05;margin:.5rem 0 1rem">${escapeHtml(page.h1)}</h1><p style="max-width:860px;font-size:1.1rem;line-height:1.7;color:#475569">${escapeHtml(page.lead)}</p><nav aria-label="Travel services" style="display:flex;gap:1rem;flex-wrap:wrap;margin-top:1.5rem"><a href="/flights">Flights</a><a href="/hotels">Hotels</a><a href="/car-rentals">Car Rentals</a>${airportNav}</nav></main></div>`;
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
  html = replaceOrInsertMeta(
    html,
    'name',
    'robots',
    page.indexable === false
      ? 'noindex, follow, noarchive'
      : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
  );
  html = replaceOrInsertMeta(
    html,
    'name',
    'googlebot',
    page.indexable === false
      ? 'noindex, follow, noarchive'
      : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
  );
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

console.log(`Prerender complete for ${pages.length} SEO and paid landing routes.`);
