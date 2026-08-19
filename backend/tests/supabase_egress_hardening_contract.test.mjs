import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const adminWrapper = read('frontend/src/features/admin/pages/AdminDashboardPage.js');
const adminDashboardV2 = read('frontend/src/features/admin/pages/AdminDashboardPageV2.js');
const adminReader = read('backend/src/modules/admin/admin-booking-read.repository.mjs');
const adminService = read('backend/src/modules/admin/admin.service.mjs');
const abandonedRepo = read('backend/src/modules/abandoned-bookings/abandoned-booking.repository.mjs');
const abandonedService = read('backend/src/modules/abandoned-bookings/abandoned-booking.service.mjs');
const bookingHardening = read('backend/src/modules/bookings/booking.repository.egress-hardening.mjs');
const bookingConstants = read('backend/src/modules/bookings/booking.constants.mjs');
const statusHardening = read('backend/src/modules/bookings/booking.service.status-hardening.mjs');
const bookingRoutes = read('backend/src/modules/bookings/booking.routes.mjs');
const adminRoutes = read('backend/src/modules/admin/admin.routes.mjs');
const rateLimiter = read('backend/src/middleware/rate-limit.mjs');
const metrics = read('backend/src/middleware/response-metrics.mjs');
const requestMetrics = read('backend/src/observability/request-metrics.mjs');
const supabaseClient = read('backend/src/integrations/supabase/supabase.client.mjs');
const app = read('backend/src/app.mjs');
const migration = read('backend/migrations/033_egress_hardening_and_schema_contract.sql');
const bookingPage = read('frontend/src/features/bookings/pages/BookingPage.js');
const confirmationPage = read('frontend/src/features/bookings/pages/PaymentSuccessPage.js');

