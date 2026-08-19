import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const entry = read('frontend/src/index.js');
const backButton = read('frontend/src/shared/components/CustomerBackButton.js');
const compactCss = read('frontend/src/shared/styles/MobileItineraryCompact.css');

// The compact itinerary layer must load after the older mobile booking styles so
// the former vertical timeline cannot regain precedence.
assert.match(entry, /MobileBookingUX\.css[\s\S]*BookingChoiceUX\.css[\s\S]*MobileItineraryCompact\.css/);

// Booking Back must have a dedicated DOM slot inserted before the itinerary
// heading rather than being appended after Outbound/Return cards.
assert.match(backButton, /tfs-booking-back-slot/);
assert.match(backButton, /querySelector\(':scope > \.booking-itinerary-top-panel__title'\)/);
assert.match(backButton, /insertBefore\(slot, itineraryTitle \|\| panel\.firstChild\)/);
assert.match(backButton, /createPortal\(button, bookingTarget\)/);

// Mobile cards intentionally hide the multi-screen desktop timeline and expose
// the existing date/time/airport summary as the primary phone itinerary.
assert.match(compactCss, /\.booking-itinerary-top-grid \.itin-card > div\[style\][\s\S]*display:\s*none\s*!important/);
assert.match(compactCss, /grid-template-areas:[\s\S]*"route route route"[\s\S]*"carrier meta chevron"/);
assert.match(compactCss, /\.booking-itinerary-top-grid \.itin-col-route[\s\S]*display:\s*flex\s*!important/);
assert.match(compactCss, /\.booking-itinerary-top-grid \.itin-dates[\s\S]*display:\s*flex\s*!important/);
assert.match(compactCss, /\.booking-itinerary-top-grid \.itin-times[\s\S]*justify-content:\s*space-between\s*!important/);
assert.match(compactCss, /\.booking-itinerary-top-grid \.itin-airports[\s\S]*grid-template-columns:\s*1fr auto 1fr\s*!important/);

// Connection information is still reachable via the existing expandable card,
// whose details remain visible and compact on phones.
assert.match(compactCss, /\.booking-itinerary-top-grid \.itin-details[\s\S]*padding:/);
assert.match(compactCss, /\.booking-itinerary-top-grid \.itin-segment-item/);

console.log('mobile compact itinerary and booking Back placement contract: PASS');
