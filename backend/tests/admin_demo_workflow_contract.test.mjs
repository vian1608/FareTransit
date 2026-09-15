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
const backofficeRoutes = read('backend/src/modules/backoffice/backoffice.routes.mjs');
const composeRoutes = read('backend/src/modules/backoffice/car-authorization-compose.routes.mjs');
const composeService = read('backend/src/modules/reservations/car-authorization-compose.service.mjs');
const emailService = read('backend/src/modules/reservations/car-authorization-email.service.mjs');
const carWorkspaceEnhanced = read('frontend/src/features/backoffice/CarReservationWorkspaceEnhanced.js');
const carComposerCss = read('frontend/src/features/backoffice/CarAuthorizationComposer.css');
const carRouter = read('frontend/src/features/backoffice/BackOfficeRouter.js');

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
assert.match(loginPage, /window\.location\.assign\('\/admin\/bookings\?type=flight'\)/);
assert.match(loginPage, /No password required/);

// The owner dashboard must not expose the old Merchant Test Workflow panel,
// sample booking cards, or temporary password generator.
assert.doesNotMatch(dashboard, /AdminDemoWorkflowCard/);
assert.doesNotMatch(dashboard, /Merchant Test Workflow/);
assert.equal(exists('frontend/src/features/admin/components/AdminDemoWorkflowCard.js'), false);
assert.equal(exists('frontend/src/features/admin/components/AdminDemoWorkflowCard.css'), false);
assert.doesNotMatch(loginPage, /merchant-test@faretransit\.com[\s\S]{0,120}password\s*[:=]\s*['"][^'"]+['"]/i);
assert.doesNotMatch(controller, /password\s*=\s*['"][^'"`]*[A-Za-z0-9]{12,}['"]/i);

// Car authorization is one deliberate compose workflow instead of six competing
// footer actions. Draft email text is editable/persisted before the canonical send.
assert.match(backofficeRoutes, /carAuthorizationComposeRouter/);
assert.match(composeRoutes, /authorization\/compose/);
assert.match(composeRoutes, /authorization\/email-draft/);
assert.match(composeRoutes, /authorization\/send/);
assert.match(composeService, /service_snapshot/);
assert.match(composeService, /emailDraft/);
assert.match(composeService, /sendAuthorizationWithEmailDraft/);
assert.match(composeService, /createAuthorizationRevision/);
assert.match(composeService, /status !== 'DRAFT'/);
assert.match(emailService, /buildCarAuthorizationEmail/);
assert.match(emailService, /subject, message/);
assert.match(carWorkspaceEnhanced, /Preview & Send Authorization/);
assert.match(carWorkspaceEnhanced, /Save Email Draft/);
assert.match(carWorkspaceEnhanced, /Send Authorization/);
assert.match(carWorkspaceEnhanced, /Passenger authorization preview/);
assert.match(carWorkspaceEnhanced, /Review & Authorize button/i);
assert.match(carWorkspaceEnhanced, /secure link and expiry notice/i);
assert.match(carComposerCss, /carws-sticky-actions \.bo-button:not\(:first-child\)/);
assert.match(carRouter, /CarReservationWorkspaceEnhanced/);

console.log('admin merchant demo + streamlined car authorization workflow contract: PASS');
