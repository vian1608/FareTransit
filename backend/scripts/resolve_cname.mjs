import dns from 'dns';

async function run() {
  const host = 'db.wgrfydrfzmjzrzgdodzs.supabase.co';
  console.log(`Resolving CNAME for ${host}...`);
  
  dns.resolveCname(host, (err, addresses) => {
    if (err) {
      console.error('CNAME lookup failed:', err.message);
    } else {
      console.log('CNAME Addresses:', addresses);
    }
  });
  
  dns.resolveTxt(host, (err, addresses) => {
    if (err) {
      console.error('TXT lookup failed:', err.message);
    } else {
      console.log('TXT records:', addresses);
    }
  });
  
  dns.resolveAny(host, (err, addresses) => {
    if (err) {
      console.error('ANY lookup failed:', err.message);
    } else {
      console.log('ANY records:', addresses);
    }
  });
}

run();
