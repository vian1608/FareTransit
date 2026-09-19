import assert from 'node:assert/strict';
import fs from 'node:fs';

const routes = fs.readFileSync(new URL('../src/modules/bookings/booking.routes.mjs', import.meta.url), 'utf8');
const controller = fs.readFileSync(new URL('../src/modules/bookings/booking.controller.mjs', import.meta.url), 'utf8');
const publicController = fs.readFileSync(new URL('../src/modules/bookings/booking-public-reservation.controller.mjs', import.meta.url), 'utf8');
const search = fs.readFileSync(new URL('../src/modules/bookings/booking-current-search.controller.mjs', import.meta.url), 'utf8');

assert.match(routes, /router\.get\('\/user\/:email', bookingReadRateLimiter, authenticate, bookingController\.getByUserEmail\)/);
assert.match(routes, /router\.get\('\/:reference', bookingReadRateLimiter, bookingPublicReservationController\.get\)/);
assert.match(controller, /BOOKING_OWNER_MISMATCH/);
assert.match(controller, /billingAddress: null/);
assert.match(controller, /expMonth: null/);
assert.match(controller, /publicTravellers/);
assert.doesNotMatch(controller.match(/const publicTravellers[\s\S]*?const publicContact/)?.[0] || '', /passport|date_of_birth|dateOfBirth|nationality|redress|known_traveler/i);
assert.match(publicController, /maskEmail/);
assert.match(publicController, /maskPhone/);
assert.match(search, /findPublicBookingByExactReference/);
assert.match(search, /email: null/);
assert.match(search, /phone: null/);
console.log('Public booking privacy contract: PASS');
