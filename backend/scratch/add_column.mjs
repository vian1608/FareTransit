import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { Client } = pg;
const projectRef = process.env.SUPABASE_URL?.replace('https://', '').replace('.supabase.co', '');
const connectionString = `postgresql://postgres.${projectRef}:${process.env.SUPABASE_SECRET_KEY}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;

console.log('Connecting to database with Ref:', projectRef);

async function run() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    console.log('Executing ALTER TABLE to add transaction_reference column...');
    await client.query(`
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS transaction_reference VARCHAR(255);
    `);
    console.log('Success! Column transaction_reference added.');
  } catch (err) {
    console.error('Error adding column:', err.message);
  } finally {
    await client.end();
  }
}

run();
