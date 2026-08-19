import assert from 'assert';
import bookingRepository from '../src/modules/bookings/booking.repository.mjs';
import { sendFinalTicketEmail } from '../src/integrations/resend/resend.service.mjs';
import { searchAirlines } from '../src/shared/utils/airline-lookup.mjs';

async function runTicketDetailsValidationTests() {
  console.log('=== RUNNING COMPREHENSIVE AIRLINE TICKET DETAILS & PNR VALIDATION TESTS ===\n');

  // Test 1: Setup test booking
  console.log('Test 1: Creating test booking record...');
  const testBooking = await bookingRepository.createBookingRecord({
    confirmation_code: `TFS-TKT-${Date.now().toString().slice(-6)}`,
    status: 'READY_FOR_TICKETING',
    payment_status: 'PAID',
    total_amount: 1540.00,
    customer_price: 1540.00,
    currency: 'USD',
    passenger_name: 'Sophia Martinez',
    email: 'delivered@resend.dev'
  });

  const bookingId = testBooking.id;

  // Insert itinerary segment
  await bookingRepository.saveItinerarySegments(bookingId, [
    {
      journey_direction: 'outbound',
      segment_sequence: 1,
      marketing_carrier_code: 'UA',
      airline_name: 'United Airlines',
      flight_number: 'UA 881',
      origin_airport: 'ORD',
      destination_airport: 'LHR',
      departure_date: '2026-11-01',
      departure_time: '06:00 PM'
    }
  ]);
  console.log(`  ✔ Created booking ${bookingId}\n`);

  // Test 2: Reject invalid PNR formats (5 chars, 7 chars, long numeric)
  console.log('Test 2: Verifying rejection of invalid PNR formats...');
  await assert.rejects(
    async () => {
      await bookingRepository.saveTicketDetails(bookingId, { airlineConfirmationNumber: 'ABC12' });
    },
    (err) => err.message.includes('exactly 6 letters or numbers')
  );

  await assert.rejects(
    async () => {
      await bookingRepository.saveTicketDetails(bookingId, { airlineConfirmationNumber: 'AB12CDE' });
    },
    (err) => err.message.includes('exactly 6 letters or numbers')
  );

  await assert.rejects(
    async () => {
      await bookingRepository.saveTicketDetails(bookingId, { airlineConfirmationNumber: '873827372832728' });
    },
    (err) => err.message.includes('exactly 6 letters or numbers')
  );
  console.log('  ✔ Invalid PNR formats (5, 7, and long numeric digits) correctly rejected\n');

  // Test 3: Convert lowercase PNR to uppercase automatically
  console.log('Test 3: Testing automatic lowercase PNR conversion (ab12cd -> AB12CD)...');
  const lowerPnrBooking = await bookingRepository.saveTicketDetails(bookingId, {
    airlineConfirmationNumber: 'ab12cd'
  });
  assert.strictEqual(lowerPnrBooking.airline_confirmation_number, 'AB12CD');
  console.log('  ✔ Lowercase PNR automatically converted to uppercase AB12CD\n');

  // Test 4: Reject invalid ticket number (letters, symbols, > 13 digits)
  console.log('Test 4: Verifying rejection of invalid ticket numbers...');
  await assert.rejects(
    async () => {
      await bookingRepository.saveTicketDetails(bookingId, { ticketNumber: '125A241098' });
    },
    (err) => err.message.includes('digits only and cannot exceed 13 digits')
  );

  await assert.rejects(
    async () => {
      await bookingRepository.saveTicketDetails(bookingId, { ticketNumber: '12345678901234' });
    },
    (err) => err.message.includes('digits only and cannot exceed 13 digits')
  );
  console.log('  ✔ Invalid ticket numbers containing letters or exceeding 13 digits correctly rejected\n');

  // Test 5: Save valid 13-digit ticket number with leading zero and full airline details
  console.log('Test 5: Saving valid PNR AB12CD and 13-digit ticket number (0162490182741)...');
  const savedBooking = await bookingRepository.saveTicketDetails(bookingId, {
    airlineCode: 'UA',
    airlineName: 'United Airlines',
    airlineLogoUrl: '/airlines/ua.png',
    airlineConfirmationNumber: 'AB12CD',
    ticketNumber: '0162490182741',
    ticketIssuedAt: '2026-07-29',
    supplierConfirmation: 'SUP-998822',
    ticketNotes: 'Issued cleanly'
  });

  assert.strictEqual(savedBooking.airline_confirmation_number, 'AB12CD');
  assert.strictEqual(savedBooking.airline_name, 'United Airlines');
  assert.strictEqual(savedBooking.airline_code, 'UA');
  assert.strictEqual(savedBooking.ticket_number, '0162490182741');
  assert.strictEqual(savedBooking.supplier_confirmation, 'SUP-998822');
  console.log('  ✔ Valid PNR AB12CD and ticket number 0162490182741 saved successfully\n');

  // Test 6: Verify Persistence by re-fetching complete booking from repository
  console.log('Test 6: Verifying database persistence across re-fetch...');
  const refetched = await bookingRepository.getCompleteBookingById(bookingId);
  assert.strictEqual(refetched.airline_confirmation_number || refetched.airlineConfirmationNumber, 'AB12CD');
  assert.strictEqual(refetched.airline_name || refetched.airlineName, 'United Airlines');
  assert.strictEqual(refetched.ticket_number || refetched.ticketNumber, '0162490182741');
  console.log('  ✔ Details cleanly persisted and verified upon re-fetch\n');

  // Test 7: Test searchable airline combobox lookup (United, UA, unire)
  console.log('Test 7: Testing searchable airline dropdown queries ("United", "UA", "unire")...');
  const matchUnited = searchAirlines('United');
  assert.ok(matchUnited.some(a => a.name === 'United Airlines' && a.iataCode === 'UA'));

  const matchUA = searchAirlines('UA');
  assert.ok(matchUA.some(a => a.name === 'United Airlines' && a.iataCode === 'UA'));

  const matchUnire = searchAirlines('unire');
  assert.ok(matchUnire.some(a => a.name === 'United Airlines' && a.iataCode === 'UA'));
  console.log('  ✔ Searches for "United", "UA", and "unire" all successfully matched United Airlines\n');

  // Test 8: Dispatch Final Ticket Email after valid save
  console.log('Test 8: Dispatching Final Ticket Email...');
  const emailRes = await sendFinalTicketEmail(bookingId);
  assert.strictEqual(emailRes.success, true);
  console.log('  ✔ Final E-Ticket email dispatched cleanly\n');

  console.log('🎉 ALL TICKET DETAILS & PNR VALIDATION TESTS PASSED SUCCESSFULLY!\n');
}

runTicketDetailsValidationTests().catch(err => {
  console.error('❌ Ticket Details Validation Test Failed:', err);
  process.exit(1);
});
