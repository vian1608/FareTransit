import pg from 'pg';
const { Client } = pg;

const globalRegions = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'ap-south-1', 'ap-southeast-1', 'ap-southeast-2',
  'ap-northeast-1', 'ap-northeast-2',
  'eu-central-1', 'eu-west-1', 'eu-west-2', 'eu-west-3',
  'eu-north-1', 'sa-east-1', 'ca-central-1', 'me-central-1', 'af-south-1'
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
    console.log(`Region ${region}: Connected?!`);
    await client.end();
  } catch (err) {
    if (err.message.includes('tenant/user') && err.message.includes('not found')) {
      // tenant not found on this region's pooler
    } else {
      console.log(`🎉 Region ${region}: ${err.message} (Code: ${err.code})`);
    }
  }
}

async function run() {
  console.log('Probing all global regions...');
  for (const r of globalRegions) {
    await probeRegion(r);
  }
  console.log('Done probing.');
}

run();
