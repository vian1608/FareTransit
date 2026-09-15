import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const readFrontend = path => fs.readFileSync(new URL(`../../frontend/${path}`, import.meta.url), 'utf8');
const admin = read('src/modules/admin/admin.service.mjs');
const currentView = read('src/modules/bookings/booking-current-view.mjs');
const passengerAdmin = read('src/modules/admin/admin.passenger.controller.mjs');
const itineraryReader = read('src/modules/admin/admin-current-itinerary.repository.mjs');
const mutationService = read('src/modules/bookings/booking-mutation.service.mjs');
const mutationController = read('src/modules/admin/admin.booking-mutation.controller.mjs');
const adminRoutes = read('src/modules/admin/admin.routes.mjs');
const bookingRoutes = read('src/modules/bookings/booking.routes.mjs');
const publicReservation = read('src/modules/bookings/booking-public-reservation.controller.mjs');
const canonicalReservation = read('src/modules/reservations/canonical-reservation.service.mjs');
const journeySessions = read('src/modules/journey-sessions/journey-session.service.mjs');
const resend = read('src/integrations/resend/resend.service.mjs');
const migration47 = read('migrations/047_stable_primary_passenger_sequence.sql');
const app = readFrontend('src/app/App.js');
const myBookings = readFrontend('src/features/bookings/pages/MyBookingsPage.js');
const reservationPage = readFrontend('src/features/bookings/pages/ReservationDetailsPage.js');

// Canonical Admin read path.
assert.equal(admin.includes('adminBookingReadRepository.getDetail(id)'), true);
assert.equal(admin.includes('adminCurrentItineraryRepository.getByBookingId(detail.id)'), true);
assert.equal(currentView.includes('passenger_sequence'), true);
assert.equal(currentView.includes('is_primary'), true);
assert.equal(passengerAdmin.includes('passenger_sequence: index + 1'), true);
assert.equal(passengerAdmin.includes('is_primary: index === 0'), true);
assert.equal(itineraryReader.includes('booking_itinerary_segments'), true);

// Stable primary-passenger database contract remains present in source control.
assert.equal(migration47.includes('tfs_sync_traveller_change_stable'), true);
assert.equal(migration47.includes('trg_tfs_assign_traveller_sequence'), true);

// All routed Admin mutations must converge on one mutation gateway instead of
// returning whichever partial row happened to be written by a repository call.
assert.equal(adminRoutes.includes("import adminBookingMutationController from './admin.booking-mutation.controller.mjs'"), true);
assert.equal(adminRoutes.includes("adminBookingMutationController.updateContactDetails"), true);
assert.equal(adminRoutes.includes("adminBookingMutationController.updateStatusNotes"), true);
assert.equal(adminRoutes.includes("adminBookingMutationController.updateAuthorizationSettings"), true);
assert.equal(adminRoutes.includes("adminBookingMutationController.updatePaymentSplits"), true);
assert.equal(adminRoutes.includes("adminBookingMutationController.saveTicketDetails"), true);
assert.equal(mutationController.includes('bookingMutationService.updateContact'), true);
assert.equal(mutationController.includes('bookingMutationService.updateStatusAndNotes'), true);
assert.equal(mutationController.includes('bookingMutationService.updateAuthorizationSettings'), true);
assert.equal(mutationController.includes('bookingMutationService.updatePaymentSplits'), true);
assert.equal(mutationController.includes('bookingMutationService.updateTicket'), true);

// The gateway uses optimistic version checks and always reloads the complete
// booking after the write. Contact edits write the canonical contacts table;
// database triggers own projection synchronization back to bookings.
assert.equal(mutationService.includes('BOOKING_VERSION_CONFLICT'), true);
assert.equal(mutationService.includes('return loadCurrentBooking(before.id)'), true);
assert.equal(mutationService.includes('bookingService.getDetailsByCodeOrId(bookingId)'), true);
assert.equal(mutationService.includes("supabase.from('contacts').update(row)"), true);
assert.equal(mutationService.includes("supabase.from('contacts').insert({ booking_id: bookingId, ...row })"), true);

// Reservation-read tokens identify a booking; they never freeze an old booking
// payload. Opening r_... must resolve the booking again at request time.
assert.equal(journeySessions.includes('bookingService.getDetailsByCodeOrId(session.booking_id)'), true);
assert.equal(journeySessions.includes('buildPublicReservationDto(booking)'), true);

// Public customer lookup must use one canonical detail resolver across all
// supported service stores. Search results and old confirmation-code URLs converge
// on the same customer-facing reservation page.
assert.equal(bookingRoutes.includes("router.get('/reservation/:reference', bookingReadRateLimiter, bookingPublicReservationController.get)"), true);
assert.equal(publicReservation.includes('resolveCanonicalReservation(reference)'), true);
assert.equal(canonicalReservation.includes("serviceType: 'FLIGHT'"), true);
assert.equal(canonicalReservation.includes("serviceType: 'CAR'"), true);
assert.equal(canonicalReservation.includes("serviceType: 'HOTEL'"), true);
assert.equal(app.includes('path="/reservation/:reference"'), true);
assert.equal(app.includes('BookingConfirmationCompatibilityRoute'), true);
assert.equal(myBookings.includes('to={`/reservation/${encodeURIComponent(code)}`}'), true);
assert.equal(myBookings.includes("serviceType === 'CAR'"), true);
assert.equal(myBookings.includes("serviceType === 'HOTEL'"), true);
assert.equal(reservationPage.includes('/api/bookings/reservation/'), true);
assert.equal(reservationPage.includes("serviceType === 'CAR'"), true);
assert.equal(reservationPage.includes("serviceType === 'HOTEL'"), true);
assert.equal(reservationPage.includes('CarReservation'), true);
assert.equal(reservationPage.includes('HotelReservation'), true);
assert.equal(reservationPage.includes('FlightReservation'), true);

// Customer confirmation emails also reload the current complete booking before
// rendering, preventing Admin mutations from being followed by stale email data.
assert.equal(resend.includes('const booking = (await bookingRepository.getCompleteBookingById(rawId)) || (await bookingRepository.getById(rawId));'), true);

console.log('global booking consistency contract: PASS');
