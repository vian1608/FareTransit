import pg from 'pg';
const { Client } = pg;

async function testPasswordError() {
  const host = 'aws-0-ap-south-1.pooler.supabase.com';
  const projectRef = 'wgrfydrfzmjzrzgdodzs';
  const password = 'definitely_wrong_password_12345';
  
  const client = new Client({
    host,
    port: 6543,
    user: `postgres.${projectRef}`,
    password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000
  });
  
  try {
    await client.connect();
    console.log('Successfully connected with wrong password?!');
    await client.end();
  } catch (err) {
    console.log('Error Code:', err.code);
    console.log('Error Message:', err.message);
  }
}

testPasswordError();
