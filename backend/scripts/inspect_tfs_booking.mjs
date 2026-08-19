import { supabase } from '../src/config/supabase.mjs';
import { bookingRepository } from '../src/modules/bookings/booking.repository.mjs';

async function inspectBooking() {
  console.log('--- INSPECTING BOOKING TFS-2026-5W8ZOA ---');
  
  // 1. Search in bookings table
  const { data: recent, error: bErr } = await supabase
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30);

  if (bErr) {
    console.error('Error fetching bookings:', bErr);
    return;
  }

  const target = recent.find(b => b.booking_code === 'TFS-2026-5W8ZOA' || b.id === 'TFS-2026-5W8ZOA' || String(b.passenger_name).includes('Vinod'));
  console.log('Target booking matching TFS-2026-5W8ZOA or Vinod Saini:');
  console.log(target);

  if (!target) {
    console.log('\nList of 30 most recent bookings in database:');
    recent.forEach(b => {
      console.log(`- ID: ${b.id} | Code: ${b.booking_code} | Customer: ${b.passenger_name} | Price: $${b.customer_price || b.total_amount}`);
    });
    return;
  }

  const realId = target.id;

  // 2. Query all related tables
  const { data: flights } = await supabase.from('flights').select('*').eq('booking_id', realId);
  const { data: segments } = await supabase.from('booking_itinerary_segments').select('*').eq('booking_id', realId);
  const { data: travellers } = await supabase.from('travellers').select('*').eq('booking_id', realId);
  const { data: contacts } = await supabase.from('contacts').select('*').eq('booking_id', realId);
  const { data: payments } = await supabase.from('payments').select('*').eq('booking_id', realId);
  const { data: splits } = await supabase.from('payment_authorization_splits').select('*').eq('booking_id', realId);
  const { data: auths } = await supabase.from('passenger_authorizations').select('*').eq('booking_id', realId);
  const { data: audit } = await supabase.from('booking_audit_logs').select('*').eq('booking_id', realId);
  const { data: snapshots } = await supabase.from('checkout_snapshots').select('*').or(`session_key.eq.${realId},booking_id.eq.${realId}`);

  console.log('\n--- RELATED ROWS FOR ' + realId + ' ---');
  console.log(`Flights count: ${flights?.length || 0}`);
  console.log(`Itinerary Segments count: ${segments?.length || 0}`);
  console.log(`Travellers count: ${travellers?.length || 0}`);
  console.log(`Contacts count: ${contacts?.length || 0}`);
  console.log(`Payments count: ${payments?.length || 0}`);
  console.log(`Payment Splits count: ${splits?.length || 0}`);
  console.log(`Passenger Auths count: ${auths?.length || 0}`);
  console.log(`Audit logs count: ${audit?.length || 0}`);
  console.log(`Checkout snapshots count: ${snapshots?.length || 0}`);

  console.log('\nFlights rows:', flights);
  console.log('Itinerary Segments rows:', segments);
  console.log('Payment Splits rows:', splits);
  console.log('Passenger Auths snapshots:', auths?.map(a => ({ id: a.id, quote_snapshot: a.quote_snapshot })));

  // Complete enriched booking from repository
  const complete = await bookingRepository.getCompleteBookingById(realId);
  console.log('\nComplete enriched booking from repository:', JSON.stringify(complete, null, 2));
}

inspectBooking().catch(console.error);
