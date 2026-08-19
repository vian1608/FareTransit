# Admin Dashboard Button Reliability Audit

Scope: active `/admin/dashboard` implementation (`AdminDashboardPageV2`), its GDS importer, email preview modal, backup import modal, Create New Booking page, shared `adminAPI`, and matching backend routes.

## Reliability rule

Every asynchronous admin action must satisfy all of the following:

1. A bounded client timeout exists.
2. The button is disabled while its request is active where a spinner/loading label is shown.
3. Success is explicitly surfaced or followed by verified refreshed state.
4. Failure is visible to the admin; console-only failures are not acceptable.
5. `finally` or equivalent cleanup releases the loading/busy state.
6. A failed request can be retried without refreshing the entire browser wherever practical.
7. No hard-coded admin credentials or fake production auth tokens are allowed.

The shared Axios client now has a 25-second default timeout. Admin operations also receive explicit operation-specific limits: reads 15s, saves 20s, parsing/previews 15s, emails 35s, exports 30s, imports/deletes 45s, create booking 30s.

A dashboard-wide `admin-api-error` banner is also installed. If a component-level handler misses an error, the admin still sees a visible failure message with a refresh/dismiss action instead of a silent request.

## Button/control inventory

| Area | Control | Failure handling |
|---|---|---|
| Header | Refresh | Booking list/detail loaders have timeout + error + finally; summary API errors hit global banner |
| Header | Logout | Synchronous token/session clear and redirect |
| Navigation | Bookings | Local state only |
| Navigation | Analytics | Local state only |
| Navigation | Incomplete Forms | Local state only |
| Toolbar | Create New Booking | Navigation only |
| Toolbar | Import Backup | Modal; API has 45s timeout; catch returns to review; finally clears spinner |
| Filters | Reset | Local state only |
| Filters | Search | Booking-list timeout + visible list error + finally |
| Bulk | Export Selected | 30s API timeout + dashboard finally; global error banner on failure |
| Bulk | Delete Selected | AbortController + backend batched delete + visible per-booking result + finally |
| Bulk | Clear | Local state only |
| Table | Select all / individual selection | Local state only |
| Table | View / Edit | 15s detail timeout + visible detail error + finally |
| Pagination | Previous / Next | Local state triggers bounded list reload |
| Detail | Refresh | 15s detail timeout + error + finally |
| Detail | Edit / Exit Editing | Local state only |
| Detail | Delete Booking | Same bounded batched delete engine used by bulk delete |
| Detail | Close | Local state only |
| Status | Save Status & Notes | 20s bounded `saveAndRefresh`, visible section error, finally |
| Itinerary | Import GDS / JSON | Opens importer; parser 15s and apply 20s, visible errors, finally |
| Itinerary | Enter Manually | Local state only |
| Itinerary | Remove segment | Local state only |
| Itinerary | Clear Itinerary | 20s bounded save path + section error + finally |
| Itinerary | Save Itinerary | 20s bounded persistence + read-after-write refresh + section error + finally |
| GDS modal | Parse & Preview | 15s timeout + parse error + parsing reset |
| GDS modal | Confirm & Apply Itinerary | 20s timeout + save error + saving reset; modal stays open on failure |
| GDS modal | Back / Cancel / Remove | Local state only; close disabled during save |
| Pricing | Save Pricing | Validation + 20s save + section error + finally |
| Authorization | Save Authorization Settings | Validation + 20s save + section error + finally |
| Payment | Add Split / Remove | Local state only |
| Payment | Save Payment | Validation + 20s save + section error + finally |
| Billing | Save Billing Details | Validation + 20s save + section error + finally |
| Ticket | Save Airline Details | Validation + 20s save + section error + finally |
| Emails | Preview | 15s AbortController + visible error + Retry Preview + finally |
| Emails | Send / Resend Booking Request | 35s timeout + visible email error + finally |
| Emails | Send / Resend Authorization | 35s timeout + visible email error + finally |
| Emails | Send / Resend Final Ticket | prerequisite validation + 35s timeout + visible error + finally |
| Email preview | Copy Subject | Clipboard failure notice |
| Email preview | Copy Plain Text | Clipboard failure notice |
| Email preview | Copy Formatted Email | HTML clipboard fallback to plain text + notice |
| Email preview | Open in Email App | Local mailto validation/notice |
| Email preview | Copy Authorization Link | Clipboard action; global UI remains responsive |
| Email preview | Mark Manually Sent | 20s shared API timeout + visible modal/global error + finally |
| Evidence | Download Authorization PDF | AbortController 20s + visible error + finally |
| Delete modal | Delete Permanently | Client 35s abort + backend bounded/batched delete + visible result + finally |
| Delete modal | Cancel / Done / Close | Local state; disabled while delete is in progress |
| Backup import | Browse Files | Local file parse errors are visible |
| Backup import | Back | Local state reset |
| Backup import | Select All / booking selection / strategy | Local state only |
| Backup import | Restore Bookings | API 45s timeout + visible import error + return to review + finally |
| Backup import | Done | Local close/reset |
| Create Booking | Save Draft | Create API 30s timeout + local error banner + finally clears clicked-button spinner |
| Create Booking | Create Booking Without Payment | Same bounded create flow |
| Create Booking | Create & Send Auth | Bounded phase-1 create + explicit phase-2 email handling |
| Create Booking | Create & Process Payment | Must remain gated by genuine payment-provider token; no fake paid state |

## CI enforcement

`backend/tests/admin_dashboard_button_reliability.test.mjs` enforces the active dashboard contract. It checks:

- critical visible buttons are still present;
- shared and operation-specific timeouts exist;
- dashboard-wide API failure reporting exists;
- every loading save/email/delete/export/import path releases its busy state;
- GDS parse/apply errors remain visible;
- preview/manual-send actions reset loading states;
- Create Booking resets the clicked-button spinner;
- frontend admin API paths have corresponding backend routes;
- bulk delete continues using the batched engine;
- active admin code contains no `dev_admin_token` or hard-coded `admin123` fallback;
- spinner buttons retain disabled guards.

The test is part of both `npm test` and `npm run verify:production-ready` in the backend package.

## Production testing safety

Automated CI tests execute source/contract behavior and safe mocked/offline paths. They intentionally do **not** send real passenger email, mark real customer payments paid/refunded, or permanently delete real bookings. Those destructive provider/database actions must use disposable test bookings and controlled test recipients when a live authenticated smoke test is performed.
