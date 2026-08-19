import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const airportIdentity = read('frontend/src/features/flights/utils/airportIdentity.js');
const autocomplete = read('frontend/src/features/flights/components/AirportAutocomplete.js');
const results = read('frontend/src/features/flights/pages/SearchResultsPage.js');
const row = read('frontend/src/features/flights/components/FlightResultRow.js');
const returnPage = read('frontend/src/features/flights/pages/ReturnFlightSelectionPage.js');
const summaryBar = read('frontend/src/features/flights/components/ModifySearchSummaryBar.js');
const pageTransition = read('frontend/src/shared/components/PageTransition.js');
const routeWaiter = read('frontend/src/shared/components/CustomerRouteLoadingOverlay.js');
const motionCss = read('frontend/src/shared/styles/CustomerMotionEnhancements.css');
const flightController = read('backend/src/modules/flights/flight.controller.mjs');
const serpApi = read('backend/src/integrations/serpapi/serpapi.service.mjs');

assert.match(airportIdentity, /\^\[A-Z\]\{3\}\$/);
assert.doesNotMatch(airportIdentity, /\{3,4\}/);
assert.doesNotMatch(airportIdentity, /substring\(0,\s*3\)/);
assert.match(autocomplete, /3-letter (?:IATA )?(?:airport )?code/);
assert.match(summaryBar, /canonicalSearchAirport/);
assert.doesNotMatch(summaryBar, /\|\| 'JFK'/);
assert.doesNotMatch(summaryBar, /\|\| 'LHR'/);

assert.match(results, /sessionStorage\.setItem\('searchParams', JSON\.stringify\(params\)\)/);
assert.match(results, /routeMatches/);
assert.match(results, /returned results for a different route/);
assert.match(results, /We did not load an older saved search/);
assert.doesNotMatch(results, /sessionStorage\.getItem\('searchParams'\)/);

assert.match(row, /Per-segment timing was not included/);
assert.match(row, /layover in/);
assert.match(row, /tfs-flight-segments/);
assert.match(row, /tfs-flight-layover/);
assert.doesNotMatch(row, /'12:00'/);
assert.doesNotMatch(row, /'11:15'/);
assert.doesNotMatch(row, /'13:45'/);
assert.doesNotMatch(row, /'2h 10m'/);
assert.doesNotMatch(row, /'2h 45m'/);

assert.match(returnPage, /canonicalSearchAirport/);
// A SerpAPI/Google Flights departure_token continues the original round-trip
// search context, so the provider request keeps the original origin/destination.
// The returned selectable leg is still validated as destination -> origin.
assert.match(returnPage, /from:\s*outboundFrom/);
assert.match(returnPage, /to:\s*outboundTo/);
assert.match(returnPage, /departureToken:\s*token/);
assert.match(returnPage, /\},\s*outboundTo,\s*outboundFrom\);/);
assert.match(returnPage, /saved departure flight does not match/);
assert.match(returnPage, /The flight provider returned a different route/);

assert.match(pageTransition, /CustomerRouteLoadingOverlay/);
assert.match(routeWaiter, /Preparing return flight options/);
assert.match(routeWaiter, /Preparing traveler details/);
assert.match(routeWaiter, /Preparing secure checkout/);
assert.match(routeWaiter, /Loading reservation confirmation/);
assert.match(routeWaiter, /LOADING_SELECTOR/);
assert.match(routeWaiter, /STALL_MS/);
assert.match(routeWaiter, /This page is taking longer than expected/);
assert.match(routeWaiter, /Retry page/);
assert.match(routeWaiter, /Go back/);
assert.match(routeWaiter, /MutationObserver/);
assert.doesNotMatch(motionCss, /blur\(7px\)/);

assert.match(flightController, /valid 3-letter IATA airport codes/);
assert.doesNotMatch(flightController, /substring\(0,\s*3\)/);
assert.doesNotMatch(flightController, /\{3,4\}/);
assert.match(serpApi, /segments,/);
assert.match(serpApi, /Dropping mismatched itinerary/);
assert.match(serpApi, /PROVIDER_TIMEOUT_MS/);
assert.doesNotMatch(serpApi, /substring\(0,\s*3\)/);

console.log('flight results integrity + customer loading contract: PASS');
