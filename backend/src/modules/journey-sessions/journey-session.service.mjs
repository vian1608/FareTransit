import crypto from 'node:crypto';
import supabase from '../../integrations/supabase/supabase.client.mjs';
import bookingService from '../bookings/booking.service.mjs';

export const JOURNEY_SESSION_TYPES = Object.freeze({
  QUOTE: 'QUOTE',
  CHECKOUT: 'CHECKOUT',
  RESERVATION_READ: 'RESERVATION_READ',
  PAYMENT: 'PAYMENT',
});

const TYPE_CONFIG = Object.freeze({
  [JOURNEY_SESSION_TYPES.QUOTE]: { prefix: 'q_', ttlMinutes: 60 },
  [JOURNEY_SESSION_TYPES.CHECKOUT]: { prefix: 'c_', ttlMinutes: 120 },
  [JOURNEY_SESSION_TYPES.RESERVATION_READ]: { prefix: 'r_', ttlMinutes: 60 * 24 * 365 * 2 },
  [JOURNEY_SESSION_TYPES.PAYMENT]: { prefix: 'p_', ttlMinutes: 60 },
});

const SESSION_COLUMNS = 'token,session_type,payload,status,booking_id,expires_at,created_at,updated_at';
const SENSITIVE_KEYS = new Set([
  'cardnumber', 'card_number', 'pan', 'cvv', 'cvc', 'cch', 'securitycode', 'security_code',
  'trackdata', 'track_data', 'pin', 'cardpin', 'card_pin'
]);

function normalizeKey(key) {
  return String(key || '').replace(/[^a-z0-9_]/gi, '').toLowerCase();
}

function sanitizeValue(value, depth = 0) {
  if (depth > 12) return null;
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, depth + 1));
  if (!value || typeof value !== 'object') return value;

  const clean = {};
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(normalizeKey(key))) continue;
    clean[key] = sanitizeValue(child, depth + 1);
  }
  return clean;
}

function makeToken(type) {
  const config = TYPE_CONFIG[type];
  if (!config) throw new Error(`Unsupported journey session type: ${type}`);
  return `${config.prefix}${crypto.randomBytes(24).toString('base64url')}`;
}

function expiresAt(type) {
  const minutes = TYPE_CONFIG[type]?.ttlMinutes;
  if (!minutes) throw new Error(`Unsupported journey session type: ${type}`);
  return new Date(Date.now() + (minutes * 60 * 1000)).toISOString();
}

function assertTokenType(token, type) {
  const expectedPrefix = TYPE_CONFIG[type]?.prefix;
  if (!expectedPrefix || !String(token || '').startsWith(expectedPrefix)) {
    const error = new Error('This link is not valid for this step of the journey.');
    error.status = 400;
    error.code = 'INVALID_JOURNEY_TOKEN';
    throw error;
  }
}

function assertUsable(row) {
  if (!row) {
    const error = new Error('This travel session could not be found.');
    error.status = 404;
    error.code = 'JOURNEY_SESSION_NOT_FOUND';
    throw error;
  }
  if (row.status === 'REVOKED') {
    const error = new Error('This travel-session link has been revoked.');
    error.status = 410;
    error.code = 'JOURNEY_SESSION_REVOKED';
    throw error;
  }
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    const error = new Error('This travel-session link has expired. Please start again to refresh live pricing.');
    error.status = 410;
    error.code = 'JOURNEY_SESSION_EXPIRED';
    throw error;
  }
  return row;
}

async function insertSession(type, payload = {}, { bookingId = null, status = 'ACTIVE' } = {}) {
  const row = {
    token: makeToken(type),
    session_type: type,
    payload: sanitizeValue(payload || {}),
    booking_id: bookingId,
    status,
    expires_at: expiresAt(type),
  };

  const { data, error } = await supabase
    .from('journey_sessions')
    .insert(row)
    .select(SESSION_COLUMNS)
    .single();

  if (error) {
    const wrapped = new Error(`Unable to create ${type.toLowerCase()} session: ${error.message}`);
    wrapped.status = 500;
    wrapped.code = 'JOURNEY_SESSION_CREATE_FAILED';
    throw wrapped;
  }
  return data;
}

async function getSession(token, type) {
  assertTokenType(token, type);
  const { data, error } = await supabase
    .from('journey_sessions')
    .select(SESSION_COLUMNS)
    .eq('token', token)
    .eq('session_type', type)
    .maybeSingle();

  if (error) {
    const wrapped = new Error(`Unable to load travel session: ${error.message}`);
    wrapped.status = 500;
    wrapped.code = 'JOURNEY_SESSION_READ_FAILED';
    throw wrapped;
  }
  return assertUsable(data);
}

