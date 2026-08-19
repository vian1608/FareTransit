import { supabase } from '../src/config/supabase.mjs';

async function run() {
  console.log('Testing booking update...');
  
  const bookingId = '8ff3aa08-d5ce-40bd-87e5-264d3a5a00bb';
  
  const updatePayload = {
    total_amount: 228.00,
    customer_price: 228.00,
    status: 'PENDING',
    authorization_status: 'PENDING',
    payment_status: 'pending'
  };
  
  const { data, error } = await supabase
    .from('bookings')
    .update(updatePayload)
    .eq('id', bookingId)
    .select()
    .maybeSingle();
    
  console.log('Update Result:', { data, error });
}

run();
