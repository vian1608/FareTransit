import assert from 'node:assert/strict';
import bookingMapper from '../src/modules/bookings/booking.mapper.mjs';

const pending = bookingMapper.toCanonicalModel({
  id: 'qa-booking',
  confirmation_code: 'FT-2026-ABC123',
  status: 'PENDING',
  payment_status: 'PENDING',
  customer_price: 222.22,
  total_amount: 222.22,
  supplier_price: 240,
  currency: 'USD',
  passenger_name: 'QA Passenger',
  email: 'qa@example.test',
  phone: '+17165550100',
  authorization_status: 'NOT_CREATED',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

assert.equal(pending.pricing.taxes, 0, 'Unknown taxes must not be fabricated.');
assert.equal(pending.pricing.serviceFee, 0, 'Unknown service fees must not be fabricated.');
assert.equal(pending.payment.provider, null, 'Unknown payment provider must remain null.');
assert.equal(pending.authorization.authorizedAmount, null, 'Pending booking must not look authorized.');
assert.equal(pending.payment.paidAmount, null, 'Pending booking must not expose a paid amount.');

const paid = bookingMapper.toCanonicalModel({
  id: 'qa-paid',
  confirmation_code: 'FT-2026-PAID01',
  status: 'DONE',
  payment_status: 'PAID',
  customer_price: 300,
  total_amount: 300,
  supplier_price: 320,
  currency: 'USD',
  passenger_name: 'Paid Passenger',
  email: 'paid@example.test',
  phone: '+17165550101',
  authorization_status: 'AUTHORIZED',
  authorized_amount: 300,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}, [], [], [], [{ payment_status: 'PAID', payment_amount: 300, payment_provider: 'test-provider' }]);

assert.equal(paid.authorization.authorizedAmount, 300);
assert.equal(paid.payment.provider, 'test-provider');
assert.equal(paid.payment.paidAmount, 300);

const summary = bookingMapper.toSummaryList([{
  id: 'qa-summary',
  confirmation_code: 'FT-2026-SUM001',
  status: 'PENDING',
  payment_status: 'PENDING',
  customer_price: 150,
  total_amount: 150,
  supplier_price: 165,
  currency: 'USD',
  passenger_name: 'Summary Passenger',
}])[0];

assert.equal(summary.pricing.taxes, 0);
assert.equal(summary.pricing.serviceFee, 0);
assert.equal(summary.authorization.authorizedAmount, null);

console.log('booking mapper truthfulness contract passed');
