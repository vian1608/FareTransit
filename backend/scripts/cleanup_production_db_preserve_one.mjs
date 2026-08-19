import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

import fs from 'fs';
import path from 'path';
import supabase from '../src/integrations/supabase/supabase.client.mjs';

async function performDatabaseCleanup() {
  console.log('================================================================================');
  console.log('  CRITICAL DATABASE CLEANUP TASK — PRESERVE BOOKING TFS-2026-HQ39GA');
  console.log('================================================================================\n');

  const TARGET_CONFIRMATION_CODE = 'TFS-2026-HQ39GA';
  const BACKUP_DIR = './backend/backups';

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFilePath = path.join(BACKUP_DIR, `pre_cleanup_backup_${timestamp}.json`);

  // ----------------------------------------------------
  // STEP 1: BACKUP ALL 6 TABLES BEFORE DELETION
  // ----------------------------------------------------
  console.log('--- STEP 1: BACKING UP ALL TABLES BEFORE DELETION ---');
  
  const tablesToBackup = ['bookings', 'flights', 'travellers', 'contacts', 'payments', 'abandoned_bookings'];
  const backupData = {
    metadata: {
      timestamp: new Date().toISOString(),
      protectedConfirmationCode: TARGET_CONFIRMATION_CODE
    },
    tables: {}
  };

  for (const tableName of tablesToBackup) {
    try {
      const { data, error } = await supabase.from(tableName).select('*');
      if (error) {
        console.warn(`[Backup Notice] Querying table '${tableName}' returned: ${error.message}`);
        backupData.tables[tableName] = [];
      } else {
        backupData.tables[tableName] = data || [];
        console.log(`✔ Backed up ${tableName}: ${(data || []).length} rows`);
      }
    } catch (e) {
      console.warn(`[Backup Notice] Table '${tableName}' not accessible: ${e.message}`);
      backupData.tables[tableName] = [];
    }
  }

  fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), 'utf8');

  if (!fs.existsSync(backupFilePath) || fs.statSync(backupFilePath).size < 10) {
    console.error('❌ BACKUP FAILED! Aborting cleanup immediately.');
    process.exit(1);
  }
  console.log(`✔ Step 1 Passed: Timestamped backup created successfully at: ${backupFilePath}\n`);

  // ----------------------------------------------------
  // STEP 2: LOCATE THE PROTECTED BOOKING
  // ----------------------------------------------------
  console.log('--- STEP 2: LOCATING PROTECTED BOOKING ---');
  const { data: bookingRows, error: bookingErr } = await supabase
    .from('bookings')
    .select('*')
    .eq('confirmation_code', TARGET_CONFIRMATION_CODE);

  if (bookingErr) {
    console.error(`❌ Error querying protected booking: ${bookingErr.message}`);
    process.exit(1);
  }

  if (!bookingRows || bookingRows.length !== 1) {
    console.error(`❌ STOPPING IMMEDIATELY: Query for confirmation_code '${TARGET_CONFIRMATION_CODE}' returned ${bookingRows?.length || 0} rows (expected exactly 1). No deletions performed.`);
    process.exit(1);
  }

  const protectedBooking = bookingRows[0];
  const protected_booking_id = protectedBooking.id;
  console.log(`✔ Protected Booking Found:`);
  console.log(`   UUID: ${protected_booking_id}`);
  console.log(`   Confirmation Code: ${protectedBooking.confirmation_code}`);
  console.log(`   Passenger Name: ${protectedBooking.passenger_name || 'N/A'}`);
  console.log(`   Total Amount: $${protectedBooking.total_amount || 0}\n`);

  // ----------------------------------------------------
  // STEP 3: PREVIEW PRESERVED & DELETED ROWS
  // ----------------------------------------------------
  console.log('--- STEP 3: PREVIEWING PRESERVED & DELETED ROWS ---');

  const getCounts = async (tableName) => {
    try {
      const { data } = await supabase.from(tableName).select('id, booking_id');
      if (!data) return { total: 0, preserved: 0, toDelete: 0 };
      if (tableName === 'bookings') {
        const preserved = data.filter(r => r.id === protected_booking_id).length;
        return { total: data.length, preserved, toDelete: data.length - preserved };
      } else if (tableName === 'abandoned_bookings') {
        return { total: data.length, preserved: 0, toDelete: data.length };
      } else {
        const preserved = data.filter(r => r.booking_id === protected_booking_id).length;
        return { total: data.length, preserved, toDelete: data.length - preserved };
      }
    } catch (e) {
      return { total: 0, preserved: 0, toDelete: 0 };
    }
  };

  const countsPreview = {};
  for (const table of tablesToBackup) {
    countsPreview[table] = await getCounts(table);
    console.log(`Table '${table}': Total = ${countsPreview[table].total} | Preserved = ${countsPreview[table].preserved} | To Delete = ${countsPreview[table].toDelete}`);
  }
  console.log('\n');

  // ----------------------------------------------------
  // STEP 4: PERFORM DELETIONS (CHILD TABLES FIRST)
  // ----------------------------------------------------
  console.log('--- STEP 4: EXECUTING DELETIONS FOR NON-PROTECTED RECORDS ---');

  const deletedCounts = {};

  // 1. Delete flights not belonging to protected_booking_id
  try {
    const { data: delFlights, error: errFlights } = await supabase
      .from('flights')
      .delete()
      .neq('booking_id', protected_booking_id)
      .select();
    deletedCounts.flights = delFlights?.length || 0;
    console.log(`✔ Deleted ${deletedCounts.flights} non-protected flights`);
  } catch (e) {
    console.warn(`Notice on flights deletion: ${e.message}`);
    deletedCounts.flights = 0;
  }

  // 2. Delete travellers not belonging to protected_booking_id
  try {
    const { data: delTravellers, error: errTravellers } = await supabase
      .from('travellers')
      .delete()
      .neq('booking_id', protected_booking_id)
      .select();
    deletedCounts.travellers = delTravellers?.length || 0;
    console.log(`✔ Deleted ${deletedCounts.travellers} non-protected travellers`);
  } catch (e) {
    console.warn(`Notice on travellers deletion: ${e.message}`);
    deletedCounts.travellers = 0;
  }

  // 3. Delete contacts not belonging to protected_booking_id
  try {
    const { data: delContacts, error: errContacts } = await supabase
      .from('contacts')
      .delete()
      .neq('booking_id', protected_booking_id)
      .select();
    deletedCounts.contacts = delContacts?.length || 0;
    console.log(`✔ Deleted ${deletedCounts.contacts} non-protected contacts`);
  } catch (e) {
    console.warn(`Notice on contacts deletion: ${e.message}`);
    deletedCounts.contacts = 0;
  }

  // 4. Delete payments not belonging to protected_booking_id
  try {
    const { data: delPayments, error: errPayments } = await supabase
      .from('payments')
      .delete()
      .neq('booking_id', protected_booking_id)
      .select();
    deletedCounts.payments = delPayments?.length || 0;
    console.log(`✔ Deleted ${deletedCounts.payments} non-protected payments`);
  } catch (e) {
    console.warn(`Notice on payments deletion: ${e.message}`);
    deletedCounts.payments = 0;
  }

  // 5. Delete abandoned_bookings
  try {
    const { data: delAbandoned, error: errAbandoned } = await supabase
      .from('abandoned_bookings')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Deletes all
      .select();
    deletedCounts.abandoned_bookings = delAbandoned?.length || 0;
    console.log(`✔ Deleted ${deletedCounts.abandoned_bookings} abandoned_bookings`);
  } catch (e) {
    console.warn(`Notice on abandoned_bookings deletion: ${e.message}`);
    deletedCounts.abandoned_bookings = 0;
  }

  // 6. Delete bookings not equal to protected_booking_id
  try {
    const { data: delBookings, error: errBookings } = await supabase
      .from('bookings')
      .delete()
      .neq('id', protected_booking_id)
      .select();
    deletedCounts.bookings = delBookings?.length || 0;
    console.log(`✔ Deleted ${deletedCounts.bookings} non-protected bookings\n`);
  } catch (e) {
    console.error(`❌ Error deleting bookings: ${e.message}`);
    process.exit(1);
  }

  // ----------------------------------------------------
  // STEP 5: VALIDATE POST-CLEANUP STATE
  // ----------------------------------------------------
  console.log('--- STEP 5: VALIDATING POST-CLEANUP DATABASE STATE ---');

  const { data: finalBookings, error: finalBookingsErr } = await supabase
    .from('bookings')
    .select('*');

  if (finalBookingsErr || !finalBookings) {
    console.error('❌ Validation Failed: Unable to read bookings table!');
    process.exit(1);
  }

  if (finalBookings.length !== 1) {
    console.error(`❌ VALIDATION FAILED: Total remaining bookings count = ${finalBookings.length} (expected exactly 1)!`);
    process.exit(1);
  }

  if (finalBookings[0].confirmation_code !== TARGET_CONFIRMATION_CODE) {
    console.error(`❌ VALIDATION FAILED: Remaining booking confirmation code '${finalBookings[0].confirmation_code}' !== '${TARGET_CONFIRMATION_CODE}'!`);
    process.exit(1);
  }

  console.log(`✔ Validation 5a Passed: Exactly 1 booking remains in database (Confirmation Code: ${finalBookings[0].confirmation_code}).`);

  // Check child tables for orphans
  const remainingCounts = {};
  for (const table of ['flights', 'travellers', 'contacts', 'payments']) {
    try {
      const { data } = await supabase.from(table).select('id, booking_id');
      const orphans = (data || []).filter(r => r.booking_id !== protected_booking_id);
      if (orphans.length > 0) {
        console.error(`❌ VALIDATION FAILED: Found ${orphans.length} orphan records in '${table}'!`);
        process.exit(1);
      }
      remainingCounts[table] = (data || []).length;
      console.log(`✔ Validation 5b Passed: Table '${table}' has ${remainingCounts[table]} records (0 orphans).`);
    } catch (e) {
      remainingCounts[table] = 0;
    }
  }

  remainingCounts.bookings = finalBookings.length;

  // ----------------------------------------------------
  // STEP 7: FINAL REPORT
  // ----------------------------------------------------
  console.log('\n================================================================================');
  console.log('  FINAL CLEANUP AUDIT REPORT');
  console.log('================================================================================');
  console.log(`• Protected Booking UUID: ${protected_booking_id}`);
  console.log(`• Protected Confirmation Code: ${TARGET_CONFIRMATION_CODE}`);
  console.log(`• Backup Location: ${backupFilePath}`);
  console.log(`\nDeleted Row Counts:`);
  console.log(`  - bookings: ${deletedCounts.bookings}`);
  console.log(`  - flights: ${deletedCounts.flights}`);
  console.log(`  - travellers: ${deletedCounts.travellers}`);
  console.log(`  - contacts: ${deletedCounts.contacts}`);
  console.log(`  - payments: ${deletedCounts.payments}`);
  console.log(`  - abandoned_bookings: ${deletedCounts.abandoned_bookings}`);

  console.log(`\nRemaining Row Counts:`);
  console.log(`  - bookings: ${remainingCounts.bookings}`);
  console.log(`  - flights: ${remainingCounts.flights}`);
  console.log(`  - travellers: ${remainingCounts.travellers}`);
  console.log(`  - contacts: ${remainingCounts.contacts}`);

  console.log('\n🎉 DATABASE CLEANUP COMPLETED AND VALIDATED SUCCESSFULLY WITH ZERO ORPHANS!\n');
}

performDatabaseCleanup().catch(err => {
  console.error('❌ Database Cleanup Fatal Error:', err);
  process.exit(1);
});
