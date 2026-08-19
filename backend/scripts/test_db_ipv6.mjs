import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pg;

async function run() {
  const host = '2406:da12:5ca:b701:2dc6:b6b3:af94:df23';
  const password = process.env.SUPABASE_SECRET_KEY;
  
  console.log(`Connecting to Postgres direct IPv6 host ${host} with user postgres...`);
  
  const client = new Client({
    host,
    port: 5432,
    user: 'postgres',
    password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
  });
  
  try {
    await client.connect();
    console.log('✅ Connection successful!');
    const res = await client.query('SELECT tablename FROM pg_tables WHERE schemaname = \'public\'');
    console.log('Tables:', res.rows.map(r => r.tablename));
    await client.end();
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
  }
}

run();
