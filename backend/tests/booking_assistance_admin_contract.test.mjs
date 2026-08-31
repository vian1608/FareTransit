import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const booking = read('frontend/src/features/bookings/pages/BookingPageV3.js');
const contactStep = read('frontend/src/features/bookings/steps/ContactAssistanceStep.js');
const protectionStep = read('frontend/src/features/bookings/steps/TripProtectionStep.js');
const paymentCard = read('frontend/src/features/bookings/components/PaymentCardEntry.js');
const professionalCss = read('frontend/src/features/bookings/pages/BookingPageV3Professional.css');
const fixesCss = read('frontend/src/features/bookings/pages/BookingPageV3Fixes.css');
const assistanceService = read('backend/src/modules/bookings/booking.service.assistance-hardening.mjs');
const baggagePricingService = read('backend/src/modules/flights/baggage-pricing.service.mjs');
const flightRoutes = read('backend/src/modules/flights/flight.routes.mjs');
const bookingRoutes = read('backend/src/modules/bookings/booking.routes.mjs');
const adminRoutes = read('backend/src/modules/admin/admin.routes.mjs');
const adminController = read('backend/src/modules/admin/admin.assistance.controller.mjs');
const adminPanel = read('frontend/src/features/admin/components/AdminBookingServiceRequestsPanel.js');
const adminBadges = read('frontend/src/features/admin/components/AdminBookingOperationalBadges.js');
const adminEntry = read('frontend/src/features/admin/pages/AdminDashboardPage.js');
const migration = read('backend/migrations/123_booking_service_requests.sql');
const baggageMigration = read('backend/migrations/124_booking_additional_baggage_request.sql');
const baggageQuoteMigration = read('backend/migrations/125_booking_baggage_price_quote.sql');

// Customer assistance choices are explicit and submitted as structured booking data.
assert.match(contactStep, /Meal Preference/);
assert.match(contactStep, /Seat Preference/);
assert.match(contactStep, /Request Wheelchair Assistance/);
assert.match(contactStep, /Additional Airline \/ Assistance Requests/);
assert.match(contactStep, /Add checked baggage/);
assert.match(contactStep, /additionalBaggageCount/);
assert.match(contactStep, /\/flights\/baggage-options/);
assert.match(contactStep, /Only baggage options with an airline-provided price are shown/);
assert.match(contactStep, /You do not pay this baggage amount during the reservation/);
assert.match(contactStep, /FareTransit baggage quote/);
assert.match(booking, /assistance:\s*specialRequests/);
assert.match(booking, /specialRequests,/);

// Baggage prices come from Google Flights booking options and FareTransit applies its server-known 20% quote markup.
assert.match(flightRoutes, /baggage-options/);
assert.match(baggagePricingService, /booking_token/);
assert.match(baggagePricingService, /baggage_prices/);
assert.match(baggagePricingService, /BAGGAGE_MARKUP_RATE = 0\.20/);
assert.match(baggagePricingService, /customerPrice:\s*money\(item\.sourcePrice \* \(1 \+ BAGGAGE_MARKUP_RATE\)\)/);
assert.match(baggagePricingService, /if \(!items\.length/);

// Assistance and baggage requests are stored in an operational table with a staff lifecycle.
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.booking_service_requests/);
assert.match(migration, /meal_preference/);
assert.match(migration, /seat_preference/);
assert.match(migration, /wheelchair_required/);
assert.match(migration, /additional_request/);
assert.match(migration, /'NONE', 'REQUESTED', 'ACKNOWLEDGED', 'COMPLETED'/);
assert.match(baggageMigration, /additional_baggage_count/);
assert.match(baggageMigration, /BETWEEN 0 AND 6/);
assert.match(baggageQuoteMigration, /additional_baggage_quote/);
assert.match(baggageQuoteMigration, /additional_baggage_source_total/);
assert.match(baggageQuoteMigration, /additional_baggage_customer_total/);
assert.match(assistanceService, /booking_service_requests/);
assert.match(assistanceService, /additional_baggage_count/);
assert.match(assistanceService, /additional_baggage_quote/);
assert.match(assistanceService, /BAGGAGE_MARKUP_RATE = 0\.20/);
assert.match(assistanceService, /customerPrice:\s*money\(sourcePrice \* \(1 \+ BAGGAGE_MARKUP_RATE\)\)/);
assert.match(assistanceService, /assistance_status:\s*hasSpecialAssistance \? 'REQUESTED' : 'NONE'/);
assert.match(bookingRoutes, /booking\.service\.assistance-hardening\.mjs/);

