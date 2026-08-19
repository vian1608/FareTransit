import { adminService } from '../src/modules/admin/admin.service.mjs';

async function testAdminBookings() {
  console.log('--- TESTING adminService.getAllBookings({}) ---');
  try {
    const bookings = await adminService.getAllBookings({});
    console.log('Result count:', bookings.length);
    if (bookings.length > 0) {
      console.log('First booking sample:', JSON.stringify(bookings[0], null, 2));
    }
  } catch (err) {
    console.error('adminService.getAllBookings FAILED:', err);
  }
}

testAdminBookings();
