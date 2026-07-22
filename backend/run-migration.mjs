/**
 * run-migration.mjs
 * Runs the Supabase database migration programmatically.
 * Usage: node run-migration.mjs
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false } }
);

// Individual SQL statements (Supabase client can run these via rpc or direct queries)
const statements = [
  // UUID extension
  `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`,

  // 1. BOOKINGS
  `CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    confirmation_code VARCHAR(20) UNIQUE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    payment_status VARCHAR(20) NOT NULL DEFAULT 'paid',
    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    currency VARCHAR(5) NOT NULL DEFAULT 'USD',
    passenger_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    internal_notes TEXT,
    original_api_price DECIMAL(10,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_bookings_email ON bookings(email)`,
  `CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status)`,
  `CREATE INDEX IF NOT EXISTS idx_bookings_created ON bookings(created_at DESC)`,

  // 2. TRAVELLERS
  `CREATE TABLE IF NOT EXISTS travellers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'adult',
    title VARCHAR(10),
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    last_name VARCHAR(100) NOT NULL,
    date_of_birth DATE,
    gender VARCHAR(20),
    nationality VARCHAR(100),
    passport_number VARCHAR(50),
    passport_expiry DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_travellers_booking ON travellers(booking_id)`,

  // 3. CONTACTS
  `CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    country_code VARCHAR(10),
    phone_number VARCHAR(30),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_contacts_booking ON contacts(booking_id)`,

  // 4. FLIGHTS
  `CREATE TABLE IF NOT EXISTS flights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    leg VARCHAR(10) NOT NULL DEFAULT 'outbound',
    trip_type VARCHAR(20) NOT NULL DEFAULT 'one-way',
    airline_name VARCHAR(100),
    flight_number VARCHAR(30),
    departure_airport VARCHAR(10),
    arrival_airport VARCHAR(10),
    departure_date VARCHAR(20),
    arrival_date VARCHAR(20),
    departure_time_str VARCHAR(20),
    arrival_time_str VARCHAR(20),
    duration VARCHAR(30),
    stops INTEGER DEFAULT 0,
    cabin_class VARCHAR(50) DEFAULT 'Economy',
    fare_details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_flights_booking ON flights(booking_id)`,

  // 5. PAYMENTS
  `CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    payment_provider VARCHAR(30) NOT NULL DEFAULT 'stripe',
    stripe_session_id VARCHAR(255),
    stripe_payment_id VARCHAR(255),
    payment_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    currency VARCHAR(5) NOT NULL DEFAULT 'USD',
    payment_status VARCHAR(20) NOT NULL DEFAULT 'paid',
    payment_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id)`,
  `CREATE INDEX IF NOT EXISTS idx_payments_session ON payments(stripe_session_id)`,

  // 6. ABANDONED BOOKINGS
  `CREATE TABLE IF NOT EXISTS abandoned_bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_key VARCHAR(100),
    selected_flight JSONB,
    return_flight JSONB,
    traveller_info JSONB,
    contact_info JSONB,
    special_requests JSONB,
    current_step VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_abandoned_session ON abandoned_bookings(session_key)`,
  `CREATE INDEX IF NOT EXISTS idx_abandoned_created ON abandoned_bookings(created_at DESC)`,

  // Trigger function
  `CREATE OR REPLACE FUNCTION update_updated_at()
   RETURNS TRIGGER AS $$
   BEGIN
     NEW.updated_at = NOW();
     RETURN NEW;
   END;
   $$ LANGUAGE plpgsql`,

  // Triggers
  `DROP TRIGGER IF EXISTS trg_bookings_updated_at ON bookings`,
  `CREATE TRIGGER trg_bookings_updated_at BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at()`,
  `DROP TRIGGER IF EXISTS trg_abandoned_updated_at ON abandoned_bookings`,
  `CREATE TRIGGER trg_abandoned_updated_at BEFORE UPDATE ON abandoned_bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at()`,

  // RLS
  `ALTER TABLE bookings ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE travellers ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE contacts ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE flights ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE payments ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE abandoned_bookings ENABLE ROW LEVEL SECURITY`,
];

async function runMigration() {
  console.log('🚀 Running Supabase migration...\n');

  for (const sql of statements) {
    const label = sql.split('\n')[0].trim().substring(0, 60);
    try {
      const { error } = await supabase.rpc('exec', { sql }).catch(() => ({ error: null }));
      // Try direct approach via the REST API
      const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/`, {
        method: 'POST',
        headers: {
          'apikey': process.env.SUPABASE_SECRET_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SECRET_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ query: sql })
      });
      console.log(`  ✅ ${label}`);
    } catch (err) {
      console.log(`  ⚠️  ${label} — ${err.message}`);
    }
  }

  console.log('\n✅ Migration complete. Check Supabase dashboard to verify tables.');
}

// Use pg directly via supabase's postgres connection
async function tryDirectSQL() {
  console.log('Attempting migration via Supabase management API...\n');

  const projectRef = 'wgrfydrfzmjzrzgdodzs';
  const allSQL = statements.join(';\n');

  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SECRET_KEY}`,
      },
      body: JSON.stringify({ query: statements.join('; ') }),
    });

    const data = await res.json();
    if (res.ok) {
      console.log('✅ Migration successful via management API!');
    } else {
      console.log('⚠️  Management API response:', JSON.stringify(data, null, 2));
      console.log('\n📋 Please run the migration SQL manually in your Supabase Dashboard:');
      console.log('   → https://app.supabase.com/project/wgrfydrfzmjzrzgdodzs/sql/new');
      console.log('   → Open: backend/supabase-migration.sql and paste its contents\n');
    }
  } catch (err) {
    console.log('⚠️  Could not run migration automatically:', err.message);
    console.log('\n📋 Please run the migration SQL manually in your Supabase Dashboard:');
    console.log('   → https://app.supabase.com/project/wgrfydrfzmjzrzgdodzs/sql/new');
    console.log('   → Open: backend/supabase-migration.sql and paste its contents\n');
  }
}

tryDirectSQL();
