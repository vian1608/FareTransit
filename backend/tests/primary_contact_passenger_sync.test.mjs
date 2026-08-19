import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const entry = read('frontend/src/index.js');
const syncUX = read('frontend/src/shared/contact/installPrimaryContactSyncUX.js');

assert.match(entry, /installPrimaryContactSyncUX/);
assert.match(entry, /installPrimaryContactSyncUX\(\)/);
assert.match(syncUX, /contactSame/);
assert.match(syncUX, /passenger-card-block/);
assert.match(syncUX, /input\[placeholder\^="First Name"\]/);
assert.match(syncUX, /input\[placeholder\^="Last Name"\]/);
assert.match(syncUX, /input\[placeholder="First Name"\]/);
assert.match(syncUX, /input\[placeholder="Last Name"\]/);
assert.match(syncUX, /dispatchEvent\(new Event\('input', \{ bubbles: true \}\)\)/);
assert.match(syncUX, /dispatchEvent\(new Event\('change', \{ bubbles: true \}\)\)/);
assert.match(syncUX, /if \(target\.checked\)/);

console.log('primary contact passenger sync contract: PASS');
