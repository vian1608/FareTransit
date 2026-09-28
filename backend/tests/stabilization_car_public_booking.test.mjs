import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

process.env.JWT_SECRET ||= 'faretransit-car-contract-jwt-secret';
process.env.CAR_QUOTE_SIGNING_SECRET ||= 'faretransit-car-contract-quote-secret';

const backendRoot = path.resolve(process.cwd());
const repoRoot = path.resolve(backendRoot, '..');
const read = relative => fs.readFileSync(path.join(repoRoot, relative), 'utf8');

const routes = read('backend/src/modules/cars/car.routes.mjs');
const controller = read('backend/src/modules/cars/car.controller.mjs');
const searchService = read('backend/src/modules/cars/car.service.mjs');
const bookingService = read('backend/src/modules/cars/car-booking.service.mjs');
const parseClient = read('backend/src/modules/cars/parse-enterprise.client.mjs');
const resultCard = read('frontend/src/features/cars/components/CarResultCard.js');
const checkoutPage = read('frontend/src/features/cars/pages/CarRentalCheckoutPage.js');
const confirmationPage = read('frontend/src/features/cars/pages/CarRentalRequestConfirmationPage.js');
const appRoutes = read('frontend/src/app/App.js');

assert.match(routes, /router\.post\('\/search'/, 'Live car search route must exist.');
assert.match(routes, /router\.post\('\/bookings'/, 'Public FareTransit car request route must exist.');
assert.match(routes, /router\.get\('\/bookings\/:reference'/, 'Token-protected public car request lookup must exist.');
assert.match(routes, /carBookingRateLimiter/, 'Public reservation creation must be rate limited.');

assert.match(parseClient, /X-API-Key/, 'Parse credentials must be sent server-side in X-API-Key.');
assert.doesNotMatch(resultCard, /booking\.com/i, 'Customer car cards must not redirect to Booking.com.');
assert.doesNotMatch(resultCard, /window\.location\.assign/, 'Car selection must remain on FareTransit.');
assert.match(resultCard, /Reserve with FareTransit/, 'Car cards must use FareTransit on-site reservation CTA.');

assert.match(searchService, /parseEnterpriseClient\.searchVehicles/, 'Live vehicle inventory must use the Parse Enterprise provider.');
assert.match(searchService, /ONE_WAY_NOT_SUPPORTED/, 'Unsupported one-way inventory must fail explicitly rather than fabricate results.');
assert.doesNotMatch(searchService, /generateDemoSearchResponse/, 'Production car search must not silently fabricate demo inventory.');
assert.match(searchService, /quote_token/, 'Search results must carry a signed server quote token into checkout.');

assert.match(bookingService, /verifyCarQuoteToken/, 'Checkout must verify the signed quote server-side.');
assert.match(bookingService, /reservation_status:\s*'READY_TO_BOOK'/, 'Public requests must enter the manual-fulfillment queue, not BOOKED.');
assert.match(bookingService, /payment_status:\s*'PENDING'/, 'Public car requests must not be recorded as paid.');
assert.match(bookingService, /client_request_id/, 'Reservation requests must use database-backed idempotency.');
assert.match(bookingService, /publicReadTokenHash/, 'Public reservation status lookup must be protected by a token hash.');
assert.match(bookingService, /supplier reservation has not yet been created/i, 'Internal record must retain the unconfirmed-supplier warning.');
assert.doesNotMatch(bookingService, /card_number|cardNumber|cvv|cvc/i, 'Public car request flow must not collect raw card data.');

assert.match(controller, /if \(booking\.created\)/, 'Idempotent retries must not resend reservation notifications.');
assert.match(checkoutPage, /No payment is collected on this page/, 'Checkout must make the no-payment boundary explicit.');
assert.match(checkoutPage, /does not create or confirm a supplier reservation/i, 'Checkout must distinguish a request from supplier confirmation.');
assert.match(confirmationPage, /Pending confirmation/, 'Request confirmation must display pending status before fulfillment.');
assert.match(confirmationPage, /not an Enterprise or supplier confirmation/i, 'Confirmation page must not misrepresent an unfulfilled request.');
assert.match(appRoutes, /\/car-rentals\/checkout/, 'Car checkout route must be registered.');
assert.match(appRoutes, /\/car-rentals\/request\/:reference/, 'Car request confirmation route must be registered.');

const { createCarQuoteToken, verifyCarQuoteToken } = await import('../src/modules/cars/car-quote-token.mjs');
const token = createCarQuoteToken({
  provider: 'parse-enterprise',
  supplier: 'Enterprise',
  vehicleCode: 'ECAR',
  vehicleName: 'Economy car',
  currency: 'USD',
  dailyRate: 50,
  totalPrice: 200,
  pickupDatetime: '2026-10-10T10:00:00',
  returnDatetime: '2026-10-14T10:00:00',
  pickupLocation: { id: '123', name: 'Test Airport' },
  returnLocation: { id: '123', name: 'Test Airport' },
  driverAge: 30
});
const verified = verifyCarQuoteToken(token);
assert.equal(verified.totalPrice, 200, 'Signed quote must preserve authoritative server price.');
assert.equal(verified.provider, 'parse-enterprise');
assert.throws(
  () => verifyCarQuoteToken(`${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`),
  /could not be verified|invalid/i,
  'Tampered quote tokens must be rejected.'
);

console.log('car public booking stabilization contract passed');
