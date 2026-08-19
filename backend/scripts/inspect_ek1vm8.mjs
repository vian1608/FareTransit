import { supabase } from '../src/config/supabase.mjs';
import { bookingRepository } from '../src/modules/bookings/booking.repository.mjs';

async function run() {
  console.log('--- DB INSPECTION FOR TFS-2026-EK1VM8 ---');
  
  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select('*')
    .eq('confirmation_code', 'TFS-2026-EK1VM8')
    .maybeSingle();
    
  if (bErr) {
    console.error('Error fetching booking:', bErr);
    return;
  }
  
  if (!booking) {
    console.log('Booking TFS-2026-EK1VM8 not found!');
    return;
  }
  
  console.log('Booking row:', JSON.stringify(booking, null, 2));
  
  const realId = booking.id;
  
  const { data: splits, error: sErr } = await supabase.from('payment_authorization_splits').select('*').eq('booking_id', realId);
  const { data: auths, error: aErr } = await supabase.from('passenger_authorizations').select('*').eq('booking_id', realId);
  const { data: payments, error: pErr } = await supabase.from('payments').select('*').eq('booking_id', realId);
  
  console.log('Payment splits err:', sErr);
  console.log('Payment splits:', JSON.stringify(splits, null, 2));
  console.log('Passenger authorizations err:', aErr);
  console.log('Passenger authorizations:', JSON.stringify(auths, null, 2));
  console.log('Payments err:', pErr);
  console.log('Payments:', JSON.stringify(payments, null, 2));
}

run().catch(console.error);
