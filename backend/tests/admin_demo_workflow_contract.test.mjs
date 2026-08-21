import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const controller = read('backend/src/modules/admin/admin.demo.controller.mjs');
const routes = read('backend/src/modules/admin/admin.routes.mjs');
const service = read('backend/src/modules/backoffice/backoffice.service.mjs');
const permissionMap = read('backend/src/modules/backoffice/backoffice.legacy-admin-map.mjs');
const loginPage = read('frontend/src/features/admin/pages/AdminLoginPage.js');
const card = read('frontend/src/features/admin/components/AdminDemoWorkflowCard.js');

assert.match(controller, /merchant-test@faretransit\.com/);
assert.match(controller, /merchantDemoLogin/);
assert.match(controller, /backofficeStaffService\.demoLogin/);
assert.match(controller, /crypto\.randomBytes/);
assert.match(controller, /bcrypt\.hash/);
assert.match(controller, /backofficeRepository\.updateStaff/);
assert.match(routes, /router\.post\('\/demo-login', loginRateLimiter, adminDemoController\.merchantDemoLogin\)/);
assert.match(routes, /demo-workflow\/merchant-credentials/);
assert.match(routes, /authenticate, authorize\(\['admin'\]\)/);

assert.match(service, /MERCHANT_DEMO_GRANTS/);
assert.match(service, /bookings\.flights\.view', scope: 'OWN'/);
assert.match(service, /demoMode: true/);
assert.match(service, /expiresIn: '1h'/);
assert.doesNotMatch(service, /bookings\.flights\.(?:edit|create|cancel)/);
assert.doesNotMatch(service, /authorization\.send|payments\.request|ticketing\.send|ticketing\.update/);

assert.match(permissionMap, /email-preview/);
assert.match(permissionMap, /return 'bookings\.flights\.view'/);

assert.match(loginPage, /Open Merchant Test Demo/);
assert.match(loginPage, /fetch\('\/api\/admin\/demo-login'/);
assert.match(loginPage, /window\.location\.assign\('\/admin\/bookings\/flights'\)/);
assert.match(loginPage, /No password required/);
assert.doesNotMatch(loginPage, /merchant-test@faretransit\.com[\s\S]{0,120}password\s*[:=]\s*['"][^'"]+['"]/i);

assert.match(card, /DEMO-FT-1001/);
assert.match(card, /DEMO-FT-1002/);
assert.match(card, /DEMO-FT-1003/);
assert.match(card, /@example\.com/);
assert.doesNotMatch(card, /Mr8lJD46|aUhhIFDh|password:\s*['"][^'"]{8,}['"]/i);
assert.doesNotMatch(controller, /password\s*=\s*['"][^'"`]*[A-Za-z0-9]{12,}['"]/i);

console.log('admin merchant demo workflow contract: PASS');
