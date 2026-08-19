import supabase from '../../integrations/supabase/supabase.client.mjs';
import logger from '../../config/logger.mjs';
import bookingRepository from './booking.repository.mjs';
import bookingMapper from './booking.mapper.mjs';
import { buildCanonicalItinerary, calculateTripSummary } from '../../shared/utils/airline-lookup.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idempotencyMemory = new Map();
let idempotencyColumnsUnavailable = false;

const BASE_COLUMNS = [
  'id','confirmation_code','status','payment_status','total_amount','customer_price','supplier_price',
  'discount_percent','discount_amount','currency','passenger_name','email','phone','internal_notes',
  'original_api_price','created_at','updated_at','version','authorization_token','authorization_status','authorized_amount',
  'airline_code','airline_name','airline_logo_url','airline_confirmation_number','ticket_number','ticket_issued_at',
  'ticket_notes','supplier_confirmation','booking_request_email_status','booking_request_email_id',
  'booking_request_email_sent_at','booking_request_email_recipient','booking_request_email_error',
  'authorization_email_status','authorization_email_id','authorization_email_sent_at','authorization_email_recipient',
  'authorization_email_error','authorization_expires_at','final_confirmation_email_status','final_confirmation_email_id',
  'final_confirmation_email_sent_at','final_confirmation_email_recipient','final_confirmation_email_error',
  'voucher_id','voucher_code','voucher_discount','price_before_voucher','minimum_payable_floor','client_request_id','idempotency_key'
].join(',');
const CORE_COLUMNS = 'id,confirmation_code,status,payment_status,total_amount,customer_price,supplier_price,discount_percent,discount_amount,currency,passenger_name,email,phone,internal_notes,original_api_price,created_at,updated_at,voucher_id,voucher_code,voucher_discount,price_before_voucher,minimum_payable_floor';
const INSERT_RETURN_COLUMNS = 'id,confirmation_code,created_at,updated_at';
const TRAVELLER_COLUMNS = 'id,booking_id,role,title,first_name,middle_name,last_name,date_of_birth,gender,nationality,passport_number,passport_expiry';
const CONTACT_COLUMNS = 'id,booking_id,email,country_code,phone_number';
const FLIGHT_COLUMNS = 'id,booking_id,leg,trip_type,airline_name,carrier_code,flight_number,departure_airport,arrival_airport,departure_date,arrival_date,departure_time_str,arrival_time_str,duration,stops,cabin_class,created_at';
const PAYMENT_COLUMNS = 'id,booking_id,payment_provider,payment_amount,currency,payment_status,payment_date,refund_reference_id,refund_amount,refund_reason,refund_timestamp,created_at';
const PAYMENT_METHOD_COLUMNS = 'id,booking_id,payment_provider,provider_payment_method_id,cardholder_name,card_brand,card_last4,card_exp_month,card_exp_year,billing_email,billing_phone,billing_address_line1,billing_address_line2,billing_city,billing_state,billing_postal_code,billing_country,removed_at,updated_at';
const SPLIT_COLUMNS = 'id,booking_id,merchant_name,amount,currency,display_order,created_at,updated_at';
const EMAIL_COLUMNS = 'id,booking_id,confirmation_code,email_type,recipient,status,provider,provider_message_id,error_code,error_message,attempt_count,last_attempt_at,sent_at,created_at,updated_at';

function schemaDrift(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('schema cache') || message.includes('column') || message.includes('relation') || message.includes('does not exist') || message.includes('not found');
}

async function safe(promise, fallback) {
  try {
    const result = await promise;
    if (result?.error) return { data: fallback, error: result.error };
    return result || { data: fallback, error: null };
  } catch (error) {
    return { data: fallback, error };
  }
}

function canonicalPaymentStatus(value) {
  const status = String(value || 'PENDING').trim().toUpperCase();
  return ['PENDING','PROCESSING','PAID','FAILED','REFUNDED'].includes(status) ? status : 'PENDING';
}

