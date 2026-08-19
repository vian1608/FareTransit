import dotenv from 'dotenv';
dotenv.config();

import supabase from '../src/integrations/supabase/supabase.client.mjs';

async function testInquiriesTable() {
  console.log('Testing Supabase inquiries table...');
  const { data, error } = await supabase.from('inquiries').select('*').limit(1);
  if (error) {
    console.log('Inquiries table error:', error.message);
  } else {
    console.log('✅ Inquiries table exists! Rows count sample:', data.length);
  }
}

testInquiriesTable();
