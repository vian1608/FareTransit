async function run() {
  const ip = '2406:da12:5ca:b701:2dc6:b6b3:af94:df23';
  console.log(`Querying ARIN RDAP API for IP: ${ip}...`);
  
  try {
    const res = await fetch(`https://rdap.arin.net/registry/ip/${ip}`);
    if (res.ok) {
      const data = await res.json();
      console.log('ARIN RDAP Data name:', data.name);
      console.log('Entities:', data.entities?.map(e => e.handle));
      console.log('Remarks:', data.remarks);
    } else {
      console.log('ARIN status:', res.status);
    }
  } catch (err) {
    console.error('ARIN error:', err.message);
  }

  try {
    const res = await fetch(`https://rdap.apnic.net/ip/${ip}`);
    if (res.ok) {
      const data = await res.json();
      console.log('APNIC RDAP Data name:', data.name);
      console.log('Entity details:', JSON.stringify(data.entities, null, 2));
    } else {
      console.log('APNIC status:', res.status);
    }
  } catch (err) {
    console.error('APNIC error:', err.message);
  }
}

run();
