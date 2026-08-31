import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const datePicker = read('frontend', 'src', 'features', 'flights', 'components', 'TravelDatePicker.js');
const bookingPage = read('frontend', 'src', 'features', 'bookings', 'pages', 'BookingPageV2.js');
const modifyModal = read('frontend', 'src', 'features', 'flights', 'components', 'ModifySearchModal.js');
const returnPage = read('frontend', 'src', 'features', 'flights', 'pages', 'ReturnFlightSelectionPage.js');
const searchOverlay = read('frontend', 'src', 'shared', 'components', 'FlightSearchProgressOverlay.js');

assert.match(bookingPage, /Passport Expiry[\s\S]*placeholder="YYYY-MM-DD"/, 'Passport expiry must retain the visible YYYY-MM-DD contract.');
assert.match(datePicker, /useIsoInput[\s\S]*\[\^0-9-\]/, 'ISO date input must allow keyboard hyphens instead of stripping them.');
assert.match(datePicker, /pickerView[\s\S]*months[\s\S]*years/, 'Date picker must support direct month and year views.');
assert.match(datePicker, /Choose month/, 'Month heading must be interactive.');
assert.match(datePicker, /Choose year/, 'Year heading must be interactive.');
assert.match(datePicker, /Enter a valid date in/, 'Manual date errors must be visible to customers.');

assert.match(modifyModal, /createPortal/, 'Modify Search must render through a portal to escape route stacking contexts.');
assert.match(modifyModal, /UPDATE_TIMEOUT_MS/, 'Modify Search must have a bounded update timeout.');
assert.match(modifyModal, /taking longer than expected/, 'Modify Search timeout must explain the problem to the customer.');
assert.match(modifyModal, /return createPortal\(modal, document\.body\)/, 'Modify Search portal must mount at document.body.');

assert.match(returnPage, /Back to departure flights/, 'Return-flight selection must provide explicit outbound back navigation.');
assert.match(returnPage, /RETURN_SEARCH_TIMEOUT_MS/, 'Return-flight search must be bounded.');
assert.match(returnPage, /You are not stuck/, 'Return-flight failure state must explain recovery options.');

assert.match(searchOverlay, /SEARCH_STALL_MS/, '0–100 search progress must detect a stalled provider response.');
assert.match(searchOverlay, /Retry search/, 'Stalled search must offer retry.');
assert.match(searchOverlay, /Keep waiting/, 'Stalled search must allow the customer to continue waiting intentionally.');
assert.match(searchOverlay, /Change search/, 'Stalled search must allow the customer to leave the wait screen.');

console.log('customer date/modal/recovery contract: PASS');
