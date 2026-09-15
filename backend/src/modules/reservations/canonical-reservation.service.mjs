import supabase from '../../integrations/supabase/supabase.client.mjs';

const FLIGHT_COLUMNS = 'id,confirmation_code,status,payment_status,total_amount,customer_price,currency,passenger_name,email,phone,created_at,updated_at,assigned_agent_id,team_id,trip_id,deleted_at,airline_name,airline_confirmation_number,ticket_number';
const CAR_RESERVATION_COLUMNS = 'id,booking_reference,service_type,reservation_status,authorization_status,payment_status,customer_name,customer_email,customer_phone,total_amount,currency,created_at,updated_at,assigned_agent_id,team_id,trip_id';
const CAR_COLUMNS = 'reservation_id,rental_company_name,vehicle_name,vehicle_category,pickup_location,pickup_at,dropoff_location,dropoff_at,supplier_confirmation,mileage_policy,fuel_policy,deposit_terms,cancellation_policy,driver_age';
const HOTEL_COLUMNS = 'id,hotel_code,trip_id,lead_id,customer_contact_id,assigned_agent_id,team_id,destination,property_name,supplier_name,check_in,check_out,rooms,adults,children,room_type,supplier_confirmation_number,rate,taxes_fees,total,currency,payment_status,cancellation_policy,cancellation_deadline,status,notes,created_at,updated_at,customer_name,customer_email,customer_phone';

const text = value => value === null || value === undefined ? '' : String(value).trim();
const money = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const upper = value => text(value).toUpperCase();
const safeLimit = value => Math.max(1, Math.min(1000, Number(value) || 250));

function summaryBase({ id, reference, serviceType, status, paymentStatus, authorizationStatus = null, customerName, customerEmail, customerPhone, total, currency, travelDate, createdAt, updatedAt, assignedAgentId = null, teamId = null, tripId = null }) {
  return {
    id,
    reference,
    serviceType,
    booking_type: serviceType.toLowerCase(),
    confirmation_code: reference,
    booking_reference: reference,
    status: upper(status || 'PENDING'),
    reservation_status: upper(status || 'PENDING'),
    paymentStatus: upper(paymentStatus || 'PENDING'),
    payment_status: upper(paymentStatus || 'PENDING'),
    authorizationStatus: authorizationStatus ? upper(authorizationStatus) : null,
    authorization_status: authorizationStatus ? upper(authorizationStatus) : null,
    customerName: customerName || null,
    customer_name: customerName || null,
    passenger_name: customerName || null,
    email: customerEmail || null,
    customer_email: customerEmail || null,
    phone: customerPhone || null,
    customer_phone: customerPhone || null,
    total: money(total),
    total_amount: money(total),
    amount: money(total),
    currency: upper(currency || 'USD') || 'USD',
    travelDate: travelDate || null,
    travel_date: travelDate || null,
    createdAt: createdAt || null,
    created_at: createdAt || null,
    updatedAt: updatedAt || null,
    updated_at: updatedAt || null,
    assignedAgentId,
    assigned_agent_id: assignedAgentId,
    teamId,
    team_id: teamId,
    tripId,
    trip_id: tripId
  };
}

