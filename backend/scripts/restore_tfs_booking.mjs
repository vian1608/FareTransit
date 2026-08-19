import { supabase } from '../src/config/supabase.mjs';
import { bookingRepository } from '../src/modules/bookings/booking.repository.mjs';

async function restoreTfsBooking() {
  console.log('================================================================================');
  console.log('  RESTORATION & DATA-INTEGRITY REPAIR FOR BOOKING TFS-2026-5W8ZOA');
  console.log('================================================================================\n');

  const bId = '049dc249-5e17-41d4-a85c-a2c163b489b2';
  const booking = await bookingRepository.getById(bId);
  if (!booking) {
    console.error('Booking 049dc249-5e17-41d4-a85c-a2c163b489b2 not found.');
    return;
  }

  console.log('Existing Booking record:', {
    id: booking.id,
    code: booking.booking_code,
    name: booking.passenger_name,
    customer_price: booking.customer_price,
    supplier_price: booking.supplier_price
  });

  // Search for any orphaned flight rows created around 2026-08-02T07:38:32
  const { data: orphanedFlights } = await supabase
    .from('flights')
    .select('*')
    .gte('created_at', '2026-08-02T07:00:00')
    .lte('created_at', '2026-08-02T08:30:00');

  console.log('Flights found in time window:', orphanedFlights);

  // Check if flights exist for TFS-2026-5W8ZOA
  const currentCount = await bookingRepository.getFlightsCount(bId);
  console.log(`Current flight count for TFS-2026-5W8ZOA: ${currentCount}`);

  if (currentCount === 0) {
    console.log('Attempting read-only recovery search from related records...');
    
    // Check if there's authorization snapshot or email log
    const { data: authRecord } = await supabase
      .from('passenger_authorizations')
      .select('*')
      .eq('booking_id', bId)
      .maybeSingle();

    if (authRecord?.quote_snapshot?.outbound) {
      console.log('Found outbound itinerary in quote_snapshot! Restoring...');
      const snapItin = authRecord.quote_snapshot.outbound;
      await bookingRepository.saveItinerarySegments(bId, Array.isArray(snapItin) ? snapItin : [snapItin]);
      console.log('✔ Itinerary restored from authorization quote_snapshot.');
    } else {
      console.log('ℹ No automatic recovery snapshot found in database for TFS-2026-5W8ZOA.');
      console.log('Data Integrity Incident remains visible. Manual itinerary completion required.');
    }
  }

  const complete = await bookingRepository.getCompleteBookingById(bId);
  console.log('\nUpdated Complete Booking state:', {
    id: complete.id,
    code: complete.confirmation_code,
    passengerCount: complete.travellers?.length,
    flightsCount: complete.flights?.length,
    paymentSplitsCount: complete.payment_splits?.length,
    customerTotal: complete.customer_price
  });
}

restoreTfsBooking().catch(console.error);
