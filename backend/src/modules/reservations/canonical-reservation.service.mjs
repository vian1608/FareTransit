import supabase from '../../integrations/supabase/supabase.client.mjs';

const VIEW_COLUMNS = 'id,reference,service_type,status,payment_status,authorization_status,customer_name,customer_email,customer_phone,total_amount,currency,travel_at,created_at,updated_at,assigned_agent_id,team_id,trip_id,origin,destination,airline_name,rental_company_name,vehicle_name,vehicle_category,pickup_location,pickup_at,dropoff_location,dropoff_at,supplier_confirmation,property_name,check_in,check_out,supplier_name';
const text = value => value === null || value === undefined ? '' : String(value).trim();
const upper = value => text(value).toUpperCase();
const amount = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const limitValue = value => Math.max(1, Math.min(1000, Number(value) || 250));

function normalizeViewRow(row = {}) {
  const serviceType = upper(row.service_type);
  const normalized = {
    id: row.id,
    reference: row.reference,
    serviceType,
    service_type: serviceType,
    booking_type: serviceType.toLowerCase(),
    confirmation_code: row.reference,
    booking_reference: row.reference,
    status: upper(row.status || 'PENDING'),
    reservation_status: upper(row.status || 'PENDING'),
    paymentStatus: upper(row.payment_status || 'PENDING'),
    payment_status: upper(row.payment_status || 'PENDING'),
    authorizationStatus: row.authorization_status ? upper(row.authorization_status) : null,
    authorization_status: row.authorization_status ? upper(row.authorization_status) : null,
    customerName: row.customer_name || null,
    customer_name: row.customer_name || null,
    passenger_name: row.customer_name || null,
    email: row.customer_email || null,
    customer_email: row.customer_email || null,
    phone: row.customer_phone || null,
    customer_phone: row.customer_phone || null,
    total: amount(row.total_amount),
    total_amount: amount(row.total_amount),
    currency: upper(row.currency || 'USD') || 'USD',
    travelDate: row.travel_at || null,
    travel_date: row.travel_at || null,
    createdAt: row.created_at || null,
    created_at: row.created_at || null,
    updatedAt: row.updated_at || null,
    updated_at: row.updated_at || null,
    assigned_agent_id: row.assigned_agent_id || null,
    assignedAgentId: row.assigned_agent_id || null,
    team_id: row.team_id || null,
    teamId: row.team_id || null,
    trip_id: row.trip_id || null,
    tripId: row.trip_id || null,
    origin: row.origin || null,
    destination: row.destination || null,
    airlineName: row.airline_name || null,
    airline_name: row.airline_name || null,
    rentalCompanyName: row.rental_company_name || null,
    rental_company_name: row.rental_company_name || null,
    vehicleName: row.vehicle_name || null,
    vehicle_name: row.vehicle_name || null,
    vehicleCategory: row.vehicle_category || null,
    vehicle_category: row.vehicle_category || null,
    pickupLocation: row.pickup_location || null,
    pickup_location: row.pickup_location || null,
    pickupAt: row.pickup_at || null,
    pickup_at: row.pickup_at || null,
    dropoffLocation: row.dropoff_location || null,
    dropoff_location: row.dropoff_location || null,
    dropoffAt: row.dropoff_at || null,
    dropoff_at: row.dropoff_at || null,
    supplierConfirmation: row.supplier_confirmation || null,
    supplier_confirmation: row.supplier_confirmation || null,
    propertyName: row.property_name || null,
    property_name: row.property_name || null,
    checkIn: row.check_in || null,
    check_in: row.check_in || null,
    checkOut: row.check_out || null,
    check_out: row.check_out || null,
    supplierName: row.supplier_name || null,
    supplier_name: row.supplier_name || null
  };
  return normalized;
}

