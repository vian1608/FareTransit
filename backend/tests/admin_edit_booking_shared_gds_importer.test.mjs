import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd(), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const editImporter = read('frontend/src/features/admin/components/AdminGdsImportModalV2.js');
const sharedImporter = read('frontend/src/shared/components/admin/AdminItineraryImportModal.js');
const managementPanel = read('frontend/src/features/admin/components/AdminBookingManagementPanel.js');

assert.match(
  editImporter,
  /import AdminItineraryImportModal from ['"]\.\.\/\.\.\/\.\.\/shared\/components\/admin\/AdminItineraryImportModal['"];/,
  'Edit Booking must reuse the same AdminItineraryImportModal used by Create Booking.'
);
assert.match(editImporter, /<AdminItineraryImportModal/, 'Edit Booking must render the shared itinerary importer.');
assert.match(editImporter, /existingItineraryHasData=\{true\}/, 'Edit Booking imports must require overwrite confirmation for existing itinerary data.');
assert.match(editImporter, /outboundSegments/, 'Edit Booking adapter must preserve outbound segments.');
assert.match(editImporter, /returnSegments/, 'Edit Booking adapter must preserve return segments.');
assert.match(editImporter, /multiCityJourneys/, 'Edit Booking adapter must accept multi-city segments from the shared importer.');
assert.match(editImporter, /journey_direction:\s*'return'/, 'Return segments must remain tagged as return.');
assert.match(editImporter, /journey_direction:\s*segment\.journey_direction\s*\|\|\s*'multi_city'/, 'Multi-city segment direction must be retained by the adapter.');
assert.doesNotMatch(editImporter, /parseItineraryText/, 'Edit Booking must not keep a separate parser implementation.');

assert.match(sharedImporter, /Select Trip Type to Begin Import/, 'Shared importer must retain the trip-type selection screen.');
assert.match(sharedImporter, /One Way/, 'Shared importer must expose One Way import.');
assert.match(sharedImporter, /Round Trip/, 'Shared importer must expose Round Trip import.');
assert.match(sharedImporter, /Multi-City/, 'Shared importer must expose Multi-City import.');
assert.match(sharedImporter, /Outbound Journey GDS Lines/, 'Round-trip importer must expose a dedicated outbound GDS input.');
assert.match(sharedImporter, /Return Journey GDS Lines/, 'Round-trip importer must expose a dedicated return GDS input.');
assert.match(sharedImporter, /Confirm Overwrite & Import/, 'Existing itinerary replacement must require explicit confirmation.');

assert.match(managementPanel, /<AdminGdsImportModalV2/, 'Booking Management must keep the adapter mounted from the itinerary section.');
assert.match(managementPanel, /onApply=\{applyImportedItinerary\}/, 'Imported itinerary must continue through the existing safe save path.');

console.log('admin edit booking shared GDS importer contract: PASS');
