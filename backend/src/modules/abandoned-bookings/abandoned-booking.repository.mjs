import supabase from '../../integrations/supabase/supabase.client.mjs';

const MAX_STRING = 500;
const MAX_NOTES = 2000;

function text(value, max = MAX_STRING) {
  if (value === null || value === undefined) return null;
  return String(value).slice(0, max);
}

function compactFlight(flight) {
  if (!flight || typeof flight !== 'object') return null;
  const segments = Array.isArray(flight.segments) ? flight.segments.slice(0, 8).map(segment => ({
    airline: text(segment.airline || segment.airlineName || segment.carrier_name, 100),
    carrierCode: text(segment.carrierCode || segment.carrier_code, 10),
    flightNumber: text(segment.flightNumber || segment.flight_number, 20),
    departureAirport: text(segment.departureAirport || segment.originCode || segment.departure_airport, 10),
    arrivalAirport: text(segment.arrivalAirport || segment.destinationCode || segment.arrival_airport, 10),
    departureDate: text(segment.departureDate || segment.departure_date, 30),
    departureTime: text(segment.departureTime || segment.departure_time, 20),
    arrivalDate: text(segment.arrivalDate || segment.arrival_date, 30),
    arrivalTime: text(segment.arrivalTime || segment.arrival_time, 20),
    cabinClass: text(segment.cabinClass || segment.cabin_class || segment.cabin, 30)
  })) : null;

  return {
    id: text(flight.id, 100),
    airline: text(flight.airline || flight.airlineName || flight.carrier_name, 100),
    carrierCode: text(flight.carrierCode || flight.carrier_code, 10),
    flightNumber: text(flight.flightNumber || flight.flight_number, 20),
    departureAirport: text(flight.departureAirport || flight.originCode || flight.departure_airport, 10),
    arrivalAirport: text(flight.arrivalAirport || flight.destinationCode || flight.arrival_airport, 10),
    departureDate: text(flight.departureDate || flight.departure_date, 30),
    departureTime: text(flight.departureTime || flight.departure_time, 20),
    arrivalDate: text(flight.arrivalDate || flight.arrival_date, 30),
    arrivalTime: text(flight.arrivalTime || flight.arrival_time, 20),
    cabinClass: text(flight.cabinClass || flight.cabin_class || flight.class, 30),
    totalPrice: Number(flight.totalPrice || flight.price?.total || flight.price || 0) || null,
    currency: text(flight.currency || flight.price?.currency || 'USD', 5),
    segments
  };
}

function compactTravellerInfo(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    firstName: text(value.firstName || value.first_name, 100),
    lastName: text(value.lastName || value.last_name, 100),
    passengerCount: Number(value.passengerCount || value.passengers || 0) || null
  };
}

function compactContactInfo(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    email: text(value.email, 255),
    phone: text(value.phone || value.phoneNumber || value.phone_number, 50)
  };
}

export const abandonedBookingRepository = {
  saveSession: async (fields) => {
    const sessionKey = text(fields.sessionKey || fields.session_key, 100);
    if (!sessionKey) return { saved: false };

    const row = {
      session_key: sessionKey,
      selected_flight: compactFlight(fields.selectedFlight || fields.selected_flight),
      return_flight: compactFlight(fields.returnFlight || fields.return_flight),
      traveller_info: compactTravellerInfo(fields.travellerInfo || fields.traveller_info),
      contact_info: compactContactInfo(fields.contactInfo || fields.contact_info),
      special_requests: fields.specialRequests || fields.special_requests
        ? { notes: text((fields.specialRequests || fields.special_requests)?.notes || fields.specialRequests || fields.special_requests, MAX_NOTES) }
        : null,
      current_step: text(fields.currentStep || fields.current_step || 'passenger_form', 50),
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('abandoned_bookings')
      .upsert(row, { onConflict: 'session_key', ignoreDuplicates: false });

    if (error) throw new Error(error.message);
    return { saved: true };
  },

  deleteSession: async (sessionKey) => {
    const { error } = await supabase
      .from('abandoned_bookings')
      .delete()
      .eq('session_key', sessionKey);
    if (error) throw new Error(error.message);
    return { deleted: true };
  },

  deleteOlderThan: async (isoCutoff) => {
    const { error } = await supabase
      .from('abandoned_bookings')
      .delete()
      .lt('updated_at', isoCutoff);
    if (error) throw new Error(error.message);
    return { cleaned: true };
  }
};

export default abandonedBookingRepository;
