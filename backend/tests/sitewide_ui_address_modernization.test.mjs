import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const indexJs = read('frontend/src/index.js');
const appJs = read('frontend/src/app/App.js');
const transitionJs = read('frontend/src/shared/components/PageTransition.js');
const addressJs = read('frontend/src/shared/components/AddressAutocompleteInput.js');
const addressCss = read('frontend/src/shared/components/AddressAutocompleteInput.css');
const adminAddressJs = read('frontend/src/features/admin/components/AdminBookingAddressPanel.js');
const adminDashboardJs = read('frontend/src/features/admin/pages/AdminDashboardPage.js');
const modernCss = read('frontend/src/shared/styles/ModernInteractionSystem.css');
const detailsCss = read('frontend/src/shared/styles/ModernDetailsMotion.css');
const backendAddress = read('backend/src/modules/flights/address-autocomplete.controller.mjs');

assert.match(indexJs, /ModernInteractionSystem\.css/, 'Global modern interaction CSS must be loaded.');
assert.match(indexJs, /ModernDetailsMotion\.css/, 'Native details motion CSS must be loaded.');
assert.match(appJs, /<PageTransition>[\s\S]*?<Routes>/, 'All application routes must remain inside PageTransition.');
assert.match(transitionJs, /theme-admin/, 'Admin pages need their own visual theme class.');
assert.match(transitionJs, /tfs-route-stage/, 'Route entry stage must be present.');
assert.match(transitionJs, /location\.key/, 'Route transition must retrigger on navigation.');

for (const token of ['--tfs-radius-md', '--tfs-shadow-md', '.adv2-button', '.accordion-section', '.theme-admin', '@media (prefers-reduced-motion: reduce)']) {
  assert.ok(modernCss.includes(token), `Modern interaction system is missing ${token}`);
}
assert.match(modernCss, /\.admin-booking-detail-route \.adv2-editor-section\.abx-collapsed[\s\S]*max-height:\s*0/, 'Admin operational sections must animate closed instead of only disappearing.');
assert.match(detailsCss, /interpolate-size:\s*allow-keywords/, 'Modern native-details motion should be progressively enhanced.');
assert.match(detailsCss, /prefers-reduced-motion/, 'Details motion must respect reduced-motion preferences.');

assert.match(backendAddress, /photon\.komoot\.io\/api\//, 'Backend address autocomplete proxy must stay wired.');
assert.match(backendAddress, /timeout:\s*3500/, 'Address proxy must stay bounded.');
assert.match(addressJs, /requestSequenceRef/, 'Autocomplete must ignore stale responses.');
assert.match(addressJs, /AbortController/, 'Autocomplete must cancel obsolete requests.');
assert.match(addressJs, /onSelectSuggestion/, 'Autocomplete must support structured selection callbacks.');
assert.match(addressJs, /addressLine1[\s\S]*city[\s\S]*state[\s\S]*postalCode[\s\S]*country/, 'Suggestions must expose complete structured address fields.');
assert.match(addressCss, /address-menu-in/, 'Address suggestion dropdown must use the modern entrance transition.');

assert.match(adminDashboardJs, /AdminBookingAddressPanel/, 'Dedicated booking route must expose the address panel.');
assert.match(adminDashboardJs, /\{isBookingDetailRoute \? \([\s\S]*?<AdminBookingAddressPanel \/>[\s\S]*?<AdminBookingWorkspace \/>[\s\S]*?\) : \([\s\S]*?<AdminDashboardPageV2 \/>/, 'Address panel must exist only inside the selected-booking branch; the dashboard must not mount there.');
assert.match(adminAddressJs, /AddressAutocompleteInput/, 'Admin address field must use autocomplete while typing.');
assert.match(adminAddressJs, /patchBillingDetails/, 'Admin address save must use the isolated billing-details API.');
for (const field of ['addressLine1', 'addressLine2', 'city', 'stateProvince', 'postalCode', 'country', 'billingEmail', 'billingPhone']) {
  assert.ok(adminAddressJs.includes(field), `Admin address editor is missing ${field}`);
}
assert.match(adminAddressJs, /finally\s*\{[\s\S]*setSaving\(false\)/, 'Address save button must always leave its loading state.');
assert.match(adminAddressJs, /response\?\.success === false/, 'Address API failures must produce a visible failure instead of silent success.');

console.log('PASS sitewide UI/address modernization contract');
