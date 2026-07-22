import { createClient } from '@supabase/supabase-js';
import env from './env.mjs';

if (!env.supabaseUrl || !env.supabaseSecretKey) {
  console.error('❌ Supabase environment variables are missing! Set SUPABASE_URL and SUPABASE_SECRET_KEY.');
}

export const supabase = createClient(
  env.supabaseUrl,
  env.supabaseSecretKey,
  {
    auth: {
      persistSession: false
    }
  }
);

// Ping test helper
export async function testSupabaseConnection() {
  try {
    const { data, error } = await supabase.from('bookings').select('id').limit(1);
    if (error) {
      console.error('❌ Supabase connection failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('❌ Supabase connection error:', err.message);
    return false;
  }
}

export default supabase;
