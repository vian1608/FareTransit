import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(process.cwd(), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const bookingRoutes = read('backend/src/modules/bookings/booking.routes.mjs');
const bookingSearch = read('backend/src/modules/bookings/booking-current-search.controller.mjs');
const publicReservation = read('backend/src/modules/bookings/booking-public-reservation.controller.mjs');
const canonicalService = read('backend/src/modules/reservations/canonical-reservation.service.mjs');
const canonicalAdmin = read('backend/src/modules/backoffice/canonical-operations.routes.mjs');
const backofficeRoutes = read('backend/src/modules/backoffice/backoffice.routes.mjs');
const carCreate = read('backend/src/modules/backoffice/cars-backoffice.routes.mjs');
const carFast = read('backend/src/modules/backoffice/cars-backoffice-fast.routes.mjs');
const tripsHotels = read('backend/src/modules/backoffice/trips-hotels.routes.mjs');
const securePayment = read('backend/src/modules/backoffice/secure-payment-admin.routes.mjs');
const carEmail = read('backend/src/modules/reservations/car-authorization-email.service.mjs');
const myBookings = read('frontend/src/features/bookings/pages/MyBookingsPage.js');
const publicDetails = read('frontend/src/features/bookings/pages/ReservationDetailsPage.js');
const newCar = read('frontend/src/features/backoffice/NewCarReservationDraftPage.js');
const carWorkspace = read('frontend/src/features/backoffice/CarReservationWorkspace.js');
const hotelCreate = read('frontend/src/features/backoffice/HotelBookingCreatePage.js');
const tripDetail = read('frontend/src/features/backoffice/TripDetailPageEnhanced.js');
const backofficeRouter = read('frontend/src/features/backoffice/BackOfficeRouter.js');
const integrityMigration = read('backend/migrations/121_stabilization_integrity_guards.sql');

test('FareTransit admin stabilization contracts', async t => {
  await t.test('legacy booking mutations require authenticated staff permissions', () => {
    assert.match(bookingRoutes, /const staff = \[authenticate, loadBackOfficeProfile\]/);
    assert.match(bookingRoutes, /const flightEdit = \[\.\.\.staff, requirePermission\('bookings\.flights\.edit'\)\]/);
    assert.match(bookingRoutes, /router\.patch\('\/:id\/status',[\s\S]*\.\.\.flightEdit/);
    assert.match(bookingRoutes, /router\.patch\('\/:id\/payment',[\s\S]*\.\.\.flightEdit/);
    assert.match(bookingRoutes, /router\.patch\('\/:id\/itinerary',[\s\S]*\.\.\.flightEdit/);
    assert.match(bookingRoutes, /router\.patch\('\/:id\/ticket',[\s\S]*\.\.\.ticketEdit/);
  });

  await t.test('public search and detail resolve Flight, Car and Hotel through one canonical service', () => {
    assert.match(bookingSearch, /searchCanonicalReservations/);
    assert.match(publicReservation, /resolveCanonicalReservation/);
    for (const type of ['FLIGHT', 'CAR', 'HOTEL']) {
      assert.ok(canonicalService.includes(type), `Canonical reservation service must include ${type}.`);
    }
    assert.match(bookingSearch, /row\.serviceType === 'CAR'/);
    assert.match(bookingSearch, /row\.serviceType === 'HOTEL'/);
  });

  await t.test('My Bookings and public reservation rendering are explicitly service-aware', () => {
    assert.match(myBookings, /service_type/);
    assert.match(myBookings, /HOTEL/);
    assert.match(myBookings, /CAR/);
    assert.match(publicDetails, /function HotelReservation/);
    assert.match(publicDetails, /serviceType === 'HOTEL'/);
    assert.match(publicDetails, /serviceType === 'CAR'/);
    assert.match(publicDetails, /serviceType === 'FLIGHT'/);
  });

  await t.test('Dashboard, Customers, Payments and Refunds use canonical multi-service operations', () => {
    assert.match(canonicalAdmin, /router\.get\('\/dashboard\/summary'/);
    assert.match(canonicalAdmin, /router\.get\('\/crm\/customers'/);
    assert.match(canonicalAdmin, /router\.get\('\/payments'/);
    assert.match(canonicalAdmin, /router\.post\('\/payments\/refunds'/);
    assert.match(canonicalAdmin, /listCanonicalReservations/);
    assert.match(canonicalAdmin, /function groupCustomers\(rows\)/);
    assert.match(canonicalAdmin, /const rows = visibleReservations\(req\.staff, await listCanonicalReservations/);
    assert.ok(backofficeRoutes.indexOf('canonicalOperationsRouter') < backofficeRoutes.indexOf('adminReportingRouter'), 'Canonical routes must be mounted before legacy reporting routes.');
  });

  await t.test('Trip details include Flight, Hotel and modern Car reservations', () => {
    assert.match(tripsHotels, /items:\{flights:flights\.data\|\|\[\],hotels:hotels\.data\|\|\[\],cars:carDetails\}/);
    assert.match(tripsHotels, /from\('reservations'\)[\s\S]*eq\('service_type','CAR'\)/);
    assert.match(tripDetail, /Car rentals/);
    assert.match(tripDetail, /items\?\.cars/);
    assert.match(backofficeRouter, /TripDetailPageEnhanced/);
  });

  await t.test('Hotel creation collects customer data and validates stay chronology on both sides', () => {
    assert.match(hotelCreate, /customerName/);
    assert.match(hotelCreate, /customerEmail/);
    assert.match(hotelCreate, /Check-out must be after check-in/);
    assert.match(tripsHotels, /validStay\(b\.checkIn,b\.checkOut\)/);
    assert.match(tripsHotels, /customer_name:customerName/);
    assert.match(backofficeRouter, /HotelBookingCreatePage/);
  });

  await t.test('Car creation cannot create an empty ghost reservation and is idempotent', () => {
    assert.match(newCar, /validateFirstSave/);
    assert.match(newCar, /Customer full name is required before creating a booking ID/);
    assert.match(newCar, /Drop-off date and time must be after pickup date and time/);
    assert.match(carCreate, /validateCreatePayload/);
    assert.match(carCreate, /client_request_id/);
    assert.match(carCreate, /idempotentReplay/);
  });

  await t.test('Car save uses section-level reads and writes instead of loading the whole reservation bundle', () => {
    assert.match(carWorkspace, /minimalPatch/);
    assert.match(carWorkspace, /Save Changes/);
    assert.match(carFast, /const needsCar =/);
    assert.match(carFast, /const needsTraveller =/);
    assert.match(carFast, /const needsBilling =/);
    assert.match(carFast, /reads: 2 \+ reads\.length/);
    assert.doesNotMatch(carFast, /reservation_activity'\)\.select/);
    assert.ok(backofficeRoutes.indexOf('carsBackofficeFastRouter') < backofficeRoutes.indexOf('carsBackofficeRouter'), 'Optimized car patch route must be mounted before the historical car router.');
  });

  await t.test('Database-level guards prevent future invalid car and hotel chronology', () => {
    assert.match(integrityMigration, /car_reservations_dropoff_after_pickup/);
    assert.match(integrityMigration, /car_reservations_half_hour_times/);
    assert.match(integrityMigration, /hotel_bookings_checkout_after_checkin/);
    assert.match(integrityMigration, /DROP INDEX IF EXISTS public\.idx_reservations_customer_email_ci/);
    assert.match(integrityMigration, /Mastercard/);
  });

  await t.test('secure payment Car scope uses the modern reservation source', () => {
    assert.match(securePayment, /CAR:[\s\S]*table: 'reservations'/);
    assert.doesNotMatch(securePayment, /CAR:[^\n]*table: 'car_bookings'/);
  });

  await t.test('car authorization delivery supports provider fallback without false success', () => {
    assert.match(carEmail, /RESEND_API_KEY/);
    assert.match(carEmail, /EMAIL_HOST/);
    assert.match(carEmail, /EMAIL_USER/);
    assert.match(carEmail, /EMAIL_PASS/);
    assert.match(carEmail, /EMAIL_PROVIDER_NOT_CONFIGURED/);
    assert.match(carEmail, /throw/);
  });
});
