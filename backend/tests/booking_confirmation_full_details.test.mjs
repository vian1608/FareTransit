import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import Handlebars from 'handlebars';
import { buildCanonicalItinerary } from '../src/shared/utils/airline-lookup.mjs';
import itineraryMapper from '../src/modules/itineraries/itinerary.mapper.mjs';

const root = path.resolve(process.cwd(), '..');
const templateSource = fs.readFileSync(
  path.join(root, 'backend/src/integrations/resend/templates/booking-confirmation.html'),
  'utf8'
);

test('booking confirmation renders every passenger, contact email and complete itinerary without Commercial Airline', () => {
  const booking = {
    id: 'booking-test-1',
    confirmation_code: 'TFS-2026-TEST01',
    passenger_name: 'Rakesh Sharma',
    email: '',
    contacts: [{ email: 'harshitasingh1605@gmail.com', phone_number: '+1 555 111 2222' }],
    travellers: [
      {
        role: 'adult',
        title: 'Mr',
        first_name: 'Rakesh',
        last_name: 'Sharma',
        date_of_birth: '1980-04-10',
        gender: 'M',
        nationality: 'India',
        passport_number: 'P1234567',
        passport_expiry: '2030-05-01'
      },
      {
        role: 'adult',
        title: 'Ms',
        first_name: 'Priya',
        last_name: 'Sharma',
        date_of_birth: '1984-08-20',
        gender: 'F',
        nationality: 'India',
        passport_number: 'P7654321',
        passport_expiry: '2031-06-01'
      }
    ],
    flights: [
      {
        leg: 'outbound',
        airline_name: 'Commercial Airline',
        carrier_code: '',
        flight_number: 'UA 2204',
        departure_airport: 'EWR',
        arrival_airport: 'IAH',
        departure_date: '2026-08-12',
        arrival_date: '2026-08-12',
        departure_time_str: '12:00',
        arrival_time_str: '14:51',
        cabin_class: 'Economy'
      },
      {
        leg: 'outbound',
        airline_name: 'Commercial Airline',
        carrier_code: '',
        flight_number: 'UA 1675',
        departure_airport: 'IAH',
        arrival_airport: 'MDE',
        departure_date: '2026-08-12',
        arrival_date: '2026-08-12',
        departure_time_str: '16:25',
        arrival_time_str: '21:10',
        cabin_class: 'Economy'
      },
      {
        leg: 'return',
        airline_name: 'Commercial Airline',
        carrier_code: '',
        flight_number: 'UA 1676',
        departure_airport: 'MDE',
        arrival_airport: 'IAH',
        departure_date: '2026-10-21',
        arrival_date: '2026-10-21',
        departure_time_str: '09:45',
        arrival_time_str: '14:33',
        cabin_class: 'Economy'
      },
      {
        leg: 'return',
        airline_name: 'Commercial Airline',
        carrier_code: '',
        flight_number: 'UA 700',
        departure_airport: 'IAH',
        arrival_airport: 'EWR',
        departure_date: '2026-10-21',
        arrival_date: '2026-10-21',
        departure_time_str: '16:45',
        arrival_time_str: '21:28',
        cabin_class: 'Economy'
      }
    ]
  };

  const itinerary = buildCanonicalItinerary(booking);
  assert.equal(itinerary.outbound.length, 2);
  assert.equal(itinerary.return.length, 2);
  assert.equal(itinerary.outbound[0].airlineName, 'United Airlines');
  assert.equal(itinerary.outbound[0].carrierCode, 'UA');
  assert.equal(itinerary.outbound[0].flightNumber, '2204');

  const html = Handlebars.compile(templateSource)({
    emailHeaderSubtitle: 'FLIGHT RESERVATION CONFIRMATION',
    confirmationCode: booking.confirmation_code,
    passengerFirstName: 'Rakesh',
    passengerName: booking.passenger_name,
    passengerCount: '2',
    customerEmail: 'harshitasingh1605@gmail.com',
    currencySymbol: '$',
    amountPaid: '910.00',
    currency: 'USD',
    customerPaymentStatus: 'Payment Under Process'
  });

  assert.match(html, /Rakesh Sharma/);
  assert.match(html, /Priya Sharma/);
  assert.match(html, /Apr 10, 1980/);
  assert.match(html, /Aug 20, 1984/);
  assert.match(html, />Male</);
  assert.match(html, />Female</);
  assert.match(html, /harshitasingh1605@gmail\.com/);
  assert.match(html, /United Airlines/);
  assert.match(html, /UA 2204/);
  assert.match(html, /EWR/);
  assert.match(html, /IAH/);
  assert.match(html, /MDE/);
  assert.match(html, /Outbound Journey/);
  assert.match(html, /Return Journey/);
  assert.doesNotMatch(html, /Commercial Airline/i);
});

test('itinerary mapper infers carrier and never persists Commercial Airline placeholder', () => {
  const [row] = itineraryMapper.toDatabaseRows('booking-1', {
    airline: 'Commercial Airline',
    flightNumber: 'UA 2204',
    departure: { airport: 'EWR', date: '2026-08-12', time: '12:00' },
    arrival: { airport: 'IAH', date: '2026-08-12', time: '14:51' },
    class: 'Economy'
  }, 'outbound', 'one-way');

  assert.equal(row.carrier_code, 'UA');
  assert.equal(row.airline_name, 'United Airlines');
  assert.equal(row.flight_number, '2204');
  assert.notEqual(row.airline_name, 'Commercial Airline');
});
