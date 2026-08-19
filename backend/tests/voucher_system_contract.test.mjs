import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GLOBAL_MINIMUM_BOOKING_AMOUNT,
  GLOBAL_MINIMUM_PAYABLE_PERCENT,
  calculateVoucherApplication,
} from '../src/modules/vouchers/voucher-policy.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

assert.equal(GLOBAL_MINIMUM_BOOKING_AMOUNT, 150);
assert.equal(GLOBAL_MINIMUM_PAYABLE_PERCENT, 60);

const capped = calculateVoucherApplication({
  supplierPrice: 1000,
  priceBeforeVoucher: 900,
  voucherAmount: 400,
});
assert.equal(capped.eligible, true);
assert.equal(capped.capped, true);
assert.equal(capped.minimumPayableFloor, 600);
assert.equal(capped.maximumVoucherDiscount, 300);
assert.equal(capped.appliedDiscount, 300);
assert.equal(capped.finalPrice, 600);

const normal = calculateVoucherApplication({
  supplierPrice: 1000,
  priceBeforeVoucher: 900,
  voucherAmount: 50,
});
assert.equal(normal.eligible, true);
assert.equal(normal.capped, false);
assert.equal(normal.appliedDiscount, 50);
assert.equal(normal.finalPrice, 850);

const underMinimum = calculateVoucherApplication({
  supplierPrice: 200,
  priceBeforeVoucher: 149.99,
  voucherAmount: 25,
});
assert.equal(underMinimum.eligible, false);
assert.equal(underMinimum.code, 'VOUCHER_MINIMUM_NOT_MET');

const migration = read('backend/migrations/032_vouchers_and_redemptions.sql');
const bookingRoutes = read('backend/src/modules/bookings/booking.routes.mjs');
const voucherMiddleware = read('backend/src/modules/vouchers/voucher-booking.middleware.mjs');
const voucherService = read('backend/src/modules/vouchers/voucher.service.mjs');
const bookingMapper = read('backend/src/modules/bookings/booking.mapper.mjs');
const adminRoutes = read('backend/src/modules/admin/admin.routes.mjs');
const rootRoutes = read('backend/src/routes/index.mjs');
const app = read('frontend/src/app/App.js');
const journeyRoutes = read('frontend/src/features/journey/TokenizedJourneyRoutes.js');
const checkout = read('frontend/src/features/bookings/vouchers/BookingVoucherPage.js');
const adminPage = read('frontend/src/features/admin/pages/AdminVouchersPage.js');
const voucherShortcut = read('frontend/src/features/admin/components/AdminVoucherShortcut.js');
const voucherShortcutCss = read('frontend/src/features/admin/components/AdminVoucherShortcut.css');

assert.match(migration, /minimum_booking_amount[\s\S]*CHECK \(minimum_booking_amount >= 150\.00\)/);
assert.match(migration, /minimum_payable_percent[\s\S]*CHECK \(minimum_payable_percent >= 60\.00/);
assert.match(migration, /voucher_redemptions/);
assert.match(migration, /voucher_discount/);
assert.match(migration, /price_before_voucher/);

assert.match(bookingRoutes, /applyVoucherPricingToBooking/);
assert.match(voucherMiddleware, /calculateBookingTotal/);
assert.match(voucherMiddleware, /voucherService\.validate/);
assert.match(voucherMiddleware, /payload\.customer_price = application\.finalPrice/);
assert.match(voucherMiddleware, /requestedCode/);

assert.match(rootRoutes, /router\.use\('\/vouchers'/);
assert.match(adminRoutes, /router\.get\('\/vouchers'/);
assert.match(adminRoutes, /router\.post\('\/vouchers'/);
assert.match(adminRoutes, /router\.patch\('\/vouchers\/:id'/);
assert.match(adminRoutes, /redemptionsAdmin/);

assert.match(voucherService, /assigned_email/);
assert.match(voucherService, /max_redemptions/);
assert.match(voucherService, /max_redemptions_per_customer/);
assert.match(voucherService, /voucher_redemptions/);
assert.match(voucherService, /GLOBAL_MINIMUM_BOOKING_AMOUNT/);
assert.match(voucherService, /GLOBAL_MINIMUM_PAYABLE_PERCENT/);

assert.match(bookingMapper, /voucher_code/);
assert.match(bookingMapper, /voucher_discount/);
assert.match(bookingMapper, /price_before_voucher/);
assert.match(bookingMapper, /minimum_payable_floor/);

// Checkout is now reached through /booking/c_..., but the existing voucher UI must
// remain the rendered checkout and must still perform live server validation.
assert.match(app, /path="\/booking\/:checkoutToken"/);
assert.match(app, /TokenizedBookingPage/);
assert.match(journeyRoutes, /features\/bookings\/vouchers\/BookingVoucherPage|\.\.\/bookings\/vouchers\/BookingVoucherPage/);
assert.match(journeyRoutes, /<BookingVoucherPage initialJourneyPayload=\{session\.payload \|\| \{\}\} \/>/);
assert.match(app, /path="\/admin\/vouchers"/);
assert.match(checkout, /voucherAPI\.validate/);
assert.match(checkout, /Vouchers require a booking amount of at least \$150\.00/);
assert.match(checkout, /60% of the ticket value/);

// Checkout DOM synchronization must never observe and rewrite the same text in a
// tight loop. This protects against Chrome's Page Unresponsive failure on /booking/c_.
assert.match(checkout, /new MutationObserver\(scheduleSync\)/);
assert.match(checkout, /requestAnimationFrame/);
assert.match(checkout, /currentText !== finalText/);
assert.doesNotMatch(checkout, /new MutationObserver\(syncCheckoutState\)/);
assert.doesNotMatch(checkout, /characterData:\s*true/);
assert.doesNotMatch(checkout, /setTextIfChanged\(mobileTotal,\s*finalText\)/);
assert.match(adminPage, /Minimum customer payment/);
assert.match(adminPage, /minimumPayablePercent/);
assert.match(adminPage, /minimumBookingAmount/);
assert.match(adminPage, /Redemption history/);

// The dashboard voucher shortcut must live in the admin toolbar, never as a
// floating footer/pagination overlay.
assert.match(voucherShortcut, /createPortal/);
assert.match(voucherShortcut, /document\.querySelector\('\.adv2-toolbar'\)/);
assert.doesNotMatch(voucherShortcutCss, /position\s*:\s*fixed/i);
assert.doesNotMatch(voucherShortcutCss, /bottom\s*:/i);

console.log('voucher checkout + admin + 60% revenue-floor contract: PASS');
