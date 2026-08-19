/**
 * Create booking_payment_methods table in Supabase via REST API.
 * Uses the Supabase service role key to execute raw SQL via the sql endpoint.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

// Try via management API (pg meta)
const projectRef = SUPABASE_URL.replace('https://', '').split('.')[0];
console.log('Project ref:', projectRef);
console.log('Supabase URL:', SUPABASE_URL);

const SQL = `
-- booking_payment_methods: Safe tokenized card reference and billing address per booking
CREATE TABLE IF NOT EXISTS public.booking_payment_methods (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  payment_provider TEXT NOT NULL DEFAULT 'card',
  provider_customer_id TEXT,
  provider_payment_method_id TEXT NOT NULL DEFAULT ('pm_tok_' || extract(epoch from now())::bigint::text),
  cardholder_name TEXT,
  card_brand TEXT,
  card_last4 TEXT,
  card_exp_month INTEGER,
  card_exp_year INTEGER,
  billing_email TEXT,
  billing_phone TEXT,
  billing_address_line1 TEXT,
  billing_address_line2 TEXT,
  billing_city TEXT,
  billing_state TEXT,
  billing_postal_code TEXT,
  billing_country TEXT DEFAULT 'United States',
  tokenization_status TEXT DEFAULT 'TOKENIZED',
  removed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bpm_booking_id ON public.booking_payment_methods(booking_id);

ALTER TABLE IF EXISTS public.booking_payment_methods ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'booking_payment_methods'
    AND policyname = 'service_role_all_bpm'
  ) THEN
    CREATE POLICY "service_role_all_bpm" ON public.booking_payment_methods
      TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

SELECT 'booking_payment_methods created or already exists' AS result;
`;

async function runMigration() {
  // Try via Supabase pg meta REST endpoint
  const pgMetaUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
  
  console.log('\n--- Attempting migration via Supabase Management API ---');
  try {
    const res = await fetch(pgMetaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`
      },
      body: JSON.stringify({ query: SQL })
    });
    const text = await res.text();
    console.log('Status:', res.status);
    console.log('Response:', text.substring(0, 500));
    if (res.ok) {
      console.log('✓ Migration via Management API succeeded!');
      return;
    }
  } catch (err) {
    console.log('Management API failed:', err.message);
  }

  // Try via supabase-js rpc if available
  console.log('\n--- Attempting migration via supabase-js client ---');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);
  
  // Try using the REST API directly
  const restUrl = `${SUPABASE_URL}/rest/v1/rpc/exec_sql`;
  try {
    const res = await fetch(restUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SECRET_KEY,
        'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`
      },
      body: JSON.stringify({ sql: SQL })
    });
    const text = await res.text();
    console.log('Status:', res.status);
    console.log('Response:', text.substring(0, 500));
  } catch (err) {
    console.log('RPC failed:', err.message);
  }
  
  // Verify current state
  console.log('\n--- Verifying table state ---');
  const { data, error } = await supabase.from('booking_payment_methods').select('id').limit(1);
  if (error) {
    console.log('Table still NOT accessible:', error.message);
    console.log('\n⚠ You must run the following SQL in the Supabase Dashboard:');
    console.log('https://supabase.com/dashboard/project/' + projectRef + '/sql/new');
    console.log('\n--- SQL TO RUN ---');
    console.log(SQL);
    console.log('--- END SQL ---');
  } else {
    console.log('✓ Table booking_payment_methods is accessible!');
  }
}

runMigration().catch(console.error);