async function patchSession(token, type, patch = {}) {
  assertTokenType(token, type);
  const nextPayload = sanitizeValue(patch?.payload ?? patch ?? {});
  const now = new Date().toISOString();

  // One conditional UPDATE only. The browser already owns the loaded payload and
  // sends its complete replacement, so autosave never becomes read-then-write fan-out.
  const { data, error } = await supabase
    .from('journey_sessions')
    .update({ payload: nextPayload, updated_at: now })
    .eq('token', token)
    .eq('session_type', type)
    .neq('status', 'REVOKED')
    .gt('expires_at', now)
    .select(SESSION_COLUMNS)
    .maybeSingle();

  if (error) {
    const wrapped = new Error(`Unable to update travel session: ${error.message}`);
    wrapped.status = 500;
    wrapped.code = 'JOURNEY_SESSION_UPDATE_FAILED';
    throw wrapped;
  }
  return assertUsable(data);
}

function normalizeFlightForPublicSession(flight) {
  if (!flight || typeof flight !== 'object') return null;
  return sanitizeValue(flight);
}

function normalizePassengerForConfirmation(passenger = {}) {
  return {
    id: passenger.id || null,
    passengerType: passenger.passenger_type || passenger.passengerType || passenger.role || null,
    title: passenger.title || null,
    firstName: passenger.first_name || passenger.firstName || null,
    middleName: passenger.middle_name || passenger.middleName || null,
    lastName: passenger.last_name || passenger.lastName || null,
    gender: passenger.gender || null,
    dateOfBirth: passenger.date_of_birth || passenger.dateOfBirth || null,
    nationality: passenger.nationality || null,
  };
}

function normalizeFlightForConfirmation(f = {}) {
  return {
    id: f.id || null,
    leg: f.leg || f.journey_direction || 'outbound',
    airlineName: f.airline_name || f.carrier_name || f.airline || '',
    flightNumber: f.flight_number || f.flightNumber || '',
    departureAirport: String(f.departure_airport || f.origin_airport || f.origin_code || f.origin || '').trim().toUpperCase(),
    arrivalAirport: String(f.arrival_airport || f.destination_airport || f.destination_code || f.destination || '').trim().toUpperCase(),
    departureDate: f.departure_date || f.departureDate || '',
    departureTime: f.departure_time_str || f.departure_time || f.departureTime || '',
    arrivalDate: f.arrival_date || f.arrivalDate || '',
    arrivalTime: f.arrival_time_str || f.arrival_time || f.arrivalTime || '',
    duration: f.duration || '',
    stops: f.stops !== undefined ? Number.parseInt(f.stops, 10) || 0 : 0,
    cabinClass: f.cabin_class || f.cabinClass || 'Economy',
  };
}

function buildPublicReservationDto(completeBooking = {}) {
  const rawFlights = Array.isArray(completeBooking.flights) ? completeBooking.flights : [];
  const flights = rawFlights.map(normalizeFlightForConfirmation);
  const outbound = flights.filter((f, index) => String(f.leg || '').toLowerCase() !== 'return' && (String(f.leg || '').toLowerCase() === 'outbound' || index === 0));
  const returned = flights.filter((f, index) => String(f.leg || '').toLowerCase() === 'return' || (!f.leg && index > 0));

  const paymentMethod = completeBooking.paymentMethod || completeBooking.payment_method || {};
  const rawLast4 = String(paymentMethod.card_last4 || paymentMethod.cardLast4 || paymentMethod.last4 || '').replace(/\D/g, '');
  const last4 = /^\d{4}$/.test(rawLast4) ? rawLast4 : null;
  const total = Number.parseFloat(completeBooking.customer_price ?? completeBooking.total_amount ?? 0);

  return {
    booking: {
      id: completeBooking.id,
      confirmationCode: completeBooking.confirmation_code || completeBooking.confirmationCode,
      status: completeBooking.status,
      paymentStatus: completeBooking.payment_status || completeBooking.paymentStatus,
      passengerName: completeBooking.passenger_name || completeBooking.customerName || null,
      email: completeBooking.email || null,
      phone: completeBooking.phone || null,
      totalAmount: Number.isFinite(total) && total > 0 ? total : null,
      currency: String(completeBooking.currency || 'USD').toUpperCase(),
      bookingDate: completeBooking.created_at || null,
    },
    flights,
    itinerary: { outbound, return: returned },
    travellers: Array.isArray(completeBooking.travellers)
      ? completeBooking.travellers.map(normalizePassengerForConfirmation)
      : [],
    contact: Array.isArray(completeBooking.contacts) && completeBooking.contacts[0]
      ? {
          email: completeBooking.contacts[0].email || completeBooking.email || null,
          phone: completeBooking.contacts[0].phone_number || completeBooking.contacts[0].phone || completeBooking.phone || null,
        }
      : { email: completeBooking.email || null, phone: completeBooking.phone || null },
    cardReference: {
      cardholderName: paymentMethod.cardholder_name || paymentMethod.cardholderName || completeBooking.passenger_name || null,
      cardBrand: paymentMethod.card_brand || paymentMethod.cardBrand || null,
      last4,
      expMonth: paymentMethod.card_exp_month || paymentMethod.cardExpMonth || null,
      expYear: paymentMethod.card_exp_year || paymentMethod.cardExpYear || null,
      billingAddress: [
        paymentMethod.billing_address_line1 || paymentMethod.billingAddressLine1 || paymentMethod.billingAddress,
        paymentMethod.billing_address_line2 || paymentMethod.billingAddressLine2,
        paymentMethod.billing_city || paymentMethod.billingCity,
        paymentMethod.billing_state || paymentMethod.billingState,
        paymentMethod.billing_postal_code || paymentMethod.billingPostalCode,
        paymentMethod.billing_country || paymentMethod.billingCountry,
      ].filter(Boolean).join(', ') || null,
      billingPhone: paymentMethod.billing_phone || paymentMethod.billingPhone || completeBooking.phone || null,
    },
  };
}

