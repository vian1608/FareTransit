import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { Client } = pg;
const projectRef = 'wgrfydrfzmjzrzgdodzs';

// Try different connection string formats
const options = [
  `postgresql://postgres:${process.env.SUPABASE_SECRET_KEY}@db.${projectRef}.supabase.co:5432/postgres`,
  `postgresql://postgres.${projectRef}:${process.env.SUPABASE_SECRET_KEY}@db.${projectRef}.supabase.co:5432/postgres`,
  `postgresql://postgres.${projectRef}:${process.env.SUPABASE_SECRET_KEY}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
  `postgresql://postgres.${projectRef}:${process.env.SUPABASE_SECRET_KEY}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`
];

async function tryConnect(connStr, index) {
  console.log(`\nTrying Connection option #${index + 1}: ${connStr.replace(process.env.SUPABASE_SECRET_KEY, '***')}`);
  const client = new Client({ connectionString: connStr, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    console.log('Connected! Executing ALTER TABLE...');
    await client.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS transaction_reference VARCHAR(255);');
    console.log('Success! Column transaction_reference added.');
    await client.end();
    return true;
  } catch (err) {
    console.error('Failed:', err.message);
    try { await client.end(); } catch(e) {}
    return false;
  }
}

async function run() {
  for (let i = 0; i < options.length; i++) {
    const ok = await tryConnect(options[i], i);
    if (ok) {
      console.log('Migration completed successfully!');
      process.exit(0);
    }
  }
  console.error('All connection options failed.');
  process.exit(1);
}

run();
