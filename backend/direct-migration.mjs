/**
 * direct-migration.mjs
 * Connects directly to Supabase PostgreSQL and runs the migration.
 * Supabase PostgreSQL connection string format:
 * postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
 */
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pg;

// Supabase DB connection — uses the project ref from the URL
const projectRef = process.env.SUPABASE_URL?.replace('https://', '').replace('.supabase.co', '');

// The DB password for Supabase is the secret key for direct connections
// Connection string for Supabase session mode pooler (port 5432)
const connectionString = `postgresql://postgres.${projectRef}:${process.env.SUPABASE_SECRET_KEY}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;

const SQL = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS bookings (
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
);

CREATE INDEX IF NOT EXISTS idx_bookings_email ON bookings(email);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);

CREATE TABLE IF NOT EXISTS travellers (
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
);

CREATE INDEX IF NOT EXISTS idx_travellers_booking ON travellers(booking_id);

CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  country_code VARCHAR(10),
  phone_number VARCHAR(30),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS flights (
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
);

CREATE INDEX IF NOT EXISTS idx_flights_booking ON flights(booking_id);

CREATE TABLE IF NOT EXISTS payments (
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
);

CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id);

CREATE TABLE IF NOT EXISTS abandoned_bookings (
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
);

CREATE INDEX IF NOT EXISTS idx_abandoned_session ON abandoned_bookings(session_key);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bookings_updated_at ON bookings;
CREATE TRIGGER trg_bookings_updated_at BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_abandoned_updated_at ON abandoned_bookings;
CREATE TRIGGER trg_abandoned_updated_at BEFORE UPDATE ON abandoned_bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE travellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE flights ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE abandoned_bookings ENABLE ROW LEVEL SECURITY;
`;

async function run() {
  console.log(`\n🔌 Connecting to Supabase PostgreSQL...`);
  console.log(`   Project: ${projectRef}`);

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  try {
    await client.connect();
    console.log('✅ Connected!\n');
    console.log('📋 Running migration SQL...');
    await client.query(SQL);
    console.log('✅ Migration complete! All tables created.\n');

    // Verify
    const { rows } = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('bookings','travellers','contacts','flights','payments','abandoned_bookings')
      ORDER BY table_name
    `);
    console.log('📊 Verified tables:');
    rows.forEach(r => console.log(`   ✅ ${r.table_name}`));
    console.log('');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    console.log('\n📋 Please run the migration manually:');
    console.log('   → https://app.supabase.com/project/' + projectRef + '/sql/new');
    console.log('   → Paste the contents of: backend/supabase-migration.sql\n');
  } finally {
    await client.end();
  }
}

run();
