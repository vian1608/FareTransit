import supabase from '../src/integrations/supabase/supabase.client.mjs';

async function testBatchFetch() {
  console.time('Batch Fetch 13 Bookings');

  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  const bookingIds = data.map(b => b.id).filter(Boolean);

  const [travellersRes, contactsRes, flightsRes, paymentsRes, segmentsRes, emailLogsRes] = await Promise.all([
    supabase.from('travellers').select('*').in('booking_id', bookingIds),
    supabase.from('contacts').select('*').in('booking_id', bookingIds),
    supabase.from('flights').select('*').in('booking_id', bookingIds),
    supabase.from('payments').select('*').in('booking_id', bookingIds),
    supabase.from('booking_itinerary_segments').select('*').in('booking_id', bookingIds),
    supabase.from('email_logs').select('*').in('booking_id', bookingIds)
  ]);

  console.timeEnd('Batch Fetch 13 Bookings');

  console.log('Bookings:', data.length);
  console.log('Travellers:', travellersRes.data?.length || 0);
  console.log('Flights:', flightsRes.data?.length || 0);
  console.log('Payments:', paymentsRes.data?.length || 0);
}

testBatchFetch().catch(console.error);
