import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingRepository } from '../src/modules/bookings/booking.repository.mjs';
import { BOOKING_STATUSES, PAYMENT_OPERATIONAL_STATES } from '../src/modules/bookings/booking.constants.mjs';

test('Complete Admin Dashboard Cleanup & Combined Save Architecture Verification', async (t) => {
  let testBookingId = null;
  let testPublicCode = null;

  await t.test('0. Setup: Create production-like test booking record', async () => {
    const randomCode = `TFS-CLN-${Math.floor(100000 + Math.random() * 900000)}`;
    const created = await bookingRepository.createBookingRecord({
      confirmation_code: randomCode,
      status: 'PENDING',
      payment_status: 'pending',
      total_amount: 549.99,
      original_api_price: 499.99,
      currency: 'USD',
      passenger_name: 'Antigravity Verification User',
      email: 'verification@faretransit.com',
      phone: '+1 555-0199'
    });

    assert.ok(created, 'Booking creation failed');
    testBookingId = created.id;
    testPublicCode = created.confirmation_code;
    assert.ok(testBookingId, 'Missing booking ID');
  });

  await t.test('1. Main Booking Status restriction: 4 canonical statuses only', async () => {
    assert.deepEqual(BOOKING_STATUSES, ['PENDING', 'DONE', 'FAILED', 'CANCELLED']);

    // Valid statuses must succeed
    for (const validStatus of ['PENDING', 'DONE', 'FAILED', 'CANCELLED']) {
      const res = await bookingRepository.saveAllBookingChanges(testBookingId, { status: validStatus });
      assert.strictEqual(res.success, true, `Status ${validStatus} should be accepted`);
      assert.strictEqual(res.booking.status, validStatus);
    }

    // Invalid/legacy statuses must be rejected with INVALID_STATUS error and NOT silently mapped to PENDING
    const invalidStatuses = ['AUTHORIZED', 'READY_FOR_TICKETING', 'TICKETED', 'AWAITING_AUTHORIZATION', 'REAUTHORIZATION_REQUIRED', 'UNKNOWN_STATUS'];
    for (const invalidStatus of invalidStatuses) {
      const res = await bookingRepository.saveAllBookingChanges(testBookingId, { status: invalidStatus });
      assert.strictEqual(res.success, false, `Status '${invalidStatus}' must be rejected`);
      assert.strictEqual(res.code, 'INVALID_STATUS');
    }
  });

  await t.test('2. Independent payment updates (no itinerary requirement)', async () => {
    // Save payment status to PROCESSING without itinerary
    const res = await bookingRepository.saveAllBookingChanges(testBookingId, {
      paymentStatus: 'PROCESSING'
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.booking.payment.status, 'PROCESSING');
  });

  await t.test('3. Payment PAID validation (requires paid amount > 0 and transaction reference)', async () => {
    // Missing transaction reference
    const resMissingRef = await bookingRepository.saveAllBookingChanges(testBookingId, {
      paymentStatus: 'PAID',
      paidAmount: 549.99
    });
    assert.strictEqual(resMissingRef.success, false);
    assert.strictEqual(resMissingRef.code, 'PAYMENT_UPDATE_FAILED');

    // Valid PAID update
    const resValidPaid = await bookingRepository.saveAllBookingChanges(testBookingId, {
      paymentStatus: 'PAID',
      paidAmount: 549.99,
      transactionReference: 'TXN-99882211'
    });
    assert.strictEqual(resValidPaid.success, true);
    assert.strictEqual(resValidPaid.booking.payment.status, 'PAID');
  });

  await t.test('4. Payment REFUNDED validation (requires refund amount, refund reference ID, amount <= paid amount)', async () => {
    // Refund amount exceeding paid amount
    const resOverRefund = await bookingRepository.saveAllBookingChanges(testBookingId, {
      paymentStatus: 'REFUNDED',
      refundAmount: 999.99,
      refundReference: 'REF-001928'
    });
    assert.strictEqual(resOverRefund.success, false);
    assert.strictEqual(resOverRefund.code, 'PAYMENT_UPDATE_FAILED');

    // Valid REFUNDED update
    const resValidRefund = await bookingRepository.saveAllBookingChanges(testBookingId, {
      paymentStatus: 'REFUNDED',
      refundAmount: 549.99,
      refundReference: 'REF-001928'
    });
    assert.strictEqual(resValidRefund.success, true);
    assert.strictEqual(resValidRefund.booking.payment.status, 'REFUNDED');
  });

  await t.test('5. Payment splits saving with integer cent calculation & customer total update', async () => {
    const splits = [
      { merchantName: 'Delta Air Lines', amount: 400.00, currency: 'USD' },
      { merchantName: 'FareTransit LLC', amount: 149.99, currency: 'USD' }
    ];

    const res = await bookingRepository.saveAllBookingChanges(testBookingId, {
      paymentSplits: splits
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.booking.pricing.customerTotal, 549.99);
    assert.strictEqual(res.booking.paymentSplits.length, 2);
  });

  await t.test('6. Airline Ticket Details & PNR validation in saveAllBookingChanges', async () => {
    // Invalid 5-char PNR
    const resInvalidPnr = await bookingRepository.saveAllBookingChanges(testBookingId, {
      airlineConfirmationNumber: 'AB12C'
    });
    assert.strictEqual(resInvalidPnr.success, false);
    assert.strictEqual(resInvalidPnr.code, 'INVALID_PNR');

    // Valid 6-char PNR + 13-digit ticket number
    const resValidTicket = await bookingRepository.saveAllBookingChanges(testBookingId, {
      airlineConfirmationNumber: 'KL987X',
      ticketNumber: '0062490182741',
      airlineName: 'KLM Royal Dutch Airlines',
      airlineCode: 'KL'
    });
    assert.strictEqual(resValidTicket.success, true);
    assert.strictEqual(resValidTicket.booking.ticketDetails.airlineConfirmationNumber, 'KL987X');
    assert.strictEqual(resValidTicket.booking.ticketDetails.ticketNumber, '0062490182741');
  });

  await t.test('7. Combined atomic save across multiple sections', async () => {
    const payload = {
      status: 'DONE',
      internalNotes: 'VIP customer. Verified ticket issued cleanly.',
      paymentStatus: 'PAID',
      paidAmount: 549.99,
      transactionReference: 'TXN-COMBINED-01',
      airlineConfirmationNumber: 'AF345Y',
      ticketNumber: '0572490182749',
      airlineName: 'Air France',
      airlineCode: 'AF'
    };

    const res = await bookingRepository.saveAllBookingChanges(testBookingId, payload);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.booking.status, 'DONE');
    assert.strictEqual(res.booking.notes, 'VIP customer. Verified ticket issued cleanly.');
    assert.strictEqual(res.booking.payment.status, 'PAID');
    assert.strictEqual(res.booking.ticketDetails.airlineConfirmationNumber, 'AF345Y');
  });

  await t.test('8. Full persistence verification on re-fetch via getCompleteBookingById', async () => {
    const fetchedByPublicCode = await bookingRepository.getCompleteBookingById(testPublicCode);
    assert.ok(fetchedByPublicCode, 'Booking should be fetchable by public confirmation code');
    assert.strictEqual(fetchedByPublicCode.id, testBookingId);
    assert.strictEqual(fetchedByPublicCode.status, 'DONE');
    assert.strictEqual(fetchedByPublicCode.notes, 'VIP customer. Verified ticket issued cleanly.');
    assert.strictEqual(fetchedByPublicCode.ticketDetails.airlineConfirmationNumber, 'AF345Y');
  });
});
