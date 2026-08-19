import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

import assert from 'assert';
import bookingRepository from '../src/modules/bookings/booking.repository.mjs';

async function runImmutableTicketSnapshotsTests() {
  console.log('=== RUNNING IMMUTABLE TICKET SNAPSHOTS TESTS ===\n');

  let testBookingId = '88dd99ee-00ff-11aa-22bb-334455667788';
  const initialBooking = {
    id: testBookingId,
    confirmation_code: 'TFS-2026-TKTSNAP',
    passenger_name: 'Sophia Loren',
    email: 'sophia.loren@example.com',
    phone: '+1 415-555-0188',
    customer_price: 1850.00,
    total_amount: 1850.00,
    currency: 'USD',
    status: 'DONE',
    payment_status: 'paid',
    airline_name: 'Air France',
    airline_code: 'AF',
    itinerary_segments: [
      {
        journey_direction: 'outbound',
        segment_sequence: 1,
        carrier_name: 'Air France',
        carrier_code: 'AF',
        flight_number: 'AF 083',
        origin_airport: 'SFO',
        destination_airport: 'CDG',
        departure_date: '2026-12-10',
        departure_time: '15:20',
        arrival_date: '2026-12-11',
        arrival_time: '11:05'
      }
    ]
  };

  const createdBooking = await bookingRepository.createBookingRecord(initialBooking);
  testBookingId = createdBooking?.id || initialBooking.id;
  await bookingRepository.saveItinerarySegments(testBookingId, initialBooking.itinerary_segments);

  // Step 1: Issue First Ticket — Creates Snapshot 1
  console.log('Step 1: Saving initial ticket details (Issue Ticket 1)...');
  await bookingRepository.saveTicketDetails(testBookingId, {
    airlineConfirmationNumber: 'AF083X',
    ticketNumber: '0571122334455',
    airlineName: 'Air France',
    airlineCode: 'AF',
    ticketIssuedAt: '2026-07-30'
  });

  const history1 = await bookingRepository.getTicketSnapshotsForBooking(testBookingId);
  assert.strictEqual(history1.length, 1, 'Should have 1 ticket snapshot');
  const snap1 = history1[0];
  assert.strictEqual(snap1.pnr, 'AF083X');
  assert.strictEqual(snap1.ticket_number, '0571122334455');
  assert.strictEqual(snap1.airline, 'Air France');
  assert.strictEqual(snap1.final_price, 1850.00);
  assert.ok(Array.isArray(snap1.final_itinerary) && snap1.final_itinerary.length > 0);
  console.log('✔ Step 1 Passed: Initial ticket snapshot 1 created cleanly.');

  // Step 2: Re-Issue Ticket (Update Ticket Number & PNR) — Appends Snapshot 2
  console.log('\nStep 2: Re-issuing ticket (Updating to Ticket 2 & new PNR)...');
  await bookingRepository.saveTicketDetails(testBookingId, {
    airlineConfirmationNumber: 'AF083Y',
    ticketNumber: '0579988776655',
    airlineName: 'Air France',
    airlineCode: 'AF',
    ticketIssuedAt: '2026-07-30'
  });

  const history2 = await bookingRepository.getTicketSnapshotsForBooking(testBookingId);
  assert.strictEqual(history2.length, 2, 'Should have 2 append-only ticket snapshots');
  console.log('✔ Step 2 Passed: Second ticket snapshot appended cleanly (Total snapshots: 2).');

  // Step 3: Immutability Verification — Historical Snapshot 1 MUST remain unchanged
  console.log('\nStep 3: Verifying historical snapshot 1 immutability...');
  const firstSnapshotHistorical = history2[0];
  const secondSnapshotHistorical = history2[1];

  assert.strictEqual(firstSnapshotHistorical.pnr, 'AF083X', 'Snapshot 1 PNR must remain AF083X');
  assert.strictEqual(firstSnapshotHistorical.ticket_number, '0571122334455', 'Snapshot 1 Ticket number must remain 0571122334455');

  assert.strictEqual(secondSnapshotHistorical.pnr, 'AF083Y', 'Snapshot 2 PNR must be AF083Y');
  assert.strictEqual(secondSnapshotHistorical.ticket_number, '0579988776655', 'Snapshot 2 Ticket number must be 0579988776655');

  console.log('✔ Step 3 Passed: Historical ticket snapshot 1 was NOT modified or overwritten by re-issuance.');

  console.log('\n🎉 ALL IMMUTABLE TICKET SNAPSHOTS TESTS PASSED SUCCESSFULLY!\n');
}

runImmutableTicketSnapshotsTests().catch(err => {
  console.error('❌ Immutable Ticket Snapshots Test Failed:', err);
  process.exit(1);
});
