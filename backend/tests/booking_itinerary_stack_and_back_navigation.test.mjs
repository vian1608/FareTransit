import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const appEntry = read('frontend/src/index.js');
const bookingEntry = read('frontend/src/features/bookings/pages/BookingPage.js');
const booking = read('frontend/src/features/bookings/pages/BookingPageV2.js');
const bookingStyles = read('frontend/src/features/bookings/pages/BookingStepperV2.css');
const validationUX = read('frontend/src/shared/validation/installBookingValidationUX.js');
const validationStyles = read('frontend/src/shared/styles/BookingValidationUX.css');
const itinerary = read('frontend/src/features/bookings/components/ItineraryCard.js');
const timeline = read('frontend/src/shared/components/ItineraryTimeline.js');
const transition = read('frontend/src/shared/components/PageTransition.js');
const backButton = read('frontend/src/shared/components/CustomerBackButton.js');
const backButtonStyles = read('frontend/src/shared/components/CustomerBackButton.css');

// BookingPage remains the stable route entry point while the active implementation
// is the three-step checkout.
assert.match(bookingEntry, /BookingPageV2/);
assert.match(booking, /booking-stepper-v2/);
assert.match(booking, /Traveller Details/);
assert.match(booking, /Contact & Assistance/);
assert.match(booking, /Secure Checkout/);
assert.match(booking, /currentStep/);
assert.match(booking, /faretransit-booking-back/);
assert.match(booking, /fareTransitBookingDraftV2/);
assert.doesNotMatch(booking, /booking-hero-premium/);

// Step one keeps the existing itinerary cards and passenger validation contract.
assert.match(booking, /Your Selected Itinerary/);
assert.match(booking, /passenger-card-block/);
assert.match(booking, /data-passenger-index/);
assert.match(booking, /passengerValidationErrors/);
assert.match(booking, /validateDateOfBirth/);
assert.match(booking, /validatePassportNumber/);
assert.match(booking, /validatePassportExpiry/);

// Step two owns contact + special requests; step three owns checkout only.
assert.match(booking, /Primary Contact Details/);
assert.match(booking, /Special Requests & Preferences/);
assert.match(booking, /ManualPaymentCardFields/);
assert.match(booking, /Confirm Reservation & Save Payment Method/);
assert.match(booking, /No authorization, capture, or sale is submitted/);
assert.match(booking, /fa-circle-notch fa-spin/);

// The new layout is intentionally a page stepper, not the legacy accordion checkout.
assert.match(bookingStyles, /\.booking-stepper-v2/);
assert.match(bookingStyles, /\.booking-v2-section/);
assert.match(bookingStyles, /\.booking-v2-passenger-list/);
assert.match(bookingStyles, /\.booking-v2-no-charge-notice/);
assert.match(bookingStyles, /\.booking-v2-primary--checkout/);

// Validation feedback may focus fields, but React owns passenger-card error state.
assert.match(appEntry, /BookingValidationUX\.css/);
assert.match(appEntry, /installBookingValidationUX/);
assert.match(validationUX, /scrollIntoView\(\{ behavior: 'smooth', block: 'center'/);
assert.match(validationUX, /aria-invalid/);
assert.match(validationUX, /data-passenger-index/);
assert.match(validationStyles, /\.booking-page \.booking-global-error/);
assert.match(validationStyles, /input\.tfs-validation-error-field/);
assert.match(validationStyles, /\.passenger-card-block\.tfs-passenger-card-error/);

// Existing itinerary normalization remains part of the customer flow.
assert.match(itinerary, /className="itin-badge"/);
assert.match(timeline, /nested\?\.airport/);
assert.match(timeline, /segment\.departure\?\.airport|segment\.departure/);
assert.match(timeline, /segment\.arrival\?\.airport|segment\.arrival/);
assert.match(timeline, /firstSeg\.origin_airport \|\| '---'/);
assert.match(timeline, /lastSeg\.destination_airport \|\| '---'/);
assert.doesNotMatch(timeline, /\|\| 'ORIG'|\|\| 'CONN'|\|\| 'DEST'/);

// One global, icon-only customer back control is mounted by PageTransition. On
// booking steps 2/3 it first moves back inside the checkout before route history.
assert.match(transition, /<CustomerBackButton\s*\/>/);
assert.match(backButton, /navigate\(-1\)/);
assert.match(backButton, /faretransit-booking-back/);
assert.match(backButton, /document\.querySelector\('\.booking-itinerary-top-panel__inner'\)/);
assert.match(backButton, /createPortal\(button, bookingTarget\)/);
assert.match(backButton, /\/return-flight/);
assert.match(backButton, /\/booking/);
assert.match(backButton, /tfs-customer-back__glyph/);
assert.match(backButton, />‹<\/span>/);
assert.doesNotMatch(backButton, /<span>Back<\/span>/);
assert.match(backButton, /tfs-legacy-back-modernized/);
assert.match(backButtonStyles, /\.tfs-customer-back,[\s\S]*\.tfs-legacy-back-modernized/);
assert.match(backButtonStyles, /width:\s*44px\s*!important/);

console.log('three-step booking + itinerary + validation + icon-only customer back navigation contract: PASS');
