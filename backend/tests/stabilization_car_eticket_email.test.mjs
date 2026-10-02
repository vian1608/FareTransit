import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { buildCarEticketEmail, buildCarEticketPdf } from '../src/modules/reservations/car-eticket-email.service.mjs';

const root = path.resolve(process.cwd(), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const routes = read('backend/src/modules/backoffice/car-eticket.routes.mjs');
const backofficeRoutes = read('backend/src/modules/backoffice/backoffice.routes.mjs');
const workspace = read('frontend/src/features/backoffice/CarReservationWorkspaceEnhanced.js');
const emailDelivery = read('backend/src/modules/reservations/car-authorization-email.service.mjs');

const bundle = {
  reservation: {
    id: '11111111-1111-4111-8111-111111111111',
    booking_reference: 'CTEST1',
    service_type: 'CAR',
    reservation_status: 'READY_TO_BOOK',
    authorization_status: 'AUTHORIZED',
    customer_name: 'Test Passenger',
    customer_email: 'pax@example.com',
    customer_phone: '5551234567',
    total_amount: 760,
    currency: 'USD'
  },
  car: {
    rental_company_name: 'Enterprise Rent-A-Car',
    rental_company_logo_url: 'https://example.com/enterprise.png',
    vehicle_name: 'Toyota Corolla or Similar',
    pickup_location: 'Airport Counter',
    pickup_at: '2026-10-01T14:00:00.000Z',
    dropoff_location: 'Airport Counter',
    dropoff_at: '2026-10-04T14:00:00.000Z',
    mileage_policy: 'Unlimited'
  },
  travellers: [{ role: 'PRIMARY_DRIVER', full_name: 'Test Passenger', email: 'pax@example.com', phone: '5551234567' }],
  latestAuthorization: { status: 'AUTHORIZED', version: 2 }
};

test('car e-ticket workflow creates a customer confirmation and protected admin flow', async t => {
  await t.test('email contains supplier confirmation and passenger itinerary', async () => {
    const email = await buildCarEticketEmail({ bundle, supplierConfirmation: 'ENT-ABC123', includeAttachment: false });
    assert.equal(email.recipient, 'pax@example.com');
    assert.match(email.subject, /ENT-ABC123/);
    assert.match(email.html, /Your rental is confirmed/);
    assert.match(email.html, /ENT-ABC123/);
    assert.match(email.html, /Enterprise Rent-A-Car/);
    assert.match(email.html, /Toyota Corolla or Similar/);
    assert.match(email.html, /PDF e-ticket is attached/);
    assert.equal(email.preview.bookingReference, 'CTEST1');
    assert.equal(email.preview.supplierConfirmation, 'ENT-ABC123');
  });

  await t.test('PDF e-ticket is generated from booked reservation details', async () => {
    const pdf = await buildCarEticketPdf({ bundle, supplierConfirmation: 'ENT-ABC123', companyBrand: { name: 'Enterprise Rent-A-Car', logoUrl: '' } });
    assert.ok(Buffer.isBuffer(pdf));
    assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
    assert.ok(pdf.length > 1000);
  });

  await t.test('backend requires authorization and supplier confirmation before send', () => {
    assert.match(routes, /latestAuthorization\?\.status !== 'AUTHORIZED'/);
    assert.match(routes, /SUPPLIER_CONFIRMATION_REQUIRED/);
    assert.match(routes, /markReservationBooked/);
    assert.match(routes, /sendCarEticketEmail/);
    assert.match(routes, /CAR_ETICKET_SENT/);
    assert.match(routes, /CAR_ETICKET_SEND_FAILED/);
    assert.match(routes, /requirePermission\('bookings\.cars\.edit'\)/);
    assert.match(backofficeRoutes, /carEticketRouter/);
  });

  await t.test('customer delivery supports PDF attachments through Resend and SMTP', () => {
    assert.match(emailDelivery, /attachments/);
    assert.match(emailDelivery, /content\.toString\('base64'\)/);
    assert.match(emailDelivery, /sendCustomerHtmlEmail/);
  });

  await t.test('admin gets a confirmation-number modal and send action', () => {
    assert.match(workspace, /Send Car Rental E-Ticket/);
    assert.match(workspace, /Rental reservation \/ confirmation number/);
    assert.match(workspace, /Confirm Booking & Send E-Ticket/);
    assert.match(workspace, /\/ticket\/compose/);
    assert.match(workspace, /\/ticket\/send/);
    assert.match(workspace, /Reservation marked BOOKED/);
  });
});
