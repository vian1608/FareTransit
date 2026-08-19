import { supabase } from '../src/config/supabase.mjs';

async function inspect() {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error fetching bookings:', error);
  } else {
    console.log('Bookings columns:', Object.keys(data[0] || {}));
  }
  process.exit(0);
}

inspect();
