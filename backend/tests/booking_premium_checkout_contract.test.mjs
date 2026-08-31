import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(process.cwd(), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const paymentStep = read('frontend/src/features/bookings/steps/PaymentBillingStep.js');
const contactStep = read('frontend/src/features/bookings/steps/ContactAssistanceStep.js');
const protectionStep = read('frontend/src/features/bookings/steps/TripProtectionStep.js');
const cardEntry = read('frontend/src/features/bookings/components/PaymentCardEntry.js');
const premiumCss = read('frontend/src/features/bookings/pages/BookingPageV3Premium.css');
const visualCss = read('frontend/src/features/bookings/pages/BookingPageV3VisualPolish.css');
const backButton = read('frontend/src/shared/components/CustomerBackButton.js');
const addonMiddleware = read('backend/src/modules/journey-sessions/checkout-session-booking.middleware.mjs');

test('FareTransit premium four-step checkout keeps navigation and totals consistent', async (t) => {
  await t.test('payment total always includes selected Flex Assist', () => {
    assert.match(paymentStep, /const flexAssist = tripProtection === true \? money\(flexAmount\) : 0/);
    assert.match(paymentStep, /const total = money\(flightFare \+ flexAssist\)/);
    assert.match(paymentStep, /Complete Secure Booking/);
    assert.match(paymentStep, /pricingSummary\.total\.toFixed\(2\)/);
    assert.match(paymentStep, /Flex Assist is included in this total/);
  });

  await t.test('server rebuilds Flex pricing even without a checkout token', () => {
    assert.match(addonMiddleware, /buildRequestFallbackPayload/);
    assert.match(addonMiddleware, /buildAuthoritativeTripAddonQuote\(buildRequestFallbackPayload/);
    assert.match(addonMiddleware, /applyAuthoritativeTripAddonPricing/);
    assert.match(addonMiddleware, /flexAddonService\.persistForBooking/);
    assert.doesNotMatch(addonMiddleware, /if \(!checkoutToken\) return next\(\)/);
  });

  await t.test('only the shared top booking back control remains', () => {
    assert.match(backButton, /document\.querySelector\('\.booking-v3-shell'\)/);
    assert.doesNotMatch(contactStep, /booking-v3-icon-back/);
    assert.doesNotMatch(protectionStep, /booking-v3-icon-back/);
    assert.doesNotMatch(paymentStep, /booking-v3-icon-back/);
  });

  await t.test('payment uses a modern split layout and sticky summary', () => {
    assert.match(paymentStep, /booking-v3-payment-layout/);
    assert.match(paymentStep, /booking-v3-order-summary/);
    assert.match(paymentStep, /booking-v3-premium-surface/);
    assert.match(premiumCss, /grid-template-columns: minmax\(0, 1fr\) 330px/);
    assert.match(premiumCss, /position: sticky/);
  });

  await t.test('card brand feedback is immediate and visible', () => {
    assert.match(cardEntry, /\^4/);
    assert.match(cardEntry, /\^5/);
    assert.match(cardEntry, /\^3/);
    assert.match(cardEntry, /onBrandChange/);
    assert.match(paymentStep, /brandClass\('Visa'\)/);
    assert.match(paymentStep, /brandClass\('Mastercard'\)/);
    assert.match(paymentStep, /brandClass\('American Express'\)/);
  });

  await t.test('card number entry is capped at 16 digits and Amex at 15', () => {
    assert.match(cardEntry, /function maxCardDigits/);
    assert.match(cardEntry, /\? 15 : 16/);
    assert.match(cardEntry, /digits\.slice\(0, maxCardDigits\(digits\)\)/);
    assert.match(cardEntry, /maxLength=\{isAmexLength \? 17 : 19\}/);
  });

  await t.test('premium styling is shared across all four steps', () => {
    assert.match(premiumCss, /booking-stepper-v3/);
    assert.match(premiumCss, /booking-v3-passenger/);
    assert.match(premiumCss, /booking-v3-subcard/);
    assert.match(premiumCss, /booking-v3-protection-card/);
    assert.match(premiumCss, /booking-v3-payment-section/);
    assert.match(paymentStep, /BookingPageV3VisualPolish\.css/);
    assert.match(visualCss, /--ft-wine/);
    assert.match(visualCss, /--ft-navy/);
    assert.match(visualCss, /booking-v3-order-summary/);
    assert.match(visualCss, /booking-v3-detected-brand/);
    assert.match(visualCss, /booking-v3-protection-card/);
    assert.match(visualCss, /booking-v3-passenger/);
  });
});