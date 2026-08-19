import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(process.cwd(), '..');
const template = fs.readFileSync(path.join(root, 'backend/src/integrations/resend/templates/booking-confirmation.html'), 'utf8');
const airlineLookup = fs.readFileSync(path.join(root, 'backend/src/shared/utils/airline-lookup.mjs'), 'utf8');

test('booking confirmation template uses full passenger and itinerary renderers', () => {
  assert.match(template, /bookingPassengerDetails confirmationCode/);
  assert.match(template, /bookingItineraryDetails confirmationCode/);
  assert.match(template, /Contact Email/);
  assert.match(airlineLookup, /Handlebars\.registerHelper\('bookingPassengerDetails'/);
  assert.match(airlineLookup, /Handlebars\.registerHelper\('bookingItineraryDetails'/);
  assert.match(airlineLookup, /Airline details pending/);
});
