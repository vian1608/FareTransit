import supabase from '../src/integrations/supabase/supabase.client.mjs';
import env from '../src/config/env.mjs';

async function inspectDb() {
  console.log('========================================================================');
  console.log('  PRODUCTION SUPABASE READ-ONLY INSPECTION');
  console.log('========================================================================\n');

  console.log('SUPABASE URL Hostname:', env.supabaseUrl ? new URL(env.supabaseUrl).hostname : 'NOT SET');
  console.log('SUPABASE SECRET KEY Present:', Boolean(env.supabaseSecretKey));
  console.log('');

  const tables = [
    'bookings',
    'passengers',
    'travellers',
    'contacts',
    'flights',
    'itinerary_segments',
    'payments',
    'payment_authorization_splits',
    'passenger_authorizations',
    'email_delivery_activity'
  ];

  for (const table of tables) {
    try {
      const { count, error, data } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (error) {
        console.log(`Table [${table}]: ERROR → ${error.message} (${error.code})`);
      } else {
        console.log(`Table [${table}]: Count = ${count}`);
      }
    } catch (err) {
      console.log(`Table [${table}]: EXCEPTION → ${err.message}`);
    }
  }

  console.log('\n--- FETCHING BOOKINGS ROWS SAMPLE ---');
  try {
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('id, confirmation_code, status, passenger_name, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Failed to query bookings table:', error.message);
    } else if (!bookings || bookings.length === 0) {
      console.log('⚠️  bookings table returned 0 rows!');
    } else {
      console.log(`Found ${bookings.length} booking row(s):`);
      bookings.forEach((b, i) => {
        console.log(` [${i+1}] ID: ${b.id} | Code: ${b.confirmation_code} | Name: ${b.passenger_name} | Status: ${b.status} | Created: ${b.created_at}`);
      });
      console.log('Oldest timestamp:', bookings[bookings.length - 1].created_at);
      console.log('Newest timestamp:', bookings[0].created_at);
    }
  } catch (err) {
    console.error('Error fetching bookings sample:', err.message);
  }
}

inspectDb().catch(console.error);
