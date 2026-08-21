import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(process.cwd(), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = relative => fs.existsSync(path.join(root, relative));

const publicRoutes = read('backend/src/modules/secure-payments/secure-payment.routes.mjs');
const adminRoutes = read('backend/src/modules/backoffice/secure-payment-admin.routes.mjs');
const bookingPage = read('frontend/src/features/bookings/pages/BookingPage.js');
const manualFields = read('frontend/src/features/secure-payments/ManualPaymentCardFields.js');
const paymentPage = read('frontend/src/features/secure-payments/SecurePaymentPage.js');
const adminPage = read('frontend/src/features/backoffice/SecurePaymentAdminPages.js');
const migration = read('backend/migrations/119_manual_payment_methods.sql');

const activeRuntime = [publicRoutes, adminRoutes, bookingPage, manualFields, paymentPage, adminPage].join('\n');

test('manual payment storage replaces card-vault runtime without storing sensitive credentials', async t => {
  await t.test('legacy provider runtime files are removed', () => {
    assert.equal(exists('backend/src/modules/secure-payments/vgs-vault.service.mjs'), false);
    assert.equal(exists('backend/src/modules/secure-payments/vgs-mfa.service.mjs'), false);
    assert.equal(exists('frontend/src/features/secure-payments/VgsCheckoutCardFields.js'), false);
  });

  await t.test('active payment runtime contains no VGS integration', () => {
    assert.doesNotMatch(activeRuntime, /\bVGS\b|VeryGoodVault|verygoodvault|VGSCollect|VGSShow/i);
    assert.match(bookingPage, /ManualPaymentCardFields/);
    assert.doesNotMatch(bookingPage, /VgsCheckoutCardFields/);
  });

  await t.test('database schema stores masked metadata only', () => {
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.manual_payment_methods/);
    assert.match(migration, /last4 VARCHAR\(4\)/);
    assert.match(migration, /exp_month INTEGER/);
    assert.match(migration, /exp_year INTEGER/);
    assert.doesNotMatch(migration, /\b(card_number|pan|cvv|cvc|security_code|track_data|pin)\b\s+(TEXT|VARCHAR|CHAR|JSONB)/i);
  });

  await t.test('backend rejects raw card credential fields recursively', () => {
    assert.match(publicRoutes, /SENSITIVE_CARD_DATA_NOT_ACCEPTED/);
    assert.match(publicRoutes, /rejectSensitiveCardPayload/);
    ['cardnumber','card_number','pan','cvv','cvc','securitycode','security_code'].forEach(key => assert.ok(publicRoutes.includes(`'${key}'`), `Missing sensitive-key rejection for ${key}`));
  });

  await t.test('manual checkout stores only brand, last4, expiry and billing metadata', () => {
    assert.match(publicRoutes, /manual_payment_methods/);
    assert.match(publicRoutes, /payment_provider: 'manual'/);
    assert.match(publicRoutes, /tokenization_status: 'MANUAL_METADATA'/);
    assert.match(manualFields, /Last 4 Digits/);
    assert.match(manualFields, /Expiration/);
    assert.doesNotMatch(manualFields, /createAliases|panAlias|cvvAlias|card-number|security-code/);
  });

  await t.test('admin has no full-card reveal or secure-session route', () => {
    assert.doesNotMatch(adminRoutes, /\/reveal|request-otp|verify-otp|access\/end/);
    assert.doesNotMatch(adminPage, /SecureReveal|secureToken|requestOtp|verifyOtp|full card number.*reveal/i);
    assert.match(adminPage, /Chargeable credential/);
    assert.match(adminPage, /NOT STORED/);
  });

  await t.test('public authorization form never asks for full card number or security code', () => {
    assert.match(paymentPage, /Last 4 digits/);
    assert.match(paymentPage, /Card brand/);
    assert.doesNotMatch(paymentPage, /type=['"]card-number|name=['"]card_number|id=['"][^'"]*(cvv|cvc|pan)/i);
  });
});
