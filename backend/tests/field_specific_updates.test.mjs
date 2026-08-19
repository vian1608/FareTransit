import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

import assert from 'assert';
import bookingRepository from '../src/modules/bookings/booking.repository.mjs';

async function runFieldSpecificUpdatesTests() {
  console.log('=== RUNNING FIELD-SPECIFIC ISOLATED UPDATE ARCHITECTURE TESTS ===\n');

  const testId = '44aa55bb-66cc-77dd-88ee-990011223344';
  const initialBooking = {
    id: testId,
    confirmation_code: 'TFS-2026-ISO99',
    passenger_name: 'Sophia Chen',
    email: 'sophia.chen@example.com',
    phone: '+1 415-555-0188',
    customer_price: 890.00,
    total_amount: 890.00,
    currency: 'USD',
    status: 'PENDING',
    payment_status: 'pending',
    airline_name: 'United Airlines',
    airline_confirmation_number: 'ISO123',
    ticket_number: '016-9988776655'
  };

  await bookingRepository.createBookingRecord(initialBooking);

  // Test 1: Isolated Status Update — MUST NOT alter payment, passenger, or ticket fields
  console.log('Test 1: Isolated Status Update...');
  const statusUpdate = await bookingRepository.updateStatus(testId, {
    status: 'DONE',
    internal_notes: 'Verified payment and confirmed ticket'
  });

  assert.strictEqual(statusUpdate.status, 'DONE');
  assert.strictEqual(statusUpdate.passenger_name, 'Sophia Chen', 'Passenger name must be preserved');
  assert.strictEqual(statusUpdate.email, 'sophia.chen@example.com', 'Email must be preserved');
  assert.strictEqual(statusUpdate.airline_confirmation_number, 'ISO123', 'PNR must be preserved');
  assert.strictEqual(statusUpdate.ticket_number, '016-9988776655', 'Ticket number must be preserved');
  console.log('✔ Test 1 Passed: Isolated status update modified ONLY status & notes without affecting other fields');

  // Test 2: Isolated Ticket Details Update — MUST NOT alter status, payment, or passenger details
  console.log('\nTest 2: Isolated Ticket Details Update...');
  const ticketUpdate = await bookingRepository.saveTicketDetails(testId, {
    airlineConfirmationNumber: 'NEW789',
    ticketNumber: '0161122334455',
    supplierConfirmation: 'SUP_ISO_99'
  });

  const refreshedBooking = await bookingRepository.getById(testId);
  assert.strictEqual(refreshedBooking.airline_confirmation_number, 'NEW789', 'PNR updated');
  assert.strictEqual(refreshedBooking.ticket_number, '0161122334455', 'Ticket number updated');
  assert.strictEqual(refreshedBooking.passenger_name, 'Sophia Chen', 'Passenger name preserved');
  assert.strictEqual(refreshedBooking.email, 'sophia.chen@example.com', 'Email preserved');
  assert.strictEqual(refreshedBooking.status, 'DONE', 'Booking status preserved');
  console.log('✔ Test 2 Passed: Isolated ticket details update modified ONLY ticket attributes');

  // Test 3: Isolated Payment Status Update — MUST NOT alter itinerary, status, or ticket details
  console.log('\nTest 3: Isolated Payment Status Update...');
  await bookingRepository.updateStatus(testId, {
    payment_status: 'paid',
    paid_amount: 890.00,
    paid_at: new Date().toISOString()
  });

  const paymentUpdated = await bookingRepository.getById(testId);
  assert.strictEqual(paymentUpdated.payment_status, 'paid', 'Payment status updated to paid');
  assert.strictEqual(paymentUpdated.paid_amount, 890.00, 'Paid amount updated');
  assert.strictEqual(paymentUpdated.airline_confirmation_number, 'NEW789', 'PNR preserved');
  assert.strictEqual(paymentUpdated.passenger_name, 'Sophia Chen', 'Passenger name preserved');
  assert.strictEqual(paymentUpdated.status, 'DONE', 'Booking status preserved');
  console.log('✔ Test 3 Passed: Isolated payment status update modified ONLY payment attributes');

  // Test 4: Partial Update with Undefined Fields — MUST NOT overwrite existing values with null/undefined
  console.log('\nTest 4: Partial Update Safeguard (No Full Object Overwrite)...');
  await bookingRepository.saveAllBookingChanges(testId, {
    internalNotes: 'Updated notes via saveAllBookingChanges'
    // Missing passenger_name, email, PNR, status
  });

  const partialChecked = await bookingRepository.getById(testId);
  assert.strictEqual(partialChecked.passenger_name, 'Sophia Chen', 'Passenger name must NOT be overwritten with null/undefined');
  assert.strictEqual(partialChecked.email, 'sophia.chen@example.com', 'Email must NOT be overwritten');
  assert.strictEqual(partialChecked.airline_confirmation_number, 'NEW789', 'PNR must NOT be overwritten');
  assert.strictEqual(partialChecked.internal_notes, 'Updated notes via saveAllBookingChanges', 'Internal notes updated');
  console.log('✔ Test 4 Passed: Partial update safely modified target field without overwriting omitted attributes');

  console.log('\n🎉 ALL FIELD-SPECIFIC ISOLATED UPDATE TESTS PASSED SUCCESSFULLY!\n');
}

runFieldSpecificUpdatesTests().catch(err => {
  console.error('❌ Field-Specific Updates Test Failed:', err);
  process.exit(1);
});
