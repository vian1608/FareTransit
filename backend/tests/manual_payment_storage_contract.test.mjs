import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(process.cwd(), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const bookingEntry = read('frontend/src/features/bookings/pages/BookingPage.js');
const bookingPage = read('frontend/src/features/bookings/pages/BookingPageV2.js');
const nmiFields = read('frontend/src/features/secure-payments/ManualPaymentCardFields.js');
const nmiRoutes = read('backend/src/modules/secure-payments/nmi-vault.routes.mjs');
const routesIndex = read('backend/src/routes/index.mjs');
const migration = read('backend/migrations/121_nmi_customer_vault_checkout.sql');

test('NMI Customer Vault checkout stores a chargeable reference without raw card credentials', async t => {
  await t.test('three-step booking entry point is active', () => {
    assert.match(bookingEntry, /BookingPageV2/);
    assert.match(bookingPage, /Traveller Details/);
    assert.match(bookingPage, /Contact & Assistance/);
    assert.match(bookingPage, /Secure Checkout/);
    assert.doesNotMatch(bookingPage, /booking-hero-premium/);
  });

  await t.test('browser card fields are NMI-hosted and collect full card data outside React state', () => {
    assert.match(nmiFields, /https:\/\/secure\.nmi\.com\/token\/Collect\.js/);
    assert.match(nmiFields, /faretransit-nmi-ccnumber/);
    assert.match(nmiFields, /faretransit-nmi-ccexp/);
    assert.match(nmiFields, /faretransit-nmi-cvv/);
    assert.match(nmiFields, /startPaymentRequest/);
    assert.match(nmiFields, /paymentToken: tokenized\.token/);
    assert.match(nmiFields, /useState\(\{ ccnumber: false, ccexp: false, cvv: false \}\)/);
    assert.doesNotMatch(nmiFields, /\[(?:cardNumber|cvv|cvc|securityCode)\s*,\s*set(?:CardNumber|Cvv|Cvc|SecurityCode)\]\s*=\s*useState/i);
    assert.doesNotMatch(nmiFields, /value=\{[^}]*?(?:cardNumber|securityCode|\bcvv\b|\bcvc\b)[^}]*\}/i);
  });

  await t.test('checkout saves to NMI Customer Vault without authorization, capture or sale', () => {
    assert.match(nmiRoutes, /\/customers/);
    assert.match(nmiRoutes, /payment_details:\s*\{\s*payment_token:\s*token\s*\}/);
    assert.match(nmiRoutes, /authorizationPerformed:\s*false/);
    assert.match(nmiRoutes, /capturePerformed:\s*false/);
    assert.doesNotMatch(nmiRoutes, /payments\/sale|payments\/capture|payments\/authorize/i);
    assert.match(routesIndex, /secure-payments\/nmi-vault/);
  });

  await t.test('Supabase stores only provider references and masked metadata', () => {
    assert.match(nmiRoutes, /payment_provider:\s*'nmi'/);
    assert.match(nmiRoutes, /provider_customer_id/);
    assert.match(nmiRoutes, /provider_payment_method_id/);
    assert.match(nmiRoutes, /card_last4/);
    assert.match(nmiRoutes, /tokenization_status:\s*'TOKENIZED'/);
    assert.match(migration, /DROP COLUMN IF EXISTS card_cvv/);
    assert.doesNotMatch(migration, /ADD COLUMN[^;]*(card_number|full_card_number|\bcvv\b|\bcvc\b|security_code)/i);
  });

  await t.test('backend recursively rejects raw sensitive credential keys', () => {
    assert.match(nmiRoutes, /SENSITIVE_CARD_DATA_NOT_ACCEPTED/);
    assert.match(nmiRoutes, /rejectRawCardData/);
    ['cardnumber', 'card_number', 'pan', 'cvv', 'cvc', 'securitycode', 'security_code'].forEach((key) => {
      assert.ok(nmiRoutes.includes(`'${key}'`), `Missing sensitive-key rejection for ${key}`);
    });
  });

  await t.test('booking is pending and checkout copy explicitly says no charge now', () => {
    assert.match(bookingPage, /paymentStatus:\s*'PENDING'/);
    assert.match(bookingPage, /payment_provider:\s*'nmi'/);
    assert.match(bookingPage, /No charge will be made at this time/);
    assert.match(bookingPage, /No authorization, capture, or sale is submitted/);
  });
});
