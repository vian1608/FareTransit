import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const home = read('frontend/src/features/flights/pages/Home.js');
const sharedSearch = read('frontend/src/features/flights/components/FlightSearchPanel.js');
const modifyModal = read('frontend/src/features/flights/components/ModifySearchModal.js');
const results = read('frontend/src/features/flights/pages/SearchResultsPage.js');
const returnPage = read('frontend/src/features/flights/pages/ReturnFlightSelectionPage.js');
const bookingPage = read('frontend/src/features/bookings/pages/BookingPage.js');
const controller = read('backend/src/modules/flights/flight.controller.mjs');
const flightService = read('backend/src/modules/flights/flight.service.mjs');
const provider = read('backend/src/integrations/serpapi/serpapi.service.mjs');

for (const source of [home, sharedSearch, modifyModal]) {
  assert.match(source, /Infants in seat/i);
  assert.match(source, /Infants on lap/i);
  assert.match(source, /infantsInSeat/);
  assert.match(source, /infantsOnLap/);
}

assert.match(home, /infantsOnLap\s*>\s*searchData\.adults|searchData\.infantsOnLap\s*>\s*searchData\.adults/);
assert.match(sharedSearch, /searchData\.infantsOnLap\s*>\s*searchData\.adults/);
assert.match(modifyModal, /infantsOnLap\s*>\s*adults/);

for (const source of [home, sharedSearch, results, returnPage]) {
  assert.match(source, /infantsInSeat/);
  assert.match(source, /infantsOnLap/);
}
assert.match(home, /infants:\s*totalInfants/);
assert.match(sharedSearch, /infants:\s*totalInfants/);
assert.match(results, /infants:\s*hasSplitInfants\s*\?\s*infantsInSeat\s*\+\s*infantsOnLap\s*:\s*legacyInfants/);

// Checkout now preserves the explicit infant fulfillment type instead of
// recreating every infant as a generic passenger. Legacy links still become lap infants.
assert.match(bookingPage, /searchParams\.infantsInSeat/);
assert.match(bookingPage, /searchParams\.infantsOnLap/);
assert.match(bookingPage, /createPassenger\('infant', 'IN_SEAT'\)/);
assert.match(bookingPage, /createPassenger\('infant', 'ON_LAP'\)/);
assert.match(bookingPage, /legacyInfants/);

assert.match(results, /infantsOnLap[\s\S]*legacyInfants/);
assert.match(sharedSearch, /legacyInfantsParam/);
assert.match(controller, /legacyInfants/);

assert.match(controller, /infantsInSeat/);
assert.match(controller, /infantsOnLap/);
assert.match(controller, /INVALID_LAP_INFANT_COUNT/);
assert.match(controller, /normalizedInfantsInSeat\s*\+\s*normalizedInfantsOnLap/);

assert.match(provider, /params\.append\('infants_in_seat',\s*infantsInSeat\.toString\(\)\)/);
assert.match(provider, /params\.append\('infants_on_lap',\s*infantsOnLap\.toString\(\)\)/);

assert.match(flightService, /passengerMix/);
assert.match(flightService, /infantsInSeat/);
assert.match(flightService, /infantsOnLap/);
assert.match(flightService, /flights:\s*\(results\.flights\s*\|\|\s*\[\]\)\.map/);
assert.match(bookingPage, /flight:\s*flightObj/);

assert.match(returnPage, /departureToken:\s*token[\s\S]*infantsInSeat:\s*canonicalParams\.infantsInSeat[\s\S]*infantsOnLap:\s*canonicalParams\.infantsOnLap/);

console.log('seated + lap infant flight-search contract: PASS');
