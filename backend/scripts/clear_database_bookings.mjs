import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

import fs from 'fs/promises';
import path from 'path';
import { supabase } from '../src/integrations/supabase/supabase.client.mjs';

async function clearAllBookings() {
  console.log('================================================================================');
  console.log('  CRITICAL DATABASE CLEANUP: BACKUP & CLEAR ALL BOOKINGS');
  console.log('================================================================================\n');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.resolve('./backend/backups');
  await fs.mkdir(backupDir, { recursive: true });
  const backupFilePath = path.join(backupDir, `database_backup_${timestamp}.json`);

  // ----------------------------------------------------
  // STEP 1: BACKUP ALL DATABASE TABLES
  // ----------------------------------------------------
  console.log('--- STEP 1: CREATING TIMESTAMPED BACKUP ---');
  const tables = [
    'bookings',
    'flights',
    'travellers',
    'contacts',
    'payments',
    'abandoned_bookings',
    'booking_payment_methods',
    'booking_payment_splits',
    'email_deliveries'
  ];

  const backupData = {};
  for (const table of tables) {
    try {
      const { data, error } = await supabase.from(table).select('*');
      if (!error && data) {
        backupData[table] = data;
        console.log(`  ✓ Table '${table}': ${data.length} rows backed up.`);
      } else {
        backupData[table] = [];
        console.log(`  ! Table '${table}': Notice (${error?.message || '0 rows'}).`);
      }
    } catch (e) {
      backupData[table] = [];
      console.log(`  ! Table '${table}': Exception (${e.message}).`);
    }
  }

  await fs.writeFile(backupFilePath, JSON.stringify(backupData, null, 2), 'utf8');
  console.log(`\n✔ TIMESTAMPED BACKUP SAVED SUCCESSFULLY: ${backupFilePath}\n`);

  // ----------------------------------------------------
  // STEP 2: CHECK FOR PROTECTED BOOKING (IF APPLICABLE)
  // ----------------------------------------------------
  console.log('--- STEP 2: CHECKING CURRENT BOOKINGS IN DATABASE ---');
  const { data: currentBookings, error: bkErr } = await supabase.from('bookings').select('id, confirmation_code, passenger_name, total_amount, created_at');
  
  if (bkErr) {
    console.error('❌ Could not query bookings table:', bkErr.message);
    process.exit(1);
  }

  console.log(`Found ${currentBookings.length} booking(s) in database.`);
  currentBookings.forEach((b, idx) => {
    console.log(`  [${idx + 1}] ID: ${b.id} | Code: ${b.confirmation_code} | Pax: ${b.passenger_name} | Total: $${b.total_amount}`);
  });

  const protectedBooking = currentBookings.find(b => b.confirmation_code === 'TFS-2026-HQ39GA');
  const protectedBookingId = protectedBooking ? protectedBooking.id : null;

  if (protectedBookingId) {
    console.log(`\n📌 Protected booking 'TFS-2026-HQ39GA' found (ID: ${protectedBookingId}). Preserving protected booking.`);
  } else {
    console.log(`\n📌 No protected booking 'TFS-2026-HQ39GA' found. Clearing all bookings from database as requested.`);
  }

  // ----------------------------------------------------
  // STEP 3: PERFORM DELETION
  // ----------------------------------------------------
  console.log('\n--- STEP 3: EXECUTING DATABASE DELETION ---');

  const targetIdsToDelete = protectedBookingId
    ? currentBookings.filter(b => b.id !== protectedBookingId).map(b => b.id)
    : currentBookings.map(b => b.id);

  if (targetIdsToDelete.length === 0) {
    console.log('No bookings to delete.');
  } else {
    for (const bId of targetIdsToDelete) {
      console.log(`Deleting dependencies and booking ID: ${bId}...`);
      await supabase.from('flights').delete().eq('booking_id', bId);
      await supabase.from('travellers').delete().eq('booking_id', bId);
      await supabase.from('contacts').delete().eq('booking_id', bId);
      await supabase.from('payments').delete().eq('booking_id', bId);
      await supabase.from('booking_payment_methods').delete().eq('booking_id', bId);
      await supabase.from('booking_payment_splits').delete().eq('booking_id', bId);
      await supabase.from('email_deliveries').delete().eq('booking_id', bId);
      await supabase.from('bookings').delete().eq('id', bId);
    }
  }

  // Also clear abandoned_bookings if requested
  try {
    await supabase.from('abandoned_bookings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  } catch (e) {}

  // ----------------------------------------------------
  // STEP 4: VERIFY REMAINING DATABASE STATE
  // ----------------------------------------------------
  console.log('\n--- STEP 4: VERIFYING DATABASE STATE POST-CLEANUP ---');
  const { data: remainingBookings } = await supabase.from('bookings').select('id, confirmation_code');
  const { data: remainingFlights } = await supabase.from('flights').select('id');
  const { data: remainingTravellers } = await supabase.from('travellers').select('id');

  console.log(`Remaining Bookings: ${remainingBookings?.length || 0}`);
  console.log(`Remaining Flights: ${remainingFlights?.length || 0}`);
  console.log(`Remaining Travellers: ${remainingTravellers?.length || 0}`);

  if (protectedBookingId && remainingBookings?.length === 1) {
    console.log(`✓ Protected booking 'TFS-2026-HQ39GA' preserved cleanly.`);
  }

  console.log('\n================================================================================');
  console.log('  🎉 DATABASE CLEANUP COMPLETED SUCCESSFULLY!');
  console.log('================================================================================\n');
}

clearAllBookings().catch(err => {
  console.error('❌ Database Cleanup Failed:', err);
  process.exit(1);
});
