import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const controller = read('backend/src/modules/admin/admin.demo.controller.mjs');
const routes = read('backend/src/modules/admin/admin.routes.mjs');
const api = read('frontend/src/shared/api/api.js');
const card = read('frontend/src/features/admin/components/AdminDemoWorkflowCard.js');

assert.match(controller, /merchant-test@faretransit\.com/);
assert.match(controller, /crypto\.randomBytes/);
assert.match(controller, /bcrypt\.hash/);
assert.match(controller, /backofficeRepository\.updateStaff/);
assert.match(routes, /demo-workflow\/merchant-credentials/);
assert.match(routes, /authenticate, authorize\(\['admin'\]\)/);
assert.match(api, /resetMerchantTestCredentials/);
assert.match(card, /DEMO-FT-1001/);
assert.match(card, /DEMO-FT-1002/);
assert.match(card, /DEMO-FT-1003/);
assert.match(card, /@example\.com/);
assert.doesNotMatch(card, /Mr8lJD46|aUhhIFDh|password:\s*['"][^'"]{8,}['"]/i);
assert.doesNotMatch(controller, /password\s*=\s*['"][^'"`]*[A-Za-z0-9]{12,}['"]/i);

console.log('admin merchant demo workflow contract: PASS');
