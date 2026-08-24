import bookingService from './booking.service.mjs';
import flexAddonService from '../addons/flex-addon.service.mjs';
import logger from '../../config/logger.mjs';

function attachFlex(booking, flexAssist) {
  if (!booking || typeof booking !== 'object') return booking;
  const baggage = booking.addonRequests || booking.addon_requests || [];
  const tripAddons = {
    version: 'TRIP_ADDONS_V1',
    currency: booking.currency || flexAssist?.currency || 'USD',
    flexAssist: flexAssist || { addonType: 'FLEX_ASSIST', selected: false, rate: 0.10, price: 0, status: 'NOT_SELECTED', termsVersion: 'FLEX_V1' },
    baggage,
  };
  return { ...booking, flexAssist: tripAddons.flexAssist, flex_assist: tripAddons.flexAssist, tripAddons, trip_addons: tripAddons };
}

if (!bookingService.__fareTransitTripAddonParityHardening) {
  const coreCreate = bookingService.create?.bind(bookingService);
  const coreDetails = bookingService.getDetailsByCodeOrId?.bind(bookingService);
  const coreSearch = bookingService.search?.bind(bookingService);
  const coreByEmail = bookingService.getBookingsForEmail?.bind(bookingService);

  if (coreCreate) {
    bookingService.create = async (...args) => {
      const result = await coreCreate(...args);
      const bookingId = result?.id || result?.booking?.id;
      if (!bookingId) return result;
      try { return attachFlex(result, await flexAddonService.getForBooking(bookingId)); }
      catch (error) { logger.warn(`[TripAddons] create Flex enrichment failed: ${error.message}`); return result; }
    };
  }

  if (coreDetails) {
    bookingService.getDetailsByCodeOrId = async (...args) => {
      const booking = await coreDetails(...args);
      if (!booking?.id) return booking;
      try { return attachFlex(booking, await flexAddonService.getForBooking(booking.id)); }
      catch (error) { logger.warn(`[TripAddons] details Flex enrichment failed: ${error.message}`); return booking; }
    };
  }

  async function enrichMany(bookings) {
    if (!Array.isArray(bookings) || !bookings.length) return bookings || [];
    try {
      const map = await flexAddonService.getForBookings(bookings.map((b) => b?.id));
      return bookings.map((booking) => attachFlex(booking, map.get(booking?.id)));
    } catch (error) {
      logger.warn(`[TripAddons] list Flex enrichment failed: ${error.message}`);
      return bookings;
    }
  }

  if (coreSearch) bookingService.search = async (...args) => enrichMany(await coreSearch(...args));
  if (coreByEmail) bookingService.getBookingsForEmail = async (...args) => enrichMany(await coreByEmail(...args));

  Object.defineProperty(bookingService, '__fareTransitTripAddonParityHardening', { value: true, enumerable: false });
}

export default bookingService;