// Booking-detail pages must not mount the entire hidden dashboard.
assert.match(adminWrapper, /isBookingDetailRoute \? \(/);
assert.match(adminWrapper, /<AdminBookingAddressPanel \/>/);
assert.match(adminWrapper, /<AdminBookingWorkspace \/>/);
assert.match(adminWrapper, /:\s*\(\s*<AdminDashboardPageV2 \/>/);
assert.match(adminWrapper, /__tfsBookingDetailRequestDedupe/);
assert.match(adminWrapper, /inFlight\.has\(key\)/);

// High-volume admin reads are explicit-column DTO reads, not SELECT * fan-out.
assert.doesNotMatch(adminReader, /select\(['"]\*['"]\)/);
assert.match(adminReader, /FLIGHT_COLUMNS/);
assert.doesNotMatch(adminReader, /fare_details/);
assert.match(adminService, /adminBookingReadRepository\.list/);
assert.match(adminService, /adminBookingReadRepository\.getDetail/);
assert.match(adminService, /select\('id,session_key,traveller_info,contact_info,current_step,updated_at'\)/);

// Incomplete checkout data is lazy-loaded only when its tab is actually opened.
const summaryLoader = adminDashboardV2.match(/const loadSummaryData = useCallback[\s\S]*?\}, \[\]\);/)?.[0] || '';
assert.ok(summaryLoader, 'loadSummaryData must exist');
assert.doesNotMatch(summaryLoader, /getAbandonedBookings/);
assert.match(adminDashboardV2, /const loadAbandoned = useCallback/);
assert.match(adminDashboardV2, /if \(activeTab === 'abandoned'\) loadAbandoned\(\)/);
assert.match(adminDashboardV2, /abandonedLoaded/);
assert.match(adminDashboardV2, /abandonedLoading/);
assert.doesNotMatch(adminDashboardV2, /TICKETED','COMPLETED','CANCELLED/);
assert.match(adminDashboardV2, /TICKETED','DONE','CANCELLED/);

// Abandoned checkout uses one compact UPSERT and does not request the written row back.
assert.match(abandonedRepo, /\.upsert\(/);
assert.match(abandonedRepo, /onConflict: 'session_key'/);
assert.doesNotMatch(abandonedRepo, /findSession/);
assert.doesNotMatch(abandonedRepo, /\.select\(/);
assert.match(abandonedRepo, /compactFlight/);
assert.match(abandonedService, /RETENTION_DAYS = 30/);

// Current customer checkout saves one initial abandoned snapshot; no polling/autosave loop.
const abandonedSaveCalls = (bookingPage.match(/bookingAPI\.saveAbandoned\(/g) || []).length;
assert.equal(abandonedSaveCalls, 1);
assert.doesNotMatch(bookingPage, /setInterval\s*\(/);
assert.doesNotMatch(confirmationPage, /setInterval\s*\(/);

// High-volume booking repository override avoids SELECT * and memory-only booking creation.
assert.doesNotMatch(bookingHardening, /select\(['"]\*['"]\)/);
assert.match(bookingHardening, /BOOKING_DATABASE_INSERT_FAILED/);
assert.match(bookingHardening, /client_request_id/);
assert.match(bookingHardening, /idempotency_key/);
assert.match(bookingHardening, /email_deliveries/);
assert.match(bookingHardening, /booking_payment_splits/);
assert.doesNotMatch(bookingHardening, /booking_itinerary_segments.*select/);
assert.match(bookingHardening, /INSERT_RETURN_COLUMNS = 'id,confirmation_code,created_at,updated_at'/);
assert.match(bookingHardening, /normalizeCountryCode/);
assert.match(bookingHardening, /\^\\\+\\d\{1,4\}\$/);
assert.match(bookingHardening, /'DRAFT','PENDING'/);
assert.match(bookingConstants, /'DRAFT'/);

// Payment authorization is not a persisted payment status. Legacy AUTHORIZED
// values may be recognized only so they can be converted to PROCESSING.
assert.match(statusHardening, /ALLOWED_PAYMENT_STATES = new Set\(\['PENDING', 'PROCESSING', 'PAID', 'FAILED', 'REFUNDED'\]\)/);
assert.doesNotMatch(statusHardening, /ALLOWED_PAYMENT_STATES = new Set\([^\n]*AUTHORIZED/);
assert.match(statusHardening, /normalized === 'AUTHORIZED'[\s\S]*'PROCESSING'/);
assert.match(statusHardening, /payment_status: normalizePaymentState\(paymentRow\.payment_status\)/);
assert.match(statusHardening, /authorization_status/);

// Expensive public/admin lookup routes are bounded.
assert.match(bookingRoutes, /bookingReadRateLimiter/);
assert.match(bookingRoutes, /router\.get\('\/confirmation\/:confirmationCode', bookingReadRateLimiter/);
assert.match(bookingRoutes, /router\.get\('\/:reference', bookingReadRateLimiter/);
assert.match(adminRoutes, /adminReadRateLimiter/);
assert.match(adminRoutes, /adminWriteRateLimiter/);

// Each limiter owns its own bucket and periodically prunes stale entries.
assert.match(rateLimiter, /const buckets = new Map\(\)/);
assert.doesNotMatch(rateLimiter, /^const cache = new Map/m);
assert.match(rateLimiter, /requestCounter % 500/);

// Observability catches large payloads, slow APIs and database fan-out without logging response bodies.
assert.match(app, /app\.use\(requestMetricsContext\)/);
assert.match(app, /app\.use\(responseMetrics\)/);
assert.match(requestMetrics, /AsyncLocalStorage/);
assert.match(requestMetrics, /supabaseCalls/);
assert.match(supabaseClient, /recordSupabaseCall/);
assert.match(metrics, /API_EGRESS_WARNING/);
assert.match(metrics, /API_EGRESS_CRITICAL/);
assert.match(metrics, /SUPABASE_FANOUT_WARNING/);
assert.match(metrics, /SUPABASE_FANOUT_CRITICAL/);
assert.match(metrics, /API_SLOW_REQUEST/);
assert.doesNotMatch(metrics, /logger\.(?:info|warn|error)\([^\n]*body/);

// Database contract fixes the exact production drift categories found in logs.
assert.match(migration, /ux_abandoned_bookings_session_key/);
assert.match(migration, /client_request_id VARCHAR\(100\)/);
assert.match(migration, /idempotency_key VARCHAR\(100\)/);
assert.match(migration, /WHEN 'DRAFT' THEN 'DRAFT'/);
assert.match(migration, /'DRAFT','PENDING','AWAITING_AUTHORIZATION'/);
assert.match(migration, /contacts ALTER COLUMN country_code TYPE VARCHAR\(16\)/);
assert.match(migration, /bookings_payment_status_check/);
assert.match(migration, /booking_payment_methods/);
assert.match(migration, /booking_payment_splits/);
assert.match(migration, /email_deliveries/);
assert.match(migration, /booking_itinerary_segments/);
assert.match(migration, /CREATE VIEW public\.email_logs/);
assert.match(migration, /CREATE VIEW public\.audit_events/);
assert.match(migration, /CREATE VIEW public\.payment_splits/);

console.log('Supabase egress hardening contract: PASS');
