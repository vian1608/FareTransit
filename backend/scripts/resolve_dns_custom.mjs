import dns from 'dns';

async function run() {
  const resolver = new dns.Resolver();
  resolver.setServers(['8.8.8.8', '1.1.1.1']);
  
  const host = 'db.wgrfydrfzmjzrzgdodzs.supabase.co';
  console.log(`Resolving DNS for ${host} using 8.8.8.8/1.1.1.1...`);
  
  resolver.resolve4(host, (err, addresses) => {
    if (err) {
      console.error('DNS lookup failed:', err.message);
    } else {
      console.log('Addresses:', addresses);
    }
  });
}

run();
