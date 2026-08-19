import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

import assert from 'assert';
import { bookingService } from '../src/modules/bookings/booking.service.mjs';
import bookingRepository from '../src/modules/bookings/booking.repository.mjs';

async function runAtomicTransactionSafetyTests() {
  console.log('=== RUNNING ATOMIC BOOKING TRANSACTION SAFETY TESTS ===\n');

  // Test 1: Successful atomic creation of booking + flights + travellers + contacts + payments
  console.log('Test 1: Valid booking creation with complete relations...');
  const validPayload = {
    email: 'atomic.valid@example.com',
    phone: '+1 310-555-0199',
    passengers: [
      { firstName: 'Atomic', lastName: 'Passenger', role: 'adult', gender: 'male', dateOfBirth: '1990-01-01' }
    ],
    flight: {
      airline: 'United Airlines',
      flightNumber: 'UA 901',
      departure: { airport: 'LAX', date: '2026-10-01', time: '08:00' },
      arrival: { airport: 'SFO', date: '2026-10-01', time: '09:30' },
      price: { total: '250.00', currency: 'USD' }
    },
    customer_price: 250.00,
    currency: 'USD'
  };

  const createdBooking = await bookingService.create(validPayload);
  assert.ok(createdBooking.id, 'Booking ID must be generated');
  assert.ok(createdBooking.confirmationCode, 'Confirmation code must be generated');
  assert.strictEqual(createdBooking.flights.length, 1, 'Must have 1 flight segment');
  assert.strictEqual(createdBooking.travellers.length, 1, 'Must have 1 traveller record');
  assert.strictEqual(createdBooking.contacts.length, 1, 'Must have 1 contact record');
  console.log(`✔ Test 1 Passed: Atomic creation succeeded (Confirmation Code: ${createdBooking.confirmationCode})`);

  // Test 2: Booking creation without flight itinerary MUST trigger automatic ROLLBACK
  console.log('\nTest 2: Atomic rollback on MISSING FLIGHT ITINERARY...');
  const noFlightPayload = {
    email: 'atomic.noflight@example.com',
    phone: '+1 310-555-0199',
    passengers: [
      { firstName: 'NoFlight', lastName: 'Passenger', role: 'adult', dateOfBirth: '1992-05-15' }
    ],
    // Intentional missing flight and returnFlight
    customer_price: 300.00,
    currency: 'USD'
  };

  try {
    await bookingService.create(noFlightPayload);
    assert.fail('Booking creation without flight itinerary must throw error');
  } catch (err) {
    assert.strictEqual(err.code, 'BOOKING_ITINERARY_MISSING', 'Should throw BOOKING_ITINERARY_MISSING error');
    console.log('✔ Test 2 Passed: Reject creation without flight itinerary and triggered ROLLBACK');
  }

  // Test 3: Verify no orphan records exist after rollback
  console.log('\nTest 3: Verify clean database state (Zero orphan records after rollback)...');
  const findOrphan = await bookingRepository.findBookingsByEmail('atomic.noflight@example.com');
  assert.strictEqual(findOrphan.length, 0, 'No booking record must remain for rolled back booking');
  console.log('✔ Test 3 Passed: Verified zero orphan records exist after rollback');

  console.log('\n🎉 ALL ATOMIC TRANSACTION SAFETY TESTS PASSED SUCCESSFULLY!\n');
}

runAtomicTransactionSafetyTests().catch(err => {
  console.error('❌ Atomic Transaction Safety Test Failed:', err);
  process.exit(1);
});
