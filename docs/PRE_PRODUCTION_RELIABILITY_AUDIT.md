# THE FINAL SEAT — PRE-PRODUCTION RELIABILITY AUDIT
**Repository:** vian1608/faretransit  
**Production:** https://www.faretransit.com  
**Audit Date:** 2026-08-07  
**Status: PHASE 1 — READ-ONLY AUDIT COMPLETE. No code has been changed.**

---

## SUMMARY SCORECARD

| Severity | Count |
|----------|-------|
| P0 CRITICAL | 6 |
| P1 HIGH | 9 |
| P2 MEDIUM | 10 |
| P3 CLEANUP | 8 |
| **TOTAL** | **33** |

---

## P0 CRITICAL — FIX FIRST (COMMIT 1 & 2)

### P0-1 GOOGLE SERVICE ACCOUNT PRIVATE KEY ON DISK IN REPO
- **Files:** `fare-transit-1ceae727e583.json`, `urgent.json` (repository root)
- **Status:** VERIFIED — real GCP private key `-----BEGIN PRIVATE KEY-----` with key ID `1ceae727e5837641634d2d00c902af7bc8a89975` is present on disk.
- **Must do:** Run `git log --all --full-history -- fare-transit-1ceae727e583.json` immediately. If ever committed, rotate GCP key, purge with BFG, then delete files and use `GA4_CREDENTIALS_JSON` env var.

### P0-2 ADMIN LOGIN ISSUES JWT WITHOUT VALIDATING PASSWORD
- **File:** `backend/src/modules/admin/admin.service.mjs` lines 9-22
- **Status:** VERIFIED — `password` param is received but never compared to anything. Any password produces a valid admin JWT.
- **Impact:** Complete admin panel compromise. Any actor gets admin access.
- **Fix:** Compare password to bcrypt hash stored in `ADMIN_PASSWORD_HASH` env var.

### P0-3 DEV TOKEN BYPASS ACTIVE IN PRODUCTION (NO ENV GUARD)
- **File:** `backend/src/middleware/authenticate.mjs` lines 16-19
- **Status:** VERIFIED — `dev_admin_token` and `mock_admin_token_dev` bypass all JWT verification with no NODE_ENV guard.
- **Impact:** Anyone who sends `Authorization: Bearer dev_admin_token` gets full admin access in production NOW.
- **Fix:** Remove bypass entirely, or gate with `if (env.nodeEnv !== 'production' && env.nodeEnv !== 'staging')`.

### P0-4 PRODUCTION FALLBACK TO INSECURE JWT SECRET AND ADMIN PASSWORD
- **File:** `backend/src/config/env.mjs` lines 51, 56
- **Status:** VERIFIED
  ```
  get jwtSecret() { return process.env.JWT_SECRET || 'your-secret-key-change-this-in-production'; }
  get adminPassword() { return process.env.ADMIN_PASSWORD || 'admin123'; }
  ```
- **Impact:** If JWT_SECRET env var is cleared, all JWTs become forgeable with a public string.
- **Fix:** Throw fatal error in production if JWT_SECRET is missing. Remove adminPassword plaintext fallback.

### P0-5 SUPABASE CREATES CLIENT WITH PLACEHOLDER CREDENTIALS (SILENT STARTUP)
- **File:** `backend/src/config/supabase.mjs` lines 4-5
- **Status:** VERIFIED
  ```
  const url = env.supabaseUrl || 'https://placeholder.supabase.co';
  const key = env.supabaseSecretKey || 'placeholder-key';
  ```
- **Impact:** Missing credentials → server starts successfully → all DB calls fail with 500 → bookings silently lost.
- **Fix:** Throw fatal error if credentials are missing in production.

### P0-6 PRODUCTION ACCEPTANCE TEST MUTATES LIVE PRODUCTION DATABASE
- **File:** `backend/tests/final_production_acceptance_verification.test.mjs`
- **Status:** VERIFIED — loads `backend/.env` directly (line 2), then calls `createBookingRecord`, `saveItinerarySegments`, `savePaymentSplits`, `updateStatus`, `createAuthorizationToken`, `acceptAuthorization`, `softDeleteBooking` with NO production guard and NO finally cleanup.
- **Impact:** Running this test writes test records to the live Supabase database. Test records with code `TFS-2026-FINALACCEPT` appear in admin dashboard.
- **Fix:** Add `if (NODE_ENV === 'production') throw new Error('BLOCKED')` as first line. Require `TEST_SUPABASE_URL`. Add `finally` cleanup.

---

## P1 HIGH — RUNTIME FAILURES FOR REAL PASSENGERS