// Flex selection is local-first: network sync can warn, but must never clear the passenger choice.
assert.match(booking, /setTripProtection\(selected\)/);
assert.match(booking, /setProtectionSyncWarning/);
assert.match(protectionStep, /aria-checked/);
assert.doesNotMatch(booking, /setTripProtection\(null\)/);
assert.doesNotMatch(protectionStep, /disabled=\{syncPending/);

// Admin has a batch list indicator plus a dedicated detail panel and status update route.
assert.match(adminRoutes, /bookings\/operational-flags/);
assert.match(adminRoutes, /bookings\/:id\/service-requests/);
assert.match(adminController, /getOperationalFlags/);
assert.match(adminController, /getOperationalDetails/);
assert.match(adminController, /updateAssistance/);
assert.match(adminController, /additionalBaggageCustomerTotal/);
assert.match(adminPanel, /Passenger Travel Profiles/);
assert.match(adminPanel, /Special Assistance & Requests/);
assert.match(adminPanel, /Wheelchair Required/);
assert.match(adminPanel, /Additional Checked Bags/);
assert.match(adminPanel, /FareTransit Baggage Quote/);
assert.match(adminPanel, /Airline Price Basis/);
assert.match(adminPanel, /Service Request Status/);
assert.match(adminPanel, /Acknowledged/);
assert.match(adminPanel, /Completed/);
assert.match(adminPanel, /FareTransit Flex Assist/);
assert.match(adminBadges, /Special Assistance/);
assert.match(adminBadges, /Flex Assist/);
assert.match(adminEntry, /AdminBookingServiceRequestsPanel/);
assert.match(adminEntry, /AdminBookingOperationalBadges/);

// Passenger operational view exposes airline profile identifiers.
assert.match(adminController, /loyaltyProgram/);
assert.match(adminController, /frequentFlyerNumber/);
assert.match(adminController, /knownTravelerNumber/);
assert.match(adminController, /redressNumber/);
assert.match(adminPanel, /Loyalty Program/);
assert.match(adminPanel, /Frequent Flyer #/);
assert.match(adminPanel, /Known Traveler #/);
assert.match(adminPanel, /Redress #/);

// The checkout uses a restrained system typography layer instead of Avenir-style heavy headings.
assert.match(fixesCss, /BookingPageV3Professional\.css/);
assert.doesNotMatch(professionalCss, /Avenir Next/);
assert.match(professionalCss, /-apple-system/);
assert.match(professionalCss, /font-weight:\s*700\s*!important/);
assert.match(professionalCss, /font-size:\s*clamp\(1\.85rem, 2\.65vw, 2\.35rem\)/);

// Sensitive card data stays browser-only and the booking payload remains masked metadata only.
assert.match(paymentCard, /cardNumber/);
assert.match(paymentCard, /securityCode/);
assert.doesNotMatch(paymentCard, /bookingAPI|fetch\(|sessionStorage|localStorage/);
assert.match(booking, /cardLast4:\s*card\.last4/);
assert.doesNotMatch(booking, /cardNumber\s*:/);
assert.doesNotMatch(booking, /\bcvv\s*:/i);

console.log('booking assistance + priced baggage persistence + admin operations + professional typography contract: PASS');
