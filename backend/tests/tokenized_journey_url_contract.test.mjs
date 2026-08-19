import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const migration = read('backend/migrations/034_tokenized_journey_sessions.sql');
const service = read('backend/src/modules/journey-sessions/journey-session.service.mjs');
const controller = read('backend/src/modules/journey-sessions/journey-session.controller.mjs');
const routes = read('backend/src/modules/journey-sessions/journey-session.routes.mjs');
const rootRoutes = read('backend/src/routes/index.mjs');
const bookingRoutes = read('backend/src/modules/bookings/booking.routes.mjs');
const bookingMiddleware = read('backend/src/modules/journey-sessions/checkout-session-booking.middleware.mjs');
const app = read('frontend/src/app/App.js');
const journey = read('frontend/src/features/journey/TokenizedJourneyRoutes.js');
const journeyApi = read('frontend/src/shared/api/journeySessionApi.js');
const bookingPage = read('frontend/src/features/bookings/pages/BookingPage.js');
const voucherCheckout = read('frontend/src/features/bookings/vouchers/BookingVoucherPage.js');
const paymentJourney = read('frontend/src/features/journey/TokenizedPaymentRoutes.js');
const consultingPayment = read('frontend/src/features/payments/pages/ConsultingPaymentPage.js');
const carGuard = read('frontend/src/features/cars/pages/CarSearchUrlGuard.js');
const carForm = read('frontend/src/features/cars/components/CarSearchForm.js');

// One centralized server-backed store owns opaque journey identifiers.
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.journey_sessions/);
assert.match(migration, /'QUOTE'/);
assert.match(migration, /'CHECKOUT'/);
assert.match(migration, /'RESERVATION_READ'/);
assert.match(migration, /'PAYMENT'/);
assert.match(migration, /token VARCHAR\(96\) UNIQUE NOT NULL/);
assert.match(migration, /expires_at TIMESTAMPTZ NOT NULL/);
assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /idx_journey_sessions_type_status_expiry/);

// Public IDs are random opaque tokens, never data-bearing URLs.
assert.match(service, /prefix: 'q_'/);
assert.match(service, /prefix: 'c_'/);
assert.match(service, /prefix: 'r_'/);
assert.match(service, /prefix: 'p_'/);
assert.match(service, /crypto\.randomBytes\(24\)\.toString\('base64url'\)/);
assert.match(service, /SENSITIVE_KEYS/);
assert.match(service, /'cardnumber'/);
assert.match(service, /'cvv'/);
assert.match(service, /'cch'/);