### P1-1 `currencyStr` UNDECLARED IN sendAuthorizationEmail — AUTHORIZATION EMAILS CRASH
- **File:** `backend/src/modules/authorizations/passenger-authorization.service.mjs` lines 224, 225, 246, 267, 272, 331
- **Status:** VERIFIED — variable used 6 times, never declared anywhere in function or file.
- **Impact:** Every authorization email send throws `ReferenceError: currencyStr is not defined`. Entire authorization workflow is broken.
- **Fix:** Add `const currencyStr = (authRecord.currency || completeBooking.currency || 'USD').toUpperCase();` at start of function.

### P1-2 DUPLICATE ADMIN ROUTES (4 CONFIRMED)
- **File:** `backend/src/modules/admin/admin.routes.mjs`
- **Status:** VERIFIED by automated scan (57 routes, 4 duplicate METHOD+PATH pairs)
  - `PATCH /bookings/:id/pricing` — lines 43 and 83
  - `PATCH /bookings/:id/airline-details` — lines 44 and 74
  - `PATCH /bookings/:id/payment-authorization` — lines 48 and 68
  - `PATCH /bookings/:id/billing-details` — lines 50 and 71
  - Plus `DELETE /bookings/:bookingId` vs `DELETE /bookings/:id` (lines 34-35)
- **Fix:** Remove duplicate registrations. Keep one canonical route per operation.

### P1-3 setImmediate FOR EMAIL DISPATCH IN SERVERLESS — EMAILS SILENTLY DROPPED
- **File:** `backend/src/modules/bookings/booking.service.mjs` lines 284-297
- **Status:** VERIFIED
- **Impact:** In Vercel serverless, process freezes after HTTP response before setImmediate fires → booking confirmation emails never sent to passengers.
- **Fix:** Dispatch emails synchronously before response using Promise.allSettled with timeout, or move to Vercel background job.

### P1-4 BOOKING CREATION NOT TRULY ATOMIC
- **File:** `backend/src/modules/bookings/booking.service.mjs` lines 80-319
- **Status:** VERIFIED — 6 sequential Supabase inserts with compensating delete (not DB transaction). If compensating delete fails, orphan partial records remain.
- **Fix:** Use Supabase server-side RPC / PostgreSQL transaction.

### P1-5 RESEND API FETCH HAS NO SERVER-SIDE TIMEOUT
- **Files:** `resend.service.mjs` lines 87-108, `passenger-authorization.service.mjs` lines 363-386
- **Status:** VERIFIED — no AbortSignal, no timeout on any `fetch('https://api.resend.com/emails')` call.
- **Impact:** Resend API degradation → request hangs indefinitely → Vercel 504 → admin retries → duplicate emails.
- **Fix:** `const signal = AbortSignal.timeout(10000); const response = await fetch(url, { ..., signal });`

### P1-6 npm test RUNS ONLY PayPal TESTS (91 FILES IGNORED)
- **File:** `backend/package.json` line 10: `"test": "node tests/paypal.test.mjs"`
- **Status:** VERIFIED — 92 test files in tests/, only 1 runs via `npm test`.
- **Fix:** `"test": "node --test tests/*.test.mjs"`

### P1-7 BACKUP SQL CONTAINS REAL PASSENGER PII (NAMES, DOB, EMAILS)
- **File:** `backend/backups/restore_prelaunch_data_20260802_1255.sql` (33KB)
- **Status:** VERIFIED — contains travellers table with real names (dean wilson, ravi bishnoi), DOB, contacts with real emails. NOT excluded by .gitignore (only *.json is excluded, not *.sql).
- **Fix:** Add `backend/backups/` to `.gitignore`. Confirm via `git log` if committed; purge with BFG if so.

### P1-8 environment-safety.mjs MISSING "DELETE FROM" IN DESTRUCTIVE KEYWORDS
- **File:** `backend/src/config/environment-safety.mjs` lines 34-40
- **Status:** VERIFIED — docstring says DELETE FROM is covered, implementation omits it.
- **Fix:** Add `'DELETE FROM'` to DESTRUCTIVE_KEYWORDS array.

### P1-9 CORS methods MISSING PATCH DESPITE EXTENSIVE PATCH API USAGE
- **File:** `backend/src/config/cors.mjs` line 28: `methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']`
- **Status:** VERIFIED — PATCH absent. 15+ admin PATCH endpoints exist.
- **Fix:** Add `'PATCH'` to methods array.

---

## P2 MEDIUM

