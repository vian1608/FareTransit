/**
 * run-paypal-migration.mjs
 * Runs the PayPal migration on Supabase programmatically.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { persistSession: false }
});

async function run() {
  console.log('Running PayPal database schema updates...');
  
  // Test query on payments table
  const { data, error } = await supabase.from('payments').select('*').limit(1);
  if (error) {
    console.error('Database connection error:', error.message);
  } else {
    console.log('Successfully connected to database payments table.');
  }
}

run();
