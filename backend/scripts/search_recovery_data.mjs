import { supabase } from '../src/config/supabase.mjs';

async function searchRecoveryData() {
  console.log('================================================================================');
  console.log('  RECOVERY AUDIT FOR BOOKING TFS-2026-5W8ZOA (049dc249-5e17-41d4-a85c-a2c163b489b2)');
  console.log('================================================================================\n');

  const bId = '049dc249-5e17-41d4-a85c-a2c163b489b2';
  const bCode = 'TFS-2026-5W8ZOA';
  const email = 'vinodsaini735100@gmail.com';

  // 1. Search abandoned_checkout_snapshots
  const { data: abandoned } = await supabase
    .from('abandoned_checkout_snapshots')
    .select('*')
    .or(`email.eq.${email},session_key.eq.${bId}`);
  console.log('1. Abandoned Checkout Snapshots:', abandoned);

  // 2. Search checkout_snapshots
  const { data: checkoutSnaps } = await supabase
    .from('checkout_snapshots')
    .select('*');
  console.log('2. Checkout Snapshots count:', checkoutSnaps?.length || 0);
  if (checkoutSnaps && checkoutSnaps.length > 0) {
    console.log('Checkout Snapshots sample:', checkoutSnaps.slice(0, 5));
  }

  // 3. Search booking_audit_logs / status audits
  const { data: statusAudits } = await supabase
    .from('booking_status_audits')
    .select('*')
    .eq('booking_id', bId);
  console.log('3. Status Audits:', statusAudits);

  // 4. Search booking_payment_events
  const { data: paymentEvents } = await supabase
    .from('booking_payment_events')
    .select('*')
    .eq('booking_id', bId);
  console.log('4. Payment Events:', paymentEvents);

  // 5. Search passenger_authorizations
  const { data: passengerAuths } = await supabase
    .from('passenger_authorizations')
    .select('*')
    .or(`booking_id.eq.${bId},email.eq.${email}`);
  console.log('5. Passenger Authorizations:', passengerAuths);

  // 6. Check if any raw flight rows exist in flights table for any booking around created_at 2026-08-02
  const { data: recentFlights } = await supabase
    .from('flights')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
  console.log('6. Recent flights in database:', recentFlights);
}

searchRecoveryData().catch(console.error);
