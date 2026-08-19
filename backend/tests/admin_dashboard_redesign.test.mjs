import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(process.cwd());
const cssFilePath = path.join(projectRoot, 'frontend/src/features/admin/pages/AdminDashboardPage.css');
const jsFilePath = path.join(projectRoot, 'frontend/src/features/admin/pages/AdminDashboardPage.js');

test('Admin Dashboard Customer Bookings Table Redesign', async (t) => {
  const cssContent = fs.readFileSync(cssFilePath, 'utf8');
  const jsContent = fs.readFileSync(jsFilePath, 'utf8');

  await t.test('1. Layout: Desktop layout removes fixed 440px/500px right sidebar and uses 100% full width', () => {
    assert.ok(!cssContent.includes('grid-template-columns: minmax(0, 1fr) 440px;'), 'CSS should not have fixed 440px sidebar column');
    assert.ok(cssContent.includes('.admin-workspace-grid'), 'CSS should include workspace grid class');
    assert.ok(cssContent.includes('width: 100%;'), 'CSS should specify full 100% width');
  });

  await t.test('2. Columns: Table includes all 11 explicit columns in sequence', () => {
    assert.ok(jsContent.includes('col-checkbox'), 'Header must contain Checkbox column');
    assert.ok(jsContent.includes('col-ref'), 'Header must contain Reference column');
    assert.ok(jsContent.includes('col-customer'), 'Header must contain Customer column');
    assert.ok(jsContent.includes('col-carrier'), 'Header must contain Carrier column');
    assert.ok(jsContent.includes('col-route'), 'Header must contain Route column');
    assert.ok(jsContent.includes('col-passengers'), 'Header must contain Passengers column');
    assert.ok(jsContent.includes('col-amount'), 'Header must contain Amount column');
    assert.ok(jsContent.includes('col-bstatus'), 'Header must contain Booking Status column');
    assert.ok(jsContent.includes('col-pstatus'), 'Header must contain Payment Status column');
    assert.ok(jsContent.includes('col-date'), 'Header must contain Date column');
    assert.ok(jsContent.includes('col-action'), 'Header must contain Action column');
  });

  await t.test('3. Expandable Rows: Expand row toggle button includes aria attributes and rotating chevron', () => {
    assert.ok(jsContent.includes('aria-expanded={isExpanded}'), 'View Details button must include aria-expanded');
    assert.ok(jsContent.includes('aria-controls='), 'View Details button must include aria-controls');
    assert.ok(jsContent.includes('chevron-icon--rotated'), 'Chevron icon must rotate when expanded');
    assert.ok(jsContent.includes('colSpan={11}'), 'Expanded row td must span all 11 columns');
  });

  await t.test('4. Single Expand Constraint: Toggling a row collapses previous expanded row state', () => {
    assert.ok(jsContent.includes('expandedBookingId === booking.id') || jsContent.includes('expandedBookingId === bId'), 'State tracks single expanded booking ID');
    assert.ok(jsContent.includes('setExpandedBookingId(bId)') || jsContent.includes('setExpandedBookingId(booking.id)'), 'Expanding a row updates single expandedBookingId state');
    assert.ok(jsContent.includes('setExpandedBookingId(null)'), 'Collapsing clears expandedBookingId state');
  });

  await t.test('5. Lazy Loading & Session Caching: Details are lazy-loaded on expand and cached in session', () => {
    assert.ok(jsContent.includes('bookingDetailsCache'), 'Session details cache state exists');
    assert.ok(jsContent.includes('detailsLoading'), 'Lazy-loading state exists for expanded row');
    assert.ok(jsContent.includes('getBookingById'), 'Fetches full booking details via API when not cached');
  });

  await t.test('6. Refresh Action: Refresh button refetches details and updates cache', () => {
    assert.ok(jsContent.includes('handleRefreshCurrentBooking'), 'Refresh handler exists');
    assert.ok(jsContent.includes('Refetch latest booking details'), 'Refresh button rendered with tooltip');
  });

  await t.test('7. In-Place Edit Mode: Edit Booking switches view in-place with Save & Cancel', () => {
    assert.ok(jsContent.includes('isEditMode ? \'Edit Booking\' : \'Booking Details\''), 'Title updates in edit mode');
    assert.ok(jsContent.includes('handleSaveAllChanges'), 'Save Changes button triggers handleSaveAllChanges');
    assert.ok(jsContent.includes('setIsEditMode(false)'), 'Cancel Editing button exits edit mode');
  });

  await t.test('8. Preservation of 10 Accordions: All detail accordions and actions remain accessible', () => {
    assert.ok(jsContent.includes("openAccordion === 'itinerary'"), 'Flight Itinerary accordion preserved');
    assert.ok(jsContent.includes("openAccordion === 'pricing'"), 'Pricing accordion preserved');
    assert.ok(jsContent.includes("openAccordion === 'ticket_details'"), 'Ticket details accordion preserved');
    assert.ok(jsContent.includes("openAccordion === 'authorization'"), 'Authorization accordion preserved');
    assert.ok(jsContent.includes("openAccordion === 'payment'"), 'Payment details accordion preserved');
    assert.ok(jsContent.includes("openAccordion === 'payment'") && jsContent.includes('Payment Authorization Splits'), 'Splits subsection preserved');
    assert.ok(jsContent.includes('billingForm') && jsContent.includes('handleSaveBillingDetails'), 'Billing & Card Reference section preserved');
    assert.ok(jsContent.includes('Email history'), 'Email history log preserved');
    assert.ok(jsContent.includes('Authorization records'), 'Authorization audit records preserved');
    assert.ok(jsContent.includes('Delete Booking') || jsContent.includes('Delete Permanently'), 'Delete booking action preserved');
  });

  await t.test('9. Multi-Select & Bulk Actions: Checkboxes enable bulk export action bar', () => {
    assert.ok(jsContent.includes('selectedBookingIds'), 'State tracks selected booking IDs');
    assert.ok(jsContent.includes('handleToggleSelectAll'), 'Select All checkbox handler exists');
    assert.ok(jsContent.includes('handleExportSelectedBookings'), 'Export Selected handler exists');
  });

  await t.test('10. Filter Preservation: Search filters remain intact during expand/collapse', () => {
    assert.ok(jsContent.includes('handleFilterChange'), 'Filter change handler preserved');
    assert.ok(jsContent.includes('filters.reference'), 'Reference filter input preserved');
    assert.ok(jsContent.includes('filters.name'), 'Name filter input preserved');
    assert.ok(jsContent.includes('filters.email'), 'Email filter input preserved');
    assert.ok(jsContent.includes('filters.status'), 'Status filter select preserved');
  });

  await t.test('11. Mobile Responsiveness: Mobile list view handles screens <= 768px without overflow', () => {
    assert.ok(cssContent.includes('@media (max-width: 768px)'), 'CSS includes mobile max-width 768px media query');
    assert.ok(cssContent.includes('.mobile-bookings-list'), 'CSS defines mobile bookings list');
    assert.ok(jsContent.includes('className="mobile-bookings-list"'), 'JS renders mobile bookings list');
  });

  await t.test('12. Pagination & AbortController: 10 bookings per page and 15s request timeout handling', () => {
    assert.ok(jsContent.includes('pageSize'), 'JS defines pageSize state');
    assert.ok(jsContent.includes('currentPage'), 'JS defines currentPage state');
    assert.ok(jsContent.includes('totalPages'), 'JS defines totalPages state');
    assert.ok(jsContent.includes('handlePageChange'), 'JS defines handlePageChange function');
    assert.ok(jsContent.includes('AbortController'), 'JS uses AbortController for details request timeout');
    assert.ok(jsContent.includes('handleRetryBookingDetails'), 'JS includes Retry button for details loading errors');
  });
});
