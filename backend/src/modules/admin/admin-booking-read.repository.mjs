import supabase from '../../integrations/supabase/supabase.client.mjs';
import bookingMapper from '../bookings/booking.mapper.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BOOKING_DETAIL_COLUMNS = [
  'id','confirmation_code','status','payment_status','total_amount','customer_price','supplier_price',
  'discount_percent','discount_amount','currency','passenger_name','email','phone','internal_notes',
  'original_api_price','created_at','updated_at','version','authorization_token','authorization_status',
  'authorized_amount','airline_code','airline_name','airline_logo_url','airline_confirmation_number',
  'ticket_number','ticket_issued_at','ticket_notes','supplier_confirmation','booking_request_email_status',
  'booking_request_email_id','booking_request_email_sent_at','booking_request_email_recipient','booking_request_email_error',
  'authorization_email_status','authorization_email_id','authorization_email_sent_at','authorization_email_recipient',
  'authorization_email_error','authorization_expires_at','final_confirmation_email_status','final_confirmation_email_id',
  'final_confirmation_email_sent_at','final_confirmation_email_recipient','final_confirmation_email_error',
  'voucher_id','voucher_code','voucher_discount','price_before_voucher','minimum_payable_floor'
].join(',');

const BOOKING_CORE_COLUMNS = [
  'id','confirmation_code','status','payment_status','total_amount','customer_price','supplier_price',
  'discount_percent','discount_amount','currency','passenger_name','email','phone','internal_notes',
  'original_api_price','created_at','updated_at','voucher_id','voucher_code','voucher_discount',
  'price_before_voucher','minimum_payable_floor'
].join(',');

const LIST_COLUMNS = [
  'id','confirmation_code','status','payment_status','customer_price','total_amount','currency',
  'passenger_name','email','phone','created_at','updated_at','airline_name','airline_code',
  'voucher_code','voucher_discount'
].join(',');
const LIST_CORE_COLUMNS = 'id,confirmation_code,status,payment_status,total_amount,currency,passenger_name,email,phone,created_at,updated_at';

const TRAVELLER_COLUMNS = 'id,booking_id,role,title,first_name,middle_name,last_name,date_of_birth,gender,nationality,passport_number,passport_expiry';
const CONTACT_COLUMNS = 'id,booking_id,email,country_code,phone_number';
const FLIGHT_COLUMNS = 'id,booking_id,leg,trip_type,airline_name,carrier_code,flight_number,departure_airport,arrival_airport,departure_date,arrival_date,departure_time_str,arrival_time_str,duration,stops,cabin_class,created_at';
const PAYMENT_COLUMNS = 'id,booking_id,payment_provider,payment_amount,currency,payment_status,payment_date,refund_reference_id,refund_amount,refund_reason,refund_timestamp,created_at';
const PAYMENT_METHOD_COLUMNS = 'id,booking_id,payment_provider,provider_payment_method_id,cardholder_name,card_brand,card_last4,card_exp_month,card_exp_year,billing_email,billing_address_line1,billing_address_line2,billing_city,billing_state,billing_postal_code,billing_country,billing_phone,removed_at,updated_at';
const SPLIT_COLUMNS = 'id,booking_id,merchant_name,amount,currency,created_at,updated_at';

function mapFlightToSegment(flight, index) {
  const direction = ['return', 'inbound'].includes(String(flight.leg || '').toLowerCase()) ? 'return' : 'outbound';
  return {
    ...flight,
    journey_direction: direction,
    direction,
    segment_sequence: index + 1,
    carrier_name: flight.airline_name || '',
    origin_airport: flight.departure_airport || '',
    destination_airport: flight.arrival_airport || '',
    departure_time: flight.departure_time_str || '',
    arrival_time: flight.arrival_time_str || '',
    cabin: flight.cabin_class || 'Economy',
    stop_count: Number(flight.stops || 0)
  };
}

function isSchemaDrift(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('column') || message.includes('schema cache') || message.includes('does not exist') || message.includes('relation');
}

async function safeResult(promise, fallback) {
  try {
    const result = await promise;
    if (result?.error) return { data: fallback, error: result.error };
    return result || { data: fallback, error: null };
  } catch (error) {
    return { data: fallback, error };
  }
}

async function loadCore(identifier) {
  const raw = String(identifier || '').trim();
  if (!raw) return null;
  const applyIdentifier = query => UUID_RE.test(raw) ? query.eq('id', raw) : query.eq('confirmation_code', raw);

  let result = await applyIdentifier(supabase.from('bookings').select(BOOKING_DETAIL_COLUMNS)).maybeSingle();
  if (result.error && isSchemaDrift(result.error)) {
    result = await applyIdentifier(supabase.from('bookings').select(BOOKING_CORE_COLUMNS)).maybeSingle();
  }
  if (result.error) throw new Error(result.error.message);
  return result.data || null;
}

async function loadDetailRelations(bookingId) {
  const [travellersRes, contactsRes, flightsRes, paymentsRes, methodRes, splitsRes] = await Promise.all([
    safeResult(supabase.from('travellers').select(TRAVELLER_COLUMNS).eq('booking_id', bookingId), []),
    safeResult(supabase.from('contacts').select(CONTACT_COLUMNS).eq('booking_id', bookingId), []),
    safeResult(supabase.from('flights').select(FLIGHT_COLUMNS).eq('booking_id', bookingId).order('created_at', { ascending: true }), []),
    safeResult(supabase.from('payments').select(PAYMENT_COLUMNS).eq('booking_id', bookingId).order('created_at', { ascending: false }).limit(5), []),
    safeResult(supabase.from('booking_payment_methods').select(PAYMENT_METHOD_COLUMNS).eq('booking_id', bookingId).is('removed_at', null).maybeSingle(), null),
    safeResult(supabase.from('booking_payment_splits').select(SPLIT_COLUMNS).eq('booking_id', bookingId).order('created_at', { ascending: true }), [])
  ]);

  return {
    travellers: travellersRes.data || [],
    contacts: contactsRes.data || [],
    flights: flightsRes.data || [],
    payments: paymentsRes.data || [],
    paymentMethod: methodRes.data || null,
    paymentSplits: splitsRes.data || []
  };
}

