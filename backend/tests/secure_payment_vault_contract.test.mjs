import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const migration = read('backend/migrations/107_secure_payment_vault.sql');
const publicRoutes = read('backend/src/modules/secure-payments/secure-payment.routes.mjs');
const adminRoutes = read('backend/src/modules/backoffice/secure-payment-admin.routes.mjs');
const vaultService = read('backend/src/modules/secure-payments/vgs-vault.service.mjs');
const customerPage = read('frontend/src/features/secure-payments/SecurePaymentPage.js');
const adminPages = read('frontend/src/features/backoffice/SecurePaymentAdminPages.js');
const legacyPanel = read('frontend/src/features/admin/components/AdminSecurePaymentPanel.js');
const index = read('frontend/src/index.js');
const envExample = read('backend/.env.example');

assert.match(migration, /CREATE TABLE IF NOT EXISTS payment_contexts/);
assert.match(migration, /'CRUISE','TOUR','ACTIVITY','PACKAGE','INSURANCE'/, 'payment contexts must stay future-product ready');
assert.match(migration, /pan_alias TEXT/);
assert.match(migration, /cvv_alias TEXT/);
assert.doesNotMatch(migration, /\b(card_number|raw_pan|raw_cvv|cvv_plaintext)\s+TEXT\b/i, 'database must never add plaintext PAN/CVV columns');
assert.match(migration, /payments\.secure_card_access/);

assert.match(vaultService, /VGS_CVV_TTL_HOURS/);
assert.match(vaultService, /VGS_CVV_TTL_CONFIRMED/);
assert.match(vaultService, /aliases\/\$\{encodeURIComponent\(alias\)\}\?storage=VOLATILE/);
assert.match(vaultService, /vgs-collect\/3\.3\.0/);
assert.match(vaultService, /vgs-show\/2\.2\.2/);

assert.match(publicRoutes, /collect-config/);
assert.match(publicRoutes, /VGS_CVV_TTL_NOT_CONFIRMED/);
assert.match(publicRoutes, /cvv_alias: String\(body\.cvvAlias\)/);
assert.doesNotMatch(publicRoutes, /body\.(cardNumber|pan|cvv)\b/, 'public API must accept aliases, not raw card credential fields');

assert.match(adminRoutes, /access\/request-otp/);
assert.match(adminRoutes, /access\/verify-otp/);
assert.match(adminRoutes, /X-TFS-Secure-Session|x-tfs-secure-session/);
assert.match(adminRoutes, /payments\.secure_card_access/);
assert.match(adminRoutes, /deleteVgsVolatileAlias/);
assert.match(adminRoutes, /SUPPLIER_TRANSACTION_AUTHORIZED/);
assert.match(adminRoutes, /CVV_CONSUMED/);

assert.match(customerPage, /VGSCollect\.create/);
assert.match(customerPage, /type: 'card-security-code'/);
assert.match(customerPage, /storage: 'VOLATILE'/);
assert.match(customerPage, /createAliases\(\{ access_token:/);
assert.match(customerPage, /recollectionOnly/);
assert.match(customerPage, /cardState\.last4/);
assert.doesNotMatch(customerPage, /setState\([^\n]*(cardNumber|cvv)/i, 'raw card credentials must not be placed in React state');

assert.match(adminPages, /Access Secure Card with OTP/);
assert.match(adminPages, /VGSShow\.create/);
assert.match(adminPages, /jsonPathSelector: 'json\.value'/);
assert.match(adminPages, /supplier-charges/);
assert.match(legacyPanel, /Create Secure Authorization/);
assert.match(legacyPanel, /entityType: 'FLIGHT'/);
assert.match(index, /secure-payment/);

assert.match(envExample, /VGS_CVV_TTL_HOURS=24/);
assert.match(envExample, /VGS_CVV_TTL_CONFIRMED=false/);
assert.doesNotMatch(read('frontend/src/index.js') + customerPage + adminPages + legacyPanel, /VGS_CLIENT_SECRET|VGS_CLIENT_ID/, 'VGS service credentials must remain server-side');

console.log('secure payment vault contract: PASS');