// Draft PATCH is one conditional database UPDATE, not a read-then-write fan-out.
const patchFunction = service.match(/async function patchSession[\s\S]*?\n}\n\nfunction normalizeFlightForPublicSession/)?.[0] || '';
assert.ok(patchFunction, 'patchSession must exist');
assert.doesNotMatch(patchFunction, /getSession\(/);
assert.match(patchFunction, /\.update\(/);
assert.match(patchFunction, /\.gt\('expires_at', now\)/);

// API is rate-limited and mounted behind no-store semantics.
assert.match(routes, /sessionWriteLimiter/);
assert.match(routes, /sessionReadLimiter/);
assert.match(routes, /router\.post\('\/quote'/);
assert.match(routes, /router\.get\('\/checkout\/:token'/);
assert.match(routes, /router\.get\('\/reservation\/:token'/);
assert.match(rootRoutes, /router\.use\('\/journey-sessions', noStore, journeySessionRouter\)/);

// Successful booking finalizes c_ and returns an r_ token without making booking
// success depend on token bookkeeping.
assert.match(bookingRoutes, /completeJourneySessionAfterBooking/);
assert.match(bookingMiddleware, /checkout_session_token/);
assert.match(bookingMiddleware, /reservationReadToken/);
assert.match(bookingMiddleware, /Non-blocking checkout completion warning/);
assert.match(controller, /data\.reservationToken/);

// Frontend routes are durable while the simple legacy URLs remain bootstrap paths.
assert.match(app, /path="\/return-flight" element={<ReturnFlightBootstrap/);
assert.match(app, /path="\/return-flight\/:quoteToken" element={<TokenizedReturnFlightPage/);
assert.match(app, /path="\/booking" element={<BookingBootstrap/);
assert.match(app, /path="\/booking\/:checkoutToken" element={<TokenizedBookingPage/);
assert.match(app, /path="\/payment" element={<PaymentBootstrap/);
assert.match(app, /path="\/payment\/:paymentToken" element={<TokenizedPaymentPage/);
assert.match(app, /path="\/authorize\/:token"/);
assert.match(app, /path="\/booking-confirmed\/:confirmationCode" element={<BookingConfirmationRoute/);

assert.match(journeyApi, /journey-sessions\/quote/);
assert.match(journeyApi, /journey-sessions\/checkout/);
assert.match(journeyApi, /journey-sessions\/reservation/);
assert.match(journey, /checkout_session_token/);
assert.match(journey, /reservationReadToken/);
assert.match(journey, /DRAFT_SAVE_DELAY_MS = 1800/);
assert.match(journey, /SENSITIVE_CONTROL_RE/);
assert.match(journey, /cardnumber/);
assert.match(journey, /expdate/);
assert.match(journey, /cvv/);
assert.match(journey, /cch/);
assert.match(journey, /journeySessionAPI\.updateCheckout/);
assert.match(journey, /restoreVoucher/);

// Checkout hydration contract: the fetched c_ payload is authoritative on the
// very first BookingPage render. This prevents the transient/stuck
// "No Itinerary Selected" state caused by initializing flight state as null and
// waiting for a later sessionStorage effect.
assert.match(journey, /<BookingVoucherPage initialJourneyPayload=\{session\.payload \|\| \{\}\} \/>/);
assert.match(voucherCheckout, /BookingVoucherPage\(\{ initialJourneyPayload = null \}\)/);
assert.match(voucherCheckout, /<Booking initialJourneyPayload=\{initialJourneyPayload\} \/>/);
assert.match(bookingPage, /function Booking\(\{ initialJourneyPayload = null \}\)/);
assert.match(bookingPage, /initialJourneyPayload\?\.selectedFlight \|\| readBookingSessionJson\('selectedFlight', null\)/);
assert.match(bookingPage, /initialJourneyPayload\?\.returnFlight/);
assert.match(bookingPage, /initialJourneyPayload\?\.searchParams/);
assert.doesNotMatch(bookingPage, /if \(!flightData\) \{ navigate\('\/'\); return; \}/);

// A failed/hung journey-session request must become a recoverable UI state,
// never an infinite browser spinner.
assert.match(journeyApi, /JOURNEY_SESSION_TIMEOUT_MS = 15000/);
assert.match(journeyApi, /timeoutConfig/);
assert.match(journey, /const \[reloadKey, setReloadKey\] = useState\(0\)/);
assert.match(journey, /Retry checkout/);
assert.match(journey, /\[checkoutToken, navigate, reloadKey\]/);

// Consulting payments have p_ state but continue to use hosted card entry.
assert.match(paymentJourney, /createPayment/);
assert.match(paymentJourney, /\/payment\/\$\{encodeURIComponent\(token\)\}/);
assert.match(consultingPayment, /paymentToken/);
assert.match(consultingPayment, /journeySessionAPI\.updatePayment/);
assert.match(consultingPayment, /Card details are entered directly on the payment provider/);

// Car search is fully URL-authoritative. Bare results URLs cannot reuse old storage.
assert.match(app, /CarSearchUrlGuard/);
assert.match(carGuard, /query\.get\('pickup'\)/);
assert.match(carGuard, /<Navigate to="\/car-rentals" replace/);
assert.match(carForm, /driverCountry/);
assert.match(carForm, /new URLSearchParams/);
assert.doesNotMatch(carForm, /sessionStorage\.setItem\('carSearchParams'/);

console.log('tokenized journey URL + copy/paste recovery contract: PASS');
