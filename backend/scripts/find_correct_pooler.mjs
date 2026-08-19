import pg from 'pg';
const { Client } = pg;

const apRegions = [
  'ap-south-1', 'ap-south-2', 'ap-southeast-1', 'ap-southeast-2',
  'ap-northeast-1', 'ap-northeast-2', 'ap-northeast-3'
];

async function probeRegion(region) {
  const host = `aws-0-${region}.pooler.supabase.com`;
  const projectRef = 'wgrfydrfzmjzrzgdodzs';
  
  const client = new Client({
    host,
    port: 6543,
    user: `postgres.${projectRef}`,
    password: 'dummy_password_for_probing',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000
  });
  
  try {
    await client.connect();
    console.log(`Region ${region}: Connected (should not happen with dummy password!)`);
    await client.end();
  } catch (err) {
    console.log(`Region ${region}: ${err.message} (Code: ${err.code})`);
  }
}

async function run() {
  console.log('Probing AP regions to find where wgrfydrfzmjzrzgdodzs is hosted...');
  for (const r of apRegions) {
    await probeRegion(r);
  }
}

run();
