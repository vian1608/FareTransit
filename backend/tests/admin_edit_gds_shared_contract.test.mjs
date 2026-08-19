import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd(), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const shim = read('frontend/src/features/admin/components/AdminGdsImportModalV2.js');
const adapter = read('frontend/src/features/admin/components/AdminEditBookingGdsImporter.js');
const shared = read('frontend/src/shared/components/admin/AdminItineraryImportModal.js');

assert.match(shim, /AdminEditBookingGdsImporter/);
assert.match(adapter, /AdminItineraryImportModal/);
assert.match(adapter, /await Promise\.resolve\(onApply/);
assert.match(adapter, /existingItineraryHasData=\{true\}/);
assert.match(shared, /Select Trip Type to Begin Import/);
assert.match(shared, /Outbound Journey GDS Lines/);
assert.match(shared, /Return Journey GDS Lines/);
assert.match(shared, /Confirm Overwrite & Import/);

console.log('admin edit GDS shared contract: PASS');