function canonicalBookingStatus(value) {
  const status = String(value || 'PENDING').trim().toUpperCase();
  const allowed = ['DRAFT','PENDING','AWAITING_AUTHORIZATION','AUTHORIZED','REAUTHORIZATION_REQUIRED','READY_FOR_TICKETING','TICKETED','DONE','FAILED','CANCELLED'];
  return allowed.includes(status) ? status : 'PENDING';
}

function normalizeCountryCode(value) {
  const code = String(value || '').trim();
  if (!code) return null;
  // A dialing code is + followed by 1-4 digits. If booking creation accidentally
  // supplied the entire phone number (e.g. +18885551234), do not persist it as
  // country_code; the complete number remains safely stored in phone_number.
  return /^\+\d{1,4}$/.test(code) ? code : null;
}

function toSegments(flights = []) {
  let outSeq = 1;
  let retSeq = 1;
  return flights.map(flight => {
    const direction = ['return','inbound'].includes(String(flight.leg || '').toLowerCase()) ? 'return' : 'outbound';
    const sequence = direction === 'return' ? retSeq++ : outSeq++;
    return {
      ...flight,
      journey_direction: direction,
      direction,
      segment_sequence: sequence,
      carrier_name: flight.airline_name || '',
      origin_airport: flight.departure_airport || '',
      destination_airport: flight.arrival_airport || '',
      origin_city: flight.departure_airport || '',
      destination_city: flight.arrival_airport || '',
      departure_time: flight.departure_time_str || '',
      arrival_time: flight.arrival_time_str || '',
      cabin: flight.cabin_class || 'Economy',
      stop_count: Number(flight.stops || 0),
      _source: 'flights_table'
    };
  });
}

function buildEmailActivity(booking, logs = []) {
  const byType = keyword => logs.find(row => String(row.email_type || '').toUpperCase().includes(keyword));
  const one = (keyword, prefix) => {
    const log = byType(keyword);
    return {
      status: String(log?.status || booking[`${prefix}_email_status`] || 'NOT_SENT').toUpperCase(),
      recipient: log?.recipient || booking[`${prefix}_email_recipient`] || booking.email || null,
      sentAt: log?.sent_at || booking[`${prefix}_email_sent_at`] || null,
      expiresAt: prefix === 'authorization' ? booking.authorization_expires_at || null : null,
      providerMessageId: log?.provider_message_id || booking[`${prefix}_email_id`] || null,
      error: log?.error_message || booking[`${prefix}_email_error`] || null
    };
  };
  const bookingRequest = one('BOOKING', 'booking_request');
  const authorization = one('AUTH', 'authorization');
  const finalTicket = one('TICKET', 'final_confirmation');
  return {
    count: [bookingRequest, authorization, finalTicket].filter(item => ['SENT','ACCEPTED','DELIVERED','MANUALLY_SENT'].includes(item.status)).length,
    bookingRequest,
    authorization,
    finalTicket,
    logs,
    lastSentAt: finalTicket.sentAt || authorization.sentAt || bookingRequest.sentAt || null
  };
}

async function findBase(identifier) {
  const raw = String(identifier || '').trim();
  if (!raw) return null;
  const apply = query => UUID_RE.test(raw) ? query.eq('id', raw) : query.eq('confirmation_code', raw);
  let result = await apply(supabase.from('bookings').select(BASE_COLUMNS)).maybeSingle();
  if (result.error && schemaDrift(result.error)) {
    result = await apply(supabase.from('bookings').select(CORE_COLUMNS)).maybeSingle();
  }
  if (result.error) throw new Error(result.error.message);
  return result.data || null;
}

