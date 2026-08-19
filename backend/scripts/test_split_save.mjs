import { supabase } from '../src/config/supabase.mjs';
import { bookingRepository } from '../src/modules/bookings/booking.repository.mjs';

async function run() {
  const bookingCode = 'TFS-2026-EK1VM8';
  
  // 1. Fetch booking by code
  const booking = await bookingRepository.getById(bookingCode);
  if (!booking) {
    console.error('Booking not found!');
    return;
  }
  
  // Reset database row to 126
  console.log('Resetting database row to 126...');
  await supabase
    .from('bookings')
    .update({ total_amount: 126.00, customer_price: 126.00 })
    .eq('id', booking.id);
    
  // Clear memory cache
  const bookingsMemoryStore = (await import('../src/modules/bookings/booking.repository.mjs')).bookingRepository;
  // Clear bookings memory store
  
  console.log('--- BEFORE SAVE (DIRECT DB READ) ---');
  const { data: beforeBooking } = await supabase.from('bookings').select('*').eq('id', booking.id).single();
  console.log(`DB Amount: ${beforeBooking.total_amount}`);
  
  // 2. Splits input
  const splitsInput = [
    { merchantName: 'FareTransit LLC', amount: 128.00 },
    { merchantName: 'Frontier Airlines', amount: 100.00 }
  ];
  
  try {
    console.log('\n--- CALLING updatePaymentSplitsAndTotal ---');
    const result = await bookingRepository.updatePaymentSplitsAndTotal(
      booking.id,
      splitsInput,
      'admin_test',
      'Test updating payment splits to $228'
    );
    console.log('Result returned successfully:', {
      id: result.id,
      amount: result.customer_price || result.total_amount,
      paymentSplits: result.paymentSplits
    });
  } catch (err) {
    console.error('❌ Error caught during updatePaymentSplitsAndTotal:', err.message);
  }
  
  // 3. Inspect database directly afterwards
  console.log('\n--- AFTER SAVE (DIRECT DB READ) ---');
  const { data: dbBooking } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', booking.id)
    .maybeSingle();
    
  console.log('DB Booking row:', {
    total_amount: dbBooking?.total_amount,
    customer_price: dbBooking?.customer_price,
    status: dbBooking?.status,
    authorization_status: dbBooking?.authorization_status
  });
}

run().catch(console.error);
