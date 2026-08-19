import { supabase } from '../src/config/supabase.mjs';

const possibleTables = [
  'bookings',
  'travellers',
  'contacts',
  'flights',
  'payments',
  'abandoned_bookings',
  'payment_authorization_splits',
  'booking_payment_splits',
  'booking_payment_methods',
  'email_deliveries',
  'passenger_authorizations',
  'payment_authorizations',
  'authorizations',
  'payment_splits',
  'audit_logs',
  'booking_audit_logs',
  'checkout_snapshots',
  'ticket_snapshots'
];

async function run() {
  console.log('Probing database tables...');
  
  for (const table of possibleTables) {
    const { error } = await supabase.from(table).select('id').limit(1);
    if (error && error.code === 'PGRST205') {
      console.log(`❌ Table '${table}' does NOT exist.`);
    } else if (error) {
      console.log(`⚠️ Table '${table}' returned error: ${error.code} - ${error.message}`);
    } else {
      console.log(`✅ Table '${table}' exists!`);
    }
  }
}

run();