async function getRelations(bookingId) {
  const [travellersRes, contactsRes, flightsRes, paymentsRes, emailRes, methodRes, splitsRes] = await Promise.all([
    safe(supabase.from('travellers').select(TRAVELLER_COLUMNS).eq('booking_id', bookingId), []),
    safe(supabase.from('contacts').select(CONTACT_COLUMNS).eq('booking_id', bookingId), []),
    safe(supabase.from('flights').select(FLIGHT_COLUMNS).eq('booking_id', bookingId).order('created_at', { ascending: true }), []),
    safe(supabase.from('payments').select(PAYMENT_COLUMNS).eq('booking_id', bookingId).order('created_at', { ascending: false }).limit(5), []),
    safe(supabase.from('email_deliveries').select(EMAIL_COLUMNS).eq('booking_id', bookingId).order('created_at', { ascending: false }).limit(10), []),
    safe(supabase.from('booking_payment_methods').select(PAYMENT_METHOD_COLUMNS).eq('booking_id', bookingId).is('removed_at', null).maybeSingle(), null),
    safe(supabase.from('booking_payment_splits').select(SPLIT_COLUMNS).eq('booking_id', bookingId).order('display_order', { ascending: true }), [])
  ]);

  const flights = flightsRes.data || [];
  return {
    travellers: travellersRes.data || [],
    contacts: contactsRes.data || [],
    flights,
    payments: paymentsRes.data || [],
    itinerarySegments: toSegments(flights),
    emailLogs: emailRes.data || [],
    paymentMethod: methodRes.data || null,
    paymentSplits: splitsRes.data || []
  };
}

