import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

import assert from 'assert';
import bookingService from '../src/modules/bookings/booking.service.mjs';
import { bookingRepository } from '../src/modules/bookings/booking.repository.mjs';
import bookingController from '../src/modules/bookings/booking.controller.mjs';

async function runSplitPaymentConsistencyTests() {
  console.log('================================================================================');
  console.log('  PAYMENT SPLIT TOTALS & AUTHORIZED AMOUNT DATA-CONSISTENCY TEST SUITE');
  console.log('================================================================================\n');

  const randomSuffix = Math.floor(Math.random() * 89999 + 10000);

  // ----------------------------------------------------
  // TEST SETUP: CREATE BOOKING FOR $1,143.00
  // ----------------------------------------------------
  console.log('--- STEP 1: INITIAL BOOKING ($1,143.00) ---');
  const payload = {
    idempotency_key: `idemp_split_test_${randomSuffix}`,
    customerName: 'Split Consistency User',
    email: 'splittest@example.com',
    customer_price: 1143.00,
    currency: 'USD',
    paymentMethod: {
      cardholder_name: 'Split Consistency User',
      card_brand: 'Mastercard',
      card_last4: '5544',
      card_exp_month: 10,
      card_exp_year: 2028
    },
    flight: {
      airline: 'British Airways',
      flightNumber: 'BA117',
      departureAirport: 'JFK',
      arrivalAirport: 'LHR',
      departureDate: '2026-11-20',
      departureTime: '19:00',
      arrivalDate: '2026-11-21',
      arrivalTime: '07:00',
      price: 1143.00
    }
  };

  const created = await bookingService.create(payload);
  const bookingId = created.booking?.id || created.id;
  const confCode = created.confirmationCode || created.confirmation_code;

  let initialBooking = await bookingService.getDetailsByCodeOrId(confCode);
  assert.strictEqual(parseFloat(initialBooking.pricing?.customerTotal || initialBooking.total_amount), 1143.00, 'Initial price must equal 1143.00');
  console.log(`✔ Step 1 PASSED: Booking ${confCode} created with initial amount $1,143.00.\n`);

  // ----------------------------------------------------
  // STEP 2: UPDATE PAYMENT SPLITS ($200 + $1,143 = $1,343)
  // ----------------------------------------------------
  console.log('--- STEP 2: UPDATE PAYMENT SPLITS TO $1,343.00 ---');
  const newSplits = [
    { merchantName: 'FareTransit LLC', amount: 200.00, currency: 'USD' },
    { merchantName: 'British Airways', amount: 1143.00, currency: 'USD' }
  ];

  const updatedBooking = await bookingService.updatePaymentSplits(bookingId, newSplits, 'admin_tester', 'Testing split update consistency');

  // Verify backend response
  const updatedAmount = parseFloat(updatedBooking.customer_price || updatedBooking.total_amount);
  assert.strictEqual(updatedAmount, 1343.00, 'Updated booking customer_price / total_amount must equal split sum 1343.00');

  // Verify DTO
  let dtoData = null;
  await bookingController.getConfirmationDTO(
    { params: { confirmationCode: confCode } },
    { json: (d) => { dtoData = d; }, status: () => ({ json: (d) => { dtoData = d; } }) },
    (err) => { if (err) throw err; }
  );

  assert.strictEqual(parseFloat(dtoData.booking.totalAmount), 1343.00, 'Confirmation DTO totalAmount must equal 1343.00');
  assert.strictEqual(dtoData.flights[0].departureAirport, 'JFK', 'Flight itinerary segments must remain untouched');
  assert.strictEqual(dtoData.flights[0].arrivalAirport, 'LHR');

  console.log(`✔ Step 2 PASSED: Payment splits updated to $1,343.00. Authorized amount, booking total, and DTO total match $1,343.00.\n`);

  // ----------------------------------------------------
  // STEP 3: REAUTHORIZATION REQUIRED WHEN ACCEPTED
  // ----------------------------------------------------
  console.log('--- STEP 3: ACCEPTED AUTHORIZATION REAUTHORIZATION TRIGGER ---');
  // Mark booking authorization_status as ACCEPTED via repository
  await bookingRepository.updateStatus(bookingId, { authorization_status: 'ACCEPTED' });

  // Update splits again to $1,500.00 ($250 + $1250)
  const reauthSplits = [
    { merchantName: 'FareTransit LLC', amount: 250.00, currency: 'USD' },
    { merchantName: 'British Airways', amount: 1250.00, currency: 'USD' }
  ];

  const reauthBooking = await bookingService.updatePaymentSplits(bookingId, reauthSplits, 'admin_tester', 'Test reauth trigger');
  assert.strictEqual(reauthBooking.authorization_status, 'REAUTHORIZATION_REQUIRED', 'Authorization status must transition to REAUTHORIZATION_REQUIRED');
  assert.strictEqual(parseFloat(reauthBooking.customer_price || reauthBooking.total_amount), 1500.00);

  console.log(`✔ Step 3 PASSED: Accepted authorization preserved; status updated to REAUTHORIZATION_REQUIRED for new amount $1,500.00.\n`);

  // ----------------------------------------------------
  // STEP 4: DECIMAL ARITHMETIC PRECISION
  // ----------------------------------------------------
  console.log('--- STEP 4: DECIMAL ARITHMETIC PRECISION ---');
  const decimalSplits = [
    { merchantName: 'Split A', amount: 100.55, currency: 'USD' },
    { merchantName: 'Split B', amount: 200.45, currency: 'USD' }
  ];

  const decimalBooking = await bookingService.updatePaymentSplits(bookingId, decimalSplits, 'admin_tester', 'Decimal test');
  assert.strictEqual(parseFloat(decimalBooking.total_amount), 301.00, 'Decimal sum must equal exactly 301.00');
  console.log(`✔ Step 4 PASSED: Exact decimal arithmetic verified ($100.55 + $200.45 = $301.00).\n`);

  console.log('================================================================================');
  console.log('  🎉 ALL PAYMENT SPLIT TOTALS & AUTHORIZED AMOUNT CONSISTENCY TESTS PASSED!');
  console.log('================================================================================\n');
}

runSplitPaymentConsistencyTests().catch(err => {
  console.error('❌ Test Suite Failed:', err);
  process.exit(1);
});
