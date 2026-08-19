import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pg;

const hosts = [
  `postgresql://postgres:${encodeURIComponent(process.env.SUPABASE_SECRET_KEY)}@db.wgrfydrfzmjzrzgdodzs.supabase.co:5432/postgres`,
  `postgresql://postgres.wgrfydrfzmjzrzgdodzs:${encodeURIComponent(process.env.SUPABASE_SECRET_KEY)}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
  `postgresql://postgres.wgrfydrfzmjzrzgdodzs:${encodeURIComponent(process.env.SUPABASE_SECRET_KEY)}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`,
];

const SQL = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS inquiries (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_type          VARCHAR(50) NOT NULL DEFAULT 'flights',
  status                VARCHAR(20) NOT NULL DEFAULT 'NEW',
  name                  VARCHAR(255) NOT NULL,
  email                 VARCHAR(255) NOT NULL,
  phone                 VARCHAR(50),
  origin                VARCHAR(255),
  destination           VARCHAR(255),
  trip_type             VARCHAR(50),
  travel_date           VARCHAR(50),
  return_date           VARCHAR(50),
  passengers            VARCHAR(50),
  cabin_class           VARCHAR(50),
  notes                 TEXT,
  sms_opt_in            BOOLEAN DEFAULT FALSE,
  preferred_destination VARCHAR(255),
  flexible_dates        VARCHAR(50),
  source                VARCHAR(100),
  utm_source            VARCHAR(100),
  utm_medium            VARCHAR(100),
  utm_campaign          VARCHAR(100),
  utm_content           VARCHAR(100),
  gclid                 VARCHAR(255),
  gbraid                VARCHAR(255),
  wbraid                VARCHAR(255),
  email_status          VARCHAR(20) DEFAULT 'PENDING',
  email_provider        VARCHAR(50),
  email_message_id      VARCHAR(255),
  email_error           TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inquiries_email ON inquiries(email);
CREATE INDEX IF NOT EXISTS idx_inquiries_service ON inquiries(service_type);
CREATE INDEX IF NOT EXISTS idx_inquiries_created ON inquiries(created_at DESC);
ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;
`;

async function tryConnect() {
  for (const connStr of hosts) {
    console.log(`Connecting to: ${connStr.replace(process.env.SUPABASE_SECRET_KEY, '****')}`);
    const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 5000 });
    try {
      await client.connect();
      console.log('✅ Connected! Running SQL migration...');
      await client.query(SQL);
      console.log('🎉 Table inquiries created successfully!');
      await client.end();
      return true;
    } catch (e) {
      console.log('   Error:', e.message);
      try { await client.end(); } catch (_) {}
    }
  }
  return false;
}

tryConnect();
