import bookingService from './booking.service.mjs';
import { searchCurrentBookings } from './booking-current-search.controller.mjs';

if (!bookingService.__currentBookingSearchInstalled) {
  bookingService.search = async query => searchCurrentBookings(query);
  Object.defineProperty(bookingService, '__currentBookingSearchInstalled', {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });
}

export default bookingService;
