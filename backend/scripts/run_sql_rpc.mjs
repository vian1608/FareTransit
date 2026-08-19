import { supabase } from '../src/config/supabase.mjs';

async function run() {
  console.log('Testing RPC exec...');
  
  // Try querying table names via exec RPC
  const sql = `
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
  `;
  
  try {
    const { data, error } = await supabase.rpc('exec', { sql_query: sql });
    console.log('Result with sql_query:', { data, error });
  } catch (err) {
    console.error('Error with sql_query:', err.message);
  }
  
  try {
    const { data, error } = await supabase.rpc('exec', { sql });
    console.log('Result with sql:', { data, error });
  } catch (err) {
    console.error('Error with sql:', err.message);
  }
}

run();
