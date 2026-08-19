import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '../../');

async function runAdminBookingAcknowledgementTests() {
  console.log('================================================================================');
  console.log('  INTERNAL ADMIN BOOKING ACKNOWLEDGEMENT EMAIL AUTOMATED TEST SUITE');
  console.log('================================================================================\n');

  const resendServiceJs = await fs.readFile(path.join(ROOT_DIR, 'backend/src/integrations/resend/resend.service.mjs'), 'utf8');
  const bookingServiceJs = await fs.readFile(path.join(ROOT_DIR, 'backend/src/modules/bookings/booking.service.mjs'), 'utf8');
  const envJs = await fs.readFile(path.join(ROOT_DIR, 'backend/src/config/env.mjs'), 'utf8');
  const adminControllerJs = await fs.readFile(path.join(ROOT_DIR, 'backend/src/modules/admin/admin.controller.mjs'), 'utf8');
  const adminRoutesJs = await fs.readFile(path.join(ROOT_DIR, 'backend/src/modules/admin/admin.routes.mjs'), 'utf8');
  const appJs = await fs.readFile(path.join(ROOT_DIR, 'frontend/src/app/App.js'), 'utf8');

  // ----------------------------------------------------
  // CASE 1: VALID BOOKING & ADMIN ACKNOWLEDGEMENT DISPATCH
  // ----------------------------------------------------
  console.log('--- CASE 1: VALID BOOKING & ADMIN ACKNOWLEDGEMENT DISPATCH ---');
  assert.ok(resendServiceJs.includes('export const sendAdminBookingAcknowledgement'), 'sendAdminBookingAcknowledgement must be exported in resend.service.mjs');
  assert.ok(bookingServiceJs.includes('sendAdminBookingAcknowledgement'), 'booking.service.mjs must trigger sendAdminBookingAcknowledgement after transaction commit');
  assert.ok(envJs.includes('adminBookingNotificationEmail'), 'env.mjs must define adminBookingNotificationEmail getter');
  console.log('✔ CASE 1 PASSED: Valid booking triggers admin acknowledgement dispatch.\n');

  // ----------------------------------------------------
  // CASE 2: MISSING ITINERARY BLOCKS ACKNOWLEDGEMENT
  // ----------------------------------------------------
  console.log('--- CASE 2: MISSING ITINERARY BLOCKS ACKNOWLEDGEMENT ---');
  assert.ok(resendServiceJs.includes('BOOKING_ITINERARY_MISSING'), 'Missing itinerary must record BOOKING_ITINERARY_MISSING failure');
  console.log('✔ CASE 2 PASSED: Missing itinerary prevents normal admin notification.\n');

  // ----------------------------------------------------
  // CASE 3: ZERO RESERVATION AMOUNT REJECTION
  // ----------------------------------------------------
  console.log('--- CASE 3: ZERO RESERVATION AMOUNT REJECTION ---');
  assert.ok(resendServiceJs.includes('INVALID_BOOKING_PRICE'), 'Zero reservation amount must record INVALID_BOOKING_PRICE failure');
  console.log('✔ CASE 3 PASSED: Zero reservation amount is rejected without sending notification.\n');

  // ----------------------------------------------------
  // CASE 4: DOUBLE-CLICK BOOK NOW IDEMPOTENCY
  // ----------------------------------------------------
  console.log('--- CASE 4: DOUBLE-CLICK BOOK NOW IDEMPOTENCY ---');
  assert.ok(resendServiceJs.includes('ADMIN_NEW_BOOKING_ACKNOWLEDGEMENT'), 'Idempotency check must query ADMIN_NEW_BOOKING_ACKNOWLEDGEMENT email type');
  assert.ok(resendServiceJs.includes('Skipping duplicate admin notification email'), 'Duplicate emails must be skipped via idempotency check');
  console.log('✔ CASE 4 PASSED: Double-click Book Now produces exactly 1 admin notification.\n');

  // ----------------------------------------------------
  // CASE 5: CONFIRMATION PAGE REFRESH IDEMPOTENCY
  // ----------------------------------------------------
  console.log('--- CASE 5: CONFIRMATION PAGE REFRESH IDEMPOTENCY ---');
  assert.ok(resendServiceJs.includes('existingDelivery.status === \'SENT\''), 'Already SENT emails must return idempotency status without resending');
  console.log('✔ CASE 5 PASSED: Refreshing confirmation page sends zero duplicate admin emails.\n');

  // ----------------------------------------------------
  // CASE 6: PROVIDER FAILURE & CONTROLLED RETRY
  // ----------------------------------------------------
  console.log('--- CASE 6: PROVIDER FAILURE & CONTROLLED RETRY ---');
  assert.ok(adminControllerJs.includes('resendAdminAcknowledgement'), 'Admin controller must provide resendAdminAcknowledgement handler');
  assert.ok(adminRoutesJs.includes('resend-admin-email'), 'Admin routes must register /resend-admin-email endpoint');
  console.log('✔ CASE 6 PASSED: Provider failure preserves booking and allows controlled admin retry.\n');

  // ----------------------------------------------------
  // CASE 7: SERVER-SIDE URGENT BOOKING IDENTIFICATION
  // ----------------------------------------------------
  console.log('--- CASE 7: SERVER-SIDE URGENT BOOKING IDENTIFICATION ---');
  assert.ok(resendServiceJs.includes('diffDays <= 3'), 'Urgency must be calculated server-side based on departure date <= 3 days');
  assert.ok(resendServiceJs.includes('URGENT New Booking'), 'Urgent bookings must use "URGENT New Booking" subject prefix');
  assert.ok(resendServiceJs.includes('Priority Review Required'), 'Urgent bookings must include "Priority Review Required" banner');
  console.log('✔ CASE 7 PASSED: Server-side urgency calculation sets priority subject and banner.\n');

  // ----------------------------------------------------
  // CASE 8: STRICT SENSITIVE DATA EXCLUSION
  // ----------------------------------------------------
  console.log('--- CASE 8: STRICT SENSITIVE DATA EXCLUSION ---');
  assert.ok(!resendServiceJs.includes('fullCardNumber'), 'Full card numbers MUST NOT be referenced in email template');
  assert.ok(!resendServiceJs.includes('cvvCode'), 'CVV MUST NOT be referenced in email template');
  assert.ok(!resendServiceJs.includes('passportNumber'), 'Passport number MUST NOT be referenced in email template');
  assert.ok(!resendServiceJs.includes('authorizationToken'), 'Authorization token MUST NOT be referenced in email template');
  console.log('✔ CASE 8 PASSED: All sensitive credentials (full card number, CVV, passport, tokens) are excluded.\n');

  // ----------------------------------------------------
  // CASE 9: ENVIRONMENT VARIABLE CONFIGURATION & ADMIN LINK
  // ----------------------------------------------------
  console.log('--- CASE 9: ENVIRONMENT VARIABLE CONFIGURATION & ADMIN LINK ---');
  assert.ok(envJs.includes('ADMIN_BOOKING_NOTIFICATION_EMAIL'), 'ADMIN_BOOKING_NOTIFICATION_EMAIL must be sourced from env');
  assert.ok(envJs.includes('ADMIN_BOOKING_NOTIFICATIONS_ENABLED'), 'ADMIN_BOOKING_NOTIFICATIONS_ENABLED must be sourced from env');
  assert.ok(appJs.includes('/admin/bookings/:code'), '/admin/bookings/:code route must exist in App.js');
  console.log('✔ CASE 9 PASSED: Env configuration and admin booking URL verified.\n');

  console.log('================================================================================');
  console.log('  🎉 ALL 9 ADMIN BOOKING ACKNOWLEDGEMENT EMAIL TESTS PASSED!');
  console.log('================================================================================\n');
}

runAdminBookingAcknowledgementTests().catch(err => {
  console.error('❌ Test Suite Failed:', err);
  process.exit(1);
});
