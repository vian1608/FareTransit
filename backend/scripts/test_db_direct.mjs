import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pg;

async function tryConnect(host, port, user, password) {
  const client = new Client({
    host,
    port,
    user,
    password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    console.log(`Trying ${host}:${port} with user ${user}...`);
    await client.connect();
    console.log(`✅ Success on ${host}:${port}!`);
    const res = await client.query('SELECT tablename FROM pg_tables WHERE schemaname = \'public\'');
    console.log('Tables:', res.rows.map(r => r.tablename));
    await client.end();
    return true;
  } catch (err) {
    console.log(`❌ Failed on ${host}:${port} - ${err.message}`);
    return false;
  }
}

async function run() {
  const projectRef = 'wgrfydrfzmjzrzgdodzs';
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  
  // Try direct host
  await tryConnect(`db.${projectRef}.supabase.co`, 5432, 'postgres', secretKey);
  await tryConnect(`db.${projectRef}.supabase.co`, 6543, 'postgres', secretKey);
  
  // Try pooler host with user postgres
  await tryConnect('aws-0-us-east-1.pooler.supabase.com', 6543, 'postgres', secretKey);
  await tryConnect('aws-0-us-east-1.pooler.supabase.com', 6543, `postgres.${projectRef}`, secretKey);
}

run();
