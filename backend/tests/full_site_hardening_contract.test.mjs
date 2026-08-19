import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(repoRoot, ...parts), 'utf8');

const seoGuard = read('frontend', 'src', 'shared', 'components', 'SeoRouteGuard.js');
const routeDispatcher = read('frontend', 'src', 'features', 'flights', 'pages', 'RouteDispatcher.js');
const airlineAction = read('frontend', 'src', 'features', 'flights', 'pages', 'AirlineActionPage.js');
const flightRoute = read('frontend', 'src', 'features', 'flights', 'pages', 'FlightRoutePage.js');
const trainRoute = read('frontend', 'src', 'features', 'flights', 'pages', 'TrainRoutePage.js');
const travelAssistance = read('frontend', 'src', 'features', 'flights', 'pages', 'TravelAssistancePage.js');
const carResultCard = read('frontend', 'src', 'features', 'cars', 'components', 'CarResultCard.js');
const carResults = read('frontend', 'src', 'features', 'cars', 'pages', 'CarSearchResultsPage.js');
const carHome = read('frontend', 'src', 'features', 'cars', 'pages', 'CarRentalsHomePage.js');
const returnFlights = read('frontend', 'src', 'features', 'flights', 'pages', 'ReturnFlightSelectionPage.js');
const myBookings = read('frontend', 'src', 'features', 'bookings', 'pages', 'MyBookingsPage.js');
const oneWayConfirmation = read('frontend', 'src', 'features', 'bookings', 'pages', 'OneWayConfirmationPage.js');
const roundTripConfirmation = read('frontend', 'src', 'features', 'bookings', 'pages', 'RoundTripConfirmationPage.js');
const signIn = read('frontend', 'src', 'features', 'customers', 'pages', 'SignInPage.js');
const signUp = read('frontend', 'src', 'features', 'customers', 'pages', 'SignUpPage.js');
const adminLogin = read('frontend', 'src', 'features', 'admin', 'pages', 'AdminLoginPage.js');
const consultingPayment = read('frontend', 'src', 'features', 'payments', 'pages', 'ConsultingPaymentPage.js');
const sensitiveGuard = read('frontend', 'src', 'shared', 'security', 'installSensitiveDataGuards.js');
const indexJs = read('frontend', 'src', 'index.js');
const api = read('frontend', 'src', 'shared', 'api', 'api.js');
const app = read('frontend', 'src', 'app', 'App.js');
const contact = read('frontend', 'src', 'shared', 'pages', 'ContactInfoPage.js');
const terms = read('frontend', 'src', 'shared', 'pages', 'TermsAndConditionsPage.js');
const privacy = read('frontend', 'src', 'shared', 'pages', 'PrivacyPolicyPage.js');
const refund = read('frontend', 'src', 'shared', 'pages', 'RefundPolicyPage.js');

assert.match(seoGuard, /VALID_ROUTE_PATHS/);
assert.match(seoGuard, /routesData/);
assert.doesNotMatch(seoGuard, /INDEXABLE_PREFIXES/);
assert.match(routeDispatcher, /NotFoundPage/);
assert.doesNotMatch(routeDispatcher, /Navigate to="\/"/);
assert.match(airlineAction, /airlinesData/);
assert.match(airlineAction, /<NotFoundPage \/>/);
assert.match(app, /<Route path="\*" element={<NotFoundPage \/>} \/>/);