async function flightRows(limit = 500) {
  const result = await supabase
    .from('bookings')
    .select(FLIGHT_COLUMNS)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(safeLimit(limit));
  if (result.error) throw result.error;
  const rows = result.data || [];
  if (!rows.length) return [];

  const ids = rows.map(row => row.id);
  const segments = await supabase
    .from('booking_itinerary_segments')
    .select('booking_id,segment_sequence,segment_order,journey_direction,direction,leg,carrier_name,carrier_code,origin_airport,destination_airport,departure_date,departure_time_str,departure_time,arrival_date,arrival_time_str,arrival_time,flight_number,cabin_class,duration,stops')
    .in('booking_id', ids);
  const segmentMap = new Map();
  if (!segments.error) {
    for (const segment of segments.data || []) {
      const list = segmentMap.get(segment.booking_id) || [];
      list.push(segment);
      segmentMap.set(segment.booking_id, list);
    }
  }

  return rows.map(row => {
    const list = (segmentMap.get(row.id) || []).sort((a, b) => Number(a.segment_sequence ?? a.segment_order ?? 9999) - Number(b.segment_sequence ?? b.segment_order ?? 9999));
    const first = list.find(item => !['return', 'inbound'].includes(String(item.journey_direction || item.direction || item.leg || 'outbound').toLowerCase())) || list[0] || {};
    return {
      ...summaryBase({
        id: row.id,
        reference: row.confirmation_code,
        serviceType: 'FLIGHT',
        status: row.status,
        paymentStatus: row.payment_status,
        customerName: row.passenger_name,
        customerEmail: row.email,
        customerPhone: row.phone,
        total: row.customer_price ?? row.total_amount,
        currency: row.currency,
        travelDate: first.departure_date,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        assignedAgentId: row.assigned_agent_id,
        teamId: row.team_id,
        tripId: row.trip_id
      }),
      airlineName: row.airline_name || first.carrier_name || null,
      airline_name: row.airline_name || first.carrier_name || null,
      origin: first.origin_airport || null,
      destination: first.destination_airport || null
    };
  });
}

async function carRows(limit = 500) {
  const result = await supabase
    .from('reservations')
    .select(CAR_RESERVATION_COLUMNS)
    .eq('service_type', 'CAR')
    .order('created_at', { ascending: false })
    .limit(safeLimit(limit));
  if (result.error) throw result.error;
  const rows = result.data || [];
  if (!rows.length) return [];

  const carResult = await supabase.from('car_reservations').select(CAR_COLUMNS).in('reservation_id', rows.map(row => row.id));
  if (carResult.error) throw carResult.error;
  const byReservation = new Map((carResult.data || []).map(row => [row.reservation_id, row]));

  return rows.map(row => {
    const car = byReservation.get(row.id) || {};
    return {
      ...summaryBase({
        id: row.id,
        reference: row.booking_reference,
        serviceType: 'CAR',
        status: row.reservation_status,
        paymentStatus: row.payment_status,
        authorizationStatus: row.authorization_status,
        customerName: row.customer_name,
        customerEmail: row.customer_email,
        customerPhone: row.customer_phone,
        total: row.total_amount,
        currency: row.currency,
        travelDate: car.pickup_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        assignedAgentId: row.assigned_agent_id,
        teamId: row.team_id,
        tripId: row.trip_id
      }),
      rentalCompanyName: car.rental_company_name || null,
      rental_company_name: car.rental_company_name || null,
      vehicleName: car.vehicle_name || null,
      vehicle_name: car.vehicle_name || null,
      vehicleCategory: car.vehicle_category || null,
      pickupLocation: car.pickup_location || null,
      pickup_location: car.pickup_location || null,
      pickupAt: car.pickup_at || null,
      pickup_at: car.pickup_at || null,
      dropoffLocation: car.dropoff_location || null,
      dropoff_location: car.dropoff_location || null,
      dropoffAt: car.dropoff_at || null,
      dropoff_at: car.dropoff_at || null,
      supplierConfirmation: car.supplier_confirmation || null,
      destination: car.dropoff_location || car.pickup_location || null
    };
  });
}

