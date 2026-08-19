import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const appEntry = read('frontend/src/index.js');
const booking = read('frontend/src/features/bookings/pages/BookingPage.js');
const overrides = read('frontend/src/shared/styles/BookingFlowOverrides.css');
const validationUX = read('frontend/src/shared/validation/installBookingValidationUX.js');
const validationStyles = read('frontend/src/shared/styles/BookingValidationUX.css');
const itinerary = read('frontend/src/features/bookings/components/ItineraryCard.js');
const timeline = read('frontend/src/shared/components/ItineraryTimeline.js');
const transition = read('frontend/src/shared/components/PageTransition.js');
const backButton = read('frontend/src/shared/components/CustomerBackButton.js');

assert.match(booking, /YOUR SELECTED ITINERARY/);

assert.match(appEntry, /import ['"]\.\/shared\/styles\/BookingFlowOverrides\.css['"]/);
assert.match(overrides, /booking-itinerary-top-grid--roundtrip[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
assert.match(overrides, /\.booking-itinerary-top-panel__inner,[\s\S]*\.container\.booking-main-container[\s\S]*max-width:\s*1180px\s*!important/);
assert.match(overrides, /\.booking-layout[\s\S]*display:\s*block\s*!important[\s\S]*width:\s*100%\s*!important/);
assert.match(overrides, /\.booking-form-area[\s\S]*width:\s*100%\s*!important[\s\S]*max-width:\s*none\s*!important/);
assert.match(overrides, /\.booking-summary-sidebar,[\s\S]*\.mobile-summary-toggle-bar[\s\S]*display:\s*none\s*!important/);
assert.doesNotMatch(overrides, /\.booking-sidebar,[\s\S]*\.mobile-summary-toggle\s*\{/);
assert.match(overrides, /booking-itinerary-pricing-summary[\s\S]*position:\s*absolute\s*!important[\s\S]*right:\s*2rem\s*!important/);

// Multi-passenger checkout must visually separate each passenger and React must
// own the accordion state; the class is intentionally dynamic now.
assert.match(booking, /passenger-card-block/);
assert.match(booking, /className="passenger-card-title"/);
assert.match(booking, /aria-expanded=\{expandedPassengers\[idx\] !== false\}/);
assert.match(booking, /tfs-pax-collapsed/);
assert.match(overrides, /\.passenger-card-block\s*\{[\s\S]*border-left:\s*4px solid #8b1538\s*!important[\s\S]*padding:\s*1\.25rem\s*!important/);
assert.match(overrides, /\.passenger-card-block \+ \.passenger-card-block\s*\{[\s\S]*margin-top:\s*1\.45rem\s*!important/);
assert.match(overrides, /\.passenger-card-title\s*\{[\s\S]*background:\s*linear-gradient[\s\S]*border-bottom:\s*1px solid #e2e8f0\s*!important/);

assert.match(booking, /className="amtrak-btn amtrak-btn--cta amtrak-btn--full"/);
assert.match(booking, /fa-circle-notch fa-spin/);
assert.match(overrides, /\.amtrak-btn\.amtrak-btn--cta\.amtrak-btn--full\s*\{[\s\S]*width:\s*100%\s*!important[\s\S]*min-height:\s*58px\s*!important[\s\S]*background:\s*linear-gradient/);
assert.match(overrides, /:has\(\.fa-circle-notch\)[\s\S]*min-height:\s*104px\s*!important[\s\S]*cursor:\s*wait\s*!important/);
assert.match(overrides, /Creating your reservation securely\. Please keep this page open/);
assert.match(overrides, /@keyframes tfs-booking-wait-progress/);
assert.match(overrides, /@keyframes tfs-booking-wait-shimmer/);

// Validation feedback may focus fields, but React owns passenger-card error state.
assert.match(appEntry, /BookingValidationUX\.css/);
assert.match(appEntry, /installBookingValidationUX/);
assert.match(validationUX, /scrollIntoView\(\{ behavior: 'smooth', block: 'center'/);
assert.match(validationUX, /aria-invalid/);
assert.match(validationUX, /const numbered = normalizedMessage\.match/);
assert.match(validationUX, /data-passenger-index/);
assert.match(validationUX, /Passenger-card error ownership belongs to BookingPage React state/);
assert.doesNotMatch(validationUX, /passengerCard\.classList\.add\('tfs-passenger-card-error'\)/);
assert.match(validationStyles, /\.booking-page \.booking-global-error/);
assert.match(validationStyles, /border-left:\s*4px solid #dc2626\s*!important/);
assert.match(validationStyles, /input\.tfs-validation-error-field/);
assert.match(validationStyles, /\.passenger-card-block\.tfs-passenger-card-error/);

assert.match(itinerary, /className="itin-badge"/);
assert.match(overrides, /\.booking-itinerary-top-grid \.itin-card \.itinerary-timeline-container > div:first-child\s*\{[\s\S]*display:\s*none\s*!important/);
assert.match(overrides, /\.booking-itinerary-top-grid \.itin-card \.itinerary-timeline-container\s*\{[\s\S]*padding-top:\s*14px\s*!important[\s\S]*margin-bottom:\s*12px\s*!important/);
assert.match(timeline, /nested\?\.airport/);
assert.match(timeline, /segment\.departure\?\.airport|segment\.departure/);
assert.match(timeline, /segment\.arrival\?\.airport|segment\.arrival/);
assert.match(timeline, /firstSeg\.origin_airport \|\| '---'/);
assert.match(timeline, /lastSeg\.destination_airport \|\| '---'/);
assert.doesNotMatch(timeline, /\|\| 'ORIG'|\|\| 'CONN'|\|\| 'DEST'/);

assert.match(transition, /<CustomerBackButton\s*\/>/);
assert.match(backButton, /navigate\(-1\)/);
// Current master groups landing pages under isPrimaryLandingPage; admin routes must
// still suppress the customer back button without coupling the test to old syntax.
assert.match(backButton, /if \(isPrimaryLandingPage \|\| pathname\.startsWith\('\/admin'\)\) return null/);
assert.match(backButton, /document\.querySelector\('\.booking-itinerary-top-panel__inner'\)/);
assert.match(backButton, /createPortal\(button, bookingTarget\)/);
assert.match(backButton, /\/return-flight/);
assert.match(backButton, /\/booking/);

console.log('booking itinerary stack + React passenger accordion + submit waiting visuals + validation focus + customer back navigation contract: PASS');
