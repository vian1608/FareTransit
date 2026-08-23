import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = relative => fs.existsSync(path.join(root, relative));

const controller = read('backend/src/modules/admin/admin.demo.controller.mjs');
const routes = read('backend/src/modules/admin/admin.routes.mjs');
const service = read('backend/src/modules/backoffice/backoffice.service.mjs');
const permissionMap = read('backend/src/modules/backoffice/backoffice.legacy-admin-map.mjs');
const loginPage = read('frontend/src/features/admin/pages/AdminLoginPage.js');
const dashboard = read('frontend/src/features/admin/pages/AdminDashboardPage.js');

// Keep the restricted passwordless merchant demo available for external review.
assert.match(controller, /merchant-test@faretransit\.com/);
assert.match(controller, /merchantDemoLogin/);
assert.match(controller, /backofficeStaffService\.demoLogin/);
assert.match(routes, /router\.post\('\/demo-login', loginRateLimiter, adminDemoController\.merchantDemoLogin\)/);
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

// The owner dashboard must not expose the old Merchant Test Workflow panel,
// sample booking cards, or temporary password generator.
assert.doesNotMatch(dashboard, /AdminDemoWorkflowCard/);
assert.doesNotMatch(dashboard, /Merchant Test Workflow/);
assert.equal(exists('frontend/src/features/admin/components/AdminDemoWorkflowCard.js'), false);
assert.equal(exists('frontend/src/features/admin/components/AdminDemoWorkflowCard.css'), false);

assert.doesNotMatch(loginPage, /merchant-test@faretransit\.com[\s\S]{0,120}password\s*[:=]\s*['"][^'"]+['"]/i);
assert.doesNotMatch(controller, /password\s*=\s*['"][^'"`]*[A-Za-z0-9]{12,}['"]/i);

console.log('admin merchant demo login + hidden dashboard workflow contract: PASS');