function install() {
  if (bookingRepository.__egressHardeningInstalled) return;

  bookingRepository.findBaseBookingRecord = findBase;
  bookingRepository.getRelations = getRelations;

  bookingRepository.getBookingByClientRequestId = async clientRequestId => {
    const key = String(clientRequestId || '').trim();
    if (!key) return null;
    const memoryId = idempotencyMemory.get(key);
    if (memoryId) return bookingRepository.getCompleteBookingById(memoryId);
    if (idempotencyColumnsUnavailable) return null;

    const result = await safe(
      supabase.from('bookings').select('id,confirmation_code').or(`client_request_id.eq.${key},idempotency_key.eq.${key}`).limit(1).maybeSingle(),
      null
    );
    if (result.error && schemaDrift(result.error)) {
      idempotencyColumnsUnavailable = true;
      return null;
    }
    return result.data?.id ? bookingRepository.getCompleteBookingById(result.data.id) : null;
  };

  bookingRepository.createBookingRecord = async dbRow => {
    const clientRequestId = dbRow.client_request_id || dbRow.idempotency_key || null;
    const normalized = {
      ...dbRow,
      status: canonicalBookingStatus(dbRow.status),
      payment_status: canonicalPaymentStatus(dbRow.payment_status),
      client_request_id: clientRequestId,
      idempotency_key: clientRequestId
    };

    let insertRow = normalized;
    let result = await supabase.from('bookings').insert(insertRow).select(INSERT_RETURN_COLUMNS).single();
    if (result.error && schemaDrift(result.error) && clientRequestId) {
      idempotencyColumnsUnavailable = true;
      const { client_request_id, idempotency_key, ...withoutIdempotencyColumns } = normalized;
      insertRow = withoutIdempotencyColumns;
      result = await supabase.from('bookings').insert(insertRow).select(INSERT_RETURN_COLUMNS).single();
    }
    if (result.error || !result.data?.id) {
      const error = new Error(`Booking database insert failed: ${result.error?.message || 'no database id returned'}`);
      error.code = 'BOOKING_DATABASE_INSERT_FAILED';
      throw error;
    }

    const record = { ...insertRow, ...result.data, client_request_id: clientRequestId, idempotency_key: clientRequestId };
    if (clientRequestId) idempotencyMemory.set(clientRequestId, record.id);
    return record;
  };

  bookingRepository.insertTravellers = async rows => {
    if (!Array.isArray(rows) || !rows.length) return [];
    const { error } = await supabase.from('travellers').insert(rows);
    if (error) throw new Error(`Travellers records insert failed: ${error.message}`);
    return rows;
  };

  bookingRepository.insertContact = async row => {
    const payload = {
      ...row,
      country_code: normalizeCountryCode(row.country_code),
      phone_number: String(row.phone_number || '').slice(0, 50)
    };
    const result = await supabase.from('contacts').insert(payload);
    if (result.error) throw new Error(`Contact record insert failed: ${result.error.message}`);
    return [payload];
  };

  bookingRepository.insertFlights = async rows => {
    if (!Array.isArray(rows) || !rows.length) return [];
    const { error } = await supabase.from('flights').insert(rows);
    if (error) throw new Error(`Flights records insert failed: ${error.message}`);
    return rows;
  };

  bookingRepository.insertPayment = async row => {
    const normalized = { ...row, payment_status: canonicalPaymentStatus(row.payment_status) };
    let result = await supabase.from('payments').insert(normalized);
    if (result.error && schemaDrift(result.error)) {
      const core = {
        booking_id: normalized.booking_id,
        payment_provider: normalized.payment_provider || 'stripe',
        payment_amount: normalized.payment_amount || 0,
        currency: normalized.currency || 'USD',
        payment_status: normalized.payment_status,
        payment_date: normalized.payment_date || new Date().toISOString()
      };
      result = await supabase.from('payments').insert(core);
      if (!result.error) return [core];
    }
    if (result.error) throw new Error(`Payment record insert failed: ${result.error.message}`);
    return [normalized];
  };

  bookingRepository.getPaymentSplits = async bookingId => {
    const result = await safe(
      supabase.from('booking_payment_splits').select(SPLIT_COLUMNS).eq('booking_id', bookingId).order('display_order', { ascending: true }),
      []
    );
    return result.data || [];
  };

  bookingRepository.getCompleteBookingById = async identifier => {
    const start = Date.now();
    const base = await findBase(identifier);
    if (!base) return null;
    const relations = await getRelations(base.id);
    const enriched = bookingRepository.enrichBookingRecord(base, relations);
    const canonical = bookingMapper.toCanonicalModel(base, relations.travellers, relations.contacts, relations.flights, relations.payments, relations.paymentMethod) || {};
    const itinerary = buildCanonicalItinerary(enriched);
    const tripSummary = calculateTripSummary(enriched);
    const emailActivity = buildEmailActivity(base, relations.emailLogs);
    const authorizationStatus = String(base.authorization_status || (base.status === 'AUTHORIZED' ? 'AUTHORIZED' : (base.authorization_token ? 'PENDING' : 'NOT_CREATED'))).toUpperCase();

    return {
      ...enriched,
      ...canonical,
      bookingId: base.confirmation_code || base.id,
      confirmationCode: base.confirmation_code,
      notes: base.internal_notes || '',
      itinerary,
      itinerary_segments: relations.itinerarySegments,
      outbound_segments: itinerary.outbound,
      return_segments: itinerary.return,
      paymentSplits: relations.paymentSplits,
      payment_splits: relations.paymentSplits,
      paymentMethod: relations.paymentMethod,
      payment_method: relations.paymentMethod,
      billingDetails: relations.paymentMethod,
      cardReference: relations.paymentMethod,
      emailActivity,
      email_history: relations.emailLogs,
      auditEvents: [],
      authorization: { ...(canonical.authorization || {}), status: authorizationStatus },
      authorization_status: authorizationStatus,
      authorization_email_status: emailActivity.authorization.status,
      authorization_email_id: emailActivity.authorization.providerMessageId,
      authorization_email_sent_at: emailActivity.authorization.sentAt,
      authorization_email_recipient: emailActivity.authorization.recipient,
      authorization_expires_at: emailActivity.authorization.expiresAt,
      trip_summary: tripSummary,
      tripSummary,
      warnings: [],
      durationMs: Date.now() - start
    };
  };

  bookingRepository.findBookingByCode = async code => bookingRepository.getCompleteBookingById(code);
  bookingRepository.findBookingById = async id => bookingRepository.getCompleteBookingById(id);
  bookingRepository.getByReference = async code => bookingRepository.getCompleteBookingById(code);
  bookingRepository.getById = async id => bookingRepository.getCompleteBookingById(id);

  Object.defineProperty(bookingRepository, '__egressHardeningInstalled', {
    value: true, enumerable: false, configurable: false, writable: false
  });
  logger.info('[EgressHardening] Installed bounded booking read/write repository paths.');
}

install();
export default bookingRepository;
