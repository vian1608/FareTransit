import dotenv from 'dotenv';
dotenv.config();

async function getTables() {
  const url = `${process.env.SUPABASE_URL}/rest/v1/?apikey=${process.env.SUPABASE_SECRET_KEY}`;
  const res = await fetch(url);
  const json = await res.json();
  const tables = Object.keys(json.definitions || {});
  console.log('Public tables in schema cache:', tables);
}

getTables().catch(err => console.error(err));
