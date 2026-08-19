import assert from 'node:assert/strict';
import { calculateFlightDiscount, calculateBookingTotal } from '../src/shared/utils/pricing.helper.mjs';

console.log('--- Running Pricing Helper Unit Tests ---');

// Test 1: $500.00 → $450.00 (save $50.00, 10% OFF)
const test1 = calculateFlightDiscount({ originalPrice: 500.00, isMock: false });
assert.equal(test1.originalPrice, '500.00', 'Original price should be 500.00');
assert.equal(test1.discountPercent, 10, 'Discount percent should be 10');
assert.equal(test1.discountAmount, '50.00', 'Discount amount should be 50.00');
assert.equal(test1.finalPrice, '450.00', 'Final price should be 450.00');
assert.equal(test1.formattedOriginal, '$500.00');
assert.equal(test1.formattedFinal, '$450.00');
assert.equal(test1.formattedDiscount, '$50.00');
console.log('✔ Test 1 Passed: $500.00 → $450.00 (Save $50.00)');

// Test 2: $199.99 → $179.99 (save $20.00, 10% OFF)
const test2 = calculateFlightDiscount({ originalPrice: 199.99, isMock: false });
assert.equal(test2.originalPrice, '199.99');
assert.equal(test2.discountPercent, 10);
assert.equal(test2.discountAmount, '20.00');
assert.equal(test2.finalPrice, '179.99');
assert.equal(test2.formattedOriginal, '$199.99');
assert.equal(test2.formattedFinal, '$179.99');
assert.equal(test2.formattedDiscount, '$20.00');
console.log('✔ Test 2 Passed: $199.99 → $179.99 (Save $20.00)');

// Test 3: No discount on offline / mock flights
const test3 = calculateFlightDiscount({ originalPrice: 280.00, isMock: true });
assert.equal(test3.originalPrice, '280.00');
assert.equal(test3.discountPercent, 0, 'Mock flights should have 0% discount');
assert.equal(test3.discountAmount, '0.00');
assert.equal(test3.finalPrice, '280.00');
assert.equal(test3.isMock, true);
console.log('✔ Test 3 Passed: Mock flight produces 0% discount ($280.00 → $280.00)');

// Test 4: Legacy per-traveler calculation remains backward compatible.
const test4 = calculateBookingTotal({
  outboundFlight: {
    price: {
      originalApiPrice: '500.00',
      finalPrice: '450.00',
      total: '450.00',
    },
    isMock: false,
  },
  passengersCount: 2,
});
assert.equal(test4.supplierPrice, '1000.00', 'Legacy per-traveler fare should multiply by passenger count once');
assert.equal(test4.discountAmount, '100.00');
assert.equal(test4.customerPrice, '900.00');
console.log('✔ Test 4 Passed: Legacy per-traveler pricing remains compatible');

// Test 5: Legacy round-trip calculation still adds per-traveler leg contributions.
const test5 = calculateBookingTotal({
  outboundFlight: {
    price: { originalApiPrice: '500.00', finalPrice: '450.00', total: '450.00' },
    isMock: false,
  },
  returnFlight: {
    price: { originalApiPrice: '199.99', finalPrice: '179.99', total: '179.99' },
    isMock: false,
  },
  passengersCount: 1,
});
assert.equal(test5.supplierPrice, '699.99');
assert.equal(test5.discountAmount, '70.00');
assert.equal(test5.customerPrice, '629.99');
console.log('✔ Test 5 Passed: Legacy round-trip per-traveler pricing remains compatible');

// Test 6: CRITICAL REGRESSION — supplier PARTY TOTAL for six travelers must
// never be multiplied by six again. This reproduces the $75k checkout class of bug.
const partyTotalSixTravelers = calculateBookingTotal({
  outboundFlight: {
    price: {
      originalApiPrice: '12625.00',
      finalPrice: '11362.50',
      total: '11362.50',
      priceScope: 'party_total',
      passengerCount: 6,
      tripScope: 'oneway_total',
      selectionStage: 'oneway',
    },
    isMock: false,
  },
  passengersCount: 6,
});
assert.equal(
  partyTotalSixTravelers.supplierPrice,
  '12625.00',
  'Party total must stay $12,625 — it must not become $75,750',
);
assert.equal(partyTotalSixTravelers.discountAmount, '1262.50');
assert.equal(
  partyTotalSixTravelers.customerPrice,
  '11362.50',
  'Discounted party total must stay $11,362.50 — it must not be multiplied by six',
);
console.log('✔ Test 6 Passed: Six-traveler party total is never multiplied again');

// Test 7: CRITICAL REGRESSION — a round-trip return selected through the
// supplier departure token is the FINAL complete-trip quote. It replaces the
// provisional outbound round-trip quote; the two totals must never be added.
const roundTripFinalQuote = calculateBookingTotal({
  outboundFlight: {
    price: {
      originalApiPrice: '11626.00',
      finalPrice: '10463.40',
      total: '10463.40',
      priceScope: 'party_total',
      passengerCount: 6,
      tripScope: 'roundtrip_total',
      selectionStage: 'outbound',
    },
    isMock: false,
  },
  returnFlight: {
    price: {
      originalApiPrice: '12000.00',
      finalPrice: '10800.00',
      total: '10800.00',
      priceScope: 'party_total',
      passengerCount: 6,
      tripScope: 'roundtrip_total',
      selectionStage: 'return',
    },
    isMock: false,
  },
  passengersCount: 6,
});
assert.equal(
  roundTripFinalQuote.supplierPrice,
  '12000.00',
  'Final return-token quote should replace the provisional round-trip quote',
);
assert.equal(roundTripFinalQuote.discountAmount, '1200.00');
assert.equal(
  roundTripFinalQuote.customerPrice,
  '10800.00',
  'Round-trip pricing must not add outbound complete-trip quote + return complete-trip quote',
);
console.log('✔ Test 7 Passed: Return-token quote replaces, rather than adds to, outbound round-trip quote');

// Test 8: The frontend compatibility adapter preserves party totals for audit
// while exposing a per-traveler contribution. Backend calculations must still
// recognize those preserved party totals if such an object reaches this helper.
const adaptedPartyTotal = calculateBookingTotal({
  outboundFlight: {
    price: {
      partyOriginalPrice: '12625.00',
      partyFinalPrice: '11362.50',
      sourcePriceScope: 'party_total',
      priceScope: 'per_traveler_booking_contribution',
      originalApiPrice: '2104.166667',
      finalPrice: '1893.750000',
      total: '1893.750000',
      tripScope: 'oneway_total',
      selectionStage: 'oneway',
      passengerCount: 6,
    },
    isMock: false,
  },
  passengersCount: 6,
});
assert.equal(adaptedPartyTotal.supplierPrice, '12625.00');
assert.equal(adaptedPartyTotal.customerPrice, '11362.50');
console.log('✔ Test 8 Passed: Preserved party-total audit fields cannot be multiplied again');

// Test 9: Payment amount matching (customerPriceNum matches customerPrice string)
assert.equal(parseFloat(test5.customerPrice), test5.customerPriceNum);
assert.equal(parseFloat(test4.customerPrice), test4.customerPriceNum);
assert.equal(parseFloat(test1.finalPrice), test1.finalPriceNum);
assert.equal(parseFloat(partyTotalSixTravelers.customerPrice), partyTotalSixTravelers.customerPriceNum);
console.log('✔ Test 9 Passed: Payment amount exact string & number matching');

console.log('🎉 ALL PRICING HELPER UNIT TESTS PASSED SUCCESSFULLY!');
