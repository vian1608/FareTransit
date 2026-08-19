import { createClient } from '@supabase/supabase-js';
import env from './env.mjs';

const isProdMode = (process.env.NODE_ENV || 'development').toLowerCase() === 'production';
if (isProdMode && (!env.supabaseUrl || !env.supabaseSecretKey || env.supabaseUrl.includes('placeholder') || env.supabaseSecretKey.includes('placeholder'))) {
  throw new Error('FATAL_CONFIG_ERROR: SUPABASE_URL and SUPABASE_SECRET_KEY environment variables are required in production');
}

const url = env.supabaseUrl || 'https://placeholder.supabase.co';
const key = env.supabaseSecretKey || 'placeholder-key';

if (!env.supabaseUrl || !env.supabaseSecretKey) {
  console.warn('⚠️ Supabase environment variables missing! Using safe stub client for tests/offline execution.');
}

export const supabase = createClient(url, key, {
  auth: {
    persistSession: false
  }
});

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