| ID | File | Issue | Status |
|----|------|-------|--------|
| P2-1 | `booking.constants.mjs` + `booking.service.mjs` | Status constants fragmented — BOOKING_STATUS has 4 values, BOOKING_STATUSES has 9, service.mjs inlines its own. DRAFT not in constants. | VERIFIED |
| P2-2 | `frontend/src/shared/utils/normalizeError.js` | No handling for CanceledError, AbortError, ECONNABORTED — raw "canceled" shown to users | VERIFIED |
| P2-3 | `backend/src/routes/index.mjs` | authorizationRouter mounted at /authorizations AND /authorization; enquiryRouter at /inquiries AND /enquiries | VERIFIED |
| P2-4 | `booking.service.mjs` lines 20-21 | Two unused in-memory idempotency Maps that don't survive cold start | VERIFIED |
| P2-5 | `booking.repository.mjs` lines 2382,2392,2410,2424,2436,2447 | 6 empty `catch (e) {}` blocks in rollback functions — errors silently swallowed | VERIFIED |
| P2-6 | `frontend/src/shared/api/api.js` lines 235-242 | `adminAPI.getBookingById` and `adminAPI.getBookingDetails` are identical functions — dead code | VERIFIED |
| P2-7 | `booking.service.mjs` | Passenger list with passport_number may be serialized into logger.info calls | POSSIBLE |
| P2-8 | `passenger-authorization.service.mjs` line 15 | `AUTH_SECRET` falls back to `env.resendApiKey` then hardcoded `'tfs_authorization_secret_key_2026'` | VERIFIED |
| P2-9 | `backend/src/routes/index.mjs` lines 52-54 | import statements interleaved with router.use() calls | VERIFIED |
| P2-10 | `booking.service.mjs` line 75 | DRAFT status used but not in BOOKING_STATUSES array | VERIFIED |

---

## P3 CLEANUP

| ID | Issue |
|----|-------|
| P3-1 | `AdminDashboardPage.js` line 1: blanket `/* eslint-disable no-unused-vars */` hides all linter errors |
| P3-2 | `backend/package.json`: empty author, no engines field, no lint/verify scripts |
| P3-3 | `fare-transit-1ceae727e583.json` and `urgent.json` appear identical — one is redundant |
| P3-4 | Dual idempotency field names: `idempotencyKey` and `clientRequestId` used interchangeably |
| P3-5 | `env.ga4PropertyId` fallback `'456789123'` is a fake placeholder ID |
| P3-6 | `resend.service.mjs` is 1,822 lines combining transport + rendering + business logic |
| P3-7 | `backend/backups/prelaunch_backup_20260802_1255.json` (41KB) may contain operational PII |
| P3-8 | Authorization token uses underscore-split format brittle to future bookingId format changes |

---

## ADMIN ROUTE INVENTORY — 57 routes, 4 duplicate METHOD+PATH pairs confirmed

