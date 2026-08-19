import supabase from '../../integrations/supabase/supabase.client.mjs';

const BOOKING_COLUMNS = [
  'id','confirmation_code','status','payment_status','customer_price','total_amount','currency',
  'passenger_name','email','phone','created_at','updated_at','airline_name','airline_code',
  'airline_confirmation_number','ticket_number'
].join(',');

const SEGMENT_COLUMNS = [
  'booking_id','journey_direction','direction','leg','segment_sequence','segment_order',
  'carrier_name','carrier_code','origin_airport','destination_airport','departure_date'
].join(',');

const FLIGHT_COLUMNS = [
  'booking_id','leg','airline_name','carrier_code','departure_airport','arrival_airport','departure_date'
].join(',');

function directionOf(segment = {}) {
  const raw = String(segment.journey_direction || segment.direction || segment.leg || 'outbound').toLowerCase();
  return ['return', 'inbound'].includes(raw) ? 'return' : 'outbound';
}

function bySequence(a, b) {
  const aSeq = Number(a.segment_sequence || a.segment_order || Number.MAX_SAFE_INTEGER);
  const bSeq = Number(b.segment_sequence || b.segment_order || Number.MAX_SAFE_INTEGER);
  return aSeq - bSeq;
}

async function findBookings(query) {
  const clean = String(query || '').trim();
  if (!clean) return [];

  const exact = await supabase.from('bookings').select(BOOKING_COLUMNS).eq('confirmation_code', clean.toUpperCase()).limit(20);
  if (exact.error) throw new Error(exact.error.message);
  if ((exact.data || []).length) return exact.data;

  const byEmail = await supabase.from('bookings').select(BOOKING_COLUMNS).ilike('email', `%${clean}%`).order('created_at', { ascending: false }).limit(20);
  if (byEmail.error) throw new Error(byEmail.error.message);
  if ((byEmail.data || []).length) return byEmail.data;

  const byName = await supabase.from('bookings').select(BOOKING_COLUMNS).ilike('passenger_name', `%${clean}%`).order('created_at', { ascending: false }).limit(20);
  if (byName.error) throw new Error(byName.error.message);
  return byName.data || [];
}

export async function searchCurrentBookings(query) {
  const bookings = await findBookings(query);
  if (!bookings.length) return [];

  const ids = bookings.map(row => row.id).filter(Boolean);
  const [segmentsResult, flightsResult] = await Promise.all([
    supabase.from('booking_itinerary_segments').select(SEGMENT_COLUMNS).in('booking_id', ids),
    supabase.from('flights').select(FLIGHT_COLUMNS).in('booking_id', ids)
  ]);

  const normalizedByBooking = new Map();
  if (!segmentsResult.error) {
    (segmentsResult.data || []).forEach(segment => {
      const list = normalizedByBooking.get(segment.booking_id) || [];
      list.push(segment);
      normalizedByBooking.set(segment.booking_id, list);
    });
  }

  const flightsByBooking = new Map();
  if (!flightsResult.error) {
    (flightsResult.data || []).forEach(flight => {
      const list = flightsByBooking.get(flight.booking_id) || [];
      list.push(flight);
      flightsByBooking.set(flight.booking_id, list);
    });
  }

  return bookings.map(booking => {
    const normalized = (normalizedByBooking.get(booking.id) || []).sort(bySequence);
    const legacy = flightsByBooking.get(booking.id) || [];
    const outbound = normalized.length
      ? normalized.filter(segment => directionOf(segment) === 'outbound')
      : legacy.filter(flight => directionOf(flight) === 'outbound');
    const first = outbound[0] || normalized[0] || legacy[0] || {};
    const last = outbound[outbound.length - 1] || first;
    const carrier = first.carrier_name || first.airline_name || booking.airline_name || null;
    const origin = first.origin_airport || first.departure_airport || null;
    const destination = last.destination_airport || last.arrival_airport || null;

    return {
      ...booking,
      confirmationCode: booking.confirmation_code,
      customerName: booking.passenger_name,
      amount: Number(booking.customer_price ?? booking.total_amount ?? 0),
      paymentStatus: booking.payment_status,
      carrier,
      airline: carrier,
      origin_code: origin,
      destination_code: destination,
      departure_date: first.departure_date || null,
      flights: normalized.length
        ? normalized.map(segment => ({
            leg: directionOf(segment),
            airline: segment.carrier_name,
            airline_name: segment.carrier_name,
            carrier_code: segment.carrier_code,
            departure_airport: segment.origin_airport,
            arrival_airport: segment.destination_airport,
            departure_date: segment.departure_date
          }))
        : legacy
    };
  });
}

export const bookingCurrentSearchController = {
  search: async (req, res, next) => {
    try {
      const query = String(req.query?.query || '').trim();
      if (!query) {
        return res.status(400).json({ success: false, error: { code: 'SEARCH_QUERY_REQUIRED', message: 'Confirmation code or email is required.' } });
      }
      const data = await searchCurrentBookings(query);
      return res.json({ success: true, data, count: data.length });
    } catch (error) {
      return next(error);
    }
  }
};

export default bookingCurrentSearchController;
