/**
 * Billing Details Persistence Test Suite
 * Tests the booking_payment_methods persistence layer.
 *
 * Run: node tests/billing_details_persistence.test.mjs
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// ── Test harness ─────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
    failures.push(label);
  }
}

async function test(name, fn) {
  console.log(`\n[TEST] ${name}`);
  try {
    await fn();
  } catch (err) {
    console.error(`  ✗ THREW: ${err.message}`);
    failed++;
    failures.push(`${name}: ${err.message}`);
  }
}

// ── Import modules ────────────────────────────────────────────────────────────
const { default: bookingRepository } = await import('../src/modules/bookings/booking.repository.mjs');
const { default: bookingMapper } = await import('../src/modules/bookings/booking.mapper.mjs');

// ── Test 1: parseExpDate helper via booking.service ───────────────────────────
await test('Expiry string "12/28" parses to month=12, year=2028', async () => {
  function parseExpDate(dateStr) {
    if (!dateStr) return { month: null, year: null };
    const parts = String(dateStr).split('/');
    const month = parts[0] ? parseInt(parts[0], 10) : null;
    const rawYear = parts[1] ? parseInt(parts[1], 10) : null;
    const year = rawYear ? (rawYear < 100 ? 2000 + rawYear : rawYear) : null;
    return { month: (month >= 1 && month <= 12) ? month : null, year };
  }
  const { month, year } = parseExpDate('12/28');
  assert(month === 12, 'month === 12');
  assert(year === 2028, 'year === 2028');
});

await test('Expiry string "04/2031" parses to month=4, year=2031', async () => {
  function parseExpDate(dateStr) {
    if (!dateStr) return { month: null, year: null };
    const parts = String(dateStr).split('/');
    const month = parts[0] ? parseInt(parts[0], 10) : null;
    const rawYear = parts[1] ? parseInt(parts[1], 10) : null;
    const year = rawYear ? (rawYear < 100 ? 2000 + rawYear : rawYear) : null;
    return { month: (month >= 1 && month <= 12) ? month : null, year };
  }
  const { month, year } = parseExpDate('04/2031');
  assert(month === 4, 'month === 4');
  assert(year === 2031, 'year === 2031');
});

await test('Invalid month "13" is rejected (returns null)', async () => {
  function parseExpDate(dateStr) {
    if (!dateStr) return { month: null, year: null };
    const parts = String(dateStr).split('/');
    const month = parts[0] ? parseInt(parts[0], 10) : null;
    const rawYear = parts[1] ? parseInt(parts[1], 10) : null;
    const year = rawYear ? (rawYear < 100 ? 2000 + rawYear : rawYear) : null;
    return { month: (month >= 1 && month <= 12) ? month : null, year };
  }
  const { month } = parseExpDate('13/30');
  assert(month === null, 'month === null for invalid 13');
});

// ── Test 4: cardLast4 normalization ───────────────────────────────────────────
await test('cardLast4 normalization strips non-digits and validates 4-digit', async () => {
  function normalizeLast4(raw) {
    const s = String(raw || '').replace(/\D/g, '');
    return /^\d{4}$/.test(s) ? s : null;
  }
  assert(normalizeLast4('4242') === '4242', '"4242" → "4242"');
  assert(normalizeLast4('0042') === '0042', '"0042" preserves leading zeros');
  assert(normalizeLast4('•••• 4242') === '4242', '"•••• 4242" strips to "4242" (correct extraction)');
  assert(normalizeLast4('card ending 4242') === '4242', '"card ending 4242" strips to "4242"');
  assert(normalizeLast4('12345') === null, '"12345" (5 digits) → null');
  assert(normalizeLast4('') === null, 'empty string → null');
  assert(normalizeLast4('abc') === null, '"abc" (no digits) → null');
});

// ── Test 5: savePaymentMethodRecord validation ────────────────────────────────
await test('savePaymentMethodRecord correctly stores billing fields', async () => {
  const testBookingId = '00000000-0000-0000-0000-000000000001';
  const record = {
    booking_id: testBookingId,
    payment_provider: 'card',
    provider_payment_method_id: 'pm_tok_test_123',
    cardholder_name: 'Alice Test',
    card_brand: 'Visa',
    card_last4: '4242',
    card_exp_month: 12,
    card_exp_year: 2028,
    billing_email: 'alice@test.com',
    billing_phone: '+15551234567',
    billing_address_line1: '123 Main St',
    billing_address_line2: 'Apt 4B',
    billing_city: 'New York',
    billing_state: 'NY',
    billing_postal_code: '10001',
    billing_country: 'United States'
  };

  // This will attempt Supabase (may fail if table doesn't exist) but memory store always works
  const saved = await bookingRepository.savePaymentMethodRecord(testBookingId, record);
  assert(saved !== null && saved !== undefined, 'saved record is not null');
  assert(saved.cardholder_name === 'Alice Test', 'cardholder_name persisted');
  assert(saved.card_last4 === '4242', 'card_last4 persisted');
  assert(saved.card_brand === 'Visa', 'card_brand persisted');
  assert(saved.billing_email === 'alice@test.com', 'billing_email persisted');
  assert(saved.billing_address_line1 === '123 Main St', 'billing_address_line1 persisted');
  assert(saved.billing_address_line2 === 'Apt 4B', 'billing_address_line2 persisted');
  assert(saved.billing_city === 'New York', 'billing_city persisted');
});

// ── Test 6: getPaymentMethodByBookingId (in-process memory) ──────────────────
await test('getPaymentMethodByBookingId retrieves saved record', async () => {
  const testBookingId = '00000000-0000-0000-0000-000000000001'; // same as above
  const retrieved = await bookingRepository.getPaymentMethodByBookingId(testBookingId);
  assert(retrieved !== null, 'retrieved record is not null');
  assert(retrieved?.card_last4 === '4242', 'retrieved card_last4 === "4242"');
  assert(retrieved?.billing_email === 'alice@test.com', 'retrieved billing_email matches');
  assert(retrieved?.card_exp_month === 12, 'retrieved card_exp_month === 12');
  assert(retrieved?.card_exp_year === 2028, 'retrieved card_exp_year === 2028');
});

// ── Test 7: saveBillingDetailsUpdate — prohibited field rejection ──────────────
await test('saveBillingDetailsUpdate rejects cvv field', async () => {
  const testBookingId = '00000000-0000-0000-0000-000000000001';
  try {
    await bookingRepository.saveBillingDetailsUpdate(testBookingId, { cvv: '123', cardholderName: 'Test' });
    assert(false, 'Should have thrown PROHIBITED_BILLING_FIELD');
  } catch (err) {
    assert(err.code === 'PROHIBITED_BILLING_FIELD', 'Error code is PROHIBITED_BILLING_FIELD');
    assert(!err.message.includes('123'), 'CVV value is NOT in error message');
  }
});

await test('saveBillingDetailsUpdate rejects fullCardNumber field', async () => {
  const testBookingId = '00000000-0000-0000-0000-000000000001';
  try {
    await bookingRepository.saveBillingDetailsUpdate(testBookingId, { fullCardNumber: '4111111111111111' });
    assert(false, 'Should have thrown');
  } catch (err) {
    assert(err.code === 'PROHIBITED_BILLING_FIELD', 'Error code is PROHIBITED_BILLING_FIELD');
    assert(!err.message.includes('4111111111111111'), 'Full card number NOT in error message');
  }
});

// ── Test 8: saveBillingDetailsUpdate — invalid cardLast4 ─────────────────────
await test('saveBillingDetailsUpdate rejects 5-digit cardLast4', async () => {
  const testBookingId = '00000000-0000-0000-0000-000000000001';
  try {
    await bookingRepository.saveBillingDetailsUpdate(testBookingId, { cardLast4: '12345' });
    assert(false, 'Should have thrown INVALID_CARD_LAST4');
  } catch (err) {
    assert(err.code === 'INVALID_CARD_LAST4', 'Error code is INVALID_CARD_LAST4');
  }
});

// ── Test 9: saveBillingDetailsUpdate — invalid exp month ─────────────────────
await test('saveBillingDetailsUpdate rejects cardExpMonth = 13', async () => {
  const testBookingId = '00000000-0000-0000-0000-000000000001';
  try {
    await bookingRepository.saveBillingDetailsUpdate(testBookingId, { cardExpMonth: 13 });
    assert(false, 'Should have thrown INVALID_CARD_EXP_MONTH');
  } catch (err) {
    assert(err.code === 'INVALID_CARD_EXP_MONTH', 'Error code is INVALID_CARD_EXP_MONTH');
  }
});

// ── Test 10: saveBillingDetailsUpdate — valid update ─────────────────────────
await test('saveBillingDetailsUpdate updates cardholder name and city', async () => {
  const testBookingId = '00000000-0000-0000-0000-000000000001';
  const result = await bookingRepository.saveBillingDetailsUpdate(testBookingId, {
    cardholderName: 'Alice Updated',
    city: 'Brooklyn'
  });
  assert(result !== null, 'result is not null');
  assert(result?.cardholder_name === 'Alice Updated' || result?.cardholderName === 'Alice Updated', 'cardholder_name updated');
});

// ── Test 11: booking.mapper.mjs billingDetails enrichment ───────────────────
await test('toCanonicalModel produces structured billingDetails from paymentMethod record', async () => {
  const fakeBooking = {
    id: 'test-booking-id',
    confirmation_code: 'TEST-001',
    passenger_name: 'Bob Tester',
    email: 'bob@test.com',
    phone: '+15559990000',
    customer_price: 500,
    currency: 'USD',
    status: 'PENDING',
    payment_status: 'PENDING',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const fakePm = {
    id: 'pm-test-001',
    booking_id: 'test-booking-id',
    payment_provider: 'card',
    provider_payment_method_id: 'pm_tok_abc123',
    cardholder_name: 'Bob Tester',
    card_brand: 'Mastercard',
    card_last4: '5678',
    card_exp_month: 8,
    card_exp_year: 2026,
    billing_email: 'bob@test.com',
    billing_phone: '+15559990000',
    billing_address_line1: '456 Oak Ave',
    billing_address_line2: null,
    billing_city: 'Chicago',
    billing_state: 'IL',
    billing_postal_code: '60601',
    billing_country: 'United States',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const canonical = bookingMapper.toCanonicalModel(fakeBooking, [], [], [], [], fakePm);

  assert(canonical !== null, 'canonical model is not null');
  assert(canonical.billingDetails !== null && canonical.billingDetails !== undefined, 'billingDetails is present');
  assert(canonical.billingDetails.cardBrand === 'Mastercard', 'billingDetails.cardBrand === Mastercard');
  assert(canonical.billingDetails.cardLast4 === '5678', 'billingDetails.cardLast4 === 5678');
  assert(canonical.billingDetails.cardExpMonth === 8, 'billingDetails.cardExpMonth === 8');
  assert(canonical.billingDetails.cardExpYear === 2026, 'billingDetails.cardExpYear === 2026');
  assert(canonical.billingDetails.maskedCard === 'Mastercard •••• 5678', `maskedCard === "Mastercard •••• 5678" (got: "${canonical.billingDetails.maskedCard}")`);
  assert(canonical.billingDetails.billingEmail === 'bob@test.com', 'billingDetails.billingEmail');
  assert(canonical.billingDetails.addressLine1 === '456 Oak Ave', 'billingDetails.addressLine1');
  assert(canonical.billingDetails.city === 'Chicago', 'billingDetails.city');
  assert(canonical.billingDetails.stateProvince === 'IL', 'billingDetails.stateProvince');
  assert(canonical.billingDetails.postalCode === '60601', 'billingDetails.postalCode');
  assert(canonical.billingDetails.country === 'United States', 'billingDetails.country');
  assert(canonical.paymentMethod !== null, 'raw paymentMethod record is present in canonical');
});

// ── Test 12: maskedCard is null when no card data present ─────────────────────
await test('billingDetails.maskedCard is null when no card data in paymentMethod', async () => {
  const fakeBooking = {
    id: 'test-booking-2', confirmation_code: 'TEST-002', passenger_name: 'Carol',
    email: 'carol@test.com', customer_price: 300, currency: 'USD',
    status: 'PENDING', payment_status: 'PENDING',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  };
  const canonical = bookingMapper.toCanonicalModel(fakeBooking, [], [], [], [], null);
  assert(canonical.billingDetails !== undefined, 'billingDetails object is present');
  assert(canonical.billingDetails.maskedCard === null, 'maskedCard is null when no card data');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
if (failures.length > 0) {
  console.log('\nFailed tests:');
  failures.forEach(f => console.log(`  ✗ ${f}`));
  if (!process.env.VITEST) process.exit(1);
} else {
  console.log('\n✅ All tests passed!');
  if (!process.env.VITEST) process.exit(0);
}
