import assert from 'node:assert/strict';
import fs from 'node:fs';

const service = fs.readFileSync(new URL('../src/modules/authorizations/passenger-authorization.service.mjs', import.meta.url), 'utf8');
const hardening = fs.readFileSync(new URL('../src/modules/bookings/booking.repository.egress-hardening.mjs', import.meta.url), 'utf8');

assert.match(service, /getAuthoritativeBookingAuthorizationState/);
assert.match(service, /select\('id,confirmation_code,booking_revision,authorization_status,status,authorization_token,authorization_expires_at'\)/);
assert.match(service, /authRevision !== bookingRevision \|\| liveAuthorizationStatus === 'REAUTHORIZATION_REQUIRED'/);
assert.match(service, /Preserve already-accepted evidence exactly as historical evidence/);
assert.match(service, /Revision\/lifecycle invalidation wins over idempotency/);
assert.match(hardening, /booking_revision/);
assert.match(hardening, /ITINERARY_SEGMENT_COLUMNS/);
assert.match(hardening, /canonicalSegments\.length > 0 \? canonicalSegments : toSegments\(flights\)/);
assert.match(hardening, /merchant_type,merchant_code/);
console.log('Authorization runtime integrity contract: PASS');
