import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const paymentEntry = fs.readFileSync(
  path.join(repoRoot, 'frontend', 'src', 'features', 'bookings', 'components', 'PaymentCardEntry.js'),
  'utf8'
);
const bookingPage = fs.readFileSync(
  path.join(repoRoot, 'frontend', 'src', 'features', 'bookings', 'pages', 'BookingPageV3.js'),
  'utf8'
);

assert.match(paymentEntry, /replace\(\/\\D\/g, ''\)/, 'Card validation must normalize formatting before validation.');
assert.match(paymentEntry, /sum % 10 === 0/, 'Checkout must retain Luhn checksum validation.');
assert.match(paymentEntry, /digits\.length > 19/, 'Checkout must allow standards-compatible PAN lengths up to 19 digits.');
assert.match(paymentEntry, /Enter the complete card number\./, 'Incomplete PANs should have a clear validation message.');
assert.match(paymentEntry, /Check the card number and try again\./, 'Checksum failures should have a clear validation message.');
assert.match(paymentEntry, /cardNumberValid/, 'Brand detection must be kept separate from card-number validity.');
assert.match(paymentEntry, /is-valid/, 'A detected network should only receive a valid state after number validation succeeds.');
assert.doesNotMatch(bookingPage, /cardNumber\s*:/, 'Raw PAN must not be included in the booking submission payload.');
assert.doesNotMatch(bookingPage, /securityCode\s*:/, 'CVV must not be included in the booking submission payload.');
assert.match(bookingPage, /cardLast4:\s*card\.last4/, 'Only masked card metadata should be submitted with the booking.');

console.log('Checkout card validation contract passed.');