function buildListQuery(filters, page, pageSize, columns, includeFlights) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const selection = includeFlights
    ? `${columns},flights(id,leg,airline_name,carrier_code,departure_airport,arrival_airport,departure_date)`
    : columns;

  let query = supabase
    .from('bookings')
    .select(selection, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (filters.reference) query = query.ilike('confirmation_code', `%${String(filters.reference).trim()}%`);
  if (filters.name) query = query.ilike('passenger_name', `%${String(filters.name).trim()}%`);
  if (filters.email) query = query.ilike('email', `%${String(filters.email).trim()}%`);
  if (filters.status) query = query.eq('status', String(filters.status).trim().toUpperCase());
  return query;
}

export const adminBookingReadRepository = {
  getDetail: async (identifier) => {
    const booking = await loadCore(identifier);
    if (!booking?.id) return null;

    const relations = await loadDetailRelations(booking.id);
    const { travellers, contacts, flights, payments, paymentMethod, paymentSplits } = relations;
    const canonical = bookingMapper.toCanonicalModel(booking, travellers, contacts, flights, payments, paymentMethod) || {};
    const segments = flights.map(mapFlightToSegment);
    const outboundSegments = segments.filter(s => s.journey_direction === 'outbound');
    const returnSegments = segments.filter(s => s.journey_direction === 'return');

    return {
      ...booking,
      ...canonical,
      travellers,
      passengers: travellers,
      contacts,
      flights,
      payments,
      itinerary_segments: segments,
      outbound_segments: outboundSegments,
      return_segments: returnSegments,
      payment_splits: paymentSplits,
      paymentSplits,
      paymentMethod,
      payment_method: paymentMethod,
      billingDetails: paymentMethod,
      cardReference: paymentMethod,
      emailActivity: {
        bookingRequest: {
          status: booking.booking_request_email_status || 'NOT_SENT',
          recipient: booking.booking_request_email_recipient || booking.email,
          providerMessageId: booking.booking_request_email_id || null,
          sentAt: booking.booking_request_email_sent_at || null,
          error: booking.booking_request_email_error || null
        },
        authorization: {
          status: booking.authorization_email_status || 'NOT_SENT',
          recipient: booking.authorization_email_recipient || booking.email,
          providerMessageId: booking.authorization_email_id || null,
          sentAt: booking.authorization_email_sent_at || null,
          error: booking.authorization_email_error || null
        },
        finalTicket: {
          status: booking.final_confirmation_email_status || 'NOT_SENT',
          recipient: booking.final_confirmation_email_recipient || booking.email,
          providerMessageId: booking.final_confirmation_email_id || null,
          sentAt: booking.final_confirmation_email_sent_at || null,
          error: booking.final_confirmation_email_error || null
        }
      }
    };
  },

  list: async (filters = {}) => {
    const page = Math.max(1, Number.parseInt(filters.page, 10) || 1);
    const pageSize = Math.min(50, Math.max(1, Number.parseInt(filters.pageSize, 10) || 20));

    let result = await buildListQuery(filters, page, pageSize, LIST_COLUMNS, true);
    let embeddedFlights = true;
    if (result.error && isSchemaDrift(result.error)) {
      result = await buildListQuery(filters, page, pageSize, LIST_CORE_COLUMNS, false);
      embeddedFlights = false;
    }
    if (result.error) throw new Error(result.error.message);

    let data = result.data || [];
    if (!embeddedFlights && data.length) {
      const ids = data.map(row => row.id).filter(Boolean);
      const flightResult = await safeResult(
        supabase.from('flights').select('id,booking_id,leg,airline_name,carrier_code,departure_airport,arrival_airport,departure_date').in('booking_id', ids),
        []
      );
      const byBooking = new Map();
      (flightResult.data || []).forEach(flight => {
        const list = byBooking.get(flight.booking_id) || [];
        list.push(flight);
        byBooking.set(flight.booking_id, list);
      });
      data = data.map(row => ({ ...row, flights: byBooking.get(row.id) || [] }));
    }

    const bookings = data.map(row => {
      const flights = row.flights || [];
      const outbound = flights.find(f => String(f.leg || '').toLowerCase() !== 'return') || flights[0] || null;
      const inbound = [...flights].reverse().find(f => String(f.leg || '').toLowerCase() === 'return') || null;
      const { flights: _dropFlights, ...base } = row;
      return {
        ...base,
        carrier: outbound?.airline_name || row.airline_name || null,
        airline: outbound?.airline_name || row.airline_name || null,
        origin_code: outbound?.departure_airport || null,
        destination_code: inbound?.arrival_airport || outbound?.arrival_airport || null,
        departure_date: outbound?.departure_date || null
      };
    });

    const totalRecords = Number(result.count || 0);
    const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
    return {
      bookings,
      pagination: { page, pageSize, totalRecords, totalPages, hasPrevious: page > 1, hasNext: page < totalPages }
    };
  }
};

export default adminBookingReadRepository;
