import { supabase } from '../src/config/supabase.mjs';

async function run() {
  console.log('Fetching system schema info...');
  
  // Try querying a view or system table if exposed
  const { data, error } = await supabase
    .from('information_schema.tables')
    .select('*')
    .limit(5);
    
  console.log('information_schema.tables:', { data, error });
}

run();
