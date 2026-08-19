import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const service = read('backend/src/modules/hotels/hotel.service.mjs');
const routes = read('backend/src/modules/hotels/hotel.routes.mjs');
const routeIndex = read('backend/src/routes/index.mjs');
const migration = read('backend/migrations/106_public_hotel_search_tracking.sql');
const app = read('frontend/src/app/App.js');
const header = read('frontend/src/shared/components/Header.js');
const serviceNav = read('frontend/src/shared/components/ServiceNav.js');
const hotelPage = read('frontend/src/features/hotels/pages/HotelSearchPage.js');
const hotelApi = read('frontend/src/features/hotels/hotelApi.js');
const seo = read('frontend/src/shared/components/SeoRouteGuard.js');

assert.match(service, /process\.env\.SERPAPI_API_KEY/);
assert.match(service, /engine', 'google_hotels'/);
assert.match(service, /property_token/);
assert.match(service, /AbortController/);
assert.doesNotMatch(service, /8df31a2da9a24a9565d2fa7d5dcd096a5f5542c1a42e42cf9f5d604e17871498/);

assert.match(routeIndex, /router\.use\('\/hotels', noStore, hotelRouter\)/);
assert.match(routes, /router\.get\('\/search'/);
assert.match(routes, /router\.get\('\/details'/);
assert.match(routes, /router\.post\('\/booking-requests'/);
assert.match(routes, /from\('crm_leads'\)\.insert\(leadPayload\)/);
assert.match(routes, /lead_id: lead\.id/);
assert.match(routes, /from\('hotel_bookings'\)\.insert\(bookingPayload\)/);
assert.match(routes, /from\('crm_notes'\)\.insert/);
assert.match(routes, /client_request_id/);
assert.match(routes, /Website Hotel Search/);
assert.match(routes, /status: 'REQUESTED'/);

assert.match(migration, /booking_source/);
assert.match(migration, /external_property_token/);
assert.match(migration, /client_request_id/);
assert.match(migration, /UNIQUE INDEX IF NOT EXISTS idx_hotel_bookings_client_request_id/);
assert.match(migration, /website_serpapi_google_hotels' OR lead_id IS NOT NULL/);

assert.match(header, /to="\/hotels"/);
assert.match(header, />\s*Hotels\s*</);
assert.match(serviceNav, /to="\/hotels"/);
assert.match(serviceNav, />Hotels</);
assert.match(app, /<Route path="\/hotels" element={<HotelSearchPage \/>} \/>/);
assert.match(app, /<Route path="\/hotels\/results" element={<HotelSearchPage \/>} \/>/);
assert.match(seo, /'\/hotels'/);
assert.match(hotelPage, /Request Booking/);
assert.match(hotelPage, /Submit Hotel Request/);
assert.match(hotelPage, /created\.leadCode/);
assert.match(hotelPage, /created\.hotelCode/);
assert.match(hotelApi, /\/hotels\/booking-requests/);
assert.doesNotMatch(hotelApi, /SERPAPI_API_KEY|api_key/i);
assert.doesNotMatch(hotelPage, /SERPAPI_API_KEY|api_key/i);

console.log('hotel SerpApi search + CRM-linked booking request contract: PASS');