function queryMatches(row, query) {
  const q = text(query).toLowerCase();
  if (!q) return true;
  return [
    row.reference, row.customerName, row.email, row.phone, row.serviceType,
    row.origin, row.destination, row.airlineName, row.rentalCompanyName,
    row.vehicleName, row.propertyName, row.supplierName
  ].filter(Boolean).some(value => String(value).toLowerCase().includes(q));
}

export async function listCanonicalReservations({ serviceType = null, status = null, query = null, limit = 500 } = {}) {
  let db = supabase.from('canonical_reservations').select(VIEW_COLUMNS).order('created_at', { ascending: false }).limit(limitValue(limit));
  if (serviceType) db = db.eq('service_type', upper(serviceType));
  if (status) db = db.eq('status', upper(status));
  const result = await db;
  if (result.error) throw result.error;
  return (result.data || []).map(normalizeViewRow).filter(row => queryMatches(row, query));
}

export async function searchCanonicalReservations(query, { limit = 40 } = {}) {
  const q = text(query);
  if (!q) return [];
  const safe = q.replace(/[,%()]/g, ' ').trim();
  let rows = [];

  // Push common search fields into PostgREST so search does not fan out across
  // three booking tables. If a name contains characters unsupported by the
  // `or` expression, fall back to the bounded canonical view scan below.
  if (safe) {
    const result = await supabase
      .from('canonical_reservations')
      .select(VIEW_COLUMNS)
      .or(`reference.ilike.%${safe}%,customer_email.ilike.%${safe}%,customer_name.ilike.%${safe}%,customer_phone.ilike.%${safe}%`)
      .order('created_at', { ascending: false })
      .limit(limitValue(limit));
    if (!result.error) rows = result.data || [];
  }

  if (!rows.length) {
    const fallback = await listCanonicalReservations({ limit: 500 });
    return fallback.filter(row => queryMatches(row, q)).slice(0, limitValue(limit));
  }
  return rows.map(normalizeViewRow).filter(row => queryMatches(row, q)).slice(0, limitValue(limit));
}

async function canonicalRow(reference) {
  const result = await supabase
    .from('canonical_reservations')
    .select(VIEW_COLUMNS)
    .eq('reference', upper(reference))
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data ? normalizeViewRow(result.data) : null;
}

async function flightDetail(row) {
  const segmentsResult = await supabase
    .from('booking_itinerary_segments')
    .select('journey_direction,direction,segment_sequence,segment_order,carrier_name,carrier_code,origin_airport,destination_airport,departure_date,departure_time,arrival_date,arrival_time,flight_number,cabin,duration,stop_count')
    .eq('booking_id', row.id)
    .order('segment_sequence', { ascending: true });
  if (segmentsResult.error) throw segmentsResult.error;

  let segments = (segmentsResult.data || []).map(segment => ({
    leg: segment.journey_direction || segment.direction || 'outbound',
    airlineName: segment.carrier_name || row.airlineName || null,
    carrierCode: segment.carrier_code || null,
    flightNumber: segment.flight_number || null,
    departureAirport: segment.origin_airport || null,
    arrivalAirport: segment.destination_airport || null,
    departureDate: segment.departure_date || null,
    departureTime: segment.departure_time || null,
    arrivalDate: segment.arrival_date || null,
    arrivalTime: segment.arrival_time || null,
    cabinClass: segment.cabin || null,
    duration: segment.duration || null,
    stops: segment.stop_count ?? null
  }));

  if (!segments.length) {
    const legacy = await supabase
      .from('flights')
      .select('leg,airline_name,carrier_code,departure_airport,arrival_airport,departure_date,arrival_date,departure_time_str,arrival_time_str,flight_number,cabin_class,duration,stops')
      .eq('booking_id', row.id);
    if (legacy.error) throw legacy.error;
    segments = (legacy.data || []).map(segment => ({
      leg: segment.leg || 'outbound',
      airlineName: segment.airline_name || row.airlineName || null,
      carrierCode: segment.carrier_code || null,
      flightNumber: segment.flight_number || null,
      departureAirport: segment.departure_airport || null,
      arrivalAirport: segment.arrival_airport || null,
      departureDate: segment.departure_date || null,
      departureTime: segment.departure_time_str || null,
      arrivalDate: segment.arrival_date || null,
      arrivalTime: segment.arrival_time_str || null,
      cabinClass: segment.cabin_class || null,
      duration: segment.duration || null,
      stops: segment.stops ?? null
    }));
  }

  const bookingResult = await supabase
    .from('bookings')
    .select('airline_confirmation_number,ticket_number')
    .eq('id', row.id)
    .maybeSingle();
  if (bookingResult.error) throw bookingResult.error;
  const booking = bookingResult.data || {};

  return {
    reference: row.reference,
    serviceType: 'FLIGHT',
    status: row.status,
    paymentStatus: row.paymentStatus,
    authorizationStatus: row.authorizationStatus,
    createdAt: row.createdAt,
    customer: { name: row.customerName, email: row.email, phone: row.phone },
    pricing: { total: row.total, currency: row.currency },
    flight: {
      airlineName: row.airlineName || segments[0]?.airlineName || null,
      airlineConfirmationNumber: booking.airline_confirmation_number || null,
      ticketNumber: booking.ticket_number || null,
      flights: segments,
      itinerary: {
        outbound: segments.filter(segment => !['return', 'inbound'].includes(String(segment.leg || '').toLowerCase())),
        return: segments.filter(segment => ['return', 'inbound'].includes(String(segment.leg || '').toLowerCase()))
      }
    }
  };
}

