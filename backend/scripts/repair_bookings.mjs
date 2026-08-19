import supabase from '../src/integrations/supabase/supabase.client.mjs';

async function runBookingRepairScript() {
  console.log('--- Starting Database Repair Script for Existing Bookings ---\n');

  try {
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Failed to fetch bookings from Supabase:', error.message);
      process.exit(1);
    }

    console.log(`Found ${bookings.length} master booking records to inspect.\n`);

    let repairedCount = 0;
    let failedStatusCount = 0;

    for (const b of bookings) {
      // 1. Fetch relations
      const [travellersRes, contactsRes, flightsRes, paymentsRes] = await Promise.all([
        supabase.from('travellers').select('*').eq('booking_id', b.id),
        supabase.from('contacts').select('*').eq('booking_id', b.id),
        supabase.from('flights').select('*').eq('booking_id', b.id),
        supabase.from('payments').select('*').eq('booking_id', b.id),
      ]);

      const travellers = travellersRes.data || [];
      const contacts = contactsRes.data || [];
      const flights = flightsRes.data || [];
      const payments = paymentsRes.data || [];

      let needsUpdate = false;
      const updateFields = {};

      // 2. Repair master passenger_name from first actual traveller
      const firstPass = travellers[0];
      if (firstPass && (firstPass.first_name || firstPass.last_name)) {
        const truePassengerName = [firstPass.first_name, firstPass.middle_name, firstPass.last_name].filter(Boolean).join(' ').trim();
        if (truePassengerName && b.passenger_name !== truePassengerName) {
          updateFields.passenger_name = truePassengerName;
          needsUpdate = true;
          console.log(`[Repair Name] Booking ${b.confirmation_code}: "${b.passenger_name}" ➔ "${truePassengerName}"`);
        }
      }

      // 3. Repair incomplete or failed Whop checkout attempts
      if (!b.payment_status || b.payment_status === 'pending' || b.payment_status === 'FAILED') {
        const hasPaidPayment = payments.some(p => p.payment_status === 'paid');
        if (!hasPaidPayment && (b.internal_notes?.includes('failed') || !b.provider_checkout_id)) {
          if (b.payment_status !== 'FAILED') {
            updateFields.payment_status = 'FAILED';
            updateFields.payment_provider = 'whop';
            needsUpdate = true;
            failedStatusCount++;
            console.log(`[Repair Payment Status] Booking ${b.confirmation_code}: payment_status ➔ FAILED`);
          }
        }
      }

      // Execute database update if fields changed
      if (needsUpdate) {
        const { error: updateErr } = await supabase
          .from('bookings')
          .update(updateFields)
          .eq('id', b.id);

        if (updateErr) {
          console.error(`❌ Failed to update booking ${b.confirmation_code}:`, updateErr.message);
        } else {
          repairedCount++;
        }
      }
    }

    console.log(`\n🎉 DATABASE REPAIR COMPLETE!`);
    console.log(`- Total Records Processed: ${bookings.length}`);
    console.log(`- Records Repaired: ${repairedCount}`);
    console.log(`- Whop Attempts Marked FAILED: ${failedStatusCount}\n`);
  } catch (err) {
    console.error('❌ Repair script exception:', err);
  }
}

runBookingRepairScript();
