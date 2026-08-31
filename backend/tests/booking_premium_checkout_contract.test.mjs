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
const paymentFixCss = read('frontend/src/features/bookings/pages/BookingPageV3PaymentFixes.css');
const professionalCss = read('frontend/src/features/bookings/pages/BookingPageV3Professional.css');
const addressAutocomplete = read('frontend/src/shared/components/AddressAutocompleteInput.js');
const googleAdsAdapter = read('frontend/src/shared/analytics/googleAds.js');
const bookingPage = read('frontend/src/features/bookings/pages/BookingPageV3.js');
const backButton = read('frontend/src/shared/components/CustomerBackButton.js');
const addonMiddleware = read('backend/src/modules/journey-sessions/checkout-session-booking.middleware.mjs');
const addonPricing = read('backend/src/modules/addons/trip-addon-pricing.service.mjs');

test('FareTransit premium four-step checkout keeps navigation and totals consistent', async (t) => {
  await t.test('payment total always includes the promotional Flex Assist amount', () => {
    assert.match(paymentStep, /FLEX_OFFER_RATE = 0\.085/);
    assert.match(paymentStep, /const flexAssist = tripProtection === true \? promoPrice\(flightFare\) : 0/);
    assert.match(paymentStep, /const total = money\(flightFare \+ flexAssist\)/);
    assert.match(paymentStep, /Complete Secure Booking/);
    assert.match(paymentStep, /pricingSummary\.total\.toFixed\(2\)/);
    assert.match(paymentStep, /Flex Assist promotional price is included in this total/);
  });

  await t.test('Flex Assist displays a genuine regular and offer schedule', () => {
    assert.match(protectionStep, /FLEX_REGULAR_RATE = 0\.11/);
    assert.match(protectionStep, /FLEX_OFFER_RATE = 0\.085/);
    assert.match(protectionStep, /regularFlexAmount/);
    assert.match(protectionStep, /offerFlexAmount/);
    assert.match(protectionStep, /<del>/);
    assert.match(protectionStep, /Offer price/);
    assert.match(professionalCss, /booking-v3-flex-promo-price/);
  });

  await t.test('server rebuilds the same promotional Flex pricing even without a checkout token', () => {
    assert.match(addonMiddleware, /buildRequestFallbackPayload/);
    assert.match(addonMiddleware, /buildAuthoritativeTripAddonQuote\(buildRequestFallbackPayload/);
    assert.match(addonMiddleware, /applyAuthoritativeTripAddonPricing/);
    assert.match(addonMiddleware, /flexAddonService\.persistForBooking/);
    assert.doesNotMatch(addonMiddleware, /if \(!checkoutToken\) return next\(\)/);
    assert.match(addonPricing, /FLEX_REGULAR_RATE = 0\.11/);
    assert.match(addonPricing, /FLEX_OFFER_RATE = 0\.085/);
    assert.match(addonPricing, /regularPrice:\s*regularFlexPrice/);
    assert.match(addonPricing, /offerPrice:\s*offerFlexPrice/);
    assert.match(addonPricing, /addOnTotal:\s*offerFlexPrice/);
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

  await t.test('billing address line one uses autocomplete and fills structured fields', () => {
    assert.match(paymentStep, /AddressAutocompleteInput/);
    assert.match(paymentStep, /onSelectSuggestion=\{applyBillingSuggestion\}/);
    assert.match(paymentStep, /addressLine1:/);
    assert.match(paymentStep, /city:/);
    assert.match(paymentStep, /postalCode:/);
    assert.match(paymentStep, /normalizeUsState/);
    assert.match(paymentStep, /normalizeCountry/);
    assert.match(addressAutocomplete, /requestSequenceRef/);
    assert.match(addressAutocomplete, /AbortController/);
    assert.match(addressAutocomplete, /onSelectSuggestion/);
    assert.match(addressAutocomplete, /Address suggestions are temporarily unavailable/);
  });

  await t.test('card brand feedback is immediate and visually boxed', () => {
    assert.match(cardEntry, /\^4/);
    assert.match(cardEntry, /\^5/);
    assert.match(cardEntry, /\^3/);
    assert.match(cardEntry, /onBrandChange/);
    assert.match(paymentStep, /CARD_BRANDS/);
    assert.match(paymentStep, /detectedBrand === cardBrand\.name/);
    assert.match(paymentStep, /booking-v3-card-brand__logo/);
    assert.match(paymentStep, /booking-v3-card-brand__check/);
    assert.match(paymentFixCss, /booking-v3-card-brand\.is-active/);
    assert.match(paymentFixCss, /grid-template-columns: repeat\(6/);
  });

  await t.test('card number entry is capped at 16 digits and Amex at 15', () => {
    assert.match(cardEntry, /function maxCardDigits/);
    assert.match(cardEntry, /\? 15 : 16/);
    assert.match(cardEntry, /digits\.slice\(0, maxCardDigits\(digits\)\)/);
    assert.match(cardEntry, /maxLength=\{isAmexLength \? 17 : 19\}/);
  });

  await t.test('booking conversion adapter is Promise-safe for checkout catch handling', () => {
    assert.match(bookingPage, /trackGoogleAdsLeadConversion[\s\S]*?\.catch\(\(\) => \{\}\)/);
    assert.match(googleAdsAdapter, /Promise\.resolve\(\)\.then/);
    assert.match(googleAdsAdapter, /trackGoogleAdsLeadConversionSync/);
  });

  await t.test('premium styling is shared across all four steps', () => {
    assert.match(premiumCss, /booking-stepper-v3/);
    assert.match(premiumCss, /booking-v3-passenger/);
    assert.match(premiumCss, /booking-v3-subcard/);
    assert.match(premiumCss, /booking-v3-protection-card/);
    assert.match(premiumCss, /booking-v3-payment-section/);
    assert.match(paymentStep, /BookingPageV3VisualPolish\.css/);
    assert.match(paymentStep, /BookingPageV3PaymentFixes\.css/);
    assert.match(visualCss, /--ft-wine/);
    assert.match(visualCss, /--ft-navy/);
    assert.match(professionalCss, /--ft-professional-font/);
    assert.match(professionalCss, /-apple-system/);
    assert.match(visualCss, /booking-v3-order-summary/);
    assert.match(visualCss, /booking-v3-detected-brand/);
    assert.match(visualCss, /booking-v3-protection-card/);
    assert.match(visualCss, /booking-v3-passenger/);
  });
});
