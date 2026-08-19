import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pg;

async function run() {
  const host = 'aws-0-ap-south-1.pooler.supabase.com';
  const projectRef = 'wgrfydrfzmjzrzgdodzs';
  const password = process.env.SUPABASE_SECRET_KEY;
  
  console.log(`Connecting to ${host} with user postgres.${projectRef} and password from env...`);
  
  const client = new Client({
    host,
    port: 6543,
    user: `postgres.${projectRef}`,
    password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
  });
  
  try {
    await client.connect();
    console.log('✅ SUCCESS! Connected successfully!');
    const res = await client.query('SELECT tablename FROM pg_tables WHERE schemaname = \'public\'');
    console.log('Tables:', res.rows.map(r => r.tablename));
    await client.end();
  } catch (err) {
    console.error('❌ Connection failed:');
    console.error('  Code:', err.code);
    console.error('  Message:', err.message);
  }
}

run();
