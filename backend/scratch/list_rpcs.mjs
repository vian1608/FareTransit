import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_SECRET_KEY; // or publishable key

async function run() {
  const url = `${supabaseUrl}/rest/v1/?apikey=${anonKey}`;
  console.log('Fetching OpenAPI schema from:', url.replace(anonKey, '***'));
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`REST error: ${res.status} ${res.statusText}`);
    }
    const schema = await res.json();
    const paths = Object.keys(schema.paths || {});
    const rpcs = paths.filter(p => p.startsWith('/rpc/'));
    console.log('Available RPCs:', rpcs);
  } catch (err) {
    console.error('Error fetching REST schema:', err.message);
  }
}

run();
