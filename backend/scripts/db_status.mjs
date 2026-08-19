import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pg;

const projectRef = process.env.SUPABASE_URL?.replace('https://', '').replace('.supabase.co', '');
const connectionString = `postgresql://postgres.${projectRef}:${process.env.SUPABASE_SECRET_KEY}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;

async function run() {
  console.log('Connecting to:', connectionString);
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    console.log('Connected!');
    
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    
    console.log('Tables in public schema:');
    res.rows.forEach(row => {
      console.log(`- ${row.table_name}`);
    });
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

run();
