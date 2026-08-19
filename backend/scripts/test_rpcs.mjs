import { supabase } from '../src/config/supabase.mjs';

async function testRpc(name) {
  const sql = `SELECT 1`;
  try {
    const { data, error } = await supabase.rpc(name, { sql });
    console.log(`RPC ${name}({sql}) result:`, { data, error });
  } catch (err) {
    console.log(`RPC ${name}({sql}) exception:`, err.message);
  }
  
  try {
    const { data, error } = await supabase.rpc(name, { query: sql });
    console.log(`RPC ${name}({query}) result:`, { data, error });
  } catch (err) {
    console.log(`RPC ${name}({query}) exception:`, err.message);
  }
}

async function run() {
  await testRpc('run_sql');
  await testRpc('execute_sql');
  await testRpc('exec_sql');
  await testRpc('query');
}

run();