assert.match(seoGuard, /params\.get\('return'\)/);
assert.match(seoGuard, /params\.set\('returnDate'/);
assert.match(seoGuard, /params\.get\('cabin'\)/);
assert.match(seoGuard, /params\.set\('travelClass'/);

for (const [name, source] of Object.entries({ contact, terms, privacy, refund })) {
  assert.match(source, /<Helmet>/, `${name} is missing Helmet metadata`);
  assert.match(source, /https:\/\/www\.faretransit\.com\//, `${name} is missing www canonical metadata`);
}

for (const [name, source] of Object.entries({ flightRoute, trainRoute, travelAssistance })) {
  assert.match(source, /clientRequestId/, `${name} is missing idempotency identity`);
  assert.match(source, /result\?\.success === true/, `${name} does not require explicit success`);
  assert.match(source, /result\?\.persisted === true/, `${name} does not verify persistence`);
  assert.match(source, /result\?\.leadId/, `${name} does not require a real lead id`);
  assert.match(source, /trackLeadConversion/, `${name} is not wired to the canonical conversion helper`);
  assert.match(source, /normalizeError/, `${name} does not normalize visible API failures`);
  assert.doesNotMatch(source, /route-inquiry@faretransit\.com/, `${name} still fabricates a customer email`);
}
assert.match(flightRoute, /origin: `\$\{oCity\} \(\$\{oCode\}\)`/);
assert.match(flightRoute, /destination: `\$\{dCity\} \(\$\{dCode\}\)`/);
assert.match(trainRoute, /serviceType: 'rail'/);
assert.match(flightRoute, /smsOptIn: formData\.smsOptIn/);
assert.match(trainRoute, /smsOptIn: formData\.smsOptIn/);

assert.match(carResultCard, /void carAPI\.recordClick/);
assert.doesNotMatch(carResultCard, /await carAPI\.recordClick/);
assert.match(carResultCard, /dealError/);
assert.match(carResultCard, /window\.location\.assign/);
assert.match(carResults, /requestSequence/);
assert.match(carResults, /pageToken/);
assert.match(carResults, /normalizeError/);
// Current master intentionally presents car-rental phone assistance on the public
// landing page. Keep the hardening contract aligned with that production behavior
// rather than the superseded inline car-search form/default-date implementation.
assert.match(carHome, /SUPPORT_PHONE_HREF/);
assert.match(carHome, /POPULAR_AIRPORTS/);
assert.match(carHome, /aria-label="Car rental phone assistance"/);
assert.match(carHome, /serviceNavActive="cars"/);
assert.match(carHome, /SeamlessAdvisorySection variant="flight"/);

assert.match(returnFlights, /setError\(normalizeError/);
assert.match(returnFlights, /Return Flight Search Failed/);
assert.match(returnFlights, /Retry Search/);
assert.match(returnFlights, /returnDate:/);
assert.match(returnFlights, /travelClass:/);

assert.match(myBookings, /queryParams\.get\('code'\)/);
assert.match(myBookings, /View Reservation/);
assert.doesNotMatch(myBookings, /Retry Payment \(Card Failed\)/);
assert.doesNotMatch(myBookings, /to="\/booking"/);
assert.match(myBookings, /normalizeError/);

// Legacy confirmation routes must never declare a booking successful from
// sessionStorage alone; they must route through the backend-backed confirmation page.
for (const [name, source] of Object.entries({ oneWayConfirmation, roundTripConfirmation })) {
  assert.match(source, /Navigate to={`\/booking-confirmed\//, `${name} does not forward to canonical confirmation`);
  assert.match(source, /Reservation Reference Required/, `${name} lacks safe missing-reference state`);
  assert.doesNotMatch(source, /successfully booked/i, `${name} still makes an unverified success claim`);
}

for (const [name, source] of Object.entries({ signIn, signUp, adminLogin })) {
  assert.match(source, /normalizeError/, `${name} is not using normalized user-visible errors`);
  assert.match(source, /if \(loading\) return/, `${name} allows duplicate submit while loading`);
  assert.match(source, /finally/, `${name} can leave loading state stuck`);
  assert.match(source, /role="alert"/, `${name} lacks an accessible visible error state`);
}

assert.doesNotMatch(consultingPayment, /cardNumber/);
assert.doesNotMatch(consultingPayment, /\bcch\b/i);
assert.doesNotMatch(consultingPayment, /CVV/i);
assert.match(consultingPayment, /createStripeSession/);
assert.match(consultingPayment, /new URL\(response\.url\)/);
assert.match(consultingPayment, /checkoutUrl\.protocol !== 'https:'/);
assert.match(consultingPayment, /normalizeError/);

assert.match(indexJs, /installSensitiveDataGuards\(\)/);
for (const forbidden of ['cardnumber', 'card_number', 'pan', 'cvv', 'cvc', 'cid', 'cch']) {
  assert.ok(sensitiveGuard.toLowerCase().includes(`'${forbidden}'`), `Sensitive guard missing ${forbidden}`);
}
assert.match(sensitiveGuard, /slice\(-4\)/);
assert.match(sensitiveGuard, /DEFAULT_FETCH_TIMEOUT_MS = 30000/);
assert.match(sensitiveGuard, /url\.pathname\.startsWith\('\/api\/'\)/);
assert.match(sensitiveGuard, /controller\.abort\(\)/);

assert.match(api, /timeout: DEFAULT_API_TIMEOUT_MS/);
assert.match(api, /DEFAULT_API_TIMEOUT_MS/);

console.log('Full-site hardening contract passed: SEO, leads, search, confirmations, auth, payments, and async-button safety.');
