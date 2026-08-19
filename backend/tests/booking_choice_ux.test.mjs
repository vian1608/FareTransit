import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const appEntry = read('frontend/src/index.js');
const booking = read('frontend/src/features/bookings/pages/BookingPage.js');
const choiceUX = read('frontend/src/shared/styles/BookingChoiceUX.css');

assert.match(appEntry, /BookingChoiceUX\.css/);
assert.match(booking, /id="contactSame"/);
assert.match(booking, /id="wheelchair-check"/);
assert.match(choiceUX, /#contactSame/);
assert.match(choiceUX, /#wheelchair-check/);
assert.match(choiceUX, /Use Passenger #1 as primary contact/);
assert.match(choiceUX, /Copy Passenger #1’s name into the contact details/);
assert.match(choiceUX, /Wheelchair assistance/);
assert.match(choiceUX, /Request airport wheelchair support for this booking/);
assert.match(choiceUX, /appearance:\s*none/);
assert.match(choiceUX, /:checked::after/);

console.log('modern booking preference controls contract: PASS');
