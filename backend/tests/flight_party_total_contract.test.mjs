import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const provider = read('backend/src/integrations/serpapi/serpapi.service.mjs');
const controller = read('backend/src/modules/flights/flight.controller.mjs');
const pricing = read('backend/src/shared/utils/pricing.helper.mjs');
const resultRow = read('frontend/src/features/flights/components/FlightResultRow.js');
const returnPage = read('frontend/src/features/flights/pages/ReturnFlightSelectionPage.js');
const bookingContract = read('frontend/src/shared/pricing/bookingPriceContract.js');
const itineraryNormalizer = read('frontend/src/shared/utils/itineraryNormalizer.js');
const bookingPage = read('frontend/src/features/bookings/pages/BookingPage.js');

// Supplier prices are explicitly typed as whole-party totals so downstream code
// never has to guess whether a number is per traveler or for the whole search.
assert.match(provider, /priceScope:\s*'party_total'/);
assert.match(provider, /passengerCount/);
assert.match(provider, /tripScope/);
assert.match(provider, /selectionStage/);

// A round trip must continue through the provider's departure token. The old
// independent one-way return search caused a complete round-trip quote to be
// combined with an unrelated return fare.
assert.match(provider, /params\.append\('departure_token',\s*departureToken\)/);
assert.match(provider, /departureToken:\s*itinerary\.departure_token/);
assert.match(controller, /departureToken/);
assert.match(returnPage, /outboundFlight\.departureToken/);
assert.match(returnPage, /departureToken:\s*token/);
assert.match(returnPage, /from:\s*outboundFrom[\s\S]*to:\s*outboundTo[\s\S]*returnDate:\s*canonicalParams\.returnDate[\s\S]*departureToken:\s*token/);

// Search result display can continue showing the supplier PARTY TOTAL, but the
// selected object must pass through the one canonical checkout adapter.
assert.match(resultRow, /prepareFlightForBooking/);
assert.match(resultRow, /onSelect\(prepareFlightForBooking\(flight,\s*totalTravelers\)\)/);

// The adapter divides a party total by the passenger count before feeding the
// legacy BookingPage calculation. For a round-trip outbound quote, contribution
// is deferred until the return-token response supplies the final complete quote.
assert.match(bookingContract, /partyAmount\)\s*\/\s*count/);
assert.match(bookingContract, /sourceScope\s*!==\s*'party_total'/);
assert.match(bookingContract, /tripScope\s*===\s*'roundtrip_total'/);
assert.match(bookingContract, /selectionStage\s*===\s*'outbound'/);
assert.match(bookingContract, /deferred_until_return_selection/);
assert.match(bookingContract, /partyOriginalPrice/);
assert.match(bookingContract, /partyFinalPrice/);

// Important: the deliberately deferred outbound booking contribution is 0, but
// itinerary integrity must validate the preserved supplier party total instead.
// Otherwise selecting any round-trip departure produces the pricing-data error.
assert.match(itineraryNormalizer, /resolveItineraryTotalAmount/);
assert.match(itineraryNormalizer, /price\.partyFinalPrice/);
assert.match(itineraryNormalizer, /const totalAmount = resolveItineraryTotalAmount\(rawResult\)/);
assert.match(itineraryNormalizer, /preserved quote, not the intentionally deferred contribution/);

// The current checkout still multiplies legacy per-traveler contributions by
// passenger count, which is why the adapter is mandatory. Guard both sides of
// the contract: party totals are normalized first, then multiplied exactly once.
assert.match(bookingPage, /const total = \(perPassFinal \* passCount\)\.toFixed\(2\)/);

// Backend pricing independently understands the same scopes. This protects
// payment/admin/server paths even if they receive a raw supplier object instead
// of a frontend-adapted object.
assert.match(pricing, /priceScope === 'party_total'/);
assert.match(pricing, /sourcePriceScope === 'party_total'/);
assert.match(pricing, /returning\.tripScope === 'roundtrip_total'/);
assert.match(pricing, /returning\.selectionStage === 'return'/);
assert.match(pricing, /returning\.originalCents/);
assert.match(pricing, /returning\.finalCents/);

console.log('flight party-total + round-trip departure-token pricing contract: PASS');
