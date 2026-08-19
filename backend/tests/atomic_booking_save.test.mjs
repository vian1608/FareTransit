import assert from 'node:assert';
import { test, describe } from 'node:test';
import bookingRepository from '../src/modules/bookings/booking.repository.mjs';

describe('Atomic Booking Save & Persistence Verification Tests', () => {
  let testBookingId = null;

  test('0. Setup: Create test booking record', async () => {
    const rawRef = `TFS-ATOMIC-${Math.floor(100000 + Math.random() * 900000)}`;
    const testBooking = {
      confirmation_code: rawRef,
      status: 'PENDING',
      payment_status: 'pending',
      total_amount: 1200.00,
      customer_price: 1200.00,
      supplier_price: 1000.00,
      passenger_name: 'Atomic Tester',
      email: 'atomic.tester@example.com',
      phone: '+15550192834'
    };

    const created = await bookingRepository.createBookingRecord(testBooking);
    assert.ok(created && created.id, 'Test booking creation failed');
    testBookingId = created.id;
  });

  test('1. Save only notes', async () => {
    const res = await bookingRepository.saveAllBookingChanges(testBookingId, {
      internalNotes: 'Automated test internal note entry.'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.booking.internalNotes || res.booking.internal_notes, 'Automated test internal note entry.');

    // Re-fetch to confirm persistence
    const fresh = await bookingRepository.getCompleteBookingById(testBookingId);
    assert.strictEqual(fresh.internalNotes || fresh.internal_notes, 'Automated test internal note entry.');
  });

  test('2. Save booking status', async () => {
    const res = await bookingRepository.saveAllBookingChanges(testBookingId, {
      bookingStatus: 'DONE'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.booking.status, 'DONE');

    const fresh = await bookingRepository.getCompleteBookingById(testBookingId);
    assert.strictEqual(fresh.status, 'DONE');
  });

  test('3. Save payment status (validation error on PAID without transaction reference)', async () => {
    const resFail = await bookingRepository.saveAllBookingChanges(testBookingId, {
      paymentStatus: 'PAID'
      // no transactionReference provided
    });

    assert.strictEqual(resFail.success, false);
    assert.strictEqual(resFail.code, 'PAYMENT_UPDATE_FAILED');
    assert.strictEqual(resFail.field, 'transactionReference');

    // Valid save with transactionReference
    const resSuccess = await bookingRepository.saveAllBookingChanges(testBookingId, {
      paymentStatus: 'PAID',
      transactionReference: 'TXN_ATOMIC_98765'
    });

    assert.strictEqual(resSuccess.success, true);
    assert.strictEqual((resSuccess.booking.paymentStatus || resSuccess.booking.payment_status || '').toLowerCase(), 'paid');

    const fresh = await bookingRepository.getCompleteBookingById(testBookingId);
    assert.strictEqual((fresh.paymentStatus || fresh.payment_status || '').toLowerCase(), 'paid');
  });

  test('4. Save payment splits (verifying integer cent sum & total recalculation)', async () => {
    const splits = [
      { merchant_name: 'Delta Air Lines', amount: 1000.45 },
      { merchant_name: 'FareTransit LLC', amount: 250.35 }
    ];

    const res = await bookingRepository.saveAllBookingChanges(testBookingId, {
      paymentSplits: splits
    });

    assert.strictEqual(res.success, true);
    // 1000.45 + 250.35 = 1250.80
    assert.strictEqual(res.booking.pricing.customerTotal, 1250.80);

    const fresh = await bookingRepository.getCompleteBookingById(testBookingId);
    assert.strictEqual(fresh.amount || fresh.customer_price, 1250.80);
  });

  test('5. Save pricing', async () => {
    const res = await bookingRepository.saveAllBookingChanges(testBookingId, {
      customerTotal: 1400.00,
      supplierCost: 1100.00,
      discount: 50.00
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.booking.pricing.customerTotal, 1400.00);
    assert.strictEqual(res.booking.pricing.supplierCost, 1100.00);

    const fresh = await bookingRepository.getCompleteBookingById(testBookingId);
    assert.strictEqual(fresh.pricing.customerTotal, 1400.00);
  });

  test('6. Save itinerary segments', async () => {
    const segments = [
      {
        journey_direction: 'outbound',
        segment_sequence: 1,
        carrier_name: 'Delta Air Lines',
        carrier_code: 'DL',
        flight_number: 'DL 450',
        origin_airport: 'JFK',
        destination_airport: 'LAX',
        departure_date: '2026-10-15',
        departure_time: '08:00 AM',
        arrival_date: '2026-10-15',
        arrival_time: '11:30 AM',
        cabin: 'Business'
      }
    ];

    const res = await bookingRepository.saveAllBookingChanges(testBookingId, {
      itinerarySegments: segments
    });

    assert.strictEqual(res.success, true);
    assert.ok(res.booking.itinerary.outbound.length >= 1);
    assert.strictEqual(res.booking.itinerary.outbound[0].flight_number || res.booking.itinerary.outbound[0].flightNumber, 'DL 450');

    const fresh = await bookingRepository.getCompleteBookingById(testBookingId);
    assert.ok(fresh.itinerary.outbound.length >= 1);
  });

  test('7. Save airline ticket details', async () => {
    const res = await bookingRepository.saveAllBookingChanges(testBookingId, {
      airlineCode: 'DL',
      airlineName: 'Delta Air Lines',
      airlineConfirmationNumber: 'DLX889',
      ticketNumber: '0062498172635'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.booking.airlineConfirmationNumber || res.booking.airline_confirmation_number, 'DLX889');
    assert.strictEqual(res.booking.ticketNumber || res.booking.ticket_number, '0062498172635');

    const fresh = await bookingRepository.getCompleteBookingById(testBookingId);
    assert.strictEqual(fresh.airlineConfirmationNumber || fresh.airline_confirmation_number, 'DLX889');
  });

  test('8. Save multiple sections simultaneously (saveAllBookingChanges)', async () => {
    const res = await bookingRepository.saveAllBookingChanges(testBookingId, {
      bookingStatus: 'DONE',
      internalNotes: 'Multi-section simultaneous save test succeeded.',
      airlineConfirmationNumber: 'ALL999',
      ticketNumber: '0069999999999',
      paymentStatus: 'PAID',
      transactionReference: 'TXN_MULTI_999'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.booking.status, 'DONE');
    assert.strictEqual(res.booking.internalNotes, 'Multi-section simultaneous save test succeeded.');
    assert.strictEqual(res.booking.airlineConfirmationNumber || res.booking.airline_confirmation_number, 'ALL999');

    const fresh = await bookingRepository.getCompleteBookingById(testBookingId);
    assert.strictEqual(fresh.status, 'DONE');
    assert.strictEqual(fresh.internalNotes, 'Multi-section simultaneous save test succeeded.');
    assert.strictEqual(fresh.airlineConfirmationNumber || fresh.airline_confirmation_number, 'ALL999');
  });

  test('9. Invalid PNR rejection in saveAllBookingChanges', async () => {
    const res = await bookingRepository.saveAllBookingChanges(testBookingId, {
      airlineConfirmationNumber: 'INVALID_LONG_PNR_99999'
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'INVALID_PNR');
    assert.strictEqual(res.field, 'airlineConfirmationNumber');

    // Confirm DB state was NOT modified
    const fresh = await bookingRepository.getCompleteBookingById(testBookingId);
    assert.strictEqual(fresh.airlineConfirmationNumber || fresh.airline_confirmation_number, 'ALL999');
  });
});
