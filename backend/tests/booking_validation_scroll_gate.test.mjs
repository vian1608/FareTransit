import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const source = fs.readFileSync(
  path.join(root, 'frontend/src/shared/validation/installBookingValidationUX.js'),
  'utf8'
);

// Auto-scroll must be armed by the actual Complete Booking CTA, not by normal
// DOM mutations such as opening the fare breakdown or another accordion.
assert.match(source, /armValidationFeedback\(\);[\s\S]*setTimeout\(applyValidationFeedback, 90\)/);
assert.match(source, /function isValidationFeedbackArmed\(\)/);
assert.match(source, /if \(!isValidationFeedbackArmed\(\)\) return;/);

// MutationObserver may react only to real booking/payment error banners while
// a submit-triggered validation window is active.
assert.match(source, /ERROR_BANNER_SELECTOR = '\.booking-global-error, \.payment-error-banner'/);
assert.match(source, /mutations\.some\(mutationTouchesErrorBanner\)/);
assert.doesNotMatch(
  source,
  /closest\?\.\('\.booking-global-error, \.payment-error-banner, \.booking-page'\)/
);

// Once the first invalid field is handled, further unrelated UI mutations must
// not repeatedly pull the customer back to the passenger form.
assert.match(source, /scrollToInvalid\(target\);\s*disarmValidationFeedback\(\);/);

console.log('booking validation auto-scroll submit gate contract: PASS');