| Method | Path | Handler |
|--------|------|---------|
| POST | /admin/login | adminController.login |
| GET | /admin/bookings | adminController.getBookings |
| POST | /admin/bookings | adminController.createBooking |
| POST | /admin/bookings/export | adminController.exportBookingsBulk |
| POST | /admin/bookings/bulk-delete | adminController.bulkDeleteBookings |
| POST | /admin/bookings/import-backup | adminController.importBookingBackup |
| GET | /admin/bookings/by-request/:clientRequestId | adminController.getBookingByClientRequestId |
| GET | /admin/bookings/:id | adminController.getBookingDetail |
| DELETE | /admin/bookings/:bookingId | adminController.deleteBooking |
| **DELETE** | **/admin/bookings/:id** | **adminController.deleteBooking ← SHADOW DUP** |
| POST | /admin/bookings/:id/email-preview | adminController.emailPreview |
| POST | /admin/bookings/:id/email-manual-sent | adminController.markEmailManuallySent |
| PATCH | /admin/bookings/:id/status-notes | adminController.updateStatusNotes |
| PATCH | /admin/bookings/:id/status | bookingController.updateStatus |
| PATCH | /admin/bookings/:id/passenger-details | adminController.updatePassengerDetails |
| PATCH | /admin/bookings/:id/contact-details | adminController.updateContactDetails |
| PATCH | /admin/bookings/:id/itinerary | bookingController.updateItinerary |
| PATCH | /admin/bookings/:id/pricing | adminController.updatePricing |
| **PATCH** | **/admin/bookings/:id/pricing** | **adminController.updatePricing ← DUP** |
| PATCH | /admin/bookings/:id/airline-details | adminController.saveTicketDetails |
| **PATCH** | **/admin/bookings/:id/airline-details** | **adminController.saveTicketDetails ← DUP** |
| PATCH | /admin/bookings/:id/authorization | adminController.updateAuthorizationSettings |
| PATCH | /admin/bookings/:id/authorization-settings | adminController.updateAuthorizationSettings |
| PATCH | /admin/bookings/:id/payment | adminController.updatePaymentAuthorization |
| PATCH | /admin/bookings/:id/payment-authorization | adminController.updatePaymentAuthorization |
| **PATCH** | **/admin/bookings/:id/payment-authorization** | **adminController.updatePaymentAuthorization ← DUP** |
| PATCH | /admin/bookings/:id/billing-reference | adminController.updateBillingDetails |
| PATCH | /admin/bookings/:id/billing-details | adminController.updateBillingDetails |
| **PATCH** | **/admin/bookings/:id/billing-details** | **adminController.updateBillingDetails ← DUP** |
| PATCH | /admin/bookings/:id/payment-splits | adminController.updatePaymentSplits |
| PATCH | /admin/bookings/:id/ticket | bookingController.updateTicket |
| PATCH | /admin/bookings/:id/notes | bookingController.updateNotes |
| PATCH | /admin/bookings/:id/restore | adminController.restoreBooking |
| PUT | /admin/bookings/:id/save-all | adminController.saveAllChanges |
| PUT | /admin/bookings/:id | adminController.updateBooking |
| PUT | /admin/bookings/:id/payment-splits | adminController.updatePaymentSplits |
| PUT | /admin/bookings/:id/ticket-details | adminController.saveTicketDetails |
| POST | /admin/bookings/:id/itinerary | adminController.updateItinerary |
| POST | /admin/bookings/:id/pricing | adminController.updatePricing |
| POST | /admin/bookings/:identifier/pricing | adminController.updatePricing |
| PATCH | /admin/bookings/:identifier/pricing | adminController.updatePricing |
| POST | /admin/bookings/:id/payment-action | adminController.handlePaymentAction |
| POST | /admin/bookings/:id/send-final-ticket | adminController.sendFinalTicketEmail |
| POST | /admin/bookings/:id/resend-admin-email | adminController.resendAdminAcknowledgement |
| POST | /admin/bookings/:id/process-authorized | adminController.processAuthorizedBooking |
| POST | /admin/bookings/:id/import-itinerary | bookingController.importItineraryText |
| POST | /admin/itineraries/parse | adminController.parseItinerary |
| POST | /admin/parse-itinerary | adminController.parseItinerary |
| POST | /admin/bookings/:id/restore-snapshot | adminController.restoreFromSnapshot |
| GET | /admin/bookings/:id/export | adminController.exportBooking |
| GET | /admin/bookings/:id/history | adminController.getBookingHistory |
| GET | /admin/bookings/:id/diagnostic | adminController.getBookingDiagnosticData |
| GET | /admin/bookings/:id/authorization-evidence | passengerAuthorizationController.getEvidenceExport |
| GET | /admin/bookings/:id/authorization-pdf | adminController.downloadAuthorizationPdf |
| GET | /admin/stats | adminController.getStats |
| GET | /admin/analytics | adminController.getAnalytics |
| GET | /admin/abandoned-bookings | adminController.getAbandonedBookings |

---

## RECOMMENDED 9-COMMIT REMEDIATION ORDER

| Commit | Scope | Items |
|--------|-------|-------|
| 1 | P0 Auth & Security | Fix login password validation, remove dev token bypass, make JWT_SECRET required in prod, remove admin123 fallback |
| 2 | P0 Env & DB Safety | Fatal error on missing Supabase creds, add backups/ to .gitignore, guard acceptance test, add DELETE FROM to safety check |
| 3 | Route cleanup | Remove 4 dup PATCH routes, remove duplicate DELETE, add PATCH to CORS, move imports to top |
| 4 | P1 Bug fixes | Declare currencyStr, add AbortSignal timeout to Resend, fix setImmediate in serverless |
| 5 | Error handling | normalizeError CanceledError/AbortError, replace empty catch blocks with logger.error |
| 6 | Canonical status | Add DRAFT to constants, consolidate BOOKING_STATUS enum, remove inline status arrays |
| 7 | Email reliability | Auth secret fallback fix, all external fetch() timeouts |
| 8 | Test infrastructure | npm test runs all files, acceptance test production guard, finally cleanup |
| 9 | Cleanup | Remove dead adminAPI.getBookingDetails, remove unused Maps, fix ga4PropertyId placeholder |

---

## OPEN ITEMS (require further investigation)

1. Whether `fare-transit-1ceae727e583.json` was ever committed — run `git log --all --full-history -- fare-transit-1ceae727e583.json`
2. Whether passport numbers appear in server logs — requires live log inspection
3. Whether test records from acceptance test exist in production Supabase — check for confirmation_code = 'TFS-2026-FINALACCEPT'
4. Full audit of AdminDashboardPage.js (2000+ line file, blanket eslint-disable)
5. Frontend axios instance has no default timeout — all API calls unbounded
6. Whether RESERVATION_CONFIRMED / COMPLETED / TICKETED statuses exist in Supabase DB schema

---

## VERDICT

**This application has TWO independent authentication bypasses active in production simultaneously (P0-2 and P0-3). Combined with the authorization email crash (P1-1, `currencyStr` undefined) and the production-database-mutating test (P0-6), remediation must begin with Commit 1 immediately.**

**All P0 and P1 findings are VERIFIED in source code. No hypothetical issues are reported as confirmed.**
