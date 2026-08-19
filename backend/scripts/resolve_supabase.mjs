import dns from 'dns';

async function run() {
  console.log('Resolving DNS for wgrfydrfzmjzrzgdodzs.supabase.co...');
  dns.resolveAny('wgrfydrfzmjzrzgdodzs.supabase.co', (err, addresses) => {
    if (err) console.error(err);
    else console.log('Addresses:', addresses);
  });
  
  try {
    const res = await fetch('https://wgrfydrfzmjzrzgdodzs.supabase.co');
    console.log('Status:', res.status);
    console.log('Headers:');
    for (const [key, value] of res.headers.entries()) {
      console.log(`  ${key}: ${value}`);
    }
  } catch (err) {
    console.error('Fetch error:', err.message);
  }
}

run();