async function enrichHotelCustomers(rows) {
  if (!rows.length) return rows;
  const contactIds = [...new Set(rows.map(row => row.customer_contact_id).filter(Boolean))];
  const leadIds = [...new Set(rows.map(row => row.lead_id).filter(Boolean))];
  const [contactsResult, leadsResult] = await Promise.all([
    contactIds.length ? supabase.from('contacts').select('id,email,country_code,phone_number').in('id', contactIds) : Promise.resolve({ data: [], error: null }),
    leadIds.length ? supabase.from('crm_leads').select('id,first_name,last_name,email,phone').in('id', leadIds) : Promise.resolve({ data: [], error: null })
  ]);
  if (contactsResult.error) throw contactsResult.error;
  if (leadsResult.error) throw leadsResult.error;
  const contacts = new Map((contactsResult.data || []).map(row => [row.id, row]));
  const leads = new Map((leadsResult.data || []).map(row => [row.id, row]));

  return rows.map(row => {
    const contact = contacts.get(row.customer_contact_id) || {};
    const lead = leads.get(row.lead_id) || {};
    const leadName = [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim();
    const contactPhone = [contact.country_code, contact.phone_number].filter(Boolean).join('');
    return {
      ...row,
      customer_name: row.customer_name || leadName || null,
      customer_email: row.customer_email || lead.email || contact.email || null,
      customer_phone: row.customer_phone || lead.phone || contactPhone || null
    };
  });
}

async function hotelRows(limit = 500) {
  const result = await supabase
    .from('hotel_bookings')
    .select(HOTEL_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(safeLimit(limit));
  if (result.error) throw result.error;
  const rows = await enrichHotelCustomers(result.data || []);
  return rows.map(row => ({
    ...summaryBase({
      id: row.id,
      reference: row.hotel_code,
      serviceType: 'HOTEL',
      status: row.status,
      paymentStatus: row.payment_status,
      customerName: row.customer_name,
      customerEmail: row.customer_email,
      customerPhone: row.customer_phone,
      total: row.total,
      currency: row.currency,
      travelDate: row.check_in,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      assignedAgentId: row.assigned_agent_id,
      teamId: row.team_id,
      tripId: row.trip_id
    }),
    propertyName: row.property_name,
    property_name: row.property_name,
    destination: row.destination,
    checkIn: row.check_in,
    check_in: row.check_in,
    checkOut: row.check_out,
    check_out: row.check_out,
    supplierName: row.supplier_name || null
  }));
}

function matchesQuery(row, query) {
  const q = text(query).toLowerCase();
  if (!q) return true;
  return [row.reference, row.customerName, row.email, row.phone, row.serviceType, row.destination, row.propertyName, row.rentalCompanyName, row.airlineName]
    .filter(Boolean)
    .some(value => String(value).toLowerCase().includes(q));
}

export async function listCanonicalReservations({ serviceType = null, status = null, query = null, limit = 500 } = {}) {
  const requested = upper(serviceType);
  const tasks = [];
  if (!requested || requested === 'FLIGHT') tasks.push(flightRows(limit)); else tasks.push(Promise.resolve([]));
  if (!requested || requested === 'CAR') tasks.push(carRows(limit)); else tasks.push(Promise.resolve([]));
  if (!requested || requested === 'HOTEL') tasks.push(hotelRows(limit)); else tasks.push(Promise.resolve([]));
  const [flights, cars, hotels] = await Promise.all(tasks);
  const statusValue = upper(status);
  return [...flights, ...cars, ...hotels]
    .filter(row => !statusValue || row.status === statusValue)
    .filter(row => matchesQuery(row, query))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, safeLimit(limit));
}

export async function searchCanonicalReservations(query, { limit = 40 } = {}) {
  return listCanonicalReservations({ query, limit: Math.max(limit, 250) }).then(rows => rows.slice(0, safeLimit(limit)));
}

async function exactFlight(reference) {
  const result = await supabase.from('bookings').select(FLIGHT_COLUMNS).eq('confirmation_code', reference).is('deleted_at', null).maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

async function exactCar(reference) {
  const result = await supabase.from('reservations').select(CAR_RESERVATION_COLUMNS).eq('service_type', 'CAR').eq('booking_reference', reference).maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

async function exactHotel(reference) {
  const result = await supabase.from('hotel_bookings').select(HOTEL_COLUMNS).eq('hotel_code', reference).maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

async function flightDetail(row) {
  const [segmentsResult, legacyResult] = await Promise.all([
    supabase.from('booking_itinerary_segments').select('journey_direction,direction,leg,segment_sequence,segment_order,carrier_name,carrier_code,origin_airport,destination_airport,departure_date,departure_time_str,departure_time,arrival_date,arrival_time_str,arrival_time,flight_number,cabin_class,duration,stops').eq('booking_id', row.id),
    supabase.from('flights').select('leg,airline_name,carrier_code,departure_airport,arrival_airport,departure_date,departure_time,arrival_date,arrival_time,flight_number,cabin_class,duration,stops').eq('booking_id', row.id)
  ]);
  const segments = !segmentsResult.error && (segmentsResult.data || []).length ? segmentsResult.data : (legacyResult.data || []);
  const normalized = segments.map(segment => ({
    leg: segment.journey_direction || segment.direction || segment.leg || 'outbound',
    airlineName: segment.carrier_name || segment.airline_name || row.airline_name || null,
    carrierCode: segment.carrier_code || null,
    flightNumber: segment.flight_number || null,
    departureAirport: segment.origin_airport || segment.departure_airport || null,
    arrivalAirport: segment.destination_airport || segment.arrival_airport || null,
    departureDate: segment.departure_date || null,
    departureTime: segment.departure_time_str || segment.departure_time || null,
    arrivalDate: segment.arrival_date || null,
    arrivalTime: segment.arrival_time_str || segment.arrival_time || null,
    cabinClass: segment.cabin_class || null,
    duration: segment.duration || null,
    stops: segment.stops ?? null
  }));
  return {
    reference: row.confirmation_code,
    serviceType: 'FLIGHT',
    status: upper(row.status || 'PENDING'),
    paymentStatus: upper(row.payment_status || 'PENDING'),
    authorizationStatus: null,
    createdAt: row.created_at,
    customer: { name: row.passenger_name || null, email: row.email || null, phone: row.phone || null },
    pricing: { total: money(row.customer_price ?? row.total_amount), currency: upper(row.currency || 'USD') || 'USD' },
    flight: {
      airlineName: row.airline_name || normalized[0]?.airlineName || null,
      airlineConfirmationNumber: row.airline_confirmation_number || null,
      ticketNumber: row.ticket_number || null,
      flights: normalized,
      itinerary: {
        outbound: normalized.filter(segment => !['return', 'inbound'].includes(String(segment.leg || '').toLowerCase())),
        return: normalized.filter(segment => ['return', 'inbound'].includes(String(segment.leg || '').toLowerCase()))
      }
    }
  };
}

async function carDetail(row) {
  const [carResult, travellerResult, authResult] = await Promise.all([
    supabase.from('car_reservations').select(CAR_COLUMNS).eq('reservation_id', row.id).maybeSingle(),
    supabase.from('reservation_travellers').select('full_name,email,phone,date_of_birth,role').eq('reservation_id', row.id).order('created_at', { ascending: true }).limit(1).maybeSingle(),
    supabase.from('authorizations').select('id,status,version,total_amount,currency,sent_at,viewed_at,authorized_at').eq('reservation_id', row.id).order('version', { ascending: false }).limit(1).maybeSingle()
  ]);
  if (carResult.error) throw carResult.error;
  if (travellerResult.error) throw travellerResult.error;
  if (authResult.error) throw authResult.error;
  const car = carResult.data || {};
  const traveller = travellerResult.data || {};
  const auth = authResult.data || null;
  return {
    reference: row.booking_reference,
    serviceType: 'CAR',
    status: upper(row.reservation_status || 'DRAFT'),
    paymentStatus: upper(row.payment_status || 'PENDING'),
    authorizationStatus: upper(row.authorization_status || auth?.status || 'NONE'),
    createdAt: row.created_at,
    customer: { name: traveller.full_name || row.customer_name || null, email: traveller.email || row.customer_email || null, phone: traveller.phone || row.customer_phone || null },
    pricing: { total: money(row.total_amount), currency: upper(row.currency || 'USD') || 'USD' },
    car: {
      rentalCompanyName: car.rental_company_name || null,
      vehicleName: car.vehicle_name || null,
      vehicleCategory: car.vehicle_category || null,
      driverAge: car.driver_age ?? null,
      pickupLocation: car.pickup_location || null,
      pickupAt: car.pickup_at || null,
      dropoffLocation: car.dropoff_location || null,
      dropoffAt: car.dropoff_at || null,
      mileagePolicy: car.mileage_policy || null,
      fuelPolicy: car.fuel_policy || null,
      depositTerms: car.deposit_terms || null,
      cancellationPolicy: car.cancellation_policy || null,
      supplierConfirmation: car.supplier_confirmation || null
    },
    authorization: auth ? {
      status: auth.status,
      version: auth.version,
      totalAmount: money(auth.total_amount),
      currency: upper(auth.currency || row.currency || 'USD') || 'USD',
      sentAt: auth.sent_at || null,
      viewedAt: auth.viewed_at || null,
      authorizedAt: auth.authorized_at || null
    } : null
  };
}

async function hotelDetail(row) {
  const [enriched] = await enrichHotelCustomers([row]);
  return {
    reference: enriched.hotel_code,
    serviceType: 'HOTEL',
    status: upper(enriched.status || 'REQUESTED'),
    paymentStatus: upper(enriched.payment_status || 'PENDING'),
    authorizationStatus: null,
    createdAt: enriched.created_at,
    customer: { name: enriched.customer_name || null, email: enriched.customer_email || null, phone: enriched.customer_phone || null },
    pricing: { total: money(enriched.total), currency: upper(enriched.currency || 'USD') || 'USD' },
    hotel: {
      propertyName: enriched.property_name,
      destination: enriched.destination,
      supplierName: enriched.supplier_name || null,
      checkIn: enriched.check_in,
      checkOut: enriched.check_out,
      rooms: enriched.rooms,
      adults: enriched.adults,
      children: enriched.children,
      roomType: enriched.room_type || null,
      supplierConfirmation: enriched.supplier_confirmation_number || null,
      cancellationPolicy: enriched.cancellation_policy || null,
      cancellationDeadline: enriched.cancellation_deadline || null
    }
  };
}

export async function resolveCanonicalReservation(reference) {
  const normalized = upper(reference);
  if (!normalized) return null;
  const [flight, car, hotel] = await Promise.all([exactFlight(normalized), exactCar(normalized), exactHotel(normalized)]);
  if (flight) return flightDetail(flight);
  if (car) return carDetail(car);
  if (hotel) return hotelDetail(hotel);
  return null;
}

export async function resolveCanonicalEntity(serviceType, { id = null, code = null } = {}) {
  const type = upper(serviceType);
  if (type === 'FLIGHT') {
    let query = supabase.from('bookings').select('id,confirmation_code,currency,total_amount,customer_price,status,payment_status,assigned_agent_id,team_id,trip_id').is('deleted_at', null);
    query = id ? query.eq('id', id) : query.eq('confirmation_code', upper(code));
    const result = await query.maybeSingle();
    if (result.error) throw result.error;
    return result.data ? { ...result.data, serviceType: 'FLIGHT', reference: result.data.confirmation_code, total: money(result.data.customer_price ?? result.data.total_amount) } : null;
  }
  if (type === 'CAR') {
    let query = supabase.from('reservations').select('id,booking_reference,currency,total_amount,reservation_status,payment_status,assigned_agent_id,team_id,trip_id').eq('service_type', 'CAR');
    query = id ? query.eq('id', id) : query.eq('booking_reference', upper(code));
    const result = await query.maybeSingle();
    if (result.error) throw result.error;
    return result.data ? { ...result.data, serviceType: 'CAR', reference: result.data.booking_reference, total: money(result.data.total_amount), status: result.data.reservation_status } : null;
  }
  if (type === 'HOTEL') {
    let query = supabase.from('hotel_bookings').select('id,hotel_code,currency,total,status,payment_status,assigned_agent_id,team_id,trip_id');
    query = id ? query.eq('id', id) : query.eq('hotel_code', upper(code));
    const result = await query.maybeSingle();
    if (result.error) throw result.error;
    return result.data ? { ...result.data, serviceType: 'HOTEL', reference: result.data.hotel_code, total: money(result.data.total) } : null;
  }
  return null;
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
    const existing = map.get(key) || {
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
    existing.bookingCount += 1;
    existing.totalValue += money(row.total);
    if (!existing.serviceTypes.includes(row.serviceType)) existing.serviceTypes.push(row.serviceType);
    existing.bookings.push({ id: row.id, reference: row.reference, serviceType: row.serviceType, status: row.status, total: row.total, currency: row.currency, travelDate: row.travelDate, createdAt: row.createdAt });
    if (!existing.latestBooking || new Date(row.createdAt || 0) > new Date(existing.latestBooking.createdAt || 0)) {
      existing.latestBooking = existing.bookings[existing.bookings.length - 1];
      if (name) existing.name = name;
      if (email) existing.email = email;
      if (phone) existing.phone = phone;
    }
    map.set(key, existing);
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
