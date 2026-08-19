import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

import assert from 'assert';
import bookingRepository from '../src/modules/bookings/booking.repository.mjs';
import bookingService from '../src/modules/bookings/booking.service.mjs';
import passengerAuthorizationService from '../src/modules/authorizations/passenger-authorization.service.mjs';

async function runSystemAuditLoggingTests() {
  console.log('=== RUNNING SYSTEM-WIDE AUDIT LOGGING TESTS ===\n');

  const testId = '99ee00ff-11aa-22bb-33cc-445566778899';
  const initialBooking = {
    id: testId,
    confirmation_code: 'TFS-2026-AUDIT99',
    passenger_name: 'Genevieve Dupont',
    email: 'genevieve@example.com',
    phone: '+1 415-555-0199',
    customer_price: 2100.00,
    total_amount: 2100.00,
    currency: 'USD',
    status: 'PENDING',
    payment_status: 'pending',
    airline_name: 'Lufthansa',
    airline_code: 'LH'
  };

  // Step 1: BOOKING_CREATED & FLIGHT_CREATED
  console.log('Step 1: Creating booking & adding flight itinerary segments...');
  const created = await bookingRepository.createBookingRecord(initialBooking);
  const realId = created?.id || testId;

  const initialSegments = [
    {
      journey_direction: 'outbound',
      segment_sequence: 1,
      carrier_name: 'Lufthansa',
      carrier_code: 'LH',
      flight_number: 'LH 455',
      origin_airport: 'SFO',
      destination_airport: 'FRA',
      departure_date: '2026-12-20',
      departure_time: '14:15',
      arrival_date: '2026-12-21',
      arrival_time: '10:05'
    }
  ];

  await bookingRepository.saveItinerarySegments(realId, initialSegments);

  // Step 2: PAYMENT_UPDATED
  console.log('\nStep 2: Updating payment details (PAYMENT_UPDATED)...');
  await bookingService.updatePayment(realId, {
    paymentStatus: 'authorized',
    paidAmount: 2100.00,
    paymentProvider: 'Stripe',
    adminId: 'admin_audit'
  });

  // Step 3: STATUS_CHANGED
  console.log('\nStep 3: Updating status (STATUS_CHANGED)...');
  await bookingService.updateStatus(realId, {
    status: 'DONE',
    internalNotes: 'Payment verified cleanly',
    adminId: 'admin_audit'
  });

  // Step 4: FLIGHT_UPDATED
  console.log('\nStep 4: Updating flight itinerary (FLIGHT_UPDATED)...');
  const updatedSegments = [
    {
      ...initialSegments[0],
      flight_number: 'LH 457',
      departure_time: '16:00'
    }
  ];
  await bookingService.updateItinerary(realId, {
    segments: updatedSegments,
    adminId: 'admin_audit'
  });

  // Step 5: AUTHORIZATION_COMPLETED
  console.log('\nStep 5: Simulating customer authorization (AUTHORIZATION_COMPLETED)...');
  const tokenRecord = await passengerAuthorizationService.createAuthorizationToken(realId);
  await passengerAuthorizationService.acceptAuthorization({
    token: tokenRecord.token,
    clientIp: '198.51.100.200',
    userAgent: 'Mozilla/5.0 Audit Test',
    acceptedCheckboxText: 'Audit consent text'
  });

  // Step 6: TICKET_CREATED
  console.log('\nStep 6: Issuing ticket details (TICKET_CREATED)...');
  await bookingRepository.saveTicketDetails(realId, {
    airlineConfirmationNumber: 'LH457X',
    ticketNumber: '2201122334455',
    airlineName: 'Lufthansa',
    airlineCode: 'LH',
    ticketIssuedAt: '2026-07-30'
  }, 'admin_audit');

  // Step 7: Query All Historical Audit Logs
  console.log('\nStep 7: Retrieving audit log trail for booking...');
  const logsBeforeDelete = await bookingRepository.getAuditLogsForBooking(realId);
  const actionsBeforeDelete = logsBeforeDelete.map(l => l.action);

  console.log('Recorded Audit Actions:', actionsBeforeDelete.join(', '));
  assert.ok(actionsBeforeDelete.includes('BOOKING_CREATED'), 'Must include BOOKING_CREATED');
  assert.ok(actionsBeforeDelete.includes('FLIGHT_CREATED'), 'Must include FLIGHT_CREATED');
  assert.ok(actionsBeforeDelete.includes('PAYMENT_UPDATED'), 'Must include PAYMENT_UPDATED');
  assert.ok(actionsBeforeDelete.includes('STATUS_CHANGED'), 'Must include STATUS_CHANGED');
  assert.ok(actionsBeforeDelete.includes('FLIGHT_UPDATED'), 'Must include FLIGHT_UPDATED');
  assert.ok(actionsBeforeDelete.includes('AUTHORIZATION_COMPLETED'), 'Must include AUTHORIZATION_COMPLETED');
  assert.ok(actionsBeforeDelete.includes('TICKET_CREATED'), 'Must include TICKET_CREATED');

  // Step 8: BOOKING_DELETED
  console.log('\nStep 8: Deleting booking (BOOKING_DELETED)...');
  await bookingRepository.deleteBooking(realId);

  const logsAfterDelete = await bookingRepository.getAuditLogsForBooking(realId);
  const actionsAfterDelete = logsAfterDelete.map(l => l.action);
  assert.ok(actionsAfterDelete.includes('BOOKING_DELETED'), 'Must include BOOKING_DELETED');

  console.log('\n🎉 ALL SYSTEM-WIDE AUDIT LOGGING TESTS PASSED SUCCESSFULLY!\n');
}

runSystemAuditLoggingTests().catch(err => {
  console.error('❌ System Audit Logging Test Failed:', err);
  process.exit(1);
});
