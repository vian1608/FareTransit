import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const timeline = read('frontend/src/shared/components/ItineraryTimeline.js');
const itinerary = read('frontend/src/features/bookings/components/ItineraryCard.js');
const itineraryStyles = read('frontend/src/features/bookings/components/ItineraryCard.css');

// Dates must be visible in the primary itinerary timeline, not hidden only in
// expanded details. Departure, connections and destination all carry a date.
assert.match(timeline, /const formatTravelDate/);
assert.match(timeline, /className="itinerary-node-date"/);
assert.match(timeline, /date:\s*arrDate \|\| depDate/);
assert.match(timeline, /date:\s*overallArrDate/);
assert.match(timeline, /far fa-calendar-alt/);

// The compact summary row must also expose the trip date(s) for quick review.
assert.match(itinerary, /const formatSummaryDate/);
assert.match(itinerary, /className="itin-dates"/);
assert.match(itinerary, /effectiveDepDate/);
assert.match(itinerary, /effectiveArrDate/);
assert.match(itineraryStyles, /\.itin-dates\s*\{/);

// Route planes travel left-to-right toward the next airport. Never reintroduce
// the old 90-degree downward rotation.
assert.match(timeline, /transform:\s*'rotate\(0deg\)'/);
assert.doesNotMatch(timeline, /transform:\s*'rotate\(90deg\)'/);

console.log('itinerary visible dates + route direction contract: PASS');
