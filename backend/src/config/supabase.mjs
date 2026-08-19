import { createClient } from '@supabase/supabase-js';
import env from './env.mjs';

const nodeEnv = (process.env.NODE_ENV || 'development').toLowerCase();
const vercelEnv = (process.env.VERCEL_ENV || '').toLowerCase();
// Vercel sets NODE_ENV=production for Preview builds as well. Enforce the
// hard credential guard only for a real production deployment; non-Vercel
// production runtimes continue to be treated as production.
const isProductionDeployment = vercelEnv ? vercelEnv === 'production' : nodeEnv === 'production';
const hasValidSupabaseConfig = Boolean(
  env.supabaseUrl &&
  env.supabaseSecretKey &&
  !env.supabaseUrl.includes('placeholder') &&
  !env.supabaseSecretKey.includes('placeholder')
);

if (isProductionDeployment && !hasValidSupabaseConfig) {
  throw new Error('FATAL_CONFIG_ERROR: SUPABASE_URL and SUPABASE_SECRET_KEY environment variables are required in production');
}

const url = env.supabaseUrl || 'https://placeholder.supabase.co';
const key = env.supabaseSecretKey || 'placeholder-key';

if (!hasValidSupabaseConfig) {
  console.warn('⚠️ Supabase environment variables missing! Using safe stub client outside the live production deployment.');
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
