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
const sharedCardInput = fs.readFileSync(
  path.join(repoRoot, 'frontend', 'src', 'shared', 'components', 'CardNumberInput.js'),
  'utf8'
);
const bookingPage = fs.readFileSync(
  path.join(repoRoot, 'frontend', 'src', 'features', 'bookings', 'pages', 'BookingPageV3.js'),
  'utf8'
);

assert.match(paymentEntry, /const CARD_NUMBER_DIGITS = 16;/, 'Checkout must enforce the FareTransit 16-digit card-number contract.');
assert.match(paymentEntry, /digitsOnly\(value\)\.length === CARD_NUMBER_DIGITS/, 'Checkout validity must require exactly 16 digits.');
assert.match(paymentEntry, /slice\(0, CARD_NUMBER_DIGITS\)/, 'Checkout must truncate card input at 16 digits.');
assert.match(paymentEntry, /maxLength=\{19\}/, 'Formatted 16-digit input must allow four groups plus spaces and no extra PAN digits.');
assert.match(paymentEntry, /Enter the complete 16-digit card number\./, 'Incomplete PANs should have a clear 16-digit validation message.');
assert.doesNotMatch(paymentEntry, /sum % 10 === 0/, 'Checkout must not reject a complete 16-digit entry solely on a local Luhn checksum.');
assert.doesNotMatch(paymentEntry, /digits\.length > 19/, 'Checkout must not permit legacy 17-19 digit entry paths.');
assert.match(paymentEntry, /cardNumberValid/, 'Brand detection must remain separate from card-number completion state.');
assert.match(paymentEntry, /is-valid/, 'A detected network should receive a valid state only after the 16-digit number is complete.');

assert.match(sharedCardInput, /const CARD_NUMBER_DIGITS = 16;/, 'Shared card inputs must follow the same 16-digit contract.');
assert.match(sharedCardInput, /slice\(0, CARD_NUMBER_DIGITS\)/, 'Shared card inputs must reject a 17th digit.');
assert.match(sharedCardInput, /maxLength=\{19\}/, 'Shared formatted card inputs must be capped at 16 digits plus spaces.');
assert.doesNotMatch(sharedCardInput, /slice\(0, 15\)/, 'Shared card inputs must not retain a separate 15-digit entry path.');

assert.doesNotMatch(bookingPage, /cardNumber\s*:/, 'Raw PAN must not be included in the booking submission payload.');
assert.doesNotMatch(bookingPage, /securityCode\s*:/, 'CVV must not be included in the booking submission payload.');
assert.match(bookingPage, /cardLast4:\s*card\.last4/, 'Only masked card metadata should be submitted with the booking.');

console.log('Checkout 16-digit card validation contract passed.');