async function carDetail(row) {
  const [carResult, authResult] = await Promise.all([
    supabase.from('car_reservations').select('driver_age,mileage_policy,fuel_policy,deposit_terms,cancellation_policy').eq('reservation_id', row.id).maybeSingle(),
    supabase.from('authorizations').select('id,status,version,total_amount,currency,sent_at,viewed_at,authorized_at').eq('reservation_id', row.id).order('version', { ascending: false }).limit(1).maybeSingle()
  ]);
  if (carResult.error) throw carResult.error;
  if (authResult.error) throw authResult.error;
  const car = carResult.data || {};
  const authorization = authResult.data || null;
  return {
    reference: row.reference,
    serviceType: 'CAR',
    status: row.status,
    paymentStatus: row.paymentStatus,
    authorizationStatus: row.authorizationStatus || upper(authorization?.status || 'NONE'),
    createdAt: row.createdAt,
    customer: { name: row.customerName, email: row.email, phone: row.phone },
    pricing: { total: row.total, currency: row.currency },
    car: {
      rentalCompanyName: row.rentalCompanyName,
      vehicleName: row.vehicleName,
      vehicleCategory: row.vehicleCategory,
      driverAge: car.driver_age ?? null,
      pickupLocation: row.pickupLocation,
      pickupAt: row.pickupAt,
      dropoffLocation: row.dropoffLocation,
      dropoffAt: row.dropoffAt,
      mileagePolicy: car.mileage_policy || null,
      fuelPolicy: car.fuel_policy || null,
      depositTerms: car.deposit_terms || null,
      cancellationPolicy: car.cancellation_policy || null,
      supplierConfirmation: row.supplierConfirmation
    },
    authorization: authorization ? {
      status: authorization.status,
      version: authorization.version,
      totalAmount: amount(authorization.total_amount),
      currency: upper(authorization.currency || row.currency || 'USD') || 'USD',
      sentAt: authorization.sent_at || null,
      viewedAt: authorization.viewed_at || null,
      authorizedAt: authorization.authorized_at || null
    } : null
  };
}