async function getOrCreateReservationReadToken(bookingId) {
  const { data: existing, error: lookupError } = await supabase
    .from('journey_sessions')
    .select(SESSION_COLUMNS)
    .eq('session_type', JOURNEY_SESSION_TYPES.RESERVATION_READ)
    .eq('booking_id', bookingId)
    .eq('status', 'ACTIVE')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lookupError && existing) return existing;
  return insertSession(JOURNEY_SESSION_TYPES.RESERVATION_READ, {}, { bookingId });
}

const journeySessionService = {
  sanitizeValue,

  createQuote: ({ searchParams, selectedFlight }) => insertSession(JOURNEY_SESSION_TYPES.QUOTE, {
    searchParams: sanitizeValue(searchParams || {}),
    selectedFlight: normalizeFlightForPublicSession(selectedFlight),
  }),

  getQuote: (token) => getSession(token, JOURNEY_SESSION_TYPES.QUOTE),

  createCheckout: ({ searchParams, selectedFlight, returnFlight = null, quoteToken = null }) => insertSession(
    JOURNEY_SESSION_TYPES.CHECKOUT,
    {
      searchParams: sanitizeValue(searchParams || {}),
      selectedFlight: normalizeFlightForPublicSession(selectedFlight),
      returnFlight: normalizeFlightForPublicSession(returnFlight),
      quoteToken: quoteToken || null,
      formDraft: null,
      voucher: null,
    },
  ),

  getCheckout: (token) => getSession(token, JOURNEY_SESSION_TYPES.CHECKOUT),
  patchCheckout: (token, patch) => patchSession(token, JOURNEY_SESSION_TYPES.CHECKOUT, patch),

  createPayment: (payload = {}) => insertSession(JOURNEY_SESSION_TYPES.PAYMENT, payload),
  getPayment: (token) => getSession(token, JOURNEY_SESSION_TYPES.PAYMENT),
  patchPayment: (token, patch) => patchSession(token, JOURNEY_SESSION_TYPES.PAYMENT, patch),

  completeCheckout: async (checkoutToken, bookingId) => {
    assertTokenType(checkoutToken, JOURNEY_SESSION_TYPES.CHECKOUT);
    const checkout = await getSession(checkoutToken, JOURNEY_SESSION_TYPES.CHECKOUT);
    if (checkout.booking_id && checkout.booking_id !== bookingId) {
      const error = new Error('This checkout session is already linked to another booking.');
      error.status = 409;
      error.code = 'CHECKOUT_ALREADY_COMPLETED';
      throw error;
    }

    const { error } = await supabase
      .from('journey_sessions')
      .update({
        booking_id: bookingId,
        status: 'COMPLETED',
        updated_at: new Date().toISOString(),
      })
      .eq('token', checkoutToken)
      .eq('session_type', JOURNEY_SESSION_TYPES.CHECKOUT);

    if (error) {
      const wrapped = new Error(`Unable to complete checkout session: ${error.message}`);
      wrapped.status = 500;
      wrapped.code = 'CHECKOUT_SESSION_COMPLETE_FAILED';
      throw wrapped;
    }

    const readSession = await getOrCreateReservationReadToken(bookingId);
    return { reservationToken: readSession.token };
  },

  getReservationByToken: async (token) => {
    const session = await getSession(token, JOURNEY_SESSION_TYPES.RESERVATION_READ);
    if (!session.booking_id) {
      const error = new Error('This reservation link is not connected to a booking.');
      error.status = 404;
      error.code = 'RESERVATION_LINK_NOT_READY';
      throw error;
    }
    const booking = await bookingService.getDetailsByCodeOrId(session.booking_id);
    if (!booking) {
      const error = new Error('The booking connected to this reservation link could not be found.');
      error.status = 404;
      error.code = 'BOOKING_NOT_FOUND';
      throw error;
    }
    return buildPublicReservationDto(booking);
  },
};

export default journeySessionService;
