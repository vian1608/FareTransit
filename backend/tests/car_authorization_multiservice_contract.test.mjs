import assert from 'node:assert/strict';
import fs from 'node:fs';

const service = fs.readFileSync(new URL('../src/modules/reservations/reservation.service.mjs', import.meta.url), 'utf8');
const routes = fs.readFileSync(new URL('../src/modules/reservations/reservation.routes.mjs', import.meta.url), 'utf8');
const email = fs.readFileSync(new URL('../src/modules/reservations/car-authorization-email.service.mjs', import.meta.url), 'utf8');
const publicPage = fs.readFileSync(new URL('../../frontend/public/car-authorization.html', import.meta.url), 'utf8');
const carService = fs.readFileSync(new URL('../src/modules/cars/car.service.mjs', import.meta.url), 'utf8');

assert.match(service, /ABCDEFGHJKLMNPQRSTUVWXYZ23456789/);
assert.match(service, /`C\$\{suffix\}`/);
assert.match(service, /AUTHORIZATION_TOTAL_MISMATCH/);
assert.match(service, /PAY_AT_COUNTER/);
assert.match(service, /evidence_payload/);
assert.match(service, /actionLabel: 'I AUTHORIZE TO PAY'/);
assert.match(routes, /adminRouter\.use\(authenticate, authorize\(\['admin'\]\)\)/);
assert.match(email, /FareTransit <support@faretransit\.com>/);
assert.match(publicPage, />I AUTHORIZE TO PAY</);
assert.doesNotMatch(publicPage, /type=["']checkbox["']/i);
assert.doesNotMatch(publicPage, /supplier_cost|estimated_margin|service fee/i);
assert.doesNotMatch(carService, /createAuthorizationToken|saveAuthorizationDraft|authorizations.*insert/i, 'Car search/service must not generate authorizations automatically.');
console.log('car_authorization_multiservice_contract: PASS');
