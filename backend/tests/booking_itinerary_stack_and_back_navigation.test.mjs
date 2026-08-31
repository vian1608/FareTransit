import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const appEntry = read('frontend/src/index.js');
const bookingEntry = read('frontend/src/features/bookings/pages/BookingPage.js');
const booking = read('frontend/src/features/bookings/pages/BookingPageV3.js');
const bookingStyles = read('frontend/src/features/bookings/pages/BookingPageV3.css');
const bookingFixes = read('frontend/src/features/bookings/pages/BookingPageV3Fixes.css');
const passengerStep = read('frontend/src/features/bookings/steps/PassengerDetailsStep.js');
const contactStep = read('frontend/src/features/bookings/steps/ContactAssistanceStep.js');
const protectionStep = read('frontend/src/features/bookings/steps/TripProtectionStep.js');
const paymentStep = read('frontend/src/features/bookings/steps/PaymentBillingStep.js');
const cardEntry = read('frontend/src/features/bookings/components/PaymentCardEntry.js');
const validationUX = read('frontend/src/shared/validation/installBookingValidationUX.js');
const validationStyles = read('frontend/src/shared/styles/BookingValidationUX.css');
const itinerary = read('frontend/src/features/bookings/components/ItineraryCard.js');
const timeline = read('frontend/src/shared/components/ItineraryTimeline.js');
const transition = read('frontend/src/shared/components/PageTransition.js');
const backButton = read('frontend/src/shared/components/CustomerBackButton.js');
const backButtonStyles = read('frontend/src/shared/components/CustomerBackButton.css');

// BookingPage remains the stable route entry point while V3 owns the four-step checkout.
assert.match(bookingEntry, /BookingPageV3/);
assert.match(booking, /booking-stepper-v3/);
assert.match(booking, /Traveller Details/);
assert.match(booking, /Contact & Assistance/);
assert.match(booking, /Trip Protection/);
assert.match(booking, /Payment/);
assert.match(booking, /PassengerDetailsStep/);
assert.match(booking, /ContactAssistanceStep/);
assert.match(booking, /TripProtectionStep/);
assert.match(booking, /PaymentBillingStep/);
assert.match(booking, /currentStep/);
assert.match(booking, /faretransit-booking-back/);
assert.match(booking, /fareTransitBookingDraftV3/);
assert.doesNotMatch(booking, /booking-hero-premium/);

// Step one keeps the itinerary and adds airline-profile fields requested by checkout.
assert.match(passengerStep, /Your Selected Itinerary/);
assert.match(passengerStep, /passenger-card-block/);
assert.match(passengerStep, /data-passenger-index/);
assert.match(passengerStep, /Passenger Details/);
assert.match(passengerStep, /Suffix/);
assert.match(passengerStep, /Loyalty Program/);
assert.match(passengerStep, /Frequent Flyer Number/);
assert.match(passengerStep, /Known Traveler #/);
assert.match(passengerStep, /Redress #/);
assert.doesNotMatch(passengerStep, /<h2>\{passengers\.length\} Passenger/);
assert.match(booking, /passengerValidationErrors/);
assert.match(booking, /validateDateOfBirth/);
assert.match(booking, /validatePassportNumber/);
assert.match(booking, /validatePassportExpiry/);

// Step two owns contact + assistance; Step three requires an explicit local-first Flex choice.
assert.match(contactStep, /Primary Contact Details/);
assert.match(contactStep, /Special Requests & Preferences/);
assert.match(contactStep, /Request Wheelchair Assistance/);
assert.match(contactStep, /Additional Airline \/ Assistance Requests/);
assert.match(protectionStep, /Trip Protection & Baggage Fees/);
assert.match(protectionStep, /HIGHLY RECOMMENDED/);
assert.match(protectionStep, /Flex Assist is a FareTransit agency service, not travel insurance/);
assert.match(protectionStep, /aria-checked/);
assert.match(booking, /selectProtection/);
assert.match(booking, /setTripProtection\(selected\)/);
assert.match(booking, /journeySessionAPI\.updateCheckout/);
assert.doesNotMatch(booking, /setTripProtection\(null\)/);
assert.doesNotMatch(booking, /removeItem\(FLEX_SELECTION_KEY\)[\s\S]{0,250}setProtectionSyncWarning/);

// Step four visually collects the normal airline-style card and billing form.
assert.match(paymentStep, /Add New Credit or Debit Card/);
assert.match(paymentStep, /PaymentCardEntry/);
assert.match(paymentStep, /Address Line 1/);
assert.match(paymentStep, /State\/Province/);
assert.match(paymentStep, /Postal Code/);
assert.match(paymentStep, /Complete Reservation/);
assert.match(cardEntry, /Card Number/);
assert.match(cardEntry, /Name on Card/);
assert.match(cardEntry, /CID\/CVV/);
assert.match(cardEntry, /Expiration Date/);
assert.match(cardEntry, /getMaskedMetadata/);
assert.match(cardEntry, /passesLuhn/);
assert.doesNotMatch(cardEntry, /bookingAPI|sessionStorage|localStorage|fetch\(/);
assert.match(paymentStep, /Our travel specialist may call you to confirm your itinerary based on availability/);
assert.match(paymentStep, /fa-circle-notch fa-spin/);

// The layout is centered and progressively narrower for the form-heavy steps.
assert.match(bookingStyles, /\.booking-stepper-v3/);
assert.match(bookingStyles, /\.booking-v3-section/);
assert.match(bookingFixes, /width:\s*min\(1240px/);
assert.match(bookingFixes, /booking-v3-step-section--travellers[\s\S]*max-width:\s*1180px/);
assert.match(bookingFixes, /booking-v3-step-section--contact,[\s\S]*booking-v3-step-section--protection[\s\S]*max-width:\s*1100px/);
assert.match(bookingFixes, /booking-v3-step-section--payment[\s\S]*max-width:\s*1080px/);
assert.match(bookingFixes, /booking-v3-card-row/);

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

// One global icon-only customer back control remains mounted by PageTransition.
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

console.log('four-step booking + local-first Flex selection + centered checkout layout contract: PASS');
