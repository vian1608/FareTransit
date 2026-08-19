import dns from 'dns';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pg;

const regions = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'ap-south-1', 'ap-south-2', 'ap-southeast-1', 'ap-southeast-2',
  'ap-northeast-1', 'ap-northeast-2', 'ap-northeast-3',
  'eu-central-1', 'eu-central-2', 'eu-west-1', 'eu-west-2', 'eu-west-3',
  'eu-north-1', 'sa-east-1', 'ca-central-1', 'me-central-1', 'af-south-1'
];

const projectRef = 'wgrfydrfzmjzrzgdodzs';
const secretKey = process.env.SUPABASE_SECRET_KEY;

function checkDns(region) {
  return new Promise((resolve) => {
    const host = `aws-0-${region}.pooler.supabase.com`;
    dns.lookup(host, (err, address) => {
      if (err) {
        resolve(null);
      } else {
        resolve({ region, host, address });
      }
    });
  });
}

async function tryConnect(host, region) {
  const client = new Client({
    host,
    port: 6543,
    user: `postgres.${projectRef}`,
    password: secretKey,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000
  });
  
  try {
    await client.connect();
    console.log(`\n🎉 SUCCESS! Connected to Supabase Database in region: ${region}`);
    const res = await client.query('SELECT tablename FROM pg_tables WHERE schemaname = \'public\'');
    console.log('Tables:', res.rows.map(r => r.tablename));
    await client.end();
    return true;
  } catch (err) {
    if (err.message.includes('tenant/user') && err.message.includes('not found')) {
      // This means the pooler exists but our project is not in this region
      return false;
    }
    console.log(`Connection error in region ${region}: ${err.message}`);
    return false;
  }
}

async function run() {
  console.log('Probing Supabase regions...');
  const dnsResults = await Promise.all(regions.map(checkDns));
  const activeRegions = dnsResults.filter(Boolean);
  
  console.log(`Found ${activeRegions.length} active pooler hosts. Connecting...`);
  
  for (const act of activeRegions) {
    process.stdout.write(`Trying ${act.region}... `);
    const success = await tryConnect(act.host, act.region);
    if (success) {
      break;
    }
  }
  console.log('\nDone probing.');
}

run();
