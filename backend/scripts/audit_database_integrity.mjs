import { supabase } from '../src/config/supabase.mjs';
import { bookingRepository } from '../src/modules/bookings/booking.repository.mjs';

async function auditDatabaseIntegrity() {
  console.log('================================================================================');
  console.log('  READ-ONLY DATA-INTEGRITY AUDIT FOR ALL REPOSITORY BOOKINGS');
  console.log('================================================================================\n');

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, confirmation_code, passenger_name, customer_price, total_amount, created_at');

  if (error) {
    console.error('Error fetching bookings for audit:', error);
    return;
  }

  console.log(`Auditing ${bookings.length} total bookings in PostgreSQL database...\n`);

  const missingItineraries = [];
  const splitMismatches = [];

  for (const b of bookings) {
    const complete = await bookingRepository.getCompleteBookingById(b.id);
    const passCount = complete.travellers?.length || 0;
    const flightCount = (complete.flights?.length || 0) + (complete.itinerary_segments?.length || 0);
    const amount = parseFloat(complete.customer_price || complete.total_amount || 0);

    // Rule 1: Pax > 0, amount > 0, flightCount = 0
    if (passCount > 0 && amount > 0 && flightCount === 0) {
      missingItineraries.push({
        id: b.id,
        code: b.confirmation_code,
        customer: b.passenger_name,
        amount,
        passCount,
        created_at: b.created_at
      });
    }

    // Rule 2: Payment splits sum vs authorized amount
    const splits = complete.payment_splits || [];
    if (splits.length > 0) {
      const splitSum = splits.reduce((sum, s) => sum + parseFloat(s.amount || 0), 0);
      const authAmt = parseFloat(complete.payment?.paymentAmount || complete.customer_price || 0);
      if (Math.abs(splitSum - authAmt) > 0.01) {
        splitMismatches.push({
          id: b.id,
          code: b.confirmation_code,
          splitSum,
          authAmt,
          diff: splitSum - authAmt
        });
      }
    }
  }

  console.log('--------------------------------------------------------------------------------');
  console.log(`AUDIT FINDINGS:`);
  console.log(`1. Bookings with Missing Itinerary (Pax > 0, Amount > 0, Segments = 0): ${missingItineraries.length}`);
  if (missingItineraries.length > 0) {
    missingItineraries.forEach(m => {
      console.log(`   - Code: ${m.code || m.id} | Customer: ${m.customer} | Amount: $${m.amount} | Pax: ${m.passCount} | Created: ${m.created_at}`);
    });
  }

  console.log(`\n2. Bookings with Payment Split Mismatches: ${splitMismatches.length}`);
  if (splitMismatches.length > 0) {
    splitMismatches.forEach(m => {
      console.log(`   - Code: ${m.code || m.id} | Split Total: $${m.splitSum} | Authorized: $${m.authAmt} | Diff: $${m.diff}`);
    });
  }
  console.log('--------------------------------------------------------------------------------\n');
}

auditDatabaseIntegrity().catch(console.error);
