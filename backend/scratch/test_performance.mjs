import bookingRepository from '../src/modules/bookings/booking.repository.mjs';

async function testPerformance() {
  console.time('findAllBookings');
  const bookings = await bookingRepository.findAllBookings({});
  console.timeEnd('findAllBookings');
  console.log('Bookings fetched:', bookings.length);
  if (bookings.length > 0) {
    console.log('Sample enriched booking keys:', Object.keys(bookings[0]));
    console.log('Sample booking travellers count:', bookings[0].travellers?.length);
    console.log('Sample booking flights count:', bookings[0].flights?.length);
  }
}

testPerformance().catch(console.error);
