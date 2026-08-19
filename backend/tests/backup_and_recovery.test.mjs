import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

import fs from 'fs';
import assert from 'assert';
import bookingRepository from '../src/modules/bookings/booking.repository.mjs';
import passengerAuthorizationService from '../src/modules/authorizations/passenger-authorization.service.mjs';
import { backupDatabaseBeforeMigration } from '../scripts/backup_db_before_migration.mjs';

async function runBackupAndRecoveryTests() {
  console.log('=== RUNNING BACKUP, EXPORT & RECOVERY TESTS ===\n');

  const testId = '55ee66ff-77aa-88bb-99cc-001122334455';
  const initialBooking = {
    id: testId,
    confirmation_code: 'TFS-2026-BACKUP',
    passenger_name: 'Guillaume Canet',
    email: 'guillaume@example.com',
    phone: '+1 415-555-0555',
    customer_price: 4100.00,
    total_amount: 4100.00,
    currency: 'USD',
    status: 'PENDING',
    payment_status: 'pending',
    airline_name: 'Lufthansa',
    airline_code: 'LH',
    itinerary_segments: [
      {
        journey_direction: 'outbound',
        segment_sequence: 1,
        carrier_name: 'Lufthansa',
        carrier_code: 'LH',
        flight_number: 'LH 455',
        origin_airport: 'SFO',
        destination_airport: 'FRA',
        departure_date: '2027-02-10',
        departure_time: '14:20',
        arrival_date: '2027-02-11',
        arrival_time: '10:05'
      }
    ]
  };

  const createdBooking = await bookingRepository.createBookingRecord(initialBooking);
  const realId = createdBooking?.id || testId;
  await bookingRepository.saveItinerarySegments(realId, initialBooking.itinerary_segments);
  await bookingRepository.savePaymentSplits(realId, [
    { merchant_name: 'Lufthansa', amount: 3500.00, currency: 'USD' },
    { merchant_name: 'FareTransit LLC', amount: 600.00, currency: 'USD' }
  ]);

  // Simulate customer authorization
  const authRecord = await passengerAuthorizationService.createAuthorizationToken(createdBooking);
  const acceptResult = await passengerAuthorizationService.acceptAuthorization({
    token: authRecord.token,
    ipAddress: '198.51.100.99',
    userAgent: 'Mozilla/5.0'
  });

  // Issue ticket details
  await bookingRepository.saveTicketDetails(realId, {
    airlineConfirmationNumber: 'LH455X',
    ticketNumber: '2201122339988',
    airlineName: 'Lufthansa',
    airlineCode: 'LH'
  });

  // ----------------------------------------------------
  // TEST 1: PRE-MIGRATION BACKUP CLI TOOL
  // ----------------------------------------------------
  console.log('Test 1: Running pre-migration database backup script...');
  const backupFilePath = await backupDatabaseBeforeMigration();
  assert.ok(fs.existsSync(backupFilePath), 'Backup JSON file must exist on disk');
  const backupContent = JSON.parse(fs.readFileSync(backupFilePath, 'utf8'));
  assert.ok(backupContent.backup_metadata, 'Must contain backup_metadata');
  assert.ok(backupContent.tables?.bookings, 'Must contain bookings table data');
  console.log(`✔ Test 1 Passed: Pre-migration DB backup created cleanly at ${backupFilePath}`);

  // ----------------------------------------------------
  // TEST 2: BOOKING EXPORT JSON
  // ----------------------------------------------------
  console.log('\nTest 2: Exporting canonical booking JSON bundle...');
  const exportedJson = await bookingRepository.exportBookingJson(realId);
  assert.ok(exportedJson, 'Exported JSON must not be null');
  assert.strictEqual(exportedJson.booking.id, realId, 'Booking ID must match');
  assert.ok(exportedJson.itinerary_segments.length > 0, 'Itinerary segments must be present');
  assert.ok(exportedJson.authorization_snapshots.length > 0, 'Authorization snapshots must be present');
  assert.ok(exportedJson.ticket_snapshots.length > 0, 'Ticket snapshots must be present');
  assert.ok(exportedJson.audit_logs.length > 0, 'Audit logs must be present');
  console.log('✔ Test 2 Passed: Portable booking JSON bundle exported with all sub-components.');

  // ----------------------------------------------------
  // TEST 3: VIEW HISTORY TIMELINE
  // ----------------------------------------------------
  console.log('\nTest 3: Retrieving chronological history timeline...');
  const history = await bookingRepository.getBookingHistory(realId);
  assert.ok(history, 'History object must exist');
  assert.strictEqual(history.bookingId, realId);
  assert.ok(Array.isArray(history.timeline), 'Timeline must be an array');
  assert.ok(history.timeline.some(t => t.type === 'AUDIT_EVENT'), 'Timeline must contain AUDIT_EVENT items');
  assert.ok(history.timeline.some(t => t.type === 'AUTHORIZATION_SNAPSHOT'), 'Timeline must contain AUTHORIZATION_SNAPSHOT items');
  assert.ok(history.timeline.some(t => t.type === 'TICKET_SNAPSHOT'), 'Timeline must contain TICKET_SNAPSHOT items');
  console.log(`✔ Test 3 Passed: History timeline retrieved cleanly (${history.timeline.length} total events).`);

  // ----------------------------------------------------
  // TEST 4: RESTORE FROM SNAPSHOT
  // ----------------------------------------------------
  console.log('\nTest 4: Restoring booking state from historic snapshot...');
  const snapToRestore = acceptResult.authorizationSnapshot;
  const restoreResult = await bookingRepository.restoreFromSnapshot(realId, snapToRestore, 'admin_restorer@faretransit.com');

  assert.strictEqual(restoreResult.success, true);
  const postRestoreBooking = await bookingRepository.getById(realId);
  assert.strictEqual(parseFloat(postRestoreBooking.total_amount), parseFloat(snapToRestore.authorized_amount), 'Total amount must match restored snapshot');

  const postRestoreLogs = await bookingRepository.getAuditLogsForBooking(realId);
  assert.ok(postRestoreLogs.some(a => a.action === 'BOOKING_RESTORED_FROM_SNAPSHOT'), 'Audit trail must contain BOOKING_RESTORED_FROM_SNAPSHOT action');
  console.log('✔ Test 4 Passed: Booking state successfully restored from snapshot with BOOKING_RESTORED_FROM_SNAPSHOT audit log.');

  console.log('\n🎉 ALL BACKUP, EXPORT & RECOVERY TESTS PASSED SUCCESSFULLY!\n');
}

runBackupAndRecoveryTests().catch(err => {
  console.error('❌ Backup & Recovery Test Failed:', err);
  process.exit(1);
});
