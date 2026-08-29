import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const repo = read('backend/src/modules/bookings/booking.repository.mjs');
const service = read('backend/src/modules/bookings/booking.service.mjs');
const mapper = read('backend/src/modules/bookings/booking.mapper.mjs');
const traveller = read('backend/src/modules/travellers/traveller.service.mjs');
const bookingPage = read('frontend/src/features/bookings/pages/BookingPageV2.js');
const manualCheckout = read('frontend/src/features/secure-payments/ManualPaymentCardFields.js');
const manualRoutes = read('backend/src/modules/secure-payments/secure-payment.routes.mjs');
const createNormalization = read('backend/src/modules/bookings/booking-create-normalization.mjs');
const routeIndex = read('backend/src/routes/index.mjs');
const migration = read('backend/migrations/035_booking_integrity_hardening.sql');

// Booking creation is database-authoritative. Never report success from a fake
// memory-only UUID or swallow a failed contact/payment write.
assert.doesNotMatch(repo, /Storing in resilience memory store/);
assert.doesNotMatch(repo, /fallbackRecord/);
assert.match(repo, /BOOKING_INSERT_FAILED/);
assert.match(repo, /CONTACT_INSERT_FAILED/);
assert.match(repo, /PAYMENT_INSERT_FAILED/);
assert.doesNotMatch(repo, /Non-blocking contact insert warning/);

// The client request ID must actually be persisted so duplicated tabs/retries
// reuse the same booking across processes and deployments.
assert.match(mapper, /client_request_id:\s*clientReqId/);
assert.match(mapper, /idempotency_key:\s*clientReqId/);
assert.match(repo, /client_request_id:\s*clientReqId/);
assert.match(repo, /idempotency_key:/);

// Payment state reaching Postgres is canonical after migration 033.
assert.match(mapper, /payment_status:\s*String\(payload\.paymentStatus \|\| 'PENDING'\)\.toUpperCase\(\)/);
assert.match(service, /paymentStatus:\s*'PENDING'/);
assert.match(service, /payment_status:\s*'PENDING'/);
assert.match(repo, /allowedStatuses = new Set\(\['PENDING', 'PROCESSING', 'PAID', 'FAILED', 'REFUNDED'\]\)/);
assert.doesNotMatch(service, /payment_status:\s*isDraft \? 'draft'/);

// Primary contact must persist or the complete booking rolls back.
assert.match(service, /CONTACT_REQUIRED/);
assert.match(service, /const contactEmail = String\(payload\.email/);
assert.match(service, /rawPhone\.match\(\/\^\(\\\+\\d\{1,4\}\)\\s\+\//);
assert.doesNotMatch(service, /rawPhone\.startsWith\('\+'\) \? rawPhone\.split\(' '\)\[0\]/);

// Passenger contract: visible required fields are validated in step one and the
// backend independently enforces the same identity requirements.
assert.match(traveller, /Title is required/);
assert.match(traveller, /Gender is required/);
assert.match(bookingPage, /const validateTravellers = \(\) =>/);
assert.match(bookingPage, /\['title', 'Title'\]/);
assert.match(bookingPage, /\['firstName', 'First Name'\]/);
assert.match(bookingPage, /\['lastName', 'Last Name'\]/);
assert.match(bookingPage, /\['gender', 'Gender'\]/);
assert.match(bookingPage, /\['dateOfBirth', 'Date of Birth'\]/);
assert.match(bookingPage, /validateDateOfBirth/);

// Explicit infant types survive search -> checkout -> persisted traveller row.
assert.match(bookingPage, /infantsInSeat/);
assert.match(bookingPage, /infantsOnLap/);
assert.match(bookingPage, /createPassenger\('infant', 'IN_SEAT'\)/);
assert.match(bookingPage, /createPassenger\('infant', 'ON_LAP'\)/);
assert.match(service, /infant_type:/);
assert.match(mapper, /infantType:\s*t\.infant_type/);
assert.match(migration, /ADD COLUMN IF NOT EXISTS infant_type VARCHAR\(20\)/);
assert.match(migration, /'IN_SEAT','ON_LAP'|'IN_SEAT', 'ON_LAP'/);

// Customer checkout is FareTransit's own manual storage flow. No third-party
// gateway/tokenization runtime is needed. Only masked card metadata and billing
// details are accepted by the persistence route.
assert.match(bookingPage, /ManualPaymentCardFields/);
assert.match(bookingPage, /secureCardRef/);
assert.match(bookingPage, /secureBooking/);
assert.doesNotMatch(bookingPage, /cleanCardNum/);
assert.doesNotMatch(bookingPage, /cardNumber\s*:/);
assert.doesNotMatch(bookingPage, /\bcvv\s*:/i);
assert.match(manualCheckout, /Card Brand/);
assert.match(manualCheckout, /Card Number \(Last 4 Digits\)/);
assert.match(manualCheckout, /Expiration Month/);
assert.match(manualCheckout, /Expiration Year/);
assert.match(manualCheckout, /\/secure-payments\/checkout\/attach/);
assert.doesNotMatch(manualCheckout, /Collect\.js|secure\.nmi\.com|startPaymentRequest|paymentToken/i);
assert.match(manualRoutes, /SENSITIVE_CARD_DATA_NOT_ACCEPTED/);
assert.match(manualRoutes, /rejectSensitiveCardPayload/);
assert.match(manualRoutes, /payment_provider:\s*'manual'/);
assert.match(manualRoutes, /tokenization_status:\s*'MANUAL_METADATA'/);
assert.match(manualRoutes, /card_last4/);
assert.match(manualRoutes, /billing_postal_code/);
assert.match(createNormalization, /normalized\.payment_provider = 'manual'/);
assert.doesNotMatch(routeIndex, /nmi-vault|paypalController|whopRouter|paymentRouter/);

// Checkout token is a stable idempotency identity, and confirmation prefers the
// opaque reservation-read token when available.
assert.match(bookingPage, /checkout:\$\{sessionStorage\.getItem\('checkoutSessionToken'\)\}/);
assert.match(bookingPage, /reservationReadToken/);
assert.match(bookingPage, /const confirmationRef = pending\.reservationReadToken \|\| pending\.code/);

console.log('booking end-to-end integrity contract: PASS');
