import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(process.cwd(), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const app = read('frontend/src/app/App.js');
const index = read('frontend/src/index.js');
const adminLogin = read('frontend/src/features/admin/pages/AdminLoginPage.js');
const boRouter = read('frontend/src/features/backoffice/BackOfficeRouter.js');
const boShell = read('frontend/src/features/backoffice/BackOfficeShell.js');
const authorize = read('backend/src/middleware/authorize.mjs');
const boMiddleware = read('backend/src/modules/backoffice/backoffice.middleware.mjs');
const boRepository = read('backend/src/modules/backoffice/backoffice.repository.mjs');
const boRoutes = read('backend/src/modules/backoffice/backoffice.routes.mjs');
const adminReporting = read('backend/src/modules/backoffice/admin-reporting.routes.mjs');
const rootRoutes = read('backend/src/routes/index.mjs');
const rbacMigration = read('backend/migrations/100_backoffice_rbac_foundation.sql');
const bridgeMigration = read('backend/migrations/102_crm_flight_bridge.sql');
const financeMigration = read('backend/migrations/105_finance_suppliers_payments.sql');

const additiveMigrations = [
  'backend/migrations/100_backoffice_rbac_foundation.sql',
  'backend/migrations/101_backoffice_crm.sql',
  'backend/migrations/102_crm_flight_bridge.sql',
  'backend/migrations/103_trips_and_hotels.sql',
  'backend/migrations/104_backoffice_car_bookings.sql',
  'backend/migrations/105_finance_suppliers_payments.sql'
].map(read).join('\n');

test('back-office expansion preserves the stable flight admin and enforces RBAC', async t => {
  await t.test('legacy admin URLs remain in the original App route table', () => {
    ['/admin/login','/admin/dashboard','/admin/vouchers','/admin/bookings/new','/admin/bookings/:code'].forEach(route => assert.ok(app.includes(`path="${route}"`), `Missing preserved route: ${route}`));
    assert.ok(index.includes("bookings\\/(?:flights|hotels|cars)"), 'Only product-specific new booking paths should be intercepted by the additive back-office router.');
    assert.ok(!index.includes("bookings\\/(?:new)"), 'Existing create-booking route must stay in the stable App router.');
  });

  await t.test('new flight alias reuses the existing booking detail implementation', () => {
    // BackOfficeRouter is mounted while the browser location still contains
    // /admin, so absolute /admin/... route paths are required to avoid the
    // wildcard redirect loop that relative paths caused in production.
    assert.match(boRouter, /path="(?:\/admin\/)?bookings\/flights\/:code"[\s\S]*?<AdminDashboard \/>/, 'New flight route must reuse AdminDashboard booking detail.');
    assert.doesNotMatch(boRouter, /FlightEditor|NewFlightEditor/, 'Back office must not introduce a duplicate flight editor.');
  });

  await t.test('roles, granular permissions and OWN TEAM ALL scopes are database-backed', () => {
    ['owner','sales_manager','sales_agent','operations_agent','finance_agent'].forEach(role => assert.ok(rbacMigration.includes(`'${role}'`), `Missing role ${role}`));
    ['crm.leads.view','bookings.flights.edit','authorization.send','payments.refund_large','admin.integrations'].forEach(permission => assert.ok(rbacMigration.includes(`'${permission}'`), `Missing permission ${permission}`));
    ['OWN','TEAM','ALL'].forEach(scope => assert.ok(rbacMigration.includes(`'${scope}'`), `Missing data scope ${scope}`));
    assert.match(boMiddleware, /requirePermission/);
    assert.match(boMiddleware, /applyScope/);
    assert.match(authorize, /bookingInScope/, 'Existing flight admin API access by staff must also enforce record scope.');
  });

  await t.test('UUID booking identifiers and confirmation codes are both safely scope-checked', () => {
    assert.match(boRepository, /UUID_RE/);
    assert.match(boRepository, /UUID_RE\.test\(String\(identifier/);
    assert.match(boRepository, /q\.eq\('id', identifier\)/);
    assert.match(boRepository, /q\.eq\('confirmation_code', identifier\)/);
  });

  await t.test('all new database changes are additive and old booking links are nullable', () => {
    assert.doesNotMatch(additiveMigrations, /DROP\s+(TABLE|COLUMN)\b/i, 'Back-office migrations must not drop production tables or columns.');
    assert.match(bridgeMigration, /ADD COLUMN IF NOT EXISTS lead_id UUID NULL/);
    assert.match(bridgeMigration, /ADD COLUMN IF NOT EXISTS assigned_agent_id UUID NULL/);
    assert.match(bridgeMigration, /ADD COLUMN IF NOT EXISTS trip_id UUID NULL/);
  });

  await t.test('staff share the existing login but do not land on the legacy owner dashboard', () => {
    assert.match(adminLogin, /isStaffProfile/);
    assert.match(adminLogin, /navigate\(isStaffProfile \? '\/admin\/backoffice' : '\/admin\/dashboard'\)/);
    assert.match(boShell, /hasPermission\(permission\)/, 'Sidebar visibility must be permission-aware.');
  });

  await t.test('backend independently protects sensitive settings and team administration', () => {
    assert.match(adminReporting, /settings\/integrations', requirePermission\('admin\.integrations'\)/);
    assert.match(adminReporting, /settings\/audit-logs', requirePermission\('admin\.audit_logs'\)/);
    assert.match(adminReporting, /team\/users\/:id',requirePermission\('team\.manage'\)/);
    assert.match(adminReporting, /SELF_PERMISSION_CHANGE_BLOCKED/);
    assert.match(adminReporting, /OWNER_ROLE_PROTECTED/);
    assert.match(boRoutes, /loadBackOfficeProfile/);
  });

  await t.test('supplier and finance schema does not store credentials or raw payment-card secrets', () => {
    assert.doesNotMatch(financeMigration, /\b(password|password_hash|api_key|api_secret|access_token|refresh_token)\b\s+(TEXT|VARCHAR|JSONB)/i);
    assert.doesNotMatch(financeMigration, /\b(card_number|pan|cvv|cvc|security_code)\b\s+(TEXT|VARCHAR|CHAR|JSONB)/i);
    assert.match(financeMigration, /refund_large_threshold/);
    assert.match(adminReporting, /payment_details:'masked\/server-side only'/);
  });

  await t.test('public car routes remain mounted separately from internal car operations', () => {
    assert.match(app, /path="\/car-rentals"/);
    assert.match(rootRoutes, /router\.use\('\/cars', carRouter\)/);
    assert.match(boRoutes, /carsBackofficeRouter/);
  });
});
