import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(process.cwd(), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const bookingEntry = read('frontend/src/features/bookings/pages/BookingPage.js');
const bookingPage = read('frontend/src/features/bookings/pages/BookingPageV3.js');
const cardEntry = read('frontend/src/features/bookings/components/PaymentCardEntry.js');
const bookingFixesCss = read('frontend/src/features/bookings/pages/BookingPageV3Fixes.css');
const manualRoutes = read('backend/src/modules/secure-payments/secure-payment.routes.mjs');
const routesIndex = read('backend/src/routes/index.mjs');
const migration = read('backend/migrations/121_manual_checkout_billing_metadata.sql');
const frontendEnvExample = read('frontend/.env.example');
const backendEnvExample = read('backend/.env.example');
const rootPackage = read('package.json');
const localDevLauncher = read('scripts/dev.mjs');

test('FareTransit four-step checkout stores billing and masked card metadata without a customer gateway', async t => {
  await t.test('four-step booking entry point is active', () => {
    assert.match(bookingEntry, /BookingPageV3/);
    assert.match(bookingPage, /Traveller Details/);
    assert.match(bookingPage, /Contact & Assistance/);
    assert.match(bookingPage, /Trip Protection/);
    assert.match(bookingPage, /Payment/);
    assert.doesNotMatch(bookingPage, /booking-hero-premium/);
  });

  await t.test('normal full visual card-entry fields are rendered', () => {
    assert.match(cardEntry, /Card Number/);
    assert.match(cardEntry, /Name on Card/);
    assert.match(cardEntry, /CID\/CVV/);
    assert.match(cardEntry, /Expiration Date/);
    assert.match(cardEntry, /passesLuhn/);
    assert.match(cardEntry, /getMaskedMetadata/);
    assert.doesNotMatch(cardEntry, /Collect\.js|secure\.nmi\.com|NMI_TOKENIZATION|startPaymentRequest/i);
  });

  await t.test('card brand is detected immediately and is visible to the passenger', () => {
    assert.match(cardEntry, /\^4.*Visa/);
    assert.match(cardEntry, /\^5.*Mastercard/);
    assert.match(cardEntry, /\^3/);
    assert.match(cardEntry, /American Express/);
    assert.match(cardEntry, /Card type/);
    assert.match(cardEntry, /booking-v3-detected-brand/);
    assert.doesNotMatch(bookingFixesCss, /\.booking-v3-detected-brand\s*\{[^}]*display:\s*none/is);
  });

  await t.test('customer checkout sends only masked metadata in the booking request', () => {
    assert.match(bookingPage, /cardBrand:\s*card\.cardBrand/);
    assert.match(bookingPage, /cardLast4:\s*card\.last4/);
    assert.match(bookingPage, /billingPostalCode:\s*billing\.postalCode/);
    assert.doesNotMatch(bookingPage, /cardNumber\s*:/);
    assert.doesNotMatch(bookingPage, /\bcvv\s*:/i);
    assert.doesNotMatch(cardEntry, /bookingAPI|fetch\(|sessionStorage|localStorage/);
  });

  await t.test('local development starts both services required by Complete Reservation', () => {
    assert.match(rootPackage, /"dev"\s*:\s*"node scripts\/dev\.mjs"/);
    assert.match(localDevLauncher, /--prefix', 'backend', 'run', 'dev'/);
    assert.match(localDevLauncher, /--prefix', 'frontend', 'start'/);
    assert.match(localDevLauncher, /localhost:5001/);
    assert.match(localDevLauncher, /localhost:3000/);
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

  await t.test('third-party gateway configuration is absent from customer checkout', () => {
    assert.doesNotMatch(frontendEnvExample, /NMI|TOKENIZATION_KEY|Collect\.js/i);
    assert.doesNotMatch(backendEnvExample, /NMI_PRIVATE_API_KEY|NMI_API_BASE_URL|NMI_ENVIRONMENT/i);
    assert.doesNotMatch(bookingPage, /Collect\.js|secure\.nmi\.com|paymentToken/i);
    assert.doesNotMatch(routesIndex, /nmi-vault|nmiVault/i);
  });

  await t.test('customer booking remains pending while masked card reference is recorded', () => {
    assert.match(bookingPage, /paymentStatus:\s*'PENDING'/);
    assert.match(bookingPage, /payment_provider:\s*'manual'/);
    assert.match(manualRoutes, /chargeable:\s*false/);
  });
});
