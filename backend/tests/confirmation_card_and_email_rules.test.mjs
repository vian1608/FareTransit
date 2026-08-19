import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

import assert from 'assert';
import bookingRepository from '../src/modules/bookings/booking.repository.mjs';
import bookingService from '../src/modules/bookings/booking.service.mjs';
import bookingController from '../src/modules/bookings/booking.controller.mjs';

async function runConfirmationRulesTests() {
  console.log('================================================================================');
  console.log('  CONFIRMATION CARD REFERENCE, PRICE, & EMAIL STATUS AUTOMATED TEST SUITE');
  console.log('================================================================================\n');

  const randomSuffix = Math.floor(Math.random() * 89999 + 10000);

  // ----------------------------------------------------
  // CASE 1: ACTUAL LAST4 IS 9876
  // ----------------------------------------------------
  console.log('--- CASE 1: ACTUAL LAST4 IS 9876 ---');
  const payloadCase1 = {
    idempotency_key: `idemp_last4_9876_${randomSuffix}`,
    customerName: 'Real Card User',
    email: 'realcard@example.com',
    customer_price: 1250.00,
    currency: 'USD',
    paymentMethod: {
      cardholder_name: 'Real Card User',
      card_brand: 'Visa',
      card_last4: '9876',
      card_exp_month: 11,
      card_exp_year: 2029
    },
    flight: {
      airline: 'Delta Air Lines',
      flightNumber: 'DL450',
      departureAirport: 'JFK',
      arrivalAirport: 'LAX',
      departureDate: '2026-11-15',
      departureTime: '09:00',
      arrivalDate: '2026-11-15',
      arrivalTime: '12:30',
      price: 1250.00
    }
  };

  const created1 = await bookingService.create(payloadCase1);
  const confCode1 = created1.confirmationCode || created1.confirmation_code;
  const completeBooking1 = await bookingService.getDetailsByCodeOrId(confCode1);

  assert.strictEqual(completeBooking1.paymentMethod?.card_last4, '9876', 'Database must store actual last4 9876');

  // Verify DTO
  let dtoResponse1 = null;
  const mockReq1 = { params: { confirmationCode: confCode1 } };
  const mockRes1 = {
    json: (data) => { dtoResponse1 = data; },
    status: () => mockRes1
  };
  await bookingController.getConfirmationDTO(mockReq1, mockRes1, (err) => {
    if (err) console.error('❌ DTO Exception caught in test next():', err);
  });

  assert.strictEqual(dtoResponse1.cardReference.last4, '9876', 'API DTO must return actual last4 9876');
  assert.strictEqual(dtoResponse1.cardReference.cardBrand, 'Visa');
  assert.notStrictEqual(dtoResponse1.cardReference.last4, '4242', '4242 must never appear');
  console.log(`✔ CASE 1 PASSED: Booking ${confCode1} saved card_last4=9876; DTO returned last4=9876.\n`);

  // ----------------------------------------------------
  // CASE 2: LAST4 IS MISSING (NULL)
  // ----------------------------------------------------
  console.log('--- CASE 2: LAST4 IS MISSING (NULL) ---');
  const payloadCase2 = {
    idempotency_key: `idemp_last4_missing_${randomSuffix}`,
    customerName: 'No Last4 User',
    email: 'nolast4@example.com',
    customer_price: 850.00,
    currency: 'USD',
    paymentMethod: {
      cardholder_name: 'No Last4 User',
      card_brand: 'Mastercard',
      card_last4: '' // Empty/missing!
    },
    flight: {
      airline: 'American Airlines',
      flightNumber: 'AA100',
      departureAirport: 'MIA',
      arrivalAirport: 'LHR',
      departureDate: '2026-12-01',
      departureTime: '18:00',
      arrivalDate: '2026-12-02',
      arrivalTime: '07:30',
      price: 850.00
    }
  };

  const created2 = await bookingService.create(payloadCase2);
  const confCode2 = created2.confirmationCode || created2.confirmation_code;

  let dtoResponse2 = null;
  const mockReq2 = { params: { confirmationCode: confCode2 } };
  const mockRes2 = {
    json: (data) => { dtoResponse2 = data; },
    status: () => mockRes2
  };
  await bookingController.getConfirmationDTO(mockReq2, mockRes2, () => {});

  assert.strictEqual(dtoResponse2.cardReference.last4, null, 'API must return last4: null when missing');
  assert.notStrictEqual(dtoResponse2.cardReference.last4, '4242', 'Must never invent fake 4242 value');
  console.log(`✔ CASE 2 PASSED: Missing last4 returned as null in DTO; UI label resolves to "Card ending unavailable".\n`);

  // ----------------------------------------------------
  // CASE 4: VALID ITINERARY, AMOUNT, AND EMAIL STATUS
  // ----------------------------------------------------
  console.log('--- CASE 4: VALID ITINERARY, AMOUNT, & EMAIL STATUS ---');
  assert.strictEqual(dtoResponse1.booking.totalAmount, 1250.00, 'Total amount must equal numeric customer price');
  assert.strictEqual(dtoResponse1.flights[0].departureAirport, 'JFK');
  assert.strictEqual(dtoResponse1.flights[0].arrivalAirport, 'LAX');
  assert.ok(['SENT', 'FAILED', 'UNATTEMPTED', 'NOT_SENT'].includes(dtoResponse1.emailDeliveryStatus));
  console.log(`✔ CASE 4 PASSED: DTO contains positive amount ($1,250.00), complete airports (JFK -> LAX), and email status.\n`);

  // ----------------------------------------------------
  // CASE 5: HARD REFRESH CONSISTENCY
  // ----------------------------------------------------
  console.log('--- CASE 5: HARD REFRESH CONSISTENCY ---');
  let refreshedDto = null;
  await bookingController.getConfirmationDTO(mockReq1, { json: (d) => { refreshedDto = d; } }, () => {});

  assert.deepStrictEqual(refreshedDto.cardReference, dtoResponse1.cardReference, 'Card reference must remain identical on refresh');
  assert.strictEqual(refreshedDto.booking.totalAmount, dtoResponse1.booking.totalAmount, 'Amount must remain identical');
  console.log(`✔ CASE 5 PASSED: Hard refresh fetched identical persisted DTO from backend.\n`);

  console.log('================================================================================');
  console.log('  🎉 ALL CONFIRMATION CARD REFERENCE & PRICE RULE TESTS PASSED!');
  console.log('================================================================================\n');
}

runConfirmationRulesTests().catch(err => {
  console.error('❌ Test Suite Failed:', err);
  process.exit(1);
});