async function hotelDetail(row) {
  const result = await supabase
    .from('hotel_bookings')
    .select('rooms,adults,children,room_type,cancellation_policy,cancellation_deadline,supplier_confirmation_number,supplier_name')
    .eq('id', row.id)
    .maybeSingle();
  if (result.error) throw result.error;
  const hotel = result.data || {};
  return {
    reference: row.reference,
    serviceType: 'HOTEL',
    status: row.status,
    paymentStatus: row.paymentStatus,
    authorizationStatus: null,
    createdAt: row.createdAt,
    customer: { name: row.customerName, email: row.email, phone: row.phone },
    pricing: { total: row.total, currency: row.currency },
    hotel: {
      propertyName: row.propertyName,
      destination: row.destination,
      supplierName: hotel.supplier_name || row.supplierName,
      checkIn: row.checkIn,
      checkOut: row.checkOut,
      rooms: hotel.rooms,
      adults: hotel.adults,
      children: hotel.children,
      roomType: hotel.room_type || null,
      supplierConfirmation: hotel.supplier_confirmation_number || row.supplierConfirmation,
      cancellationPolicy: hotel.cancellation_policy || null,
      cancellationDeadline: hotel.cancellation_deadline || null
    }
  };
}

export async function resolveCanonicalReservation(reference) {
  const row = await canonicalRow(reference);
  if (!row) return null;
  if (row.serviceType === 'CAR') return carDetail(row);
  if (row.serviceType === 'HOTEL') return hotelDetail(row);
  return flightDetail(row);
}

export async function resolveCanonicalEntity(serviceType, { id = null, code = null } = {}) {
  const type = upper(serviceType);
  if (!['FLIGHT', 'CAR', 'HOTEL'].includes(type)) return null;
  let query = supabase.from('canonical_reservations').select(VIEW_COLUMNS).eq('service_type', type);
  if (id) query = query.eq('id', id);
  else if (code) query = query.eq('reference', upper(code));
  else return null;
  const result = await query.maybeSingle();
  if (result.error) throw result.error;
  const row = result.data ? normalizeViewRow(result.data) : null;
  if (!row) return null;
  return {
    ...row,
    serviceType: type,
    reference: row.reference,
    total: row.total,
    status: row.status,
    assigned_agent_id: row.assigned_agent_id,
    team_id: row.team_id,
    trip_id: row.trip_id
  };
}

export async function listCanonicalCustomers({ limit = 1000 } = {}) {
  const reservations = await listCanonicalReservations({ limit });
  const map = new Map();
  for (const row of reservations) {
    const email = text(row.email).toLowerCase();
    const phone = text(row.phone);
    const name = text(row.customerName);
    if (!email && !phone && !name) continue;
    const key = email || `${name.toLowerCase()}|${phone}`;
    const current = map.get(key) || {
      id: key,
      name: name || 'Customer',
      email: email || null,
      phone: phone || null,
      bookingCount: 0,
      serviceTypes: [],
      totalValue: 0,
      latestBooking: null,
      bookings: []
    };
    const booking = {
      id: row.id,
      reference: row.reference,
      serviceType: row.serviceType,
      status: row.status,
      total: row.total,
      currency: row.currency,
      travelDate: row.travelDate,
      destination: row.destination,
      createdAt: row.createdAt,
      assigned_agent_id: row.assigned_agent_id,
      team_id: row.team_id,
      trip_id: row.trip_id
    };
    current.bookingCount += 1;
    current.totalValue += row.total;
    if (!current.serviceTypes.includes(row.serviceType)) current.serviceTypes.push(row.serviceType);
    current.bookings.push(booking);
    if (!current.latestBooking || new Date(row.createdAt || 0) > new Date(current.latestBooking.createdAt || 0)) {
      current.latestBooking = booking;
      if (name) current.name = name;
      if (email) current.email = email;
      if (phone) current.phone = phone;
    }
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => new Date(b.latestBooking?.createdAt || 0) - new Date(a.latestBooking?.createdAt || 0));
}

export default {
  listCanonicalReservations,
  searchCanonicalReservations,
  resolveCanonicalReservation,
  resolveCanonicalEntity,
  listCanonicalCustomers
};
