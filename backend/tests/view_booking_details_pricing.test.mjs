import assert from 'node:assert';
import { test, describe } from 'node:test';
import bookingMapper from '../src/modules/bookings/booking.mapper.mjs';

describe('View Booking Details Pricing & Field Safety Tests', () => {
  test('1. Legacy booking with incomplete pricing does not crash and populates canonical pricing', () => {
    const legacyBooking = {
      id: 'legacy-101',
      confirmation_code: 'TFS-LEGACY-01',
      passenger_name: 'John Doe',
      status: 'PENDING'
      // missing customer_price, supplier_price, discount_amount, base_fare, taxes, etc.
    };

    const canonical = bookingMapper.toCanonicalModel(legacyBooking);
    assert.notStrictEqual(canonical, null);
    assert.strictEqual(canonical.pricing.baseFare, null);
    assert.strictEqual(canonical.pricing.taxes, 45);
    assert.strictEqual(canonical.pricing.serviceFee, 15);
    assert.strictEqual(canonical.pricing.discount, null);
    assert.strictEqual(canonical.pricing.customerTotal, null);
    assert.strictEqual(canonical.pricing.supplierCost, null);
    assert.strictEqual(canonical.pricing.margin, null);
    assert.strictEqual(canonical.pricing.currency, 'USD');

    assert.strictEqual(canonical.authorization.authorizedAmount, null);
    assert.strictEqual(canonical.payment.paidAmount, null);
  });

  test('2. Booking with payment splits and confirmed customer price', () => {
    const booking = {
      id: 'split-202',
      confirmation_code: 'TFS-SPLIT-02',
      passenger_name: 'Alice Smith',
      total_amount: 1500.50,
      customer_price: 1500.50,
      supplier_price: 1300.00,
      currency: 'EUR',
      payment_status: 'paid'
    };

    const canonical = bookingMapper.toCanonicalModel(booking);
    assert.strictEqual(canonical.pricing.customerTotal, 1500.50);
    assert.strictEqual(canonical.pricing.supplierCost, 1300.00);
    assert.strictEqual(canonical.pricing.margin, 200.50);
    assert.strictEqual(canonical.pricing.currency, 'EUR');
    assert.strictEqual(canonical.payment.paidAmount, 1500.50);
  });

  test('3. Booking with no authorization defaults cleanly', () => {
    const booking = {
      id: 'no-auth-303',
      confirmation_code: 'TFS-NOAUTH-03',
      passenger_name: 'Bob Marley',
      status: 'PENDING'
    };

    const canonical = bookingMapper.toCanonicalModel(booking);
    assert.strictEqual(canonical.authorization.status, 'NOT_SENT');
    assert.strictEqual(canonical.authorization.authorizedAmount, null);
  });

  test('4. Paid booking correctly reflects paidAmount equal to customer price', () => {
    const booking = {
      id: 'paid-404',
      confirmation_code: 'TFS-PAID-04',
      customer_price: 850.00,
      payment_status: 'paid'
    };

    const canonical = bookingMapper.toCanonicalModel(booking);
    assert.strictEqual(canonical.payment.paymentStatus, 'PAID');
    assert.strictEqual(canonical.payment.paidAmount, 850.00);
  });

  test('5. Refunded booking correctly reflects refundedAmount equal to customer price', () => {
    const booking = {
      id: 'refund-505',
      confirmation_code: 'TFS-REFUND-05',
      customer_price: 620.00,
      payment_status: 'refunded'
    };

    const canonical = bookingMapper.toCanonicalModel(booking);
    assert.strictEqual(canonical.payment.paymentStatus, 'REFUNDED');
    assert.strictEqual(canonical.payment.refundedAmount, 620.00);
  });

  test('6. Booking with missing supplier cost uses customer price as supplier cost fallback', () => {
    const booking = {
      id: 'nosupplier-606',
      confirmation_code: 'TFS-NOSUPP-06',
      customer_price: 500.00
      // supplier_price is missing
    };

    const canonical = bookingMapper.toCanonicalModel(booking);
    assert.strictEqual(canonical.pricing.customerTotal, 500.00);
    assert.strictEqual(canonical.pricing.supplierCost, 500.00);
    assert.strictEqual(canonical.pricing.margin, 0);
  });

  test('7. Booking with zero discount explicitly reflects 0', () => {
    const booking = {
      id: 'zerodisc-707',
      confirmation_code: 'TFS-ZERODISC-07',
      customer_price: 400.00,
      supplier_price: 400.00,
      discount_amount: 0
    };

    const canonical = bookingMapper.toCanonicalModel(booking);
    assert.strictEqual(canonical.pricing.discount, 0);
  });
});
