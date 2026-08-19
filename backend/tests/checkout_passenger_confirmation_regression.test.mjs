import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '../../');

async function read(relativePath) {
  return fs.readFile(path.join(ROOT_DIR, relativePath), 'utf8');
}

async function run() {
  const bookingPage = await read('frontend/src/features/bookings/pages/BookingPage.js');
  const mobileInstaller = await read('frontend/src/shared/mobile/installMobileBookingUX.js');
  const successPage = await read('frontend/src/features/bookings/pages/PaymentSuccessPage.js');
  const migration = await read('backend/migrations/041_email_delivery_upsert_constraint.sql');

  // React must be the single source of truth for passenger completion + collapse state.
  assert.ok(bookingPage.includes('PASSENGER_REQUIRED_FIELDS'));
  assert.ok(bookingPage.includes('getMissingPassengerFields'));
  assert.ok(bookingPage.includes('isPassengerRequiredComplete'));
  assert.ok(bookingPage.includes('expandedPassengers'));
  assert.ok(bookingPage.includes('passengerValidationErrors'));
  assert.ok(bookingPage.includes('aria-expanded={expandedPassengers[idx] !== false}'));
  assert.ok(bookingPage.includes("setExpandedPassengers(prev => ({ ...prev, [idx]: prev[idx] === false }))"));
  assert.ok(bookingPage.includes("{isPassengerRequiredComplete(passenger) ? 'Done' : 'Required'}"));

  // Do not let browser-native :invalid state disagree with React passenger state again.
  assert.ok(bookingPage.includes('<form noValidate'));
  assert.ok(!bookingPage.includes(".passenger-card-block select:invalid"));
  assert.ok(!bookingPage.includes(".passenger-card-block input:invalid"));
  assert.ok(bookingPage.includes('revealPassenger(firstIncompleteIndex)'));
  assert.ok(bookingPage.includes('Passenger #${firstIncompleteIndex + 1}: Please complete ${missing.join(\', \')}'));

  // Title normalization prevents "Mr." vs "Mr" style-value drift.
  assert.ok(bookingPage.includes("replace(/\\.$/, '')"));
  assert.ok(bookingPage.includes('<option value="Miss">Miss</option>'));
  assert.ok(bookingPage.includes('<option value="Master">Master</option>'));

  // The old mobile enhancer must never mutate React-owned passenger DOM.
  assert.ok(!mobileInstaller.includes('MutationObserver'));
  assert.ok(!mobileInstaller.includes('passenger-card-block'));
  assert.ok(!mobileInstaller.includes('createElement'));

  // Confirmation rendering must sanitize unexpected DTO values instead of crashing React.
  assert.ok(successPage.includes('const displayText ='));
  assert.ok(successPage.includes('const safeArray ='));
  assert.ok(successPage.includes('displayText(booking.booking?.status'));
  assert.ok(successPage.includes('safeArray(booking.flights)'));

  // Email delivery upserts require this exact conflict key to be unique in Postgres.
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS ux_email_deliveries_booking_type[\s\S]*?booking_id, email_type/);

  console.log('✔ Passenger accordion is React-owned and deterministic.');
  console.log('✔ Passenger validation uses the same React state shown to the customer.');
  console.log('✔ Confirmation rendering is defensive against legacy/unexpected DTO shapes.');
  console.log('✔ Email-delivery upsert conflict key is backed by a unique database index.');
}

run().catch((error) => {
  console.error('❌ Checkout passenger/confirmation regression test failed:', error);
  process.exit(1);
});
