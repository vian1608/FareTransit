import bookingRepository from '../src/modules/bookings/booking.repository.mjs';
import logger from '../src/config/logger.mjs';

async function runBulkCleanup() {
  console.log('=== RUNNING FAST BULK TEST BOOKING CLEANUP ===');
  const KEEP_CODE = 'TFS-2026-HQ39GA';

  // 1. Fetch all bookings
  const allBookings = await bookingRepository.findAllBookings();
  const totalBefore = allBookings.length;
  console.log(`Initial total bookings count: ${totalBefore}`);

  const toDelete = [];
  let keptCount = 0;

  for (const b of allBookings) {
    const code = (b.confirmation_code || b.confirmationCode || b.bookingReference || '').trim();
    if (code.toUpperCase() === KEEP_CODE.toUpperCase()) {
      console.log(`[KEEP] Preserving production test booking: ${code} (ID: ${b.id})`);
      keptCount++;
    } else {
      toDelete.push(b);
    }
  }

  console.log(`Bookings queued for deletion: ${toDelete.length}`);

  let deletedCount = 0;
  const BATCH_SIZE = 10;

  for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
    const batch = toDelete.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (b) => {
      const code = (b.confirmation_code || b.confirmationCode || b.bookingReference || '').trim();
      try {
        const res = await bookingRepository.deleteBookingTransactional(b.id, 'admin@faretransit.com', '127.0.0.1');
        if (res.success) {
          deletedCount++;
        }
      } catch (err) {
        console.error(`Error deleting ${code}:`, err.message);
      }
    }));
    console.log(`Processed ${Math.min(i + BATCH_SIZE, toDelete.length)} / ${toDelete.length}...`);
  }

  // 2. Fetch remaining bookings to verify final state
  const remainingBookings = await bookingRepository.findAllBookings();
  console.log('\n=== CLEANUP SUMMARY ===');
  console.log(`Before cleanup: ${totalBefore} booking(s)`);
  console.log(`Deleted:        ${deletedCount} booking(s)`);
  console.log(`Kept:           ${keptCount} booking(s)`);
  console.log(`After cleanup:  ${remainingBookings.length} booking(s)`);

  for (const rem of remainingBookings) {
    const remCode = rem.confirmation_code || rem.confirmationCode || rem.bookingReference;
    console.log(` - Remaining Booking: ${remCode} (Status: ${rem.status})`);
  }

  if (remainingBookings.length === 1 && (remainingBookings[0].confirmation_code || remainingBookings[0].confirmationCode) === KEEP_CODE) {
    console.log('\n🎉 SUCCESS: Bulk cleanup completed successfully! Only TFS-2026-HQ39GA remains.');
  } else {
    console.log(`\nNote: Cleaned up ${deletedCount} test booking(s). Remaining count: ${remainingBookings.length}.`);
  }
}

runBulkCleanup().catch((err) => {
  console.error('Fatal error during bulk cleanup:', err);
  process.exit(1);
});
