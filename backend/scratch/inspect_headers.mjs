import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;

async function run() {
  console.log('Fetching response headers from:', supabaseUrl);
  try {
    const res = await fetch(supabaseUrl);
    console.log('Status:', res.status);
    console.log('Headers:');
    for (const [key, val] of res.headers.entries()) {
      console.log(`  ${key}: ${val}`);
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

run();
