import dns from 'node:dns/promises';

async function run() {
  try {
    const host = 'wgrfydrfzmjzrzgdodzs.supabase.co';
    const ips = await dns.resolve4(host);
    console.log(`${host} IPv4 addresses:`, ips);

    const cnames = await dns.resolveCname(host).catch(() => []);
    console.log(`${host} CNAMEs:`, cnames);

    const txt = await dns.resolveTxt(host).catch(() => []);
    console.log(`${host} TXT:`, txt);
  } catch (err) {
    console.error('DNS error:', err.message);
  }
}

run();
