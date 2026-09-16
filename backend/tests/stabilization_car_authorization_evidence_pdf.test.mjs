import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(process.cwd(), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const evidenceService = read('backend/src/modules/reservations/car-authorization-evidence.service.mjs');
const routes = read('backend/src/modules/backoffice/car-authorization-compose.routes.mjs');
const api = read('frontend/src/features/backoffice/backofficeApi.js');
const workspace = read('frontend/src/features/backoffice/CarReservationWorkspaceEnhanced.js');

test('authorized car reservations expose an admin evidence PDF', async t => {
  await t.test('PDF is generated only from an accepted authorization snapshot', () => {
    assert.match(evidenceService, /\.eq\('status', 'AUTHORIZED'\)/);
    assert.match(evidenceService, /evidence_payload/);
    assert.match(evidenceService, /Evidence SHA-256/);
    assert.match(evidenceService, /I AUTHORIZE TO PAY/);
    assert.match(evidenceService, /authorized_ip/);
    assert.match(evidenceService, /authorized_user_agent/);
    assert.match(evidenceService, /card_last4/);
    assert.doesNotMatch(evidenceService, /card_number|cvv|cvc/i);
  });

  await t.test('admin-only route streams the PDF with no-store caching', () => {
    assert.match(routes, /authorization\/evidence\.pdf/);
    assert.match(routes, /requirePermission\('bookings\.cars\.view'\)/);
    assert.match(routes, /Content-Type', 'application\/pdf'/);
    assert.match(routes, /Cache-Control', 'private, no-store, max-age=0'/);
    assert.match(routes, /car_authorization\.evidence_viewed/);
  });

  await t.test('frontend can fetch a protected binary artifact and open View Authorization', () => {
    assert.match(api, /backofficeBlobFetch/);
    assert.match(api, /Authorization: `Bearer \$\{token\}`/);
    assert.match(workspace, /View Authorization/);
    assert.match(workspace, /authorization\/evidence\.pdf/);
    assert.match(workspace, /URL\.createObjectURL/);
  });
});
