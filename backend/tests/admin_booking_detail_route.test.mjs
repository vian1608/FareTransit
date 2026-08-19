import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(process.cwd(), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const wrapper = read('frontend/src/features/admin/pages/AdminDashboardPage.js');
const workspace = read('frontend/src/features/admin/components/AdminBookingWorkspace.js');
const workspaceCss = read('frontend/src/features/admin/components/AdminBookingWorkspace.css');
const management = read('frontend/src/features/admin/components/AdminBookingManagementPanel.js');
const managementCss = read('frontend/src/features/admin/components/AdminBookingManagementPanel.css');
const adminEnhancementsCss = read('frontend/src/features/admin/pages/AdminDashboardEnhancements.css');
const header = read('frontend/src/shared/components/Header.js');
const headerCss = read('frontend/src/shared/components/Header.css');
const footer = read('frontend/src/shared/components/Footer.js');
const footerCss = read('frontend/src/shared/components/Footer.css');
const app = read('frontend/src/app/App.js');
const routes = read('backend/src/modules/admin/admin.routes.mjs');
const passengerController = read('backend/src/modules/admin/admin.passenger.controller.mjs');

test('admin booking route is a dedicated compact booking workspace', async t => {
  await t.test('direct route stays separate from dashboard list and mounts dedicated management controls', () => {
    assert.match(app, /path="\/admin\/bookings\/:code"/, 'Direct booking route must exist.');
    assert.match(wrapper, /isBookingDetailRoute\s*=\s*Boolean\(code\)/, 'Booking route must have explicit detail-only mode.');
    assert.match(wrapper, /\{isBookingDetailRoute \? \([\s\S]*?<AdminBookingAddressPanel \/>[\s\S]*?<AdminBookingWorkspace \/>[\s\S]*?<AdminBookingManagementPanel \/>[\s\S]*?\) : \([\s\S]*?<AdminDashboardPageV2 \/>/, 'Detail route must mount focused booking panels without mounting the dashboard list.');
    assert.match(wrapper, /__tfsBookingDetailRequestDedupe/, 'Sibling detail panels must coalesce simultaneous identical booking reads.');
    assert.doesNotMatch(management, /getBookings\(|getStats\(|getAnalytics\(|getAbandonedBookings\(/, 'Dedicated management panel must not query booking lists, stats, analytics or abandoned forms.');
    assert.match(wrapper, /window\.open\(`\/admin\/bookings\/\$\{encodeURIComponent\(reference\)\}`,[\s\S]*?'_blank'\)/, 'View / Edit must open the direct booking route in a new tab.');
  });

  await t.test('admin site header, admin brand header and footer align with the 1540px body container', () => {
    assert.match(header, /const isAdminRoute = location\.pathname\.startsWith\('\/admin'\)/, 'Site header must recognize admin routes.');
    assert.match(header, /header--admin-route/, 'Admin routes must receive a dedicated site-header width class.');
    assert.match(headerCss, /\.header--admin-route \.container\s*\{[\s\S]*?max-width:\s*1540px;[\s\S]*?padding-left:\s*22px;[\s\S]*?padding-right:\s*22px;/, 'Red site header must match the admin body width and horizontal padding.');
    assert.match(adminEnhancementsCss, /\.adv2-header__inner\s*\{[\s\S]*?max-width:\s*1540px\s*!important;[\s\S]*?padding:\s*12px 22px\s*!important;/, 'Blue admin header must match the admin body width and horizontal padding.');
    assert.match(workspaceCss, /\.abx-workspace\s*\{[\s\S]*?max-width:\s*1540px;[\s\S]*?padding:\s*18px 22px 0;/, 'Booking workspace must keep the same horizontal geometry.');
    assert.match(footer, /const isAdminRoute = location\.pathname\.startsWith\('\/admin'\)/, 'Footer must recognize admin routes.');
    assert.match(footer, /footer--admin/, 'Admin routes must receive a dedicated footer width class.');
    assert.match(footerCss, /\.footer--admin > \.container\s*\{[\s\S]*?max-width:\s*1540px;[\s\S]*?padding-left:\s*22px;[\s\S]*?padding-right:\s*22px;/, 'Admin footer must match the admin body width and horizontal padding.');
  });

  await t.test('booking tab title is distinct from dashboard title', () => {
    assert.match(workspace, /const desiredTitle = `\$\{code\} \| Booking Editor`/, 'Booking editor must enforce a reference-specific browser tab title.');
    assert.match(workspace, /MutationObserver\(enforceTitle\)/, 'Booking title must remain stable while nested components update the document head.');
  });

  await t.test('passenger editor exposes the stored identity and contact fields', () => {
    [
      'Passenger type', 'Title', 'First name *', 'Middle name', 'Last name *',
      'Date of birth', 'Gender', 'Nationality', 'Passport number', 'Passport expiry',
      'Primary Contact', 'Email', 'Phone', 'Country code', '+ Add Passenger', 'Remove passenger'
    ].forEach(label => assert.ok(workspace.includes(label), `Missing passenger editor field/control: ${label}`));
    assert.match(workspace, /\/passenger-details/, 'Passenger save must use the protected passenger-details endpoint.');
    assert.match(workspace, /AbortController/, 'Passenger save must be bounded and abortable.');
    assert.match(workspace, /finally[\s\S]*?setSaving\(false\)/, 'Passenger save must always release loading state.');
  });

  await t.test('passenger endpoint persists actual traveller rows and primary contact', () => {
    assert.match(routes, /adminPassengerController\.updatePassengerDetails/, 'Passenger route must use durable passenger controller.');
    assert.match(passengerController, /from\('travellers'\)/, 'Passenger editor must persist to travellers table.');
    assert.match(passengerController, /date_of_birth/, 'DOB must persist to traveller row.');
    assert.match(passengerController, /passport_number/, 'Passport number must persist to traveller row.');
    assert.match(passengerController, /passport_expiry/, 'Passport expiry must persist to traveller row.');
    assert.match(passengerController, /from\('contacts'\)/, 'Primary contact must persist to contacts table.');
    assert.match(passengerController, /passenger_name:\s*primaryName/, 'Booking primary passenger summary must stay synchronized.');
    assert.match(passengerController, /REAUTHORIZATION_REQUIRED/, 'Identity changes after authorization must invalidate the old authorization state.');
  });

  await t.test('visual itinerary and compact dropdown behavior are present', () => {
    assert.ok(workspace.includes('Flight Itinerary'), 'Visual itinerary section is required.');
    assert.match(workspace, /function Journey/, 'Itinerary must render route journeys.');
    assert.match(workspace, /className="abx-route-line"/, 'Itinerary must have a visual airport-to-airport route line.');
    assert.match(workspace, /layoverBetween/, 'Multi-segment itinerary should display calculable layovers.');
    assert.match(workspace, /<details className="abx-flight"/, 'Every visual flight segment must be independently collapsible.');
    assert.match(workspaceCss, /adv2-editor-section\.abx-collapsed \.adv2-editor-section__body/, 'Legacy compact operational section styling must remain available.');
  });

  await t.test('detail route exposes full booking management workflow', () => {
    [
      'Booking Management', 'Status & Internal Notes', 'Flight Itinerary', 'Import GDS / JSON',
      'Add Flight Manually', 'Save Itinerary', 'Pricing', 'Supplier fare', 'Customer total',
      'Passenger Authorization', 'Authorized amount', 'Payment & Splits', 'Billing & Card Reference',
      'Airline Ticket / PNR', 'Email & Authorization Actions', 'Download Authorization Evidence PDF'
    ].forEach(label => assert.ok(management.includes(label), `Missing booking management control: ${label}`));

    [
      'patchStatusNotes', 'patchItinerary', 'patchPricing', 'patchAuthorizationSettings',
      'patchPaymentAuthorization', 'patchBillingDetails', 'patchAirlineDetails', 'sendEmailAction'
    ].forEach(method => assert.match(management, new RegExp(`adminAPI\\.${method}`), `Management panel must use adminAPI.${method}.`));

    assert.match(management, /AdminGdsImportModalV2/, 'Itinerary editor must support the existing GDS/JSON importer.');
    assert.match(management, /AdminEmailPreviewModal/, 'Email actions must retain preview support.');
    assert.match(management, /authorization-pdf/, 'Authorization evidence download must remain available.');
    assert.match(management, /Safe card metadata only/, 'Billing editor must explicitly explain that only safe card metadata is stored.');
    assert.doesNotMatch(
      management,
      /cardNumber\s*:|card_number\s*:|name=["']cardNumber|id=["']cardNumber|securityCode\s*:|security_code\s*:|cvv\s*:|cvc\s*:/i,
      'Management panel must never define or accept full PAN or CVV/CVC fields.'
    );
    assert.match(management, /cardLast4/, 'Billing editor should expose only masked card reference data.');
    assert.match(managementCss, /\.abm-two-column/, 'Pricing and authorization should have a compact dedicated layout.');
    assert.match(managementCss, /@media \(max-width: 680px\)/, 'Management controls must remain usable on mobile.');
  });
});
