import assert from 'assert';
import jwt from 'jsonwebtoken';
import env from '../src/config/env.mjs';

async function testApiPersistence() {
  console.log('=== VERIFYING PRODUCTION API TICKET DETAILS PERSISTENCE & FIELD-LEVEL EDITING ===\n');

  // Generate Admin JWT token
  const token = jwt.sign(
    { id: 'admin-1', email: 'admin@faretransit.com', role: 'admin' },
    env.jwtSecret,
    { expiresIn: '1h' }
  );

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  };

  // 1. Fetch bookings list via API
  console.log('1. Fetching bookings list via GET /api/admin/bookings...');
  const getRes = await fetch('http://localhost:5001/api/admin/bookings', { headers });
  const getData = await getRes.json();
  assert.strictEqual(getRes.status, 200, 'GET /api/admin/bookings should return HTTP 200');
  
  const bookingsList = getData.data || getData.bookings || [];
  assert.ok(bookingsList.length > 0, 'At least one booking should exist for persistence testing');
  
  const targetBooking = bookingsList[0];
  const bookingId = targetBooking.id;
  console.log(`  ✔ Selected target booking: ${bookingId} (${targetBooking.confirmationCode || targetBooking.confirmation_code})\n`);

  // 2. Test Invalid PNR rejection via HTTP API
  console.log('2. Testing HTTP PUT invalid PNR rejection (873827372832728)...');
  const invPnrRes = await fetch(`http://localhost:5001/api/admin/bookings/${bookingId}/ticket-details`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      airlineConfirmationNumber: '873827372832728'
    })
  });
  const invPnrData = await invPnrRes.json();
  assert.strictEqual(invPnrRes.status, 400, 'Invalid PNR should return HTTP 400');
  assert.strictEqual(invPnrData.success, false);
  assert.ok(invPnrData.error?.message?.includes('exactly 6 letters or numbers'), 'Error message must state 6 letters or numbers requirement');
  console.log(`  ✔ API correctly rejected invalid PNR 873827372832728 with message: "${invPnrData.error.message}"\n`);

  // 3. Test Invalid Ticket Number rejection via HTTP API
  console.log('3. Testing HTTP PUT invalid Ticket Number rejection (125A241098)...');
  const invTktRes = await fetch(`http://localhost:5001/api/admin/bookings/${bookingId}/ticket-details`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      ticketNumber: '125A241098'
    })
  });
  const invTktData = await invTktRes.json();
  assert.strictEqual(invTktRes.status, 400, 'Invalid ticket number should return HTTP 400');
  assert.strictEqual(invTktData.success, false);
  assert.ok(invTktData.error?.message?.includes('digits only and cannot exceed 13 digits'));
  console.log(`  ✔ API correctly rejected invalid ticket number 125A241098\n`);

  // 4. Save Valid Ticket Details via HTTP PUT API
  console.log('4. Saving valid ticket details (United Airlines, UA, AB12CD, 0162490182741)...');
  const saveRes = await fetch(`http://localhost:5001/api/admin/bookings/${bookingId}/ticket-details`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      airlineName: 'United Airlines',
      airlineCode: 'UA',
      airlineLogoUrl: '/airlines/ua.png',
      airlineConfirmationNumber: 'ab12cd', // test lowercase conversion
      ticketNumber: '0162490182741',
      ticketIssuedAt: '2026-07-29'
    })
  });

  const saveData = await saveRes.json();
  assert.strictEqual(saveRes.status, 200, 'Save ticket details should return HTTP 200');
  assert.strictEqual(saveData.success, true);
  
  const savedBooking = saveData.booking || saveData.data;
  assert.strictEqual(savedBooking.airline_name || savedBooking.airlineName, 'United Airlines');
  assert.strictEqual(savedBooking.airline_code || savedBooking.airlineCode, 'UA');
  assert.strictEqual(savedBooking.airline_logo_url || savedBooking.airlineLogoUrl, '/airlines/ua.png');
  assert.strictEqual(savedBooking.airline_confirmation_number || savedBooking.airlineConfirmationNumber, 'AB12CD');
  assert.strictEqual(savedBooking.ticket_number || savedBooking.ticketNumber, '0162490182741');
  console.log('  ✔ Saved successfully. API returned updated booking object.\n');

  // 5. Verify Persistence After Refresh (Fresh GET Request)
  console.log('5. Simulating browser refresh by fetching bookings afresh from server API...');
  const refreshRes = await fetch('http://localhost:5001/api/admin/bookings', { headers });
  const refreshData = await refreshRes.json();
  assert.strictEqual(refreshRes.status, 200);

  const refreshedList = refreshData.data || refreshData.bookings || [];
  const refreshedBooking = refreshedList.find(b => b.id === bookingId);
  assert.ok(refreshedBooking, 'Target booking must exist after refresh');

  assert.strictEqual(refreshedBooking.airline_name || refreshedBooking.airlineName, 'United Airlines');
  assert.strictEqual(refreshedBooking.airline_code || refreshedBooking.airlineCode, 'UA');
  assert.strictEqual(refreshedBooking.airline_confirmation_number || refreshedBooking.airlineConfirmationNumber || refreshedBooking.airline_pnr || refreshedBooking.pnr, 'AB12CD');
  assert.strictEqual(refreshedBooking.ticket_number || refreshedBooking.ticketNumber, '0162490182741');
  console.log('  ✔ Initial save persisted across refresh.\n');

  // 6. Test Single-Field Edit: Edit ONLY the PNR to ZX98YU
  console.log('6. Editing ONLY PNR field to ZX98YU via HTTP PUT API...');
  const editPnrRes = await fetch(`http://localhost:5001/api/admin/bookings/${bookingId}/ticket-details`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      airlineConfirmationNumber: 'ZX98YU'
    })
  });
  const editPnrData = await editPnrRes.json();
  assert.strictEqual(editPnrRes.status, 200, 'Single field update should return HTTP 200');
  assert.strictEqual(editPnrData.success, true);
  console.log('  ✔ Single-field edit of PNR to ZX98YU succeeded.\n');

  // 7. Verify Persistence After Single-Field Edit
  console.log('7. Simulating full browser refresh after single-field edit...');
  const refresh2Res = await fetch('http://localhost:5001/api/admin/bookings', { headers });
  const refresh2Data = await refresh2Res.json();
  assert.strictEqual(refresh2Res.status, 200);

  const list2 = refresh2Data.data || refresh2Data.bookings || [];
  const booking2 = list2.find(b => b.id === bookingId);
  assert.ok(booking2);

  assert.strictEqual(booking2.airline_confirmation_number || booking2.airlineConfirmationNumber || booking2.airline_pnr, 'ZX98YU', 'PNR must be updated to ZX98YU');
  assert.strictEqual(booking2.airline_name || booking2.airlineName, 'United Airlines', 'Airline Name must remain United Airlines');
  assert.strictEqual(booking2.ticket_number || booking2.ticketNumber, '0162490182741', 'Ticket Number must remain 0162490182741');

  console.log('  ✔ SINGLE-FIELD PERSISTENCE VERIFIED! Updated PNR ("ZX98YU") persisted after refresh while Airline ("United Airlines") and Ticket Number ("0162490182741") remained unchanged.\n');
  console.log('🎉 ALL PERSISTENCE AND API INTEGRATION TESTS PASSED CLEANLY!\n');
}

testApiPersistence().catch(err => {
  console.error('❌ API Persistence Test Failed:', err);
  process.exit(1);
});
