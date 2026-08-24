import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildAuthoritativeTripAddonQuote,
  applyAuthoritativeTripAddonPricing,
} from '../src/modules/addons/trip-addon-pricing.service.mjs';

const checkout = {
  searchParams: { adults: 2, children: 0, infants: 0 },
  selectedFlight: { price: { finalPrice: 300 } },
  returnFlight: { price: { finalPrice: 200 } },
  addons: {
    flexAssist: { selected: true, rate: 0.01, price: 1 },
    baggage: [
      { travelerIndex: 0, direction: 'OUTBOUND', quantity: 9, unitPrice: 999 },
      { travelerIndex: 1, direction: 'RETURN', quantity: 2, unitPrice: 999 },
    ],
  },
};

const quote = buildAuthoritativeTripAddonQuote(checkout);
assert.equal(quote.ticketBase, 1000, 'ticket base must be canonical party selling price');
assert.equal(quote.flexAssist.rate, 0.10, 'browser cannot override Flex rate');
assert.equal(quote.flexAssist.price, 100, 'Flex must be exactly 10% of pre-voucher ticket base');
assert.equal(quote.flexAssist.termsVersion, 'FLEX_V1');
assert.equal(quote.addOnTotal, 100, 'request-only baggage cannot enter airfare add-on total');
assert.equal(quote.baggage[0].quantity, 3, 'baggage must be capped at three per traveler/direction');
assert.equal(quote.baggage[0].unitPrice, 0, 'browser baggage price must be ignored');
assert.equal(quote.baggage[0].totalPrice, 0);
assert.equal(quote.baggage[0].termsVersion, 'BAGGAGE_REQUEST_V1');

const priced = applyAuthoritativeTripAddonPricing({ customer_price: 1, voucher_discount: 50, minimum_payable_floor: 0 }, quote);
assert.equal(priced.ticket_component_total, 950, 'voucher applies to ticket component');
assert.equal(priced.flex_assist_fee, 100, 'voucher must not discount Flex');
assert.equal(priced.customer_price, 1050, 'final total = discounted ticket + Flex only');
assert.equal(priced.price_before_voucher, 1100);

const noFlex = buildAuthoritativeTripAddonQuote({
  searchParams: { adults: 1 },
  selectedFlight: { price: { finalPrice: 400 } },
  addons: { flexAssist: { selected: false, price: 999 } },
});
assert.equal(noFlex.flexAssist.price, 0);
assert.equal(noFlex.addOnTotal, 0);

function source(relativePath) {
  return fs.readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

const ui = source('../../frontend/src/features/bookings/addons/installTripAddonsUX.js');
assert.match(ui, /faretransit:trip-addons:/, 'checkout state must be scoped to checkout token');
assert.match(ui, /Customize Your Trip/, 'checkout must have a dedicated trip-customization stage');
assert.match(ui, /MAX_BAGS = 3/, 'frontend max baggage must match server/database contract');
assert.match(ui, /not travel insurance/i);
assert.match(ui, /paid separately/i);
assert.match(ui, /Request a Change/, 'My Bookings must expose Flex change requests');

const terms = source('../../frontend/src/shared/pages/TermsAndConditionsPage.js');
assert.match(terms, /Flex Assist is not travel insurance/i);
assert.match(terms, /Payment receipt does not itself mean baggage is confirmed/i);

const middleware = source('../src/modules/journey-sessions/checkout-session-booking.middleware.mjs');
assert.match(middleware, /buildAuthoritativeTripAddonQuote/);
assert.match(middleware, /applyAuthoritativeTripAddonPricing/);
assert.match(middleware, /journeySessionService\.getCheckout/);

const evidence = source('../src/modules/addons/trip-addon-evidence-hardening.mjs');
assert.match(evidence, /flexTermsVersion/);
assert.match(evidence, /baggageDueNow: 0/);
assert.match(evidence, /price_breakdown/);

const migration = source('../migrations/20260824_flex_assist_trip_customization.sql');
assert.match(migration, /quantity between 1 and 3/i);
assert.match(migration, /create table if not exists public\.flex_change_requests/i);
assert.match(migration, /idx_flex_change_requests_booking_addon/i);
assert.match(migration, /revoke all .* anon, authenticated/is);

console.log('FareTransit trip add-ons parity contract: PASS');
