import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../..');

const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const dashboard = read('frontend/src/features/admin/pages/AdminDashboardPageV2.js');
const dashboardWrapper = read('frontend/src/features/admin/pages/AdminDashboardPage.js');
const api = read('frontend/src/shared/api/api.js');
const gdsShim = read('frontend/src/features/admin/components/AdminGdsImportModalV2.js');
const gdsAdapter = read('frontend/src/features/admin/components/AdminEditBookingGdsImporter.js');
const sharedGdsImporter = read('frontend/src/shared/components/admin/AdminItineraryImportModal.js');
const previewModal = read('frontend/src/shared/components/admin/AdminEmailPreviewModal.js');
const backupModal = read('frontend/src/features/admin/components/BookingBackupImportModal.js');
const createBooking = read('frontend/src/features/admin/pages/AdminCreateBookingPage.js');
const routes = read('backend/src/modules/admin/admin.routes.mjs');
const bulkDelete = read('backend/src/modules/admin/admin.bulk-delete.controller.mjs');

function expectText(source, text, label = text) {
  assert.ok(source.includes(text), `Missing admin control/contract: ${label}`);
}

function expectRegex(source, regex, label) {
  assert.match(source, regex, label);
}

test('Admin dashboard button reliability contract', async t => {
  await t.test('1. Active dashboard exposes all critical visible controls', () => {
    const labels = [
      'Refresh', 'Logout', 'Bookings', 'Analytics', 'Incomplete Forms',
      '+ Create New Booking', 'Import Backup', 'Reset', 'Search',
      'Export Selected', 'Delete Selected', 'Clear', 'View / Edit',
      'Previous', 'Next', 'Edit Booking', 'Delete Booking', 'Close',
      'Save Status & Notes', 'Import GDS / JSON', '+ Enter Manually',
      'Clear Itinerary', 'Save Itinerary', 'Save Pricing',
      'Save Authorization Settings', '+ Add Split', 'Save Payment',
      'Save Billing Details', 'Save Airline Details', 'Preview',
      'Download Authorization Evidence PDF', 'Delete Permanently'
    ];
    labels.forEach(label => expectText(dashboard, label));
  });

  await t.test('2. Shared API has a real default timeout and per-admin-operation timeouts', () => {
    expectRegex(api, /DEFAULT_API_TIMEOUT_MS\s*=\s*25000/, 'Default Axios timeout must be explicitly bounded');
    expectRegex(api, /axios\.create\([\s\S]*?timeout:\s*DEFAULT_API_TIMEOUT_MS/, 'Axios client must enforce default timeout');
    ['read', 'save', 'parse', 'preview', 'email', 'export', 'import', 'delete', 'create'].forEach(key => {
      expectRegex(api, new RegExp(`${key}:\\s*\\d+`), `ADMIN_TIMEOUTS.${key} must exist`);
    });
  });

  await t.test('3. Admin API failures are normalized and broadcast to a visible dashboard error surface', () => {
    expectText(api, 'getApiErrorMessage');
    expectText(api, "new CustomEvent('admin-api-error'");
    expectText(api, 'The request timed out. Please retry; the button has been reset.');
    expectText(dashboardWrapper, "window.addEventListener('admin-api-error'");
    expectText(dashboardWrapper, "window.addEventListener('unhandledrejection'");
    expectText(dashboardWrapper, 'Admin action failed');
    expectText(dashboardWrapper, 'Refresh Dashboard');
    expectText(dashboardWrapper, 'Dismiss');
  });

  await t.test('4. Booking list/detail operations always release loading state', () => {
    expectRegex(dashboard, /const loadBookingDetail[\s\S]*?finally\s*{[\s\S]*?setDetailLoading\(false\)/, 'Detail loader must reset in finally');
    expectRegex(dashboard, /const loadBookings[\s\S]*?finally\s*{[\s\S]*?setLoading\(false\)/, 'Booking list loader must reset in finally');
  });

  await t.test('5. Every section save goes through bounded saveAndRefresh and clears busy state', () => {
    expectRegex(dashboard, /const saveAndRefresh[\s\S]*?withTimeout\([\s\S]*?20000[\s\S]*?catch[\s\S]*?setMessage\(section, 'error'[\s\S]*?finally\s*{[\s\S]*?setBusyFlag\(section, false\)/, 'saveAndRefresh must timeout, show error, and clear busy state');
    ['saveStatus', 'persistItinerary', 'savePricing', 'saveAuthorization', 'savePayment', 'saveBilling', 'saveTicket'].forEach(name => expectText(dashboard, `const ${name}`));
  });

  await t.test('6. Email send cannot spin forever and always reports success/failure', () => {
    expectRegex(dashboard, /const sendEmail[\s\S]*?withTimeout\([\s\S]*?35000[\s\S]*?setMessage\('emails', 'error'[\s\S]*?finally\s*{[\s\S]*?setBusyFlag\(`email-\$\{type\}`, false\)/, 'Email send must timeout, report error, and reset busy state');
    expectRegex(api, /sendEmailAction[\s\S]*?timeout:\s*ADMIN_TIMEOUTS\.email/, 'Email API must have dedicated timeout');
  });

  await t.test('7. Authorization PDF and bulk delete native fetch calls use AbortController and finally', () => {
    expectRegex(dashboard, /const downloadAuthorizationPdf[\s\S]*?new AbortController\(\)[\s\S]*?setTimeout\(\(\) => controller\.abort\(\), 20000\)[\s\S]*?finally/, 'PDF must be abortable');
    expectRegex(dashboard, /const confirmDelete[\s\S]*?new AbortController\(\)[\s\S]*?setTimeout\(\(\) => controller\.abort\(\), 35000\)[\s\S]*?finally[\s\S]*?setDeleteBusy\(false\)/, 'Delete must be abortable and release busy state');
  });

  await t.test('8. Export always releases busy state and shared export API has a bounded timeout', () => {
    expectRegex(dashboard, /const exportSelected[\s\S]*?finally\s*{[\s\S]*?setBusyFlag\('export', false\)/, 'Export busy flag must reset');
    expectRegex(api, /exportSelectedBackups[\s\S]*?timeout:\s*ADMIN_TIMEOUTS\.export/, 'Export API timeout is required');
  });

  await t.test('9. Shared GDS parsing and edit-booking apply both expose bounded, visible failure handling', () => {
    expectText(gdsShim, 'AdminEditBookingGdsImporter', 'Legacy GDS entry point must route to the edit adapter');
    expectRegex(sharedGdsImporter, /handleParseAndPreview[\s\S]*?catch\s*\(err\)[\s\S]*?setErrorMsg/, 'Shared importer must surface parsing errors');
    expectText(sharedGdsImporter, 'Parse & Preview');
    expectRegex(gdsAdapter, /await Promise\.resolve\(onApply/, 'Edit-booking importer must wait for the persisted itinerary save');
    expectRegex(gdsAdapter, /catch\s*\(error\)[\s\S]*?setApplyError/, 'Edit-booking save failures must remain visible');
    expectText(gdsAdapter, 'savingRef.current', 'Duplicate edit-booking apply actions must be guarded');
  });

  await t.test('10. Email preview and manual-sent controls have visible error handling and reset loading state', () => {
    expectRegex(previewModal, /fetchPreview[\s\S]*?controller\.abort\(\)[\s\S]*?setErrorMsg[\s\S]*?finally\s*{[\s\S]*?setLoading\(false\)/, 'Preview loader must timeout and reset');
    expectRegex(previewModal, /handleMarkManuallySentConfirm[\s\S]*?catch[\s\S]*?setErrorMsg[\s\S]*?finally\s*{[\s\S]*?setManualSubmitting\(false\)/, 'Manual sent action must reset state');
    expectText(previewModal, 'Retry Preview');
  });

  await t.test('11. Backup import cannot remain on importing forever', () => {
    expectRegex(backupModal, /handleSubmitImport[\s\S]*?catch[\s\S]*?setImportError[\s\S]*?setStep\('review'\)[\s\S]*?finally\s*{[\s\S]*?setIsSubmitting\(false\)/, 'Backup import must return to review on failure and clear spinner');
    expectRegex(api, /importBookingBackup[\s\S]*?timeout:\s*ADMIN_TIMEOUTS\.import/, 'Backup import API must have dedicated timeout');
  });

  await t.test('12. Create Booking submission always stops the clicked-button spinner', () => {
    expectRegex(createBooking, /catch\s*\(err\)[\s\S]*?setErrorMsg[\s\S]*?finally\s*{[\s\S]*?setActiveSubmissionAction\(null\)/, 'Create booking must reset active submission in finally');
    expectRegex(api, /createBooking[\s\S]*?timeout:\s*ADMIN_TIMEOUTS\.create/, 'Create booking API must have dedicated timeout');
  });

  await t.test('13. Frontend admin API methods all map to registered backend routes', () => {
    const routeFragments = [
      "'/bookings/export'", "'/bookings/bulk-delete'", "'/bookings/import-backup'",
      "'/bookings'", "'/bookings/by-request/:clientRequestId'", "'/bookings/:id'",
      "'/bookings/:id/status-notes'", "'/bookings/:id/authorization-settings'",
      "'/bookings/:id/itinerary'", "'/bookings/:id/pricing'",
      "'/bookings/:id/payment-authorization'", "'/bookings/:id/billing-details'",
      "'/itineraries/parse'", "'/bookings/:id/airline-details'",
      "'/bookings/:id/email-preview'", "'/bookings/:id/email-manual-sent'",
      "'/bookings/:id/payment-action'", "'/bookings/:id/authorization-pdf'",
      "'/stats'", "'/analytics'", "'/abandoned-bookings'"
    ];
    routeFragments.forEach(fragment => expectText(routes, fragment, `backend route ${fragment}`));
  });

  await t.test('14. Bulk delete uses the batched engine rather than per-booking request fan-out', () => {
    expectText(routes, 'adminBulkDeleteController');
    expectRegex(routes, /adminRepairController\.bulkDeleteBookings\s*=\s*adminBulkDeleteController\.bulkDeleteBookings/, 'Bulk delete repair alias must point to batched controller');
    expectRegex(bulkDelete, /\.in\('id', uuidIds\)/, 'Bulk resolver must batch UUID lookup');
    expectRegex(bulkDelete, /\.in\('confirmation_code', referenceIds\)/, 'Bulk resolver must batch reference lookup');
    expectRegex(bulkDelete, /\.delete\(\)\.in\(column, cleanValues\)/, 'Dependency deletes must be batched');
    assert.doesNotMatch(bulkDelete, /Promise\.all\([\s\S]*?bookingRepository\.getById/, 'Bulk delete must not hydrate every booking independently');
  });

  await t.test('15. No production admin auth bypass or hard-coded delete password exists', () => {
    const combined = `${dashboard}\n${dashboardWrapper}\n${api}\n${routes}\n${bulkDelete}`;
    assert.doesNotMatch(combined, /dev_admin_token/, 'Development admin token must not exist in active admin path');
    assert.doesNotMatch(combined, /admin123/, 'Hard-coded admin password must not exist in active admin path');
  });

  await t.test('16. Busy button labels are paired with disabled guards', () => {
    const requiredGuards = [
      /disabled=\{busy\.export\}/,
      /disabled=\{detailLoading\}/,
      /disabled=\{busy\.status\}/,
      /disabled=\{busy\.itinerary[^}]*\}/,
      /disabled=\{busy\.pricing\}/,
      /disabled=\{busy\.authorization\}/,
      /disabled=\{busy\.payment\}/,
      /disabled=\{busy\.billing\}/,
      /disabled=\{busy\.ticket\}/,
      /disabled=\{busy\[`email-\$\{type\}`\]\}/,
      /disabled=\{busy\.pdf\}/,
      /disabled=\{deleteBusy/
    ];
    requiredGuards.forEach((regex, index) => assert.match(dashboard, regex, `Missing disabled guard #${index + 1}`));
  });
});