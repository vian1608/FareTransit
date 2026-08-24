import bookingService from './booking.service.mjs';
import bookingRepository from './booking.repository.mjs';
import addonService from '../addons/addon.service.mjs';
import { sendBaggageRequestReceivedEmail } from '../addons/addon-email.service.mjs';
import logger from '../../config/logger.mjs';

if (!bookingService.__fareTransitBaggageAncillaryHardening) {
  const coreCreate = bookingService.create.bind(bookingService);
  const coreDetails = bookingService.getDetailsByCodeOrId?.bind(bookingService);
  const coreSearch = bookingService.search?.bind(bookingService);
  const coreByEmail = bookingService.getBookingsForEmail?.bind(bookingService);

  bookingService.create = async (payload = {}) => {
    const result = await coreCreate(payload);
    const bookingId = result?.id || result?.booking?.id;
    const baggageRequests = Array.isArray(payload?.baggageRequests) ? payload.baggageRequests : (Array.isArray(payload?.baggage_requests) ? payload.baggage_requests : []);

    if (bookingId && baggageRequests.length > 0) {
      try {
        const relations = await bookingRepository.getRelations(bookingId);
        const saved = await addonService.createForBooking(bookingId, relations?.travellers || [], baggageRequests);
        void sendBaggageRequestReceivedEmail(result?.booking || result, saved).catch((error) => logger.warn(`[BaggageAddons] request email failed for ${bookingId}: ${error.message}`));
      } catch (error) {
        logger.error(`[BaggageAddons] unable to persist baggage request for ${bookingId}: ${error.message}`);
      }
    }

    try { return await addonService.attachToBooking(result); } catch { return result; }
  };

  if (coreDetails) {
    bookingService.getDetailsByCodeOrId = async (reference) => {
      const booking = await coreDetails(reference);
      if (!booking) return booking;
      try { return await addonService.attachToBooking(booking); }
      catch (error) { logger.warn(`[BaggageAddons] details enrichment failed for ${reference}: ${error.message}`); return booking; }
    };
  }

  if (coreSearch) {
    bookingService.search = async (...args) => {
      const bookings = await coreSearch(...args);
      try { return await addonService.attachToBookings(bookings); }
      catch (error) { logger.warn(`[BaggageAddons] search enrichment failed: ${error.message}`); return bookings; }
    };
  }

  if (coreByEmail) {
    bookingService.getBookingsForEmail = async (...args) => {
      const bookings = await coreByEmail(...args);
      try { return await addonService.attachToBookings(bookings); }
      catch (error) { logger.warn(`[BaggageAddons] email booking enrichment failed: ${error.message}`); return bookings; }
    };
  }

  Object.defineProperty(bookingService, '__fareTransitBaggageAncillaryHardening', { value: true, enumerable: false, writable: false, configurable: false });
}

export default bookingService;
