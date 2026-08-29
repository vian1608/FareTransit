import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(process.cwd(), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const bookingEntry = read('frontend/src/features/bookings/pages/BookingPage.js');
const bookingPage = read('frontend/src/features/bookings/pages/BookingPageV2.js');
const manualFields = read('frontend/src/features/secure-payments/ManualPaymentCardFields.js');
const manualRoutes = read('backend/src/modules/secure-payments/secure-payment.routes.mjs');
const routesIndex = read('backend/src/routes/index.mjs');
const migration = read('backend/migrations/121_manual_checkout_billing_metadata.sql');
const frontendEnvExample = read('frontend/.env.example');
const backendEnvExample = read('backend/.env.example');

test('FareTransit manual checkout stores billing and masked card metadata without a customer gateway', async t => {
  await t.test('three-step booking entry point is active', () => {
    assert.match(bookingEntry, /BookingPageV2/);
    assert.match(bookingPage, /Traveller Details/);
    assert.match(bookingPage, /Contact & Assistance/);
    assert.match(bookingPage, /Secure Checkout/);
    assert.doesNotMatch(bookingPage, /booking-hero-premium/);
  });

  await t.test('ordinary FareTransit card reference fields are rendered', () => {
    assert.match(manualFields, /Card Brand/);
    assert.match(manualFields, /Card Number \(Last 4 Digits\)/);
    assert.match(manualFields, /Expiration Month/);
    assert.match(manualFields, /Expiration Year/);
    assert.doesNotMatch(manualFields, /Collect\.js|secure\.nmi\.com|NMI_TOKENIZATION|startPaymentRequest/i);
  });

  await t.test('customer checkout uses only the internal manual attach route', () => {
    assert.match(manualFields, /\/secure-payments\/checkout\/attach/);
    assert.match(manualRoutes, /router\.post\('\/checkout\/attach'/);
    assert.match(manualRoutes, /payment_provider:\s*'manual'/);
    assert.match(manualRoutes, /tokenization_status:\s*'MANUAL_METADATA'/);
    assert.doesNotMatch(routesIndex, /nmi-vault|nmiVault/i);
  });

  await t.test('Supabase persistence is masked metadata plus billing details only', () => {
    assert.match(manualRoutes, /card_last4/);
    assert.match(manualRoutes, /card_exp_month/);
    assert.match(manualRoutes, /card_exp_year/);
    assert.match(manualRoutes, /billing_address_line1/);
    assert.match(manualRoutes, /billing_city/);
    assert.match(manualRoutes, /billing_state/);
    assert.match(manualRoutes, /billing_postal_code/);
    assert.match(manualRoutes, /billing_country/);
    assert.match(migration, /DROP COLUMN IF EXISTS card_cvv/);
    assert.doesNotMatch(migration, /ADD COLUMN[^;]*(card_number|full_card_number|\bcvv\b|\bcvc\b|security_code)/i);
  });

  await t.test('backend rejects raw PAN and card security-code payloads', () => {
    assert.match(manualRoutes, /SENSITIVE_CARD_DATA_NOT_ACCEPTED/);
    assert.match(manualRoutes, /rejectSensitiveCardPayload/);
    ['cardnumber', 'card_number', 'pan', 'cvv', 'cvc', 'securitycode', 'security_code'].forEach((key) => {
      assert.ok(manualRoutes.includes(`'${key}'`), `Missing sensitive-key rejection for ${key}`);
    });
  });

  await t.test('NMI configuration and runtime references are absent from checkout configuration', () => {
    assert.doesNotMatch(frontendEnvExample, /NMI|TOKENIZATION_KEY|Collect\.js/i);
    assert.doesNotMatch(backendEnvExample, /NMI_PRIVATE_API_KEY|NMI_API_BASE_URL|NMI_ENVIRONMENT/i);
    assert.doesNotMatch(manualFields, /\bnmi\b/i);
  });

  await t.test('customer booking remains pending while manual card reference is recorded', () => {
    assert.match(bookingPage, /paymentStatus:\s*'PENDING'/);
    assert.match(manualRoutes, /status:\s*'CARD_SUBMITTED'/);
    assert.match(manualRoutes, /chargeable:\s*false/);
  });
});
