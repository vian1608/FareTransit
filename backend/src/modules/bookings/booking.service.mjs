import bookingRepository from './booking.repository.mjs';
import bookingMapper from './booking.mapper.mjs';
import { travellerService } from '../travellers/traveller.service.mjs';
import { sendBookingConfirmation } from '../../integrations/resend/resend.service.mjs';
import { itineraryMapper } from '../itineraries/itinerary.mapper.mjs';
import logger from '../../config/logger.mjs';

function generateConfirmationCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let randomPart = '';
  for (let i = 0; i < 6; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const year = new Date().getFullYear();
  return `TFS-${year}-${randomPart}`;
}

export const bookingService = {
  create: async (payload) => {
    // 1 — Run traveler validations
    const passengerList = Array.isArray(payload.passengers) 
      ? payload.passengers 
      : JSON.parse(payload.passengers || '[]');
      
    travellerService.validateTravellers(passengerList);

    // 2 — Generate confirmation code
    const confirmationCode = generateConfirmationCode();

    // 3 — Insert master record
    const insertRow = bookingMapper.toDatabaseInsert(confirmationCode, payload);
    const booking = await bookingRepository.createBookingRecord(insertRow);

    // 4 — Save travellers list
    let travellers = [];
    if (passengerList.length > 0) {
      travellers = await bookingRepository.insertTravellers(
        passengerList.map(p => ({
          booking_id: booking.id,
          role: (p.role || 'adult').toLowerCase(),
          title: p.title || null,
          first_name: p.firstName || '',
          middle_name: p.middleName || null,
          last_name: p.lastName || '',
          date_of_birth: p.dateOfBirth || null,
          gender: p.gender || null,
          nationality: p.nationality || null,
          passport_number: p.passportNumber || null,
          passport_expiry: p.passportExpiry || null,
        }))
      );
    }

    // 5 — Save primary contact
    const contactRow = {
      booking_id: booking.id,
      email: payload.email,
      country_code: payload.phone?.startsWith('+') ? payload.phone.split(' ')[0] : null,
      phone_number: payload.phone
    };
    const contacts = await bookingRepository.insertContact(contactRow);

    // 6 — Save flight itineraries
    const flightsList = [];
    const tripType = payload.returnFlight ? 'round-trip' : 'one-way';
    
    if (payload.flight) {
      const outboundRows = itineraryMapper.toDatabaseRows(booking.id, payload.flight, 'outbound', tripType);
      flightsList.push(...outboundRows);
    }
    if (payload.returnFlight) {
      const returnRows = itineraryMapper.toDatabaseRows(booking.id, payload.returnFlight, 'return', tripType);
      flightsList.push(...returnRows);
    }
    
    let flights = [];
    if (flightsList.length > 0) {
      flights = await bookingRepository.insertFlights(flightsList);
    }

    // 7 — Save stripe payment record
    const paymentRow = {
      booking_id: booking.id,
      payment_provider: 'stripe',
      stripe_session_id: payload.transactionId || null,
      payment_amount: parseFloat(payload.displayedWebsitePrice) || 0,
      currency: payload.currency || 'USD',
      payment_status: payload.paymentStatus || 'paid',
      payment_date: new Date().toISOString()
    };
    const payments = await bookingRepository.insertPayment(paymentRow);

    const canonicalBooking = bookingMapper.toCanonicalModel(
      booking,
      travellers,
      contacts,
      flights,
      payments
    );

    // Send confirmation email asynchronously
    sendBookingConfirmation(canonicalBooking).catch(err => {
      logger.error('Failed to send booking confirmation email:', err.message);
    });

    return canonicalBooking;
  },

  getDetailsByCodeOrId: async (reference) => {
    // Attempt code fetch
    let booking = await bookingRepository.findBookingByCode(reference.toUpperCase());
    if (!booking) {
      // Fallback ID fetch
      booking = await bookingRepository.findBookingById(reference);
    }

    if (!booking) return null;

    const relations = await bookingRepository.getRelations(booking.id);
    return bookingMapper.toCanonicalModel(
      booking,
      relations.travellers,
      relations.contacts,
      relations.flights,
      relations.payments
    );
  },

  getBookingsForEmail: async (email) => {
    const list = await bookingRepository.findBookingsByEmail(email);
    return bookingMapper.toSummaryList(list);
  },

  search: async (query) => {
    const list = await bookingRepository.searchBookings(query);
    return bookingMapper.toSummaryList(list);
  }
};

export default bookingService;
