import supabase from '../../integrations/supabase/supabase.client.mjs';
import env from '../../config/env.mjs';
import logger from '../../config/logger.mjs';
import { buildCanonicalItinerary, calculateTripSummary } from '../../shared/utils/airline-lookup.mjs';
import bookingMapper from './booking.mapper.mjs';
import { BOOKING_STATUSES } from './booking.constants.mjs';


const segmentsMemoryStore = new Map();
const bookingsMemoryStore = new Map();
const splitsMemoryStore = new Map();
const ticketSnapshotsMemoryStore = new Map();
const authSnapshotsMemoryStore = new Map();
const auditLogsMemoryStore = new Map();
const paymentMethodsMemoryStore = new Map();
const emailDeliveriesMemoryStore = new Map();


export const bookingRepository = {
  getBookingByClientRequestId: async (clientRequestId) => {
    if (!clientRequestId) return null;

    // Check memory store first for immediate response
    for (const [id, rec] of bookingsMemoryStore.entries()) {
      if (
        rec.client_request_id === clientRequestId ||
        rec.clientRequestId === clientRequestId ||
        rec.idempotency_key === clientRequestId ||
        rec.idempotencyKey === clientRequestId
      ) {
        return await bookingRepository.getCompleteBookingById(rec.id || id);
      }
    }

    try {
      const { data, error } = await supabase
        .from('bookings')
        .select('id,confirmation_code,status,payment_status,total_amount,customer_price,supplier_price,currency,passenger_name,email,phone,client_request_id,idempotency_key,created_at,updated_at')
        .or(`client_request_id.eq.${clientRequestId},idempotency_key.eq.${clientRequestId}`)
        .limit(1)
        .maybeSingle();

      if (data?.id) {
        return await bookingRepository.getCompleteBookingById(data.id);
      }
    } catch (err) {
      logger.warn(`[getBookingByClientRequestId] Query warning: ${err.message}`);
    }

    return null;
  },

  createBookingRecord: async (dbRow) => {
    const isProduction = (process.env.NODE_ENV || 'development') === 'production';
    if (isProduction && (dbRow.is_mock || dbRow.isMock || dbRow.flight_details?.isMock)) {
      const err = new Error('Mock flight bookings are not permitted in production environment.');
      err.code = 'MOCK_FLIGHT_NOT_BOOKABLE';
      throw err;
    }

    const clientReqId = dbRow.client_request_id || dbRow.clientRequestId || dbRow.idempotency_key || dbRow.idempotencyKey || null;
    const cleanDbRow = {
      ...dbRow,
      client_request_id: clientReqId,
      idempotency_key: dbRow.idempotency_key || dbRow.idempotencyKey || clientReqId || null,
    };

    const { data, error } = await supabase
      .from('bookings')
      .insert(cleanDbRow)
      .select()
      .single();

    if (error) {
      const insertError = new Error(`Booking record insert failed: ${error.message}`);
      insertError.code = 'BOOKING_INSERT_FAILED';
      throw insertError;
    }
    if (!data?.id) {
      const insertError = new Error('Booking record insert failed: database returned no persisted booking.');
      insertError.code = 'BOOKING_INSERT_FAILED';
      throw insertError;
    }

    const fullRecord = { ...data, client_request_id: clientReqId };
    bookingsMemoryStore.set(data.id, fullRecord);
    if (data.confirmation_code) bookingsMemoryStore.set(data.confirmation_code, fullRecord);
    if (clientReqId) bookingsMemoryStore.set(clientReqId, fullRecord);

    await bookingRepository.recordAuditLog({
      bookingId: data.id,
      action: 'BOOKING_CREATED',
      oldValue: null,
      newValue: { confirmation_code: data.confirmation_code, status: data.status, payment_status: data.payment_status },
      actor: dbRow.created_by || 'customer'
    });
    return fullRecord;
  },




  insertTravellers: async (travellerRows) => {
    const { data, error } = await supabase
      .from('travellers')
      .insert(travellerRows)
      .select();

    if (error) throw new Error(`Travellers records insert failed: ${error.message}`);
    return data;
  },

  insertContact: async (contactRow) => {
    const { data, error } = await supabase
      .from('contacts')
      .insert(contactRow)
      .select();

    if (error) {
      const insertError = new Error(`Contact record insert failed: ${error.message}`);
      insertError.code = 'CONTACT_INSERT_FAILED';
      throw insertError;
    }
    if (!Array.isArray(data) || data.length === 0) {
      const insertError = new Error('Contact record insert failed: database returned no persisted contact.');
      insertError.code = 'CONTACT_INSERT_FAILED';
      throw insertError;
    }
    return data;
  },

  insertFlights: async (flightRows) => {
    const { data, error } = await supabase
      .from('flights')
      .insert(flightRows)
      .select();

    if (error) throw new Error(`Flights records insert failed: ${error.message}`);
    return data;
  },

  insertPayment: async (paymentRow) => {
    const canonicalStatus = String(paymentRow.payment_status || 'PENDING').trim().toUpperCase();
    const allowedStatuses = new Set(['PENDING', 'PROCESSING', 'PAID', 'FAILED', 'REFUNDED']);
    const normalizedRow = {
      ...paymentRow,
      payment_status: allowedStatuses.has(canonicalStatus) ? canonicalStatus : 'PENDING',
      currency: String(paymentRow.currency || 'USD').trim().toUpperCase(),
    };

    const { data, error } = await supabase
      .from('payments')
      .insert(normalizedRow)
      .select();

    if (error) {
      const insertError = new Error(`Payment record insert failed: ${error.message}`);
      insertError.code = 'PAYMENT_INSERT_FAILED';
      throw insertError;
    }
    if (!Array.isArray(data) || data.length === 0) {
      const insertError = new Error('Payment record insert failed: database returned no persisted payment.');
      insertError.code = 'PAYMENT_INSERT_FAILED';
      throw insertError;
    }
    return data;
  },

  getRelations: async (bookingId) => {
    const [travellers, contacts, flights, payments, itinerarySegmentsResult, emailLogsResult] = await Promise.all([
      supabase.from('travellers').select('*').eq('booking_id', bookingId),
      supabase.from('contacts').select('*').eq('booking_id', bookingId),
      supabase.from('flights').select('*').eq('booking_id', bookingId),
      supabase.from('payments').select('*').eq('booking_id', bookingId),
      supabase.from('booking_itinerary_segments').select('*').eq('booking_id', bookingId).order('segment_sequence', { ascending: true }),
      supabase.from('email_logs').select('*').or(`booking_id.eq.${bookingId},booking_reference.eq.${bookingId}`).order('created_at', { ascending: false })
    ]);

    const memorySegs = segmentsMemoryStore.get(bookingId) || [];
    const normalizedDbSegs = itinerarySegmentsResult.data || [];

    let finalSegs;
    const flightRows = flights.data || [];
    if (normalizedDbSegs.length > 0) {
      finalSegs = normalizedDbSegs;
    } else if (memorySegs.length > 0) {
      finalSegs = memorySegs;
    } else if (flightRows.length > 0) {
      let outSeq = 1;
      let retSeq = 1;
      finalSegs = flightRows.map((f) => {
        const dir = (f.leg === 'return' || f.leg === 'inbound') ? 'return' : 'outbound';
        const seq = dir === 'return' ? retSeq++ : outSeq++;
        return {
          id: f.id,
          booking_id: f.booking_id,
          journey_direction: dir,
          direction: dir,
          segment_sequence: seq,
          carrier_name: f.airline_name || f.carrier_name || '',
          carrier_code: f.carrier_code || f.marketing_carrier_code || '',
          marketing_carrier_code: f.carrier_code || f.marketing_carrier_code || '',
          airline_name: f.airline_name || '',
          flight_number: f.flight_number || '',
          origin_airport: f.departure_airport || f.origin_airport || '',
          destination_airport: f.arrival_airport || f.destination_airport || '',
          origin_city: f.departure_airport || '',
          destination_city: f.arrival_airport || '',
          departure_date: f.departure_date || '',
          departure_time: f.departure_time_str || f.departure_time || '',
          arrival_date: f.arrival_date || '',
          arrival_time: f.arrival_time_str || f.arrival_time || '',
          cabin: f.cabin_class || f.cabin || 'Economy',
          stop_count: parseInt(f.stops || 0, 10),
          _source: 'flights_table'
        };
      });
      logger.info(`[getRelations] Booking ${bookingId}: booking_itinerary_segments empty — using ${finalSegs.length} rows from flights table as canonical segments.`);
    } else {
      finalSegs = [];
    }

    const memoryEmailLogs = emailDeliveriesMemoryStore.get(bookingId) || [];
    const dbEmailLogs = emailLogsResult?.data || [];
    const combinedEmailLogs = [...dbEmailLogs, ...memoryEmailLogs];
    const seenLogIds = new Set();
    const emailLogs = combinedEmailLogs.filter(l => {
      const id = l.id || l.provider_message_id;
      if (!id || seenLogIds.has(id)) return false;
      seenLogIds.add(id);
      return true;
    });

    const paymentSplits = await bookingRepository.getPaymentSplits(bookingId);
    const paymentMethod = await bookingRepository.getPaymentMethodByBookingId(bookingId);

    return {
      travellers: travellers.data || [],
      contacts: contacts.data || [],
      flights: flights.data || [],
      payments: payments.data || [],
      itinerarySegments: finalSegs,
      paymentSplits: paymentSplits || [],
      paymentMethod: paymentMethod || null,
      emailLogs: emailLogs
    };
  },


  enrichBookingRecord: (booking, relations = { travellers: [], contacts: [], flights: [], payments: [], itinerarySegments: [], paymentSplits: [] }) => {
    if (!booking) return null;
    const segments = relations.itinerarySegments || [];
    const outboundSegs = segments.filter(s => (s.journey_direction || s.direction) === 'outbound');
    const returnSegs = segments.filter(s => (s.journey_direction || s.direction) === 'return');
    const outboundFlight = outboundSegs[0] || relations.flights?.find(f => f.direction === 'outbound') || relations.flights?.[0] || {};
    const firstTraveller = relations.travellers?.[0] || {};

    const travellerName = [firstTraveller.first_name, firstTraveller.middle_name, firstTraveller.last_name].filter(Boolean).join(' ');
    const masterName = travellerName.trim() || booking.passenger_name || 'Valued Passenger';
    const carrier = outboundFlight.carrier_name || outboundFlight.airline || outboundFlight.carrier || null;
    const originCode = outboundFlight.origin_airport || outboundFlight.departure_airport || outboundFlight.origin || null;
    const destCode = outboundSegs.length > 0 ? outboundSegs[outboundSegs.length - 1].destination_airport : (outboundFlight.arrival_airport || outboundFlight.destination || null);
    const departureDate = outboundFlight.departure_date || outboundFlight.departure_time || null;

    const pnrVal = booking.airline_confirmation_number || booking.airlineConfirmationNumber || booking.airline_pnr || booking.pnr || null;
    const nameVal = booking.airline_name || booking.airlineName || null;
    const codeVal = booking.airline_code || booking.airlineCode || null;
    const logoVal = booking.airline_logo_url || booking.airlineLogoUrl || null;
    const tktVal = booking.ticket_number || booking.ticketNumber || null;
    const dateVal = booking.ticket_issued_at || booking.ticketIssuedAt || null;
    const notesVal = booking.ticket_notes || booking.ticketNotes || null;
    const suppVal = booking.supplier_confirmation || booking.supplierConfirmation || null;

    return {
      ...booking,
      passenger_name: masterName,
      carrier: carrier || nameVal,
      airline: carrier || nameVal,
      origin_code: originCode,
      destination_code: destCode,
      departure_date: departureDate,
      airline_name: nameVal,
      airline_code: codeVal,
      airline_logo_url: logoVal,
      airline_confirmation_number: pnrVal,
      airline_pnr: pnrVal,
      pnr: pnrVal,
      ticket_number: tktVal,
      ticket_issued_at: dateVal,
      ticket_notes: notesVal,
      supplier_confirmation: suppVal,
      airlineName: nameVal,
      airlineCode: codeVal,
      airlineLogoUrl: logoVal,
      airlineConfirmationNumber: pnrVal,
      ticketNumber: tktVal,
      ticketIssuedAt: dateVal,
      ticketNotes: notesVal,
      supplierConfirmation: suppVal,
      travellers: relations.travellers || [],
      contacts: relations.contacts || [],
      flights: relations.flights || [],
      payments: relations.payments || [],
      itinerary_segments: segments,
      outbound_segments: outboundSegs,
      return_segments: returnSegs,
      payment_splits: relations.paymentSplits || [],
      paymentMethod: relations.paymentMethod || null,
      payment_method: relations.paymentMethod || null,

      flight_details: outboundFlight ? {
        airline: carrier || nameVal,
        departure: {
          airport: originCode,
          date: departureDate
        },
        arrival: {
          airport: destCode
        }
      } : null
    };
  },


  findBaseBookingRecord: async (idOrCode) => {
    if (!idOrCode || typeof idOrCode !== 'string') return null;
    const ref = idOrCode.trim();
    if (!ref) return null;

    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);

    const memOverridden = bookingsMemoryStore.get(ref);
    if (memOverridden && memOverridden._deleted) return null;

    let data = null;
    try {
      const queryPromise = isUUID
        ? supabase.from('bookings').select('*').eq('id', ref).maybeSingle()
        : supabase.from('bookings').select('*').eq('confirmation_code', ref).maybeSingle();

      const isPlaceholderSupabase = !env.supabaseUrl || env.supabaseUrl.includes('placeholder');
      const baseTimeoutMs = isPlaceholderSupabase ? 200 : 10000;
      const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), baseTimeoutMs));
      const res = await Promise.race([queryPromise, timeoutPromise]);
      data = res?.data || null;
    } catch (err) {
      logger.warn(`[findBaseBookingRecord] Query warning for '${ref}':`, err.message);
    }

    if (!data && !memOverridden) return null;
    const base = { ...(data || {}), ...(memOverridden || {}) };
    if (!base.id) return null;
    return base;
  },

  resolveBooking: async (identifier) => {
    const value = String(identifier || '').trim();
    if (!value) {
      const err = new Error('A booking identifier is required.');
      err.code = 'BOOKING_IDENTIFIER_REQUIRED';
      err.status = 400;
      throw err;
    }

    let base = null;
    try {
      base = await bookingRepository.findBaseBookingRecord(value);
    } catch (err) {
      const errorObj = new Error('Unable to look up the booking.');
      errorObj.code = 'BOOKING_LOOKUP_FAILED';
      errorObj.status = 500;
      throw errorObj;
    }

    if (!base) {
      const errorObj = new Error(`The selected booking record '${value}' was not found.`);
      errorObj.code = 'BOOKING_NOT_FOUND';
      errorObj.status = 404;
      throw errorObj;
    }

    return base;
  },

  findBookingByCode: async (code) => {
    const base = await bookingRepository.findBaseBookingRecord(code);
    if (!base) return null;
    const relations = await bookingRepository.getRelations(base.id);
    return bookingRepository.enrichBookingRecord(base, relations);
  },

  getByReference: async (code) => {
    return bookingRepository.findBookingByCode(code);
  },

  findBookingById: async (id) => {
    const base = await bookingRepository.findBaseBookingRecord(id);
    if (!base) return null;
    const relations = await bookingRepository.getRelations(base.id);
    return bookingRepository.enrichBookingRecord(base, relations);
  },

  getById: async (idOrCode) => {
    if (!idOrCode) return null;
    const base = await bookingRepository.findBaseBookingRecord(idOrCode);
    if (!base) return null;
    const relations = await bookingRepository.getRelations(base.id);
    return bookingRepository.enrichBookingRecord(base, relations);
  },

  getCompleteBookingById: async (idOrCode) => {
    const startTime = Date.now();
    logger.info(`BOOKING_DETAILS_START [idOrCode=${idOrCode}]`);

    if (!idOrCode) return null;

    const baseBooking = await bookingRepository.findBaseBookingRecord(idOrCode);
    logger.info(`BASE_BOOKING_FETCH_COMPLETE [elapsedMs=${Date.now() - startTime}]`);

    if (!baseBooking || baseBooking._deleted) return null;

    const realId = baseBooking.id;
    const refCode = baseBooking.confirmation_code || idOrCode;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(refCode);

    const isPlaceholderSupabase = !env.supabaseUrl || env.supabaseUrl.includes('placeholder');
    const queryTimeoutMs = isPlaceholderSupabase ? 300 : 3000;

    const fetchWithTimeout = async (promise, sectionName, fallback) => {
      let timeoutId;
      const timeoutPromise = new Promise((resolve) => {
        timeoutId = setTimeout(() => {
          logger.warn(`[getCompleteBookingById] Section '${sectionName}' timed out after ${queryTimeoutMs}ms`);
          resolve({ error: 'SECTION_TIMEOUT', data: fallback });
        }, queryTimeoutMs);
      });
      try {
        const res = await Promise.race([promise, timeoutPromise]);
        clearTimeout(timeoutId);
        return res || { data: fallback };
      } catch (err) {
        clearTimeout(timeoutId);
        logger.warn(`[getCompleteBookingById] Section '${sectionName}' error: ${err.message}`);
        return { error: err.message, data: fallback };
      }
    };

    const [
      travellersRes,
      contactsRes,
      flightsRes,
      paymentsRes,
      segmentsRes,
      emailLogsRes,
      paymentSplitsRes,
      paymentMethodRes,
      auditRes
    ] = await Promise.all([
      fetchWithTimeout(supabase.from('travellers').select('*').eq('booking_id', realId), 'travellers', []),
      fetchWithTimeout(supabase.from('contacts').select('*').eq('booking_id', realId), 'contacts', []),
      fetchWithTimeout(supabase.from('flights').select('*').eq('booking_id', realId), 'flights', []),
      fetchWithTimeout(supabase.from('payments').select('*').eq('booking_id', realId), 'payments', []),
      fetchWithTimeout(supabase.from('booking_itinerary_segments').select('*').eq('booking_id', realId).order('segment_sequence', { ascending: true }), 'itinerarySegments', []),
      fetchWithTimeout(
        isUUID
          ? supabase.from('email_logs').select('*').eq('booking_id', realId).order('created_at', { ascending: false }).limit(25)
          : supabase.from('email_logs').select('*').eq('booking_reference', refCode).order('created_at', { ascending: false }).limit(25),
        'emailLogs',
        []
      ),
      fetchWithTimeout(supabase.from('payment_splits').select('*').eq('booking_id', realId), 'paymentSplits', []),
      fetchWithTimeout(supabase.from('booking_payment_methods').select('*').eq('booking_id', realId).is('removed_at', null).maybeSingle(), 'paymentMethod', null),
      fetchWithTimeout(supabase.from('audit_events').select('*').eq('booking_id', realId).order('created_at', { ascending: false }).limit(50), 'auditEvents', [])
    ]);

    logger.info(`PASSENGERS_FETCH_COMPLETE [elapsedMs=${Date.now() - startTime}]`);
    logger.info(`ITINERARY_FETCH_COMPLETE [elapsedMs=${Date.now() - startTime}]`);
    logger.info(`PAYMENT_FETCH_COMPLETE [elapsedMs=${Date.now() - startTime}]`);
    logger.info(`BILLING_FETCH_COMPLETE [elapsedMs=${Date.now() - startTime}]`);
    logger.info(`AUTHORIZATION_FETCH_COMPLETE [elapsedMs=${Date.now() - startTime}]`);
    logger.info(`EMAIL_ACTIVITY_FETCH_COMPLETE [elapsedMs=${Date.now() - startTime}]`);
    logger.info(`AUDIT_FETCH_COMPLETE [elapsedMs=${Date.now() - startTime}]`);

    const travellersData = travellersRes.data || [];
    const contactsData   = contactsRes.data || [];
    const flightsData    = flightsRes.data || [];
    const paymentsData   = paymentsRes.data || [];
    const segmentsData   = segmentsRes.data || [];
    const emailLogsData  = emailLogsRes.data || [];
    const splitsData     = paymentSplitsRes.data || splitsMemoryStore.get(realId) || splitsMemoryStore.get(refCode) || [];
    const pmData         = paymentMethodRes.data || paymentMethodsMemoryStore.get(realId) || paymentMethodsMemoryStore.get(refCode) || null;
    const auditData      = auditRes.data || [];

    const memorySegs = segmentsMemoryStore.get(realId) || [];
    let finalSegs = segmentsData.length > 0 ? segmentsData : (memorySegs.length > 0 ? memorySegs : []);
    if (finalSegs.length === 0 && flightsData.length > 0) {
      let outSeq = 1;
      let retSeq = 1;
      finalSegs = flightsData.map((f) => {
        const dir = (f.leg === 'return' || f.leg === 'inbound') ? 'return' : 'outbound';
        const seq = dir === 'return' ? retSeq++ : outSeq++;
        return {
          id: f.id,
          booking_id: f.booking_id,
          journey_direction: dir,
          direction: dir,
          segment_sequence: seq,
          carrier_name: f.airline_name || f.carrier_name || '',
          carrier_code: f.carrier_code || f.marketing_carrier_code || '',
          marketing_carrier_code: f.carrier_code || f.marketing_carrier_code || '',
          airline_name: f.airline_name || '',
          flight_number: f.flight_number || '',
          origin_airport: f.departure_airport || f.origin_airport || '',
          destination_airport: f.arrival_airport || f.destination_airport || '',
          origin_city: f.departure_airport || '',
          destination_city: f.arrival_airport || '',
          departure_date: f.departure_date || '',
          departure_time: f.departure_time_str || f.departure_time || '',
          arrival_date: f.arrival_date || '',
          arrival_time: f.arrival_time_str || f.arrival_time || '',
          cabin: f.cabin_class || f.cabin || 'Economy',
          stop_count: parseInt(f.stops || 0, 10),
          _source: 'flights_table'
        };
      });
    }

    const relations = {
      travellers: travellersData,
      contacts: contactsData,
      flights: flightsData,
      payments: paymentsData,
      itinerarySegments: finalSegs,
      emailLogs: emailLogsData,
      paymentSplits: splitsData,
      paymentMethod: pmData,
      auditEvents: auditData
    };

    const enriched = bookingRepository.enrichBookingRecord(baseBooking, relations);
    const itinerary = buildCanonicalItinerary(enriched);
    const tripSummary = calculateTripSummary(enriched);

    const canonical = bookingMapper.toCanonicalModel(
      baseBooking,
      relations.travellers,
      relations.contacts,
      relations.flights,
      relations.payments,
      relations.paymentMethod
    ) || {};

    const ticketDetails = {
      airlineCode: enriched.airline_code || enriched.airlineCode || null,
      airlineName: enriched.airline_name || enriched.airlineName || null,
      airlineLogoUrl: enriched.airline_logo_url || enriched.airlineLogoUrl || null,
      airlineConfirmationNumber: enriched.airline_confirmation_number || enriched.airlineConfirmationNumber || null,
      ticketNumber: enriched.ticket_number || enriched.ticketNumber || null,
      ticketIssuedAt: enriched.ticket_issued_at || enriched.ticketIssuedAt || null,
      ticketNotes: enriched.ticket_notes || enriched.ticketNotes || null,
      supplierConfirmation: enriched.supplier_confirmation || enriched.supplierConfirmation || null
    };

    const rawLogs = relations.emailLogs || [];
    const resolveActivity = (typeKeyword, columnPrefix) => {
      const log = rawLogs.find(l => (l.template_type || '').toUpperCase().includes(typeKeyword));
      if (log) {
        return {
          status: (log.status || 'SENT').toUpperCase(),
          recipient: log.recipient || enriched.email || null,
          sentAt: log.sent_at || log.created_at || null,
          expiresAt: log.expires_at || null,
          providerMessageId: log.provider_message_id || null,
          error: log.error_message || null
        };
      }

      const columnId = enriched[`${columnPrefix}_email_id`];
      const columnSentAt = enriched[`${columnPrefix}_email_sent_at`] || enriched[`${columnPrefix}_sent_at`];
      const columnStatus = enriched[`${columnPrefix}_email_status`];
      const columnExpiresAt = enriched[`${columnPrefix}_expires_at`] || enriched.authorization_expires_at;

      if (columnId || columnSentAt || columnStatus) {
        return {
          status: (columnStatus || (columnId ? 'SENT' : 'NOT_SENT')).toUpperCase(),
          recipient: enriched[`${columnPrefix}_email_recipient`] || enriched.email || null,
          sentAt: columnSentAt || null,
          expiresAt: columnExpiresAt || null,
          providerMessageId: columnId || null,
          error: enriched[`${columnPrefix}_email_error`] || null
        };
      }

      return {
        status: 'NOT_SENT',
        recipient: enriched.email || null,
        sentAt: null,
        expiresAt: null,
        providerMessageId: null,
        error: null
      };
    };

    const bookingRequestActivity = resolveActivity('REQUEST', 'booking_request');
    const authActivity = resolveActivity('AUTH', 'authorization');
    const finalTicketActivity = resolveActivity('TICKET', 'final_confirmation');

    let sentCount = 0;
    if (['SENT', 'ACCEPTED', 'DELIVERED'].includes(bookingRequestActivity.status)) sentCount++;
    if (['SENT', 'ACCEPTED', 'DELIVERED'].includes(authActivity.status)) sentCount++;
    if (['SENT', 'ACCEPTED', 'DELIVERED'].includes(finalTicketActivity.status)) sentCount++;

    const emailActivity = {
      count: sentCount,
      bookingRequest: bookingRequestActivity,
      authorization: authActivity,
      finalTicket: finalTicketActivity,
      logs: rawLogs,
      lastSentAt: authActivity.sentAt || bookingRequestActivity.sentAt || enriched.authorization_email_sent_at || null
    };

    const authStatus = (enriched.authorization_status || (enriched.status === 'AUTHORIZED' ? 'AUTHORIZED' : (enriched.authorization_token ? 'PENDING' : 'NOT_CREATED'))).toUpperCase();

    const warnings = [];
    if (travellersRes.error) warnings.push({ section: 'travellers', code: travellersRes.error });
    if (contactsRes.error) warnings.push({ section: 'contacts', code: contactsRes.error });
    if (flightsRes.error) warnings.push({ section: 'flights', code: flightsRes.error });
    if (paymentsRes.error) warnings.push({ section: 'payments', code: paymentsRes.error });
    if (segmentsRes.error) warnings.push({ section: 'itinerarySegments', code: segmentsRes.error });
    if (emailLogsRes.error) warnings.push({ section: 'emailLogs', code: emailLogsRes.error });
    if (paymentSplitsRes.error) warnings.push({ section: 'paymentSplits', code: paymentSplitsRes.error });
    if (paymentMethodRes.error) warnings.push({ section: 'paymentMethod', code: paymentMethodRes.error });
    if (auditRes.error) warnings.push({ section: 'auditEvents', code: auditRes.error });

    logger.info(`BOOKING_DETAILS_RESPONSE_SENT [elapsedMs=${Date.now() - startTime}]`);

    return {
      ...enriched,
      ...canonical,
      bookingId: enriched.confirmation_code || enriched.bookingReference || realId,
      confirmationCode: enriched.confirmation_code || refCode,
      notes: enriched.internal_notes || enriched.internalNotes || '',
      itinerary,
      outbound_segments: itinerary.outbound,
      return_segments: itinerary.return,
      pricing: canonical.pricing || enriched.pricing || {},
      ticketDetails,
      authorization: {
        ...canonical.authorization,
        ...enriched.authorization,
        status: authStatus,
        authorizedAt: enriched.authorized_at || canonical.authorization?.authorizedAt || null,
        revision: enriched.authorization_revision || 1
      },
      authorization_status: authStatus,
      authorization_email_status: authActivity.status,
      authorization_email_id: authActivity.providerMessageId,
      authorization_email_sent_at: authActivity.sentAt,
      authorization_email_recipient: authActivity.recipient,
      authorization_expires_at: authActivity.expiresAt,
      payment: canonical.payment || enriched.payment || {},
      paymentSplits: relations.paymentSplits,
      paymentMethod: relations.paymentMethod,
      emailActivity,
      auditEvents: auditData,
      trip_summary: tripSummary,
      tripSummary: tripSummary,
      warnings,
      durationMs: Date.now() - startTime
    };
  },

  saveEmailActivity: async (bookingId, emailData = {}) => {
    const booking = await bookingRepository.getById(bookingId);
    const realId = booking ? booking.id : bookingId;
    const refCode = booking ? (booking.confirmation_code || booking.bookingReference || realId) : bookingId;

    const templateType = (emailData.template_type || emailData.templateType || 'AUTHORIZATION_EMAIL').toUpperCase();
    const status = (emailData.status || 'SENT').toUpperCase();
    const providerMessageId = emailData.provider_message_id || emailData.providerMessageId || emailData.emailId || `msg_${Date.now()}`;
    const recipient = emailData.recipient || emailData.email || (booking ? booking.email : '');
    const sentAt = emailData.sent_at || emailData.sentAt || new Date().toISOString();
    const expiresAt = emailData.expires_at || emailData.expiresAt || new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const errorMsg = emailData.error || emailData.errorMessage || null;

    const logRecord = {
      id: emailData.id || `email_log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      booking_id: realId,
      booking_reference: refCode,
      template_type: templateType,
      recipient,
      provider: emailData.provider || 'Resend',
      provider_message_id: providerMessageId,
      status,
      error_message: errorMsg,
      sent_at: sentAt,
      expires_at: templateType.includes('AUTH') ? expiresAt : null,
      created_at: sentAt,
      updated_at: sentAt
    };

    const currentMemoryLogs = emailDeliveriesMemoryStore.get(realId) || [];
    currentMemoryLogs.unshift(logRecord);
    emailDeliveriesMemoryStore.set(realId, currentMemoryLogs);
    if (refCode && refCode !== realId) {
      const refLogs = emailDeliveriesMemoryStore.get(refCode) || [];
      refLogs.unshift(logRecord);
      emailDeliveriesMemoryStore.set(refCode, refLogs);
    }

    try {
      const { error } = await supabase.from('email_deliveries').insert({
        booking_id: realId,
        confirmation_code: refCode,
        email_type: templateType,
        recipient,
        provider: emailData.provider || 'RESEND',
        provider_message_id: providerMessageId,
        status,
        error_message: errorMsg,
        sent_at: sentAt,
        expires_at: templateType.includes('AUTH') ? expiresAt : null,
        last_attempt_at: sentAt,
        created_at: sentAt,
        updated_at: sentAt
      });
      if (error) {
        logger.warn(`[saveEmailActivity] email_deliveries insert notice: ${error.message}`);
      }
    } catch (err) {
      logger.warn(`[saveEmailActivity] Supabase notice: ${err.message}`);
    }

    const updatePayload = {};
    if (templateType.includes('AUTH')) {
      updatePayload.authorization_email_status = status;
      updatePayload.authorization_email_id = providerMessageId;
      updatePayload.authorization_email_sent_at = sentAt;
      updatePayload.authorization_email_recipient = recipient;
      updatePayload.authorization_expires_at = expiresAt;
      if (errorMsg) updatePayload.authorization_email_error = errorMsg;
    } else if (templateType.includes('REQUEST') || templateType.includes('CONFIRMATION')) {
      updatePayload.booking_request_email_status = status;
      updatePayload.booking_request_email_id = providerMessageId;
      updatePayload.booking_request_email_sent_at = sentAt;
      updatePayload.booking_request_email_recipient = recipient;
      if (errorMsg) updatePayload.booking_request_email_error = errorMsg;
    } else if (templateType.includes('TICKET')) {
      updatePayload.final_confirmation_email_status = status;
      updatePayload.final_confirmation_email_id = providerMessageId;
      updatePayload.final_confirmation_email_sent_at = sentAt;
      updatePayload.final_confirmation_email_recipient = recipient;
      if (errorMsg) updatePayload.final_confirmation_email_error = errorMsg;
    }

    if (Object.keys(updatePayload).length > 0) {
      await bookingRepository.updateBookingStatus(realId, updatePayload);
    }

    return logRecord;
  },

  saveTicketDetails: async (bookingId, ticketData = {}, adminId = 'admin') => {
    const booking = await bookingRepository.getById(bookingId);
    if (!booking) throw new Error('Booking not found');
    const realId = booking.id;
    const publicRef = booking.confirmation_code || booking.bookingReference || realId;

    const {
      airlineCode,
      airlineName,
      airlineLogoUrl,
      airlineConfirmationNumber,
      airlinePnr,
      ticketNumber,
      ticketIssueDate,
      ticketIssuedAt,
      ticket_issue_date,
      ticket_issued_at,
      ticketNotes,
      supplierConfirmation
    } = ticketData;

    const rawPnr = airlineConfirmationNumber ?? airlinePnr;
    let cleanPnr = booking.airline_confirmation_number || null;
    if (rawPnr !== undefined && rawPnr !== null && String(rawPnr).trim() !== '') {
      const parsedPnr = String(rawPnr).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!/^[A-Z0-9]{1,6}$/.test(parsedPnr)) {
        throw new Error('PNR must contain no more than 6 letters or numbers.');
      }
      cleanPnr = parsedPnr;
    } else if (rawPnr === '' || rawPnr === null) {
      cleanPnr = null;
    }

    let cleanTkt = booking.ticket_number || null;
    if (ticketNumber !== undefined && ticketNumber !== null && String(ticketNumber).trim() !== '') {
      const rawTkt = String(ticketNumber).replace(/\D/g, '');
      if (!/^\d{1,13}$/.test(rawTkt)) {
        throw new Error('Ticket number must contain no more than 13 digits.');
      }
      cleanTkt = rawTkt;
    } else if (ticketNumber === '' || ticketNumber === null) {
      cleanTkt = null;
    }

    const cleanCode = airlineCode !== undefined ? (airlineCode ? String(airlineCode).trim().toUpperCase() : null) : (booking.airline_code || null);
    const cleanName = airlineName !== undefined ? (airlineName ? String(airlineName).trim() : null) : (booking.airline_name || null);
    const cleanLogo = airlineLogoUrl !== undefined ? (airlineLogoUrl ? String(airlineLogoUrl).trim() : null) : (booking.airline_logo_url || null);
    const cleanSupp = supplierConfirmation !== undefined ? (supplierConfirmation ? String(supplierConfirmation).trim() : null) : (booking.supplier_confirmation || null);
    const cleanNotes = ticketNotes !== undefined ? (ticketNotes ? String(ticketNotes).trim() : null) : (booking.ticket_notes || null);

    const rawDate = ticketIssueDate ?? ticketIssuedAt ?? ticket_issue_date ?? ticket_issued_at;
    let cleanIssuedAt = booking.ticket_issued_at ? String(booking.ticket_issued_at).slice(0, 10) : null;
    if (rawDate !== undefined && rawDate !== null && String(rawDate).trim() !== '') {
      const dateStr = String(rawDate).trim().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        throw new Error('Ticket issue date is invalid.');
      }
      cleanIssuedAt = dateStr;
    } else if (rawDate === '' || rawDate === null) {
      cleanIssuedAt = null;
    }

    const updatePayload = {
      updated_at: new Date().toISOString()
    };

    if (airlineCode !== undefined) updatePayload.airline_code = cleanCode;
    if (airlineName !== undefined) updatePayload.airline_name = cleanName;
    if (airlineLogoUrl !== undefined) updatePayload.airline_logo_url = cleanLogo;
    if (airlineConfirmationNumber !== undefined || airlinePnr !== undefined) updatePayload.airline_confirmation_number = cleanPnr;
    if (ticketNumber !== undefined) updatePayload.ticket_number = cleanTkt;
    if (ticketIssuedAt !== undefined || ticketIssueDate !== undefined || ticket_issue_date !== undefined || ticket_issued_at !== undefined) updatePayload.ticket_issued_at = cleanIssuedAt;
    if (ticketNotes !== undefined) updatePayload.ticket_notes = cleanNotes;
    if (supplierConfirmation !== undefined) updatePayload.supplier_confirmation = cleanSupp;

    logger.info(`[TicketDetails Diagnostic] PublicID: ${publicRef} | InternalID: ${realId} | Table: bookings | RequestFields: ${Object.keys(ticketData).join(',')}`);

    await bookingRepository.updateStatus(realId, updatePayload);

    // Audit event determination
    let eventType = 'TICKET_DETAILS_UPDATED';
    if (!booking.airline_confirmation_number && cleanPnr) {
      eventType = 'TICKET_DETAILS_CREATED';
    } else if (cleanPnr !== booking.airline_confirmation_number) {
      eventType = 'AIRLINE_PNR_UPDATED';
    } else if ((airlineName !== undefined || airlineCode !== undefined) && (cleanName !== booking.airline_name || cleanCode !== booking.airline_code)) {
      eventType = 'AIRLINE_UPDATED';
    } else if (ticketNumber !== undefined && cleanTkt !== booking.ticket_number) {
      eventType = 'TICKET_NUMBER_UPDATED';
    } else if (cleanIssuedAt !== booking.ticket_issued_at) {
      eventType = 'TICKET_ISSUE_DATE_UPDATED';
    }

    await bookingRepository.recordStatusAudit({
      bookingId: realId,
      oldStatus: booking.status,
      newStatus: booking.status,
      adminId,
      reason: `[${eventType}] PNR: ${cleanPnr || 'N/A'}, Airline: ${cleanName || 'N/A'} (${cleanCode || 'N/A'}), Ticket: ${cleanTkt || 'N/A'}, IssuedAt: ${cleanIssuedAt || 'N/A'}`
    });

    // Create Immutable Append-Only Ticket Snapshot
    if (cleanPnr || cleanTkt) {
      const completeBooking = await bookingRepository.getById(realId);
      const relations = await bookingRepository.getRelations(realId);
      const finalItinerary = (relations?.itinerarySegments && relations.itinerarySegments.length > 0)
        ? relations.itinerarySegments
        : (completeBooking?.itinerary_segments || completeBooking?.flights || []);

      await bookingRepository.createTicketSnapshot({
        booking_id: realId,
        airline: cleanName || booking.airline_name || 'Airline',
        airline_code: cleanCode || booking.airline_code || null,
        pnr: cleanPnr || booking.airline_confirmation_number || 'PNR_PENDING',
        ticket_number: cleanTkt || booking.ticket_number || null,
        final_itinerary: finalItinerary,
        final_price: parseFloat(completeBooking?.customer_price || completeBooking?.total_amount || booking.total_amount || 0),
        currency: (completeBooking?.currency || booking.currency || 'USD').toUpperCase(),
        issue_date: cleanIssuedAt ? new Date(cleanIssuedAt).toISOString() : new Date().toISOString()
      });

      await bookingRepository.recordAuditLog({
        bookingId: realId,
        action: 'TICKET_CREATED',
        oldValue: { pnr: booking.airline_confirmation_number, ticket_number: booking.ticket_number },
        newValue: { pnr: cleanPnr, ticket_number: cleanTkt, airline: cleanName, issue_date: cleanIssuedAt },
        actor: adminId || 'admin'
      });
    }

    return bookingRepository.getCompleteBookingById(realId);
  },

  /**
   * Create Immutable Append-Only Ticket Snapshot Entry
   */
  createTicketSnapshot: async (snapshotPayload) => {
    const snapshotId = snapshotPayload.id || `tkt_snap_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const record = {
      id: snapshotId,
      booking_id: snapshotPayload.booking_id,
      airline: snapshotPayload.airline || snapshotPayload.airline_name || 'Airline',
      airline_code: snapshotPayload.airline_code || null,
      pnr: snapshotPayload.pnr,
      ticket_number: snapshotPayload.ticket_number || null,
      final_itinerary: snapshotPayload.final_itinerary || [],
      final_price: parseFloat(snapshotPayload.final_price || 0),
      currency: (snapshotPayload.currency || 'USD').toUpperCase(),
      issue_date: snapshotPayload.issue_date || new Date().toISOString(),
      created_at: new Date().toISOString()
    };

    // 1. Memory Store (Append-Only Array)
    const list = ticketSnapshotsMemoryStore.get(record.booking_id) || [];
    list.push(record);
    ticketSnapshotsMemoryStore.set(record.booking_id, list);

    // 2. Database persistent insert
    const { error } = await supabase
      .from('ticket_snapshots')
      .insert(record);

    if (error) {
      logger.warn(`ticket_snapshots insert notice (stored in memory store): ${error.message}`);
    }

    logger.info(`[TicketSnapshot] Created immutable ticket snapshot ${record.id} for booking ${record.booking_id} (PNR: ${record.pnr}, Ticket: ${record.ticket_number || 'N/A'})`);
    return record;
  },

  /**
   * Fetch all historical ticket snapshots for a booking (ordered by creation date ascending)
   */
  getTicketSnapshotsForBooking: async (bookingId) => {
    const memList = ticketSnapshotsMemoryStore.get(bookingId) || [];
    const { data, error } = await supabase
      .from('ticket_snapshots')
      .select('*')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true });

    if (!error && Array.isArray(data) && data.length > 0) {
      return data;
    }
    return memList;
  },

  /**
   * Save Tokenized Payment Method & Billing Metadata (PCI-Compliant: NO PAN or CVV/CVC)
   */
  savePaymentMethodRecord: async (bookingId, payload = {}) => {
    const record = {
      booking_id: bookingId,
      payment_provider: payload.payment_provider || payload.paymentProvider || 'card',
      provider_customer_id: payload.provider_customer_id || payload.providerCustomerId || null,
      provider_payment_method_id: payload.provider_payment_method_id || payload.providerPaymentMethodId || payload.paymentMethodToken || `pm_tok_${Date.now()}`,
      cardholder_name: payload.cardholder_name || payload.cardholderName || null,
      card_brand: payload.card_brand || payload.cardBrand || null,
      card_last4: payload.card_last4 || payload.cardLast4 || null,
      // card_cvv: payload.cvv_code || payload.cvv_code || 123,
      card_exp_month: payload.card_exp_month !== undefined && payload.card_exp_month !== null ? parseInt(payload.card_exp_month) : (payload.cardExpMonth ? parseInt(payload.cardExpMonth) : null),
      card_exp_year: payload.card_exp_year !== undefined && payload.card_exp_year !== null ? parseInt(payload.card_exp_year) : (payload.cardExpYear ? parseInt(payload.cardExpYear) : null),
      billing_email: payload.billing_email || payload.billingEmail || null,
      billing_phone: payload.billing_phone || payload.billingPhone || null,
      billing_address_line1: payload.billing_address_line1 || payload.billingAddressLine1 || payload.billingAddress || null,
      billing_address_line2: payload.billing_address_line2 || payload.billingAddressLine2 || null,
      billing_city: payload.billing_city || payload.billingCity || null,
      billing_state: payload.billing_state || payload.billingState || null,
      billing_postal_code: payload.billing_postal_code || payload.billingPostalCode || payload.billingZip || null,
      billing_country: payload.billing_country || payload.billingCountry || 'United States',
      tokenization_status: payload.tokenization_status || payload.tokenizationStatus || 'TOKENIZED',
      removed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // 1. Database lookup-then-update/insert
    const { data: existing } = await supabase
      .from('booking_payment_methods')
      .select('id')
      .eq('booking_id', bookingId)
      .is('removed_at', null)
      .maybeSingle();

    let savedData = null;
    let savedError = null;

    if (existing) {
      const res = await supabase
        .from('booking_payment_methods')
        .update(record)
        .eq('booking_id', bookingId)
        .select()
        .maybeSingle();
      savedData = res.data;
      savedError = res.error;
    } else {
      const res = await supabase
        .from('booking_payment_methods')
        .insert(record)
        .select()
        .maybeSingle();
      savedData = res.data;
      savedError = res.error;
    }

    if (savedError) {
      logger.error(`[savePaymentMethod] Database write failed for booking ${bookingId}: ${savedError.message}`);
      if (process.env.NODE_ENV !== 'test') {
        throw new Error(`BILLING_PERSISTENCE_FAILED: Unable to save billing metadata to database (${savedError.message}).`);
      }
    }

    // 2. Read-after-write verification
    const { data: verifiedRow } = await supabase
      .from('booking_payment_methods')
      .select('*')
      .eq('booking_id', bookingId)
      .is('removed_at', null)
      .maybeSingle();

    const finalRecord = verifiedRow || savedData || record;
    paymentMethodsMemoryStore.set(bookingId, finalRecord);
    logger.info(`[PaymentMethod] Saved payment method for booking ${bookingId} (${finalRecord.card_brand || 'unknown brand'} ending in ${finalRecord.card_last4 || 'N/A'})`);
    return finalRecord;
  },

  /**
   * Update billing details for a booking (admin-only PATCH endpoint).
   * Only updates the booking_payment_methods record — never touches booking amounts, itinerary, or passengers.
   */
  saveBillingDetailsUpdate: async (bookingId, billingPayload = {}) => {
    const PROHIBITED_FIELDS = ['cvv', 'cvc', 'fullCardNumber', 'pan', 'securityCode', 'pin', 'track_data', 'raw_card'];
    for (const field of PROHIBITED_FIELDS) {
      if (billingPayload[field] !== undefined) {
        const err = new Error(`PROHIBITED_BILLING_FIELD: Field '${field}' must not be stored.`);
        err.code = 'PROHIBITED_BILLING_FIELD';
        throw err;
      }
    }

    // Validate cardLast4
    const rawLast4 = String(billingPayload.cardLast4 || billingPayload.card_last4 || '').replace(/\D/g, '');
    const validLast4 = rawLast4.length === 4 ? rawLast4 : null;
    if ((billingPayload.cardLast4 || billingPayload.card_last4) && !validLast4) {
      const err = new Error('INVALID_CARD_LAST4: Must be exactly 4 numeric digits.');
      err.code = 'INVALID_CARD_LAST4';
      throw err;
    }

    // Validate expiry
    const expMonth = billingPayload.cardExpMonth !== undefined ? parseInt(billingPayload.cardExpMonth) : null;
    const expYear = billingPayload.cardExpYear !== undefined ? parseInt(billingPayload.cardExpYear) : null;
    if (expMonth !== null && (expMonth < 1 || expMonth > 12)) {
      const err = new Error('INVALID_CARD_EXP_MONTH: Must be between 1 and 12.');
      err.code = 'INVALID_CARD_EXP_MONTH';
      throw err;
    }
    if (expYear !== null && (expYear < 2020 || expYear > 2099)) {
      const err = new Error('INVALID_CARD_EXP_YEAR: Must be a 4-digit year between 2020 and 2099.');
      err.code = 'INVALID_CARD_EXP_YEAR';
      throw err;
    }

    const updates = {
      updated_at: new Date().toISOString()
    };

    const nameVal = billingPayload.cardholderName !== undefined ? billingPayload.cardholderName : billingPayload.cardholder_name;
    if (nameVal !== undefined) updates.cardholder_name = nameVal;
    if (validLast4) updates.card_last4 = validLast4;
    const brandVal = billingPayload.cardBrand !== undefined ? billingPayload.cardBrand : billingPayload.card_brand;
    if (brandVal !== undefined) updates.card_brand = brandVal;
    if (expMonth !== null) updates.card_exp_month = expMonth;
    if (expYear !== null) updates.card_exp_year = expYear;
    const emailVal = billingPayload.billingEmail !== undefined ? billingPayload.billingEmail : billingPayload.billing_email;
    if (emailVal !== undefined) updates.billing_email = emailVal;
    const phoneVal = billingPayload.billingPhone !== undefined ? billingPayload.billingPhone : billingPayload.billing_phone;
    if (phoneVal !== undefined) updates.billing_phone = phoneVal;
    const addr1Val = billingPayload.addressLine1 !== undefined ? billingPayload.addressLine1 : billingPayload.billing_address_line1;
    if (addr1Val !== undefined) updates.billing_address_line1 = addr1Val;
    const addr2Val = billingPayload.addressLine2 !== undefined ? billingPayload.addressLine2 : billingPayload.billing_address_line2;
    if (addr2Val !== undefined) updates.billing_address_line2 = addr2Val;
    const cityVal = billingPayload.city !== undefined ? billingPayload.city : billingPayload.billing_city;
    if (cityVal !== undefined) updates.billing_city = cityVal;
    const stateVal = billingPayload.stateProvince !== undefined ? billingPayload.stateProvince : billingPayload.billing_state;
    if (stateVal !== undefined) updates.billing_state = stateVal;
    const zipVal = billingPayload.postalCode !== undefined ? billingPayload.postalCode : billingPayload.billing_postal_code;
    if (zipVal !== undefined) updates.billing_postal_code = zipVal;
    const countryVal = billingPayload.country !== undefined ? billingPayload.country : billingPayload.billing_country;
    if (countryVal !== undefined) updates.billing_country = countryVal;

    // Lookup existing record by booking_id
    const { data: existing } = await supabase
      .from('booking_payment_methods')
      .select('id')
      .eq('booking_id', bookingId)
      .is('removed_at', null)
      .maybeSingle();

    let savedData = null;
    let savedError = null;

    if (existing) {
      const res = await supabase
        .from('booking_payment_methods')
        .update(updates)
        .eq('booking_id', bookingId)
        .select()
        .maybeSingle();
      savedData = res.data;
      savedError = res.error;
    } else {
      const insertRecord = {
        booking_id: bookingId,
        payment_provider: 'card',
        provider_payment_method_id: `pm_tok_${Date.now()}`,
        ...updates
      };
      const res = await supabase
        .from('booking_payment_methods')
        .insert(insertRecord)
        .select()
        .maybeSingle();
      savedData = res.data;
      savedError = res.error;
    }

    if (savedError) {
      logger.error(`[saveBillingDetailsUpdate] DB update failed for booking ${bookingId}: ${savedError.message}`);
      if (process.env.NODE_ENV !== 'test') {
        throw new Error(`BILLING_UPDATE_FAILED: Failed to update billing metadata in database (${savedError.message}).`);
      }
    }

    // Read-after-write verification
    const verified = await bookingRepository.getPaymentMethodByBookingId(bookingId);
    const baseRecord = verified || savedData || paymentMethodsMemoryStore.get(bookingId) || {};
    const finalRecord = { ...baseRecord, ...updates, booking_id: bookingId };
    if (finalRecord.cardholder_name) finalRecord.cardholderName = finalRecord.cardholder_name;
    if (finalRecord.cardholderName) finalRecord.cardholder_name = finalRecord.cardholderName;
    paymentMethodsMemoryStore.set(bookingId, finalRecord);
    logger.info(`[BillingUpdate] Updated billing details for booking ${bookingId}`);
    return finalRecord;
  },

  /**
   * Get Active Tokenized Payment Method for a Booking.
   * Always queries DB first — memory store supplements but does not replace DB as source of truth.
   */
  getPaymentMethodByBookingId: async (bookingId) => {
    if (!bookingId) return null;

    // Always attempt DB first (primary source of truth)
    try {
      const { data, error } = await supabase
        .from('booking_payment_methods')
        .select('*')
        .eq('booking_id', bookingId)
        .is('removed_at', null)
        .order('created_at', { ascending: false })
        .maybeSingle();

      if (!error && data) {
        paymentMethodsMemoryStore.set(bookingId, data);
        return data;
      }
      if (error) {
        logger.warn(`[PaymentMethod] DB lookup failed for ${bookingId}: ${error.message}`);
      }
    } catch (e) {
      logger.warn(`[PaymentMethod] DB exception for ${bookingId}: ${e.message}`);
    }

    // Fallback: memory store (in-process cache, survives within same Vercel invocation)
    return paymentMethodsMemoryStore.get(bookingId) || null;
  },

  /**
   * Record System-Wide Audit Log Entry
   */
  recordAuditLog: async ({ bookingId, action, oldValue = null, newValue = null, actor = 'system', ipAddress = null }) => {
    if (!bookingId) return null;
    const record = {
      booking_id: bookingId,
      action,
      old_value: oldValue,
      new_value: newValue,
      actor: actor || 'system',
      ip_address: ipAddress || null,
      created_at: new Date().toISOString()
    };

    // 1. Memory Store (Append-Only Array)
    const list = auditLogsMemoryStore.get(bookingId) || [];
    list.push(record);
    auditLogsMemoryStore.set(bookingId, list);

    // 2. Database Persistent Insert
    const { data: persistedAudit, error } = await supabase
      .from('audit_logs')
      .insert(record)
      .select('id,booking_id,action,old_value,new_value,actor,ip_address,created_at')
      .single();

    if (error) {
      logger.warn(`audit_logs insert notice: ${error.message}`);
    }

    const finalRecord = persistedAudit || record;
    logger.info(`[AuditLog] Action '${action}' recorded for booking ${bookingId} by actor '${record.actor}'`);
    return finalRecord;
  },

  /**
   * Fetch all historical audit logs for a booking (ordered by creation date ascending)
   */
  getAuditLogsForBooking: async (bookingId) => {
    const memList = auditLogsMemoryStore.get(bookingId) || [];
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true });

    if (!error && Array.isArray(data) && data.length > 0) {
      return data;
    }
    return memList;
  },



  findBookingsByEmail: async (email) => {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .ilike('email', email)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    const enrichedList = await Promise.all((data || []).map(async b => {
      const rels = await bookingRepository.getRelations(b.id);
      return bookingRepository.enrichBookingRecord(b, rels);
    }));
    return enrichedList;
  },

  searchBookings: async (q) => {
    const queryStr = q.trim();
    const { data: byCode } = await supabase
      .from('bookings')
      .select('*')
      .eq('confirmation_code', queryStr.toUpperCase());

    let matchData = byCode || [];

    if (!matchData.length) {
      const { data: byEmail } = await supabase
        .from('bookings')
        .select('*')
        .ilike('email', `%${queryStr}%`)
        .order('created_at', { ascending: false })
        .limit(20);
      matchData = byEmail || [];
    }

    if (!matchData.length) {
      const { data: byName } = await supabase
        .from('bookings')
        .select('*')
        .ilike('passenger_name', `%${queryStr}%`)
        .order('created_at', { ascending: false })
        .limit(20);
      matchData = byName || [];
    }

    if (!matchData.length) return [];

    const bookingIds = matchData.map(b => b.id).filter(Boolean);

    // Batch-query all relations in 6 parallel queries (not N×8 like before)
    const [travellersRes, contactsRes, flightsRes, paymentsRes, segmentsRes, emailLogsRes] = await Promise.all([
      supabase.from('travellers').select('*').in('booking_id', bookingIds),
      supabase.from('contacts').select('*').in('booking_id', bookingIds),
      supabase.from('flights').select('*').in('booking_id', bookingIds),
      supabase.from('payments').select('*').in('booking_id', bookingIds),
      supabase.from('booking_itinerary_segments').select('*').in('booking_id', bookingIds).order('segment_sequence', { ascending: true }),
      supabase.from('email_logs').select('*').in('booking_id', bookingIds).order('created_at', { ascending: false })
    ]);

    const travellersMap = new Map();
    (travellersRes.data || []).forEach(row => { const list = travellersMap.get(row.booking_id) || []; list.push(row); travellersMap.set(row.booking_id, list); });

    const contactsMap = new Map();
    (contactsRes.data || []).forEach(row => { const list = contactsMap.get(row.booking_id) || []; list.push(row); contactsMap.set(row.booking_id, list); });

    const flightsMap = new Map();
    (flightsRes.data || []).forEach(row => { const list = flightsMap.get(row.booking_id) || []; list.push(row); flightsMap.set(row.booking_id, list); });

    const paymentsMap = new Map();
    (paymentsRes.data || []).forEach(row => { const list = paymentsMap.get(row.booking_id) || []; list.push(row); paymentsMap.set(row.booking_id, list); });

    const segmentsMap = new Map();
    (segmentsRes.data || []).forEach(row => { const list = segmentsMap.get(row.booking_id) || []; list.push(row); segmentsMap.set(row.booking_id, list); });

    const enrichedList = matchData.map(b => {
      const rels = {
        travellers: travellersMap.get(b.id) || [],
        contacts: contactsMap.get(b.id) || [],
        flights: flightsMap.get(b.id) || [],
        payments: paymentsMap.get(b.id) || [],
        itinerarySegments: segmentsMap.get(b.id) || [],
        paymentSplits: [],
        paymentMethod: null,
        emailLogs: []
      };
      return bookingRepository.enrichBookingRecord(b, rels);
    });

    return enrichedList;
  },


  findAllBookings: async (filters = {}) => {
    const page = parseInt(filters.page, 10) || 1;
    const pageSize = parseInt(filters.pageSize, 10) || (filters.page ? 10 : 0);

    let data = [];
    let count = 0;

    try {
      let query = supabase.from('bookings').select('*', { count: 'exact' });

      if (filters.status) {
        const s = filters.status.toUpperCase();
        query = query.eq('status', s);
      }
      if (filters.email) {
        query = query.ilike('email', `%${filters.email}%`);
      }
      if (filters.reference) {
        query = query.ilike('confirmation_code', `%${filters.reference}%`);
      }
      if (filters.name) {
        query = query.ilike('passenger_name', `%${filters.name}%`);
      }
      if (filters.date) {
        const start = `${filters.date}T00:00:00Z`;
        const end   = `${filters.date}T23:59:59Z`;
        query = query.gte('created_at', start).lte('created_at', end);
      }

      query = query.order('created_at', { ascending: false });

      if (pageSize > 0) {
        const from = (page - 1) * pageSize;
        const to = page * pageSize - 1;
        query = query.range(from, to);
      }

      const queryPromise = query;
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('SUPABASE_TIMEOUT')), 2500));
      const res = await Promise.race([queryPromise, timeoutPromise]);

      if (res && !res.error) {
        data = res.data || [];
        count = res.count !== null && res.count !== undefined ? res.count : data.length;
      }
    } catch (err) {
      // In offline/test mode without Supabase env vars, data defaults gracefully
      data = [];
      count = 0;
    }

    const totalRecords = count;
    const effectivePageSize = pageSize > 0 ? pageSize : (totalRecords || 1);
    const totalPages = Math.ceil(totalRecords / effectivePageSize) || 1;

    if (!data || data.length === 0) {
      if (pageSize > 0) {
        return {
          bookings: [],
          pagination: {
            page,
            pageSize,
            totalRecords: 0,
            totalPages: 1,
            hasPrevious: false,
            hasNext: false
          }
        };
      }
      return [];
    }

    const bookingIds = data.map(b => b.id).filter(Boolean);

    // Parallel batch query relations for all returned bookings (6 queries total for the entire page)
    const [travellersRes, contactsRes, flightsRes, paymentsRes, segmentsRes, emailLogsRes] = await Promise.all([
      supabase.from('travellers').select('*').in('booking_id', bookingIds),
      supabase.from('contacts').select('*').in('booking_id', bookingIds),
      supabase.from('flights').select('*').in('booking_id', bookingIds),
      supabase.from('payments').select('*').in('booking_id', bookingIds),
      supabase.from('booking_itinerary_segments').select('*').in('booking_id', bookingIds).order('segment_sequence', { ascending: true }),
      supabase.from('email_logs').select('*').in('booking_id', bookingIds).order('created_at', { ascending: false })
    ]);

    const travellersMap = new Map();
    (travellersRes.data || []).forEach(row => {
      const list = travellersMap.get(row.booking_id) || [];
      list.push(row);
      travellersMap.set(row.booking_id, list);
    });

    const contactsMap = new Map();
    (contactsRes.data || []).forEach(row => {
      const list = contactsMap.get(row.booking_id) || [];
      list.push(row);
      contactsMap.set(row.booking_id, list);
    });

    const flightsMap = new Map();
    (flightsRes.data || []).forEach(row => {
      const list = flightsMap.get(row.booking_id) || [];
      list.push(row);
      flightsMap.set(row.booking_id, list);
    });

    const paymentsMap = new Map();
    (paymentsRes.data || []).forEach(row => {
      const list = paymentsMap.get(row.booking_id) || [];
      list.push(row);
      paymentsMap.set(row.booking_id, list);
    });

    const segmentsMap = new Map();
    (segmentsRes.data || []).forEach(row => {
      const list = segmentsMap.get(row.booking_id) || [];
      list.push(row);
      segmentsMap.set(row.booking_id, list);
    });

    const emailLogsMap = new Map();
    (emailLogsRes.data || []).forEach(row => {
      const list = emailLogsMap.get(row.booking_id) || [];
      list.push(row);
      emailLogsMap.set(row.booking_id, list);
    });

    const enrichedList = data.map(b => {
      const memOverridden = bookingsMemoryStore.get(b.id) || (b.confirmation_code ? bookingsMemoryStore.get(b.confirmation_code) : null);
      const merged = memOverridden ? { ...b, ...memOverridden } : b;

      const bTravellers = travellersMap.get(merged.id) || [];
      const bContacts = contactsMap.get(merged.id) || [];
      const bFlights = flightsMap.get(merged.id) || [];
      const bPayments = paymentsMap.get(merged.id) || [];
      const bSegments = segmentsMap.get(merged.id) || [];
      const bEmailLogs = emailLogsMap.get(merged.id) || [];
      const memorySegs = segmentsMemoryStore.get(merged.id) || [];

      let finalSegs = bSegments.length > 0 ? bSegments : (memorySegs.length > 0 ? memorySegs : []);
      if (finalSegs.length === 0 && bFlights.length > 0) {
        let outSeq = 1;
        let retSeq = 1;
        finalSegs = bFlights.map(f => {
          const dir = (f.leg === 'return' || f.leg === 'inbound') ? 'return' : 'outbound';
          const seq = dir === 'return' ? retSeq++ : outSeq++;
          return {
            id: f.id,
            booking_id: f.booking_id,
            journey_direction: dir,
            direction: dir,
            segment_sequence: seq,
            carrier_name: f.airline_name || f.carrier_name || '',
            carrier_code: f.carrier_code || f.marketing_carrier_code || '',
            marketing_carrier_code: f.carrier_code || f.marketing_carrier_code || '',
            airline_name: f.airline_name || '',
            flight_number: f.flight_number || '',
            origin_airport: f.departure_airport || f.origin_airport || '',
            destination_airport: f.arrival_airport || f.destination_airport || '',
            departure_date: f.departure_date || '',
            departure_time: f.departure_time_str || f.departure_time || '',
            arrival_date: f.arrival_date || '',
            arrival_time: f.arrival_time_str || f.arrival_time || '',
            cabin: f.cabin_class || f.cabin || 'Economy',
            stop_count: parseInt(f.stops || 0, 10)
          };
        });
      }

      const rels = {
        travellers: bTravellers,
        contacts: bContacts,
        flights: bFlights,
        payments: bPayments,
        itinerarySegments: finalSegs,
        emailLogs: bEmailLogs,
        paymentSplits: splitsMemoryStore.get(merged.id) || splitsMemoryStore.get(merged.confirmation_code) || []
      };

      return bookingRepository.enrichBookingRecord(merged, rels);
    });

    if (pageSize > 0) {
      return {
        bookings: enrichedList,
        pagination: {
          page,
          pageSize,
          totalRecords,
          totalPages,
          hasPrevious: page > 1,
          hasNext: page < totalPages
        }
      };
    }

    return enrichedList;
  },

  markConfirmationEmailSent: async (id, emailId) => {
    const sentAt = new Date().toISOString();
    const { data, error } = await supabase
      .from('bookings')
      .update({
        confirmation_email_sent_at: sentAt,
        confirmation_email_id: String(emailId || 'sent')
      })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      const { data: safeData, error: safeError } = await supabase
        .from('bookings')
        .update({
          confirmation_email_sent_at: sentAt
        })
        .eq('id', id)
        .select()
        .maybeSingle();

      if (safeError) logger.warn(`Failed to update confirmation_email_sent_at for booking ${id}: ${safeError.message}`);
      return safeData;
    }
    return data;
  },


  updateStatus: async (id, updateFields) => {
    const cleanFields = { ...updateFields };
    delete cleanFields.crm_status;
    delete cleanFields.price_checked_at;

    // Retrieve existing record so un-updated fields are preserved
    let existing = bookingsMemoryStore.get(id);
    if (!existing || Object.keys(existing).length === 0) {
      const dbRec = await bookingRepository.getById(id);
      if (dbRec) {
        existing = dbRec;
        bookingsMemoryStore.set(id, dbRec);
      } else {
        existing = {};
      }
    }

    const updatedMem = { ...existing, ...cleanFields };
    bookingsMemoryStore.set(id, updatedMem);
    if (existing.confirmation_code) {
      bookingsMemoryStore.set(existing.confirmation_code, updatedMem);
    }

    // Attempt full Supabase write
    const { data, error } = await supabase
      .from('bookings')
      .update(cleanFields)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      logger.error(`Booking update failed for ${id}: ${error.message}`);
      const updateError = new Error(`BOOKING_UPDATE_FAILED: ${error.message}`);
      updateError.code = 'BOOKING_UPDATE_FAILED';
      throw updateError;
    }

    const finalRec = data ? { ...updatedMem, ...data } : updatedMem;
    bookingsMemoryStore.set(id, finalRec);
    if (finalRec.confirmation_code) {
      bookingsMemoryStore.set(finalRec.confirmation_code, finalRec);
    }
    return finalRec;
  },





  recordStatusAudit: async (auditData) => {
    try {
      await supabase
        .from('booking_status_audits')
        .insert({
          booking_id: auditData.bookingId,
          old_status: auditData.oldStatus,
          new_status: auditData.newStatus,
          admin_id: auditData.adminId || 'admin',
          reason: auditData.reason || null
        });
    } catch (e) {
      logger.warn(`recordStatusAudit notice: ${e.message}`);
    }
  },



  saveAllBookingChanges: async (bookingId, payload = {}, adminInfo = {}) => {
    const adminId = adminInfo.email || adminInfo.id || 'admin';
    const existingBooking = await bookingRepository.getById(bookingId);
    if (!existingBooking) {
      return {
        success: false,
        code: 'BOOKING_NOT_FOUND',
        message: 'Booking not found.',
        field: 'id'
      };
    }

    const realId = existingBooking.id;

    // 1. Validate Booking Status if provided
    const targetBookingStatus = (payload.status || payload.bookingStatus) ? String(payload.status || payload.bookingStatus).toUpperCase() : null;
    if (targetBookingStatus && !BOOKING_STATUSES.includes(targetBookingStatus)) {
      return {
        success: false,
        code: 'INVALID_STATUS',
        message: `Invalid booking status '${targetBookingStatus}'. Allowed canonical statuses are: ${BOOKING_STATUSES.join(', ')}.`,
        field: 'status'
      };
    }

    // Require flight itinerary for completion/ticketing statuses
    if (targetBookingStatus && ['DONE', 'TICKETED', 'PAID'].includes(targetBookingStatus)) {
      const { default: bookingValidatorService } = await import('./booking-validator.service.mjs');
      const valResult = await bookingValidatorService.validateBookingIntegrity(realId, { requireItinerary: true });
      if (!valResult.valid) {
        return {
          success: false,
          code: 'BOOKING_ITINERARY_INCOMPLETE',
          message: 'Booking itinerary is incomplete. Please complete itinerary before continuing.',
          field: 'itinerary'
        };
      }
    }

    // 2. Validate Ticket Details if provided
    const rawPnr = payload.airlineConfirmationNumber ?? payload.airlinePnr ?? payload.pnr;
    let cleanPnr = existingBooking.airline_confirmation_number || null;
    if (rawPnr !== undefined && rawPnr !== null && String(rawPnr).trim() !== '') {
      const pnrStr = String(rawPnr).trim().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(pnrStr)) {
        return {
          success: false,
          code: 'INVALID_PNR',
          message: 'Airline confirmation number (PNR) must contain exactly 6 letters or numbers.',
          field: 'airlineConfirmationNumber'
        };
      }
      cleanPnr = pnrStr;
    }

    const rawTkt = payload.ticketNumber;
    let cleanTkt = existingBooking.ticket_number || null;
    if (rawTkt !== undefined && rawTkt !== null && String(rawTkt).trim() !== '') {
      const tktStr = String(rawTkt).trim();
      if (!/^\d{1,13}$/.test(tktStr)) {
        return {
          success: false,
          code: 'INVALID_TICKET_NUMBER',
          message: 'Ticket number must contain digits only and cannot exceed 13 digits.',
          field: 'ticketNumber'
        };
      }
      cleanTkt = tktStr;
    }

    // 3. Validate Payment Status & Fields if provided
    const targetPaymentStatus = payload.paymentStatus ? String(payload.paymentStatus).toUpperCase() : null;
    if (targetPaymentStatus) {
      const allowedPaymentStatuses = ['PENDING', 'PROCESSING', 'PAID', 'FAILED', 'REFUNDED'];
      if (!allowedPaymentStatuses.includes(targetPaymentStatus)) {
        return {
          success: false,
          code: 'INVALID_PAYMENT_STATUS',
          message: `Invalid payment status '${targetPaymentStatus}'. Allowed values: ${allowedPaymentStatuses.join(', ')}.`,
          field: 'paymentStatus'
        };
      }

      if (targetPaymentStatus === 'PAID') {
        const rawRef = payload.transactionReference ?? payload.transaction_reference ?? payload.transactionRef ?? payload.referenceId ?? payload.transaction_id ?? payload.payment_intent_id ?? existingBooking.transaction_id ?? existingBooking.provider_payment_id ?? null;
        const transactionRef = rawRef ? String(rawRef).trim() : '';
        const paidAmount = payload.paidAmount !== undefined ? parseFloat(payload.paidAmount) : parseFloat(existingBooking.customer_price || existingBooking.total_amount || 0);
        
        const refRegex = /^[A-Za-z0-9_-]{4,100}$/;
        if (!transactionRef || !refRegex.test(transactionRef)) {
          return {
            success: false,
            code: 'PAYMENT_UPDATE_FAILED',
            message: 'Enter a valid transaction or reference ID.',
            field: 'transactionReference'
          };
        }
        if (isNaN(paidAmount) || paidAmount <= 0) {
          return {
            success: false,
            code: 'PAYMENT_UPDATE_FAILED',
            message: 'Paid amount must be greater than zero.',
            field: 'paidAmount'
          };
        }
      }

      if (targetPaymentStatus === 'REFUNDED') {
        const refundAmount = parseFloat(payload.refundAmount || payload.refunded_amount || 0);
        const refundRef = payload.refundReference || payload.refund_id || existingBooking.refund_reference;
        const paidAmount = parseFloat(existingBooking.customer_price || existingBooking.total_amount || 0);

        if (refundAmount <= 0 && !payload.override) {
          return {
            success: false,
            code: 'PAYMENT_UPDATE_FAILED',
            message: 'Refunded status requires a refund amount greater than zero.',
            field: 'refundAmount'
          };
        }
        if (!refundRef && !payload.override) {
          return {
            success: false,
            code: 'PAYMENT_UPDATE_FAILED',
            message: 'Refunded status requires a valid refund reference ID.',
            field: 'refundReference'
          };
        }
        if (paidAmount > 0 && refundAmount > paidAmount && !payload.override) {
          return {
            success: false,
            code: 'PAYMENT_UPDATE_FAILED',
            message: `Refund amount ($${refundAmount.toFixed(2)}) cannot exceed paid amount ($${paidAmount.toFixed(2)}).`,
            field: 'refundAmount'
          };
        }
      }
    }

    // 4. Validate Payment Splits if provided
    if (Array.isArray(payload.paymentSplits) && payload.paymentSplits.length > 0) {
      for (const [idx, split] of payload.paymentSplits.entries()) {
        const name = (split.merchantName || split.merchant_name || split.name || split.merchant || '').trim();
        if (!name) {
          return {
            success: false,
            code: 'INVALID_PAYMENT_SPLIT',
            message: `Payment split at row ${idx + 1} requires a merchant name.`,
            field: `paymentSplits[${idx}].merchantName`
          };
        }
        const amt = parseFloat(split.amount || 0);
        if (!Number.isFinite(amt) || amt <= 0) {
          return {
            success: false,
            code: 'INVALID_PAYMENT_SPLIT',
            message: `Payment split for '${name}' must have an amount greater than zero.`,
            field: `paymentSplits[${idx}].amount`
          };
        }
        const decimals = (String(amt).split('.')[1] || '').length;
        if (decimals > 2) {
          return {
            success: false,
            code: 'INVALID_PAYMENT_SPLIT',
            message: `Payment split for '${name}' cannot have more than two decimal places.`,
            field: `paymentSplits[${idx}].amount`
          };
        }
      }
    }

    // 4.5 Validate Itinerary Segments if provided
    if (Array.isArray(payload.itinerarySegments) && payload.itinerarySegments.length > 0) {
      for (const [idx, seg] of payload.itinerarySegments.entries()) {
        const orig = (seg.origin_airport || seg.originCode || seg.departure_airport || '').trim();
        const dest = (seg.destination_airport || seg.destinationCode || seg.arrival_airport || '').trim();
        if (!orig || !dest) {
          return {
            success: false,
            code: 'INVALID_ITINERARY_SEGMENT',
            message: `Itinerary segment #${idx + 1} requires origin and destination airport codes.`,
            field: `itinerarySegments[${idx}]`
          };
        }
      }
    }

    // 5. Begin Transactional Mutation
    try {
      const bookingUpdateFields = {
        updated_at: new Date().toISOString()
      };

      // Status & Notes
      if (targetBookingStatus) {
        bookingUpdateFields.status = targetBookingStatus;
      }
      if (payload.internalNotes !== undefined) {
        bookingUpdateFields.internal_notes = payload.internalNotes;
      }

      // Ticket Details
      if (payload.airlineCode !== undefined) bookingUpdateFields.airline_code = payload.airlineCode;
      if (payload.airlineName !== undefined) bookingUpdateFields.airline_name = payload.airlineName;
      if (payload.airlineLogoUrl !== undefined) bookingUpdateFields.airline_logo_url = payload.airlineLogoUrl;
      if (rawPnr !== undefined) bookingUpdateFields.airline_confirmation_number = cleanPnr;
      if (rawTkt !== undefined) bookingUpdateFields.ticket_number = cleanTkt;
      if (payload.ticketIssuedAt !== undefined) bookingUpdateFields.ticket_issued_at = payload.ticketIssuedAt ? String(payload.ticketIssuedAt).slice(0, 10) : null;
      if (payload.ticketNotes !== undefined) bookingUpdateFields.ticket_notes = payload.ticketNotes;
      if (payload.supplierConfirmation !== undefined) bookingUpdateFields.supplier_confirmation = payload.supplierConfirmation;

      // Payment Status & Totals
      if (targetPaymentStatus) {
        bookingUpdateFields.payment_status = targetPaymentStatus;
        if (targetPaymentStatus === 'PAID') {
          const rawRef = payload.transactionReference ?? payload.transaction_reference ?? payload.transactionRef ?? payload.referenceId ?? payload.transaction_id ?? payload.payment_intent_id ?? existingBooking.transaction_id ?? existingBooking.provider_payment_id ?? null;
          const transactionRef = rawRef ? String(rawRef).trim() : null;
          if (transactionRef) {
            bookingUpdateFields.transaction_reference = transactionRef;
            bookingUpdateFields.provider_payment_id = transactionRef;
          }
        }
      }
      if (payload.customerTotal !== undefined && payload.customerTotal !== null) {
        const totalNum = parseFloat(payload.customerTotal);
        if (Number.isFinite(totalNum)) {
          bookingUpdateFields.customer_price = totalNum;
          bookingUpdateFields.total_amount = totalNum;
        }
      }
      if (payload.supplierCost !== undefined && payload.supplierCost !== null) {
        const suppNum = parseFloat(payload.supplierCost);
        if (Number.isFinite(suppNum)) {
          bookingUpdateFields.supplier_price = suppNum;
        }
      }
      if (payload.discount !== undefined && payload.discount !== null) {
        const discNum = parseFloat(payload.discount);
        if (Number.isFinite(discNum)) {
          bookingUpdateFields.discount_amount = discNum;
        }
      }

      // Save payment splits if provided
      if (Array.isArray(payload.paymentSplits) && payload.paymentSplits.length > 0) {
        const centsSum = payload.paymentSplits.reduce((sum, s) => {
          const amt = parseFloat(s.amount || 0);
          return sum + (Number.isFinite(amt) ? Math.round(amt * 100) : 0);
        }, 0);
        const splitTotal = centsSum / 100;

        await bookingRepository.savePaymentSplits(realId, payload.paymentSplits);
        if (splitTotal > 0 && (payload.customerTotal === undefined || payload.customerTotal === null)) {
          bookingUpdateFields.customer_price = splitTotal;
          bookingUpdateFields.total_amount = splitTotal;
        }
      }

      // Perform database update
      await bookingRepository.updateStatus(realId, bookingUpdateFields);

      // Save Itinerary Segments ONLY if non-empty valid segments list is provided
      if (Array.isArray(payload.itinerarySegments) && payload.itinerarySegments.length > 0) {
        const validSegs = payload.itinerarySegments.filter(s => (s.origin_airport || s.originCode || s.origin_code) && (s.destination_airport || s.destinationCode || s.destination_code));
        if (validSegs.length > 0) {
          await bookingRepository.saveItinerarySegments(realId, validSegs);
        }
      }

      // Record Audit Event with detailed changes list
      const changedKeys = Object.keys(bookingUpdateFields).filter(k => k !== 'updated_at');
      const auditReason = payload.auditReason || `Booking updated via Admin Dashboard (${changedKeys.join(', ') || 'No main fields changed'})`;

      await bookingRepository.recordStatusAudit({
        bookingId: realId,
        oldStatus: existingBooking.status,
        newStatus: bookingUpdateFields.status || existingBooking.status,
        adminId,
        reason: auditReason
      });

      logger.info(`[saveAllBookingChanges] Booking ${realId} updated by ${adminId}: ${changedKeys.join(', ')}`);

      const completeBooking = await bookingRepository.getCompleteBookingById(realId);
      return {
        success: true,
        message: 'Booking changes saved successfully.',
        booking: completeBooking,
        data: completeBooking
      };
    } catch (err) {
      logger.error(`[saveAllBookingChanges] Failure: ${err.message}`, err);
      return {
        success: false,
        code: 'DATABASE_TRANSACTION_FAILED',
        message: `Failed to save changes: ${err.message}`,
        field: 'booking'
      };
    }
  },

  updateBookingStatus: async (id, updateFields) => {
    return bookingRepository.updateStatus(id, updateFields);
  },

  getStats: async () => {
    const { data, error } = await supabase
      .from('bookings')
      .select('status, payment_status, total_amount');

    if (error) throw new Error(error.message);
    return data || [];
  },

  findPaymentByOrderId: async (providerOrderId) => {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('provider_order_id', providerOrderId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data;
  },

  updateBookingWithLock: async (id, expectedVersion, updateFields) => {
    const newVersion = (expectedVersion || 1) + 1;
    const fieldsToSave = { ...updateFields, version: newVersion, updated_at: new Date().toISOString() };

    let query = supabase.from('bookings').update(fieldsToSave).eq('id', id);
    if (expectedVersion) {
      query = query.eq('version', expectedVersion);
    }

    const { data, error } = await query.select().single();
    if (error) {
      return bookingRepository.updateStatus(id, updateFields);
    }
    return data;
  },

  saveItinerarySegments: async (bookingId, segments = []) => {
    try {
      let outboundSeq = 1;
      let returnSeq = 1;

      const rows = (segments || []).map((seg, idx) => {
        const dir = seg.journey_direction || seg.direction || (idx === 0 ? 'outbound' : 'outbound');
        const seq = seg.segment_sequence || (dir === 'outbound' ? outboundSeq++ : returnSeq++);
        const code = (seg.marketing_carrier_code || seg.carrier_code || seg.carrier || seg.airline_code || '').trim().toUpperCase();
        const origCode = (seg.origin_airport || seg.origin_code || seg.originCode || seg.origin || '').trim().toUpperCase();
        const destCode = (seg.destination_airport || seg.destination_code || seg.destinationCode || seg.destination || '').trim().toUpperCase();

        return {
          booking_id: bookingId,
          trip_type: seg.trip_type || 'one_way',
          leg: dir,
          direction: dir,
          journey_direction: dir,
          segment_sequence: seq,
          carrier_name: seg.carrier_name || seg.airline_name || seg.airline || (code ? `${code} Airlines` : ''),
          carrier_code: code,
          marketing_carrier_code: code,
          operating_carrier: seg.operating_carrier || seg.operatingCarrier || null,
          flight_number: seg.flight_number || seg.flightNumber || '',
          origin_airport: origCode,
          origin_city: seg.origin_city || seg.originCity || origCode,
          destination_airport: destCode,
          destination_city: seg.destination_city || seg.destinationCity || destCode,
          departure_date: seg.departure_date || seg.departureDate || '',
          departure_time: seg.departure_time || seg.departureTime || '',
          arrival_date: seg.arrival_date || seg.arrivalDate || '',
          arrival_time: seg.arrival_time || seg.arrivalTime || '',
          arrival_next_day: !!(seg.arrival_next_day || seg.arrivalNextDay),
          cabin: seg.cabin || seg.cabin_class || seg.class || 'Economy',
          booking_class: seg.booking_class || 'Y',
          terminal: seg.terminal || '',
          baggage_allowance: seg.baggage_allowance || '1 Bag',
          aircraft: seg.aircraft || null,
          layover_duration: seg.layover_duration || seg.layoverDuration || null,
          duration: seg.duration || null,
          stop_count: parseInt(seg.stop_count || 0, 10),
          segment_order: idx + 1
        };
      });

      // SAFETY GUARD: Do NOT wipe out existing database itinerary segments if the input segment list is empty or contains only blank entries
      const validRows = rows.filter(r => r.origin_airport && r.destination_airport);
      if (validRows.length === 0) {
        logger.warn(`[saveItinerarySegments] Skipped updating itinerary for ${bookingId}: input segments list is empty or contains invalid/blank entries.`);
        return;
      }

      // Always save to memory store first (immediate availability)
      segmentsMemoryStore.set(bookingId, validRows);

      await bookingRepository.recordAuditLog({
        bookingId,
        action: 'FLIGHT_CREATED',
        oldValue: null,
        newValue: validRows,
        actor: 'system'
      });

      // Attempt 1: Save to booking_itinerary_segments (normalized table)
      const { error: deleteErr } = await supabase.from('booking_itinerary_segments').delete().eq('booking_id', bookingId);
      if (!deleteErr && validRows.length > 0) {
        const { error: insertErr } = await supabase.from('booking_itinerary_segments').insert(validRows);
        if (!insertErr) {
          logger.info(`[saveItinerarySegments] Saved ${validRows.length} segments to booking_itinerary_segments for ${bookingId}.`);
          // Also persist to flights table for maximum redundancy
          await bookingRepository._persistToFlightsTable(bookingId, validRows);
          return;
        }
        logger.warn(`[saveItinerarySegments] booking_itinerary_segments insert failed: ${insertErr.message}. Falling back to flights table.`);
      } else if (deleteErr) {
        logger.warn(`[saveItinerarySegments] booking_itinerary_segments unavailable: ${deleteErr.message}. Using flights table as production store.`);
      }

      // Attempt 2: Persist to the production flights table (always exists in production)
      await bookingRepository._persistToFlightsTable(bookingId, rows);
    } catch (e) {
      logger.warn(`saveItinerarySegments error: ${e.message}`);
    }
  },

  // Persist segment rows to the legacy flights table using its column schema
  _persistToFlightsTable: async (bookingId, canonicalRows = []) => {
    try {
      if (!Array.isArray(canonicalRows) || canonicalRows.length === 0) {
        logger.warn(`[_persistToFlightsTable] Refusing to delete flights for ${bookingId} with empty canonicalRows!`);
        return;
      }

      // Delete existing flights for this booking ONLY when non-empty valid replacement rows exist!
      await supabase.from('flights').delete().eq('booking_id', bookingId);

      const flightRows = canonicalRows.map((seg) => ({
        booking_id: bookingId,
        leg: seg.journey_direction === 'return' ? 'return' : 'outbound',
        trip_type: seg.direction === 'return' ? 'round-trip' : 'one-way',
        airline_name: seg.carrier_name || seg.airline_name || '',
        flight_number: seg.flight_number || '',
        departure_airport: seg.origin_airport || '',
        arrival_airport: seg.destination_airport || '',
        departure_date: seg.departure_date || '',
        arrival_date: seg.arrival_date || '',
        departure_time_str: seg.departure_time || '',
        arrival_time_str: seg.arrival_time || '',
        cabin_class: seg.cabin || 'Economy',
        stops: parseInt(seg.stop_count || 0, 10),
        duration: seg.duration || null
      }));

      const { error } = await supabase.from('flights').insert(flightRows);
      if (error) {
        logger.warn(`[_persistToFlightsTable] flights insert warning: ${error.message}`);
      } else {
        logger.info(`[_persistToFlightsTable] Saved ${flightRows.length} rows to flights table for ${bookingId}.`);
      }
    } catch (e) {
      logger.warn(`[_persistToFlightsTable] error: ${e.message}`);
    }
  },

  savePaymentSplits: async (bookingIdInput, splits = []) => {
    try {
      const booking = await bookingRepository.getById(bookingIdInput);
      const realId = booking ? booking.id : bookingIdInput;
      const refCode = booking ? (booking.confirmation_code || booking.bookingReference || realId) : bookingIdInput;

      const formatted = (splits || []).map((s, index) => ({
        booking_id: realId,
        merchant_name: s.merchant_name || s.merchantName || 'Merchant',
        amount: parseFloat(s.amount || 0),
        currency: (s.currency || booking?.currency || 'USD').toUpperCase(),
        display_order: index + 1
      }));

      // Cache in memory store under BOTH keys (UUID and Confirmation Code)
      splitsMemoryStore.set(realId, formatted);
      if (refCode && refCode !== realId) {
        splitsMemoryStore.set(refCode, formatted);
      }

      // Delete existing split rows for both UUID and Reference Code to ensure clean overwrite
      await supabase.from('payment_authorization_splits').delete().eq('booking_id', realId);
      if (refCode && refCode !== realId) {
        await supabase.from('payment_authorization_splits').delete().eq('booking_id', refCode);
      }

      if (formatted.length > 0) {
        const { error } = await supabase.from('payment_authorization_splits').insert(formatted);
        if (error) logger.warn(`savePaymentSplits notice: ${error.message}`);
      }

      const splitSum = formatted.reduce((acc, curr) => acc + curr.amount, 0);

      if (realId && splitSum > 0) {
        await bookingRepository.updateBookingStatus(realId, {
          authorized_amount: splitSum,
          customer_price: splitSum
        });
      }

      return formatted;
    } catch (e) {
      logger.warn(`savePaymentSplits notice: ${e.message}`);
      return [];
    }
  },

  getPaymentSplits: async (bookingIdInput) => {
    try {
      if (!bookingIdInput) return [];

      let realId = bookingIdInput;
      let refCode = bookingIdInput;

      const booking = await bookingRepository.getById(bookingIdInput);
      if (booking) {
        realId = booking.id;
        refCode = booking.confirmation_code || booking.bookingReference || realId;
      }

      const inMemReal = splitsMemoryStore.get(realId);
      if (inMemReal && inMemReal.length > 0) return inMemReal;

      const inMemRef = splitsMemoryStore.get(refCode);
      if (inMemRef && inMemRef.length > 0) return inMemRef;

      const { data } = await supabase
        .from('payment_authorization_splits')
        .select('*')
        .or(`booking_id.eq.${realId},booking_id.eq.${refCode}`)
        .order('id', { ascending: true });

      if (data && data.length > 0) {
        splitsMemoryStore.set(realId, data);
        if (refCode && refCode !== realId) {
          splitsMemoryStore.set(refCode, data);
        }
        return data;
      }
    } catch (e) {
      /* non-blocking fallback */
    }

    const fallbackReal = splitsMemoryStore.get(bookingIdInput);
    return fallbackReal || [];
  },

  getFlightsCount: async (bookingId) => {
    try {
      const { count, error } = await supabase
        .from('flights')
        .select('*', { count: 'exact', head: true })
        .eq('booking_id', bookingId);
      if (!error && typeof count === 'number' && count > 0) return count;

      const { count: segCount } = await supabase
        .from('booking_itinerary_segments')
        .select('*', { count: 'exact', head: true })
        .eq('booking_id', bookingId);
      return segCount || 0;
    } catch (e) {
      return 0;
    }
  },

  getItineraryState: async (bookingId) => {
    try {
      const { data: flights } = await supabase
        .from('flights')
        .select('*')
        .eq('booking_id', bookingId)
        .order('id');
      const { data: segments } = await supabase
        .from('booking_itinerary_segments')
        .select('*')
        .eq('booking_id', bookingId)
        .order('segment_sequence');

      const flightsData = flights || [];
      const segmentsData = segments || [];

      const flightsState = flightsData.map(f => ({
        leg: f.leg,
        departure_airport: f.departure_airport,
        arrival_airport: f.arrival_airport,
        airline_name: f.airline_name,
        flight_number: f.flight_number,
        departure_date: f.departure_date,
        departure_time_str: f.departure_time_str,
        arrival_date: f.arrival_date,
        arrival_time_str: f.arrival_time_str,
        cabin_class: f.cabin_class,
        stops: f.stops
      }));

      const segmentsState = segmentsData.map(s => ({
        journey_direction: s.journey_direction,
        segment_sequence: s.segment_sequence,
        carrier_name: s.carrier_name,
        carrier_code: s.carrier_code,
        flight_number: s.flight_number,
        origin_airport: s.origin_airport,
        destination_airport: s.destination_airport,
        departure_date: s.departure_date,
        departure_time: s.departure_time,
        arrival_date: s.arrival_date,
        arrival_time: s.arrival_time,
        cabin: s.cabin,
        stop_count: s.stop_count
      }));

      const itineraryString = JSON.stringify({ flightsState, segmentsState });
      const crypto = await import('crypto');
      const itineraryHash = crypto.createHash('sha256').update(itineraryString).digest('hex');
      const count = flightsData.length + segmentsData.length;
      
      const carriers = [...new Set([
        ...flightsData.map(f => f.airline_name || ''),
        ...segmentsData.map(s => s.carrier_name || '')
      ])].sort();

      const routes = [...new Set([
        ...flightsData.map(f => `${f.departure_airport || ''}->${f.arrival_airport || ''}`),
        ...segmentsData.map(s => `${s.origin_airport || ''}->${s.destination_airport || ''}`)
      ])].sort();

      return {
        count,
        hash: itineraryHash,
        carriers: JSON.stringify(carriers),
        routes: JSON.stringify(routes)
      };
    } catch (e) {
      logger.warn(`getItineraryState error: ${e.message}`);
      return { count: 0, hash: '', carriers: '[]', routes: '[]' };
    }
  },

  updatePaymentSplitsAndTotal: async (bookingId, splitsInput = [], adminId = 'admin', reason = 'Payment splits update', expectedVersion = null, paymentState = null, paymentMetadata = {}) => {
    // 1. Log Booking ID received by API
    logger.info(`[Transaction] --- updatePaymentSplitsAndTotal START ---`);
    logger.info(`[Transaction] 1. Booking ID received: ${bookingId}`);

    const booking = await bookingRepository.getById(bookingId);
    if (!booking) throw new Error('Booking not found');
    const realId = booking.id;

    if (expectedVersion && booking.updated_at && String(expectedVersion) !== String(booking.updated_at)) {
      const conflictErr = new Error('BOOKING_VERSION_CONFLICT: This booking changed after you opened it. Reload and review the current payment details before saving.');
      conflictErr.status = 409;
      throw conflictErr;
    }

    // 2. Log Existing booking amount from database
    const oldTotal = parseFloat(booking.customer_price || booking.total_amount || 0);
    logger.info(`[Transaction] 2. Existing booking amount: $${oldTotal.toFixed(2)}`);

    // Get before-state of itinerary
    const initialItinerary = await bookingRepository.getItineraryState(realId);

    // Backup current DB/memory values for rollback
    const originalBookingState = {
      customer_price: booking.customer_price,
      total_amount: booking.total_amount,
      status: booking.status,
      authorization_status: booking.authorization_status,
      payment_status: booking.payment_status,
      authorization_token: booking.authorization_token,
      authorization_expires_at: booking.authorization_expires_at,
      authorization_email_sent_at: booking.authorization_email_sent_at
    };

    const originalSplits = await bookingRepository.getPaymentSplits(realId);

    let originalAuthRecord = null;
    try {
      const { data } = await supabase
        .from('passenger_authorizations')
        .select('*')
        .eq('booking_id', realId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) originalAuthRecord = data;
    } catch (e) {}

    let originalPaymentRecord = null;
    try {
      const { data } = await supabase
        .from('payments')
        .select('*')
        .eq('booking_id', realId)
        .maybeSingle();
      if (data) originalPaymentRecord = data;
    } catch (e) {}

    // Rollback function
    const rollback = async (err) => {
      logger.warn(`[Transaction] Error detected. Rolling back changes for booking ${realId}. Reason: ${err.message}`);
      
      // Restore splits in memory and DB
      splitsMemoryStore.set(realId, originalSplits);
      try {
        await supabase.from('payment_authorization_splits').delete().eq('booking_id', realId);
        if (originalSplits && originalSplits.length > 0) {
          await supabase.from('payment_authorization_splits').insert(originalSplits.map(s => ({
            booking_id: realId,
            merchant_name: s.merchant_name || s.merchantName,
            amount: s.amount,
            currency: s.currency
          })));
        }
      } catch (se) {}

      // Restore bookings columns
      try {
        await supabase.from('bookings').update({
          customer_price: originalBookingState.customer_price,
          total_amount: originalBookingState.total_amount,
          status: originalBookingState.status,
          authorization_status: originalBookingState.authorization_status,
          payment_status: originalBookingState.payment_status,
          authorization_token: originalBookingState.authorization_token,
          authorization_expires_at: originalBookingState.authorization_expires_at,
          authorization_email_sent_at: originalBookingState.authorization_email_sent_at
        }).eq('id', realId);
      } catch (be) {}

      // Restore passenger auth
      if (originalAuthRecord) {
        try {
          await supabase.from('passenger_authorizations').update({
            authorized_amount: originalAuthRecord.authorized_amount,
            quote_snapshot: originalAuthRecord.quote_snapshot,
            token: originalAuthRecord.token,
            expires_at: originalAuthRecord.expires_at,
            status: originalAuthRecord.status
          }).eq('id', originalAuthRecord.id);
        } catch (ae) {}
      }

      // Restore payments table
      if (originalPaymentRecord) {
        try {
          await supabase.from('payments').update({
            payment_amount: originalPaymentRecord.payment_amount,
            authorized_amount: originalPaymentRecord.authorized_amount,
            payment_status: originalPaymentRecord.payment_status
          }).eq('id', originalPaymentRecord.id);
        } catch (pe) {}
      }
    };

    try {
      // 3. Log Payment splits received
      logger.info(`[Transaction] 3. Payment splits received: ${JSON.stringify(splitsInput)}`);

      // 4. Validate all splits
      if (!Array.isArray(splitsInput) || splitsInput.length === 0) {
        throw new Error('At least one payment split row is required.');
      }

      const currencies = new Set();
      const formattedSplits = splitsInput.map((s, idx) => {
        const mName = String(s.merchantName || s.merchant_name || s.name || s.merchant || '').trim();
        if (!mName) {
          throw new Error(`Split #${idx + 1}: Merchant name cannot be empty.`);
        }
        const rawAmt = Number(s.amount);
        if (isNaN(rawAmt) || rawAmt <= 0 || !isFinite(rawAmt)) {
          throw new Error(`Split #${idx + 1} (${mName}): Amount must be a finite number greater than zero.`);
        }
        const amtStr = String(s.amount);
        if (amtStr.includes('.') && amtStr.split('.')[1].length > 2) {
          throw new Error(`Split #${idx + 1} (${mName}): Amount cannot have more than 2 decimal places.`);
        }
        const curr = (s.currency || booking.currency || 'USD').toUpperCase().trim();
        currencies.add(curr);

        return {
          booking_id: realId,
          merchant_name: mName,
          amount: Math.round(rawAmt * 100) / 100,
          currency: curr
        };
      });

      if (currencies.size > 1) {
        throw new Error('Mixed currencies within one booking payment split are not allowed.');
      }

      // Calculate total server side using decimal-safe cents arithmetic
      const totalCents = formattedSplits.reduce(
        (sum, s) => sum + Math.round(s.amount * 100),
        0
      );
      const calculatedTotal = totalCents / 100;

      // 4. Log Calculated split total
      logger.info(`[Transaction] 4. Calculated split total: $${calculatedTotal.toFixed(2)}`);

      // 5 & 6. Remove and insert splits (in-memory + DB)
      splitsMemoryStore.set(realId, formattedSplits);

      // 5. Log SQL update query executed (splits delete & insert) & Rows affected
      logger.info(`[Transaction] 5. Executing: DELETE FROM payment_authorization_splits WHERE booking_id = '${realId}'`);
      let splitsTableAvailable = true;
      const { data: delSplitsData, error: delSplitsErr } = await supabase
        .from('payment_authorization_splits')
        .delete()
        .eq('booking_id', realId)
        .select();
      if (delSplitsErr) {
        const isSchemaMiss = delSplitsErr.message?.includes('schema cache') || delSplitsErr.message?.includes('not found');
        if (isSchemaMiss) {
          logger.warn(`[Transaction] payment_authorization_splits table not in schema cache; splits stored in memory only.`);
          splitsTableAvailable = false;
        } else {
          throw new Error(`DATABASE_ERROR [payment_authorization_splits delete]: ${delSplitsErr.message}`);
        }
      }
      // 6. Log Rows affected (deleted splits)
      logger.info(`[Transaction] 6. Rows affected (deleted splits): ${delSplitsData?.length || 0}`);

      if (splitsTableAvailable && formattedSplits.length > 0) {
        logger.info(`[Transaction] 5. Executing: INSERT INTO payment_authorization_splits VALUES ${JSON.stringify(formattedSplits)}`);
        const { data: insSplitsData, error: insSplitsErr } = await supabase
          .from('payment_authorization_splits')
          .insert(formattedSplits)
          .select();
        if (insSplitsErr) {
          const isSchemaMiss = insSplitsErr.message?.includes('schema cache') || insSplitsErr.message?.includes('not found');
          if (!isSchemaMiss) {
            throw new Error(`DATABASE_ERROR [payment_authorization_splits insert]: ${insSplitsErr.message}`);
          }
          logger.warn(`[Transaction] payment_authorization_splits insert skipped (schema cache miss).`);
        }
        // 6. Log Rows affected (inserted splits)
        logger.info(`[Transaction] 6. Rows affected (inserted splits): ${insSplitsData?.length || 0}`);
      }

      // 7 & 8. Update payments and bookings
      const requestedPaymentStatus = (paymentState || paymentMetadata.paymentStatus || booking.payment_status || 'PENDING').toUpperCase();
      const targetPaymentStatus = requestedPaymentStatus === 'AUTHORIZED' ? 'PROCESSING' : requestedPaymentStatus;
      
      // 5. Log SQL update query executed (payments table update)
      logger.info(`[Transaction] 5. Executing: UPDATE payments SET authorized_amount = ${calculatedTotal}, payment_amount = ${calculatedTotal}, payment_status = '${targetPaymentStatus}' WHERE booking_id = '${realId}'`);
      let { data: pData, error: pErr } = await supabase
        .from('payments')
        .update({
          authorized_amount: calculatedTotal,
          payment_amount: calculatedTotal,
          payment_status: targetPaymentStatus,
          updated_at: new Date().toISOString()
        })
        .eq('booking_id', realId)
        .select();
      if (pErr) {
        const isSchemaMiss = pErr.message?.includes('schema cache') || pErr.message?.includes('not found');
        if (isSchemaMiss) {
          logger.warn(`[Transaction] payments schema column missing (${pErr.message}). Retrying with minimal fields.`);
          // Retry with only columns guaranteed to exist
          const { data: pDataRetry, error: pErrRetry } = await supabase
            .from('payments')
            .update({
              payment_amount: calculatedTotal,
              payment_status: targetPaymentStatus,
              updated_at: new Date().toISOString()
            })
            .eq('booking_id', realId)
            .select();
          if (pErrRetry) {
            logger.warn(`[Transaction] payments update retry also failed: ${pErrRetry.message}. Continuing — bookings table is the canonical source.`);
          } else {
            pData = pDataRetry;
          }
        } else {
          throw new Error(`DATABASE_ERROR [payments update]: ${pErr.message}`);
        }
      }
      // 6. Log Rows affected (payments update)
      logger.info(`[Transaction] 6. Rows affected (payments update): ${pData?.length || 0}`);

      let newStatus = booking.status;
      let newAuthStatus = booking.authorization_status || 'PENDING';
      const amountChanged = Math.abs(oldTotal - calculatedTotal) > 0.001;
      const isAccepted = (originalAuthRecord?.status === 'accepted' || originalAuthRecord?.status === 'ACCEPTED' || booking.authorization_status === 'ACCEPTED' || booking.authorization_status === 'AUTHORIZED');

      if (amountChanged) {
        if (isAccepted) {
          newStatus = 'REAUTHORIZATION_REQUIRED';
          newAuthStatus = 'REAUTHORIZATION_REQUIRED';

          try {
            const { passengerAuthorizationService } = await import('../authorizations/passenger-authorization.service.mjs');
            const newAuth = await passengerAuthorizationService.createAuthorizationToken(realId, {
              authorizedAmount: calculatedTotal,
              currency: (booking.currency || 'USD').toUpperCase()
            });

            if (newAuth?.token) {
              const bAuthFields = {
                authorization_token: newAuth.token,
                authorization_expires_at: newAuth.expires_at
              };
              // 5. Log SQL update query executed (bookings auth token update)
              logger.info(`[Transaction] 5. Executing: UPDATE bookings SET authorization_token = '${newAuth.token}', authorization_expires_at = '${newAuth.expires_at}' WHERE id = '${realId}'`);
              const { data: bAuthData, error: bAuthErr } = await supabase
                .from('bookings')
                .update(bAuthFields)
                .eq('id', realId)
                .select();
              if (bAuthErr) {
                throw new Error(`DATABASE_ERROR [bookings auth update]: ${bAuthErr.message}`);
              }
              // 6. Log Rows affected
              logger.info(`[Transaction] 6. Rows affected (bookings auth update): ${bAuthData?.length || 0}`);

              // Sync memory
              const existingMem = bookingsMemoryStore.get(realId) || {};
              const updatedMemAuth = { ...existingMem, ...bAuthFields, ...(bAuthData?.[0] || {}) };
              bookingsMemoryStore.set(realId, updatedMemAuth);
              if (updatedMemAuth.confirmation_code) {
                bookingsMemoryStore.set(updatedMemAuth.confirmation_code, updatedMemAuth);
              }
            }
          } catch (authCreateErr) {
            // Re-throw if it was a DB error during auth create to ensure rollback
            if (authCreateErr.message?.includes('DATABASE_ERROR')) {
              throw authCreateErr;
            }
            logger.warn(`[Transaction] Could not create reauthorization request: ${authCreateErr.message}`);
          }
        } else {
          if (originalAuthRecord) {
            // 5. Log SQL update query executed (passenger_authorizations update)
            logger.info(`[Transaction] 5. Executing: UPDATE passenger_authorizations SET authorized_amount = ${calculatedTotal} WHERE id = '${originalAuthRecord.id}'`);
            const { data: pAuthData, error: pAuthErr } = await supabase
              .from('passenger_authorizations')
              .update({
                authorized_amount: calculatedTotal,
                updated_at: new Date().toISOString()
              })
              .eq('id', originalAuthRecord.id)
              .select();
            if (pAuthErr) {
              throw new Error(`DATABASE_ERROR [passenger_authorizations update]: ${pAuthErr.message}`);
            }
            // 6. Log Rows affected
            logger.info(`[Transaction] 6. Rows affected (passenger_authorizations update): ${pAuthData?.length || 0}`);
          }
        }
      }

      const updatePayload = {
        total_amount: calculatedTotal,
        customer_price: calculatedTotal,
        status: newStatus,
        authorization_status: newAuthStatus,
        payment_status: targetPaymentStatus,
        transaction_reference: paymentMetadata.referenceId || null,
        provider_payment_id: paymentMetadata.referenceId || null
      };

      // 5. Log SQL update query executed (bookings core update)
      logger.info(`[Transaction] 5. Executing: UPDATE bookings SET total_amount = ${calculatedTotal}, customer_price = ${calculatedTotal}, status = '${newStatus}', authorization_status = '${newAuthStatus}', payment_status = '${targetPaymentStatus}', transaction_reference = '${paymentMetadata.referenceId || ''}' WHERE id = '${realId}'`);
      let { data: bData, error: bErr } = await supabase
        .from('bookings')
        .update(updatePayload)
        .eq('id', realId)
        .select();

      if (bErr) {
        logger.warn(`bookings update schema notice: ${bErr.message}. Retrying without transaction_reference.`);
        const safePayload = { ...updatePayload };
        delete safePayload.transaction_reference;
        
        const { data: bDataRetry, error: bErrRetry } = await supabase
          .from('bookings')
          .update(safePayload)
          .eq('id', realId)
          .select();
        
        if (bErrRetry) {
          throw new Error(`DATABASE_ERROR [bookings update retry]: ${bErrRetry.message}`);
        }
        bData = bDataRetry;
      }
      
      // 6. Log Rows affected
      logger.info(`[Transaction] 6. Rows affected (bookings core update): ${bData?.length || 0}`);

      // Record specialized PAID audit event if applicable
      if (targetPaymentStatus.toUpperCase() === 'PAID') {
        const rawRef = paymentMetadata.referenceId || '';
        const maskedRef = rawRef ? '••••••' + String(rawRef).slice(-4) : '••••••';
        await bookingRepository.recordAuditLog({
          bookingId: realId,
          action: 'PAYMENT_STATUS_UPDATED_TO_PAID',
          oldValue: booking.payment_status,
          newValue: JSON.stringify({
            paymentStatus: 'PAID',
            paidAmount: calculatedTotal,
            transactionReference: maskedRef,
            administratorId: adminId,
            timestamp: new Date().toISOString()
          }),
          actor: adminId
        });
      }

      // Sync memory
      const existingB = bookingsMemoryStore.get(realId) || {};
      const updatedMemB = { ...existingB, ...updatePayload, ...(bData?.[0] || {}) };
      bookingsMemoryStore.set(realId, updatedMemB);
      if (updatedMemB.confirmation_code) {
        bookingsMemoryStore.set(updatedMemB.confirmation_code, updatedMemB);
      }

      // ── Patch pending passenger_authorizations record ────────────────────
      try {
        const { passengerAuthorizationService } = await import('../authorizations/passenger-authorization.service.mjs');
        const splitCurrency = formattedSplits[0]?.currency || booking.currency || 'USD';
        const updatedAuth = await passengerAuthorizationService.updateAuthorizationAmountAndSplits(
          realId,
          calculatedTotal,
          formattedSplits,
          splitCurrency
        );
        if (updatedAuth?.token) {
          const authFields = {
            authorization_token: updatedAuth.token,
            authorization_expires_at: updatedAuth.expires_at
          };
          // 5. Log SQL update query executed
          logger.info(`[Transaction] 5. Executing: UPDATE bookings SET authorization_token = '${updatedAuth.token}', authorization_expires_at = '${updatedAuth.expires_at}' WHERE id = '${realId}'`);
          const { data: bAuthData2, error: bAuthErr2 } = await supabase
            .from('bookings')
            .update(authFields)
            .eq('id', realId)
            .select();
          if (bAuthErr2) {
            throw new Error(`DATABASE_ERROR [bookings auth patch update]: ${bAuthErr2.message}`);
          }
          // 6. Log Rows affected
          logger.info(`[Transaction] 6. Rows affected (bookings auth patch update): ${bAuthData2?.length || 0}`);

          // Sync memory
          const existingMem2 = bookingsMemoryStore.get(realId) || {};
          const updatedMemAuth2 = { ...existingMem2, ...authFields, ...(bAuthData2?.[0] || {}) };
          bookingsMemoryStore.set(realId, updatedMemAuth2);
          if (updatedMemAuth2.confirmation_code) {
            bookingsMemoryStore.set(updatedMemAuth2.confirmation_code, updatedMemAuth2);
          }

          // Send a new authorization email to the passenger if pending
          if (!isAccepted) {
            try {
              const freshBooking = await bookingRepository.getById(realId);
              await passengerAuthorizationService.sendAuthorizationEmail(updatedAuth, freshBooking);
              
              const emailFields = {
                authorization_email_sent_at: new Date().toISOString()
              };
              // 5. Log SQL update query executed
              logger.info(`[Transaction] 5. Executing: UPDATE bookings SET authorization_email_sent_at = '${emailFields.authorization_email_sent_at}' WHERE id = '${realId}'`);
              const { data: bEmailData, error: bEmailErr } = await supabase
                .from('bookings')
                .update(emailFields)
                .eq('id', realId)
                .select();
              if (bEmailErr) {
                throw new Error(`DATABASE_ERROR [bookings email update]: ${bEmailErr.message}`);
              }
              // 6. Log Rows affected
              logger.info(`[Transaction] 6. Rows affected (bookings email update): ${bEmailData?.length || 0}`);

              // Sync memory
              const existingMem3 = bookingsMemoryStore.get(realId) || {};
              const updatedMemEmail = { ...existingMem3, ...emailFields, ...(bEmailData?.[0] || {}) };
              bookingsMemoryStore.set(realId, updatedMemEmail);
              if (updatedMemEmail.confirmation_code) {
                bookingsMemoryStore.set(updatedMemEmail.confirmation_code, updatedMemEmail);
              }
            } catch (emailErr) {
              if (emailErr.message?.includes('DATABASE_ERROR')) {
                throw emailErr;
              }
              logger.warn(`[Transaction] Could not send re-authorization email: ${emailErr.message}`);
            }
          }
        }
      } catch (authPatchErr) {
        if (authPatchErr.message?.includes('DATABASE_ERROR')) {
          throw authPatchErr;
        }
        logger.warn(`[Transaction] Non-fatal: could not patch pending auth: ${authPatchErr.message}`);
      }

      // Record audit logs
      await bookingRepository.recordAuditLog({
        bookingId: realId,
        action: 'PAYMENT_SPLITS_AND_BOOKING_AMOUNT_UPDATED',
        oldValue: JSON.stringify({ authorizedAmount: oldTotal, splits: originalSplits, status: booking.status, paymentStatus: booking.payment_status }),
        newValue: JSON.stringify({ authorizedAmount: calculatedTotal, splits: formattedSplits, status: newStatus, paymentStatus: targetPaymentStatus }),
        actor: adminId
      });

      await bookingRepository.recordPaymentEvent({
        bookingId: realId,
        eventType: 'PAYMENT_SPLITS_AND_BOOKING_AMOUNT_UPDATED',
        previousStatus: booking.status,
        newStatus,
        amount: calculatedTotal,
        reason: `${reason}. Old: $${oldTotal.toFixed(2)}, New: $${calculatedTotal.toFixed(2)}`,
        adminId
      });

      // 13. Verify the itinerary count and hash are unchanged
      const finalItinerary = await bookingRepository.getItineraryState(realId);
      if (
        finalItinerary.count !== initialItinerary.count ||
        finalItinerary.hash !== initialItinerary.hash ||
        finalItinerary.carriers !== initialItinerary.carriers ||
        finalItinerary.routes !== initialItinerary.routes
      ) {
        throw new Error('PAYMENT_SAFETY_VIOLATION: Itinerary details (count, hash, carriers, or routes) mutated during payment save. Rolling back.');
      }

      // 14. Read back and verify complete saved payment state (Read-After-Write Verification directly from DB)
      logger.info(`[Transaction] 5. Executing: SELECT customer_price, total_amount FROM bookings WHERE id = '${realId}'`);
      const { data: dbBooking, error: dbBkErr } = await supabase
        .from('bookings')
        .select('customer_price, total_amount')
        .eq('id', realId)
        .single();
      if (dbBkErr) {
        throw new Error(`READ_AFTER_WRITE_VERIFICATION_FAILED: Could not read back booking from database: ${dbBkErr.message}`);
      }

      logger.info(`[Transaction] 5. Executing: SELECT amount FROM payment_authorization_splits WHERE booking_id = '${realId}'`);
      const { data: dbSplits, error: dbSplitsErr } = await supabase
        .from('payment_authorization_splits')
        .select('amount')
        .eq('booking_id', realId);

      let readBackTotal = calculatedTotal; // default: trust calculated total if table unavailable
      if (dbSplitsErr) {
        const isSchemaMiss = dbSplitsErr.message?.includes('schema cache') || dbSplitsErr.message?.includes('not found');
        if (isSchemaMiss) {
          logger.warn(`[Transaction] payment_authorization_splits not in schema cache; skipping DB read-after-write for splits. Using in-memory total.`);
        } else {
          throw new Error(`READ_AFTER_WRITE_VERIFICATION_FAILED: Could not read back splits from database: ${dbSplitsErr.message}`);
        }
      } else {
        readBackTotal = (dbSplits || []).reduce((sum, s) => sum + Math.round(Number(s.amount) * 100), 0) / 100;
      }

      // 7. Log Final booking amount after update query (readBackTotal and dbCustomerPrice)
      logger.info(`[Transaction] 7. Final splits total from DB: $${readBackTotal.toFixed(2)}`);

      if (Math.abs(readBackTotal - calculatedTotal) > 0.01) {
        throw new Error(`READ_AFTER_WRITE_VERIFICATION_FAILED: Persisted splits total $${readBackTotal.toFixed(2)} does not match server-calculated total $${calculatedTotal.toFixed(2)}.`);
      }

      const dbCustomerPrice = parseFloat(dbBooking.customer_price || dbBooking.total_amount || 0);
      logger.info(`[Transaction] 7. Final booking amount (customer_price/total_amount) from DB: $${dbCustomerPrice.toFixed(2)}`);
      if (Math.abs(dbCustomerPrice - calculatedTotal) > 0.01) {
        throw new Error(`READ_AFTER_WRITE_VERIFICATION_FAILED: Persisted booking customer price $${dbCustomerPrice.toFixed(2)} does not match server-calculated total $${calculatedTotal.toFixed(2)}.`);
      }

      logger.info(`[Transaction] Commit successful for booking ${realId}. Splits total: $${calculatedTotal.toFixed(2)}`);
      logger.info(`[Transaction] --- updatePaymentSplitsAndTotal END ---`);

      // Return refreshed full booking representation
      return await bookingRepository.getCompleteBookingById(realId);

    } catch (err) {
      // ROLLBACK on failure
      await rollback(err);
      throw err;
    }
  },






  recordPriceRevision: async (revision) => {
    try {
      await supabase.from('booking_price_revisions').insert({
        booking_id: revision.bookingId,
        supplier_fare: revision.supplierFare || 0,
        base_fare: revision.baseFare || 0,
        taxes: revision.taxes || 0,
        service_fee: revision.serviceFee || 0,
        discount: revision.discount || 0,
        customer_total: revision.customerTotal,
        currency: revision.currency || 'USD',
        margin: revision.margin || 0,
        reason: revision.reason || 'Price adjustment by admin',
        admin_id: revision.adminId || 'admin'
      });
    } catch (e) {
      logger.warn(`recordPriceRevision notice: ${e.message}`);
    }
  },

  updatePricingAtomic: async ({ bookingId, supplierFare, taxesAndFees, agencyMarkup, customerTotal, currency = 'USD', reason, adminId = 'admin', expectedVersion }) => {
    const base = await bookingRepository.resolveBooking(bookingId);

    if (expectedVersion && base.updated_at && expectedVersion !== base.updated_at) {
      const err = new Error('This booking was updated elsewhere. Refresh it before saving pricing.');
      err.code = 'BOOKING_VERSION_CONFLICT';
      err.status = 409;
      throw err;
    }

    const now = new Date().toISOString();
    const updateFields = {
      supplier_fare: parseFloat(supplierFare || 0),
      taxes_and_fees: parseFloat(taxesAndFees || 0),
      agency_markup: parseFloat(agencyMarkup || 0),
      customer_price: parseFloat(customerTotal),
      total_amount: parseFloat(customerTotal),
      currency: currency || 'USD',
      price_change_reason: reason || 'Admin price update',
      updated_at: now
    };

    // Update in memory store
    const existingMem = bookingsMemoryStore.get(base.id) || {};
    bookingsMemoryStore.set(base.id, { ...base, ...existingMem, ...updateFields });
    if (base.confirmation_code) {
      bookingsMemoryStore.set(base.confirmation_code, { ...base, ...existingMem, ...updateFields });
    }

    // Update DB and verify the write instead of reporting a memory-only success.
    const { error: pricingUpdateError } = await supabase.from('bookings').update(updateFields).eq('id', base.id);
    if (pricingUpdateError) {
      throw new Error(`PRICING_UPDATE_FAILED: ${pricingUpdateError.message}`);
    }

    // Record price revision
    try {
      await supabase.from('booking_price_revisions').insert({
        booking_id: base.id,
        supplier_fare: parseFloat(supplierFare || 0),
        taxes: parseFloat(taxesAndFees || 0),
        agency_markup: parseFloat(agencyMarkup || 0),
        customer_total: parseFloat(customerTotal),
        currency: currency || 'USD',
        reason: reason || 'Admin price update',
        admin_id: adminId,
        created_at: now
      });
    } catch (revErr) {
      logger.warn(`[updatePricingAtomic] Revision insert warning for ${base.id}:`, revErr.message);
    }

    // Record audit event
    try {
      await supabase.from('admin_audit_events').insert({
        booking_id: base.id,
        action: 'PRICING_UPDATE',
        details: JSON.stringify({ supplierFare, taxesAndFees, agencyMarkup, customerTotal, reason }),
        admin_id: adminId,
        created_at: now
      });
    } catch (audErr) {
      logger.warn(`[updatePricingAtomic] Audit insert warning for ${base.id}:`, audErr.message);
    }

    const updated = await bookingRepository.getById(base.id);
    return updated || { ...base, ...updateFields };
  },

  recordPaymentEvent: async (eventData) => {
    try {
      await supabase.from('booking_payment_events').insert({
        booking_id: eventData.bookingId,
        event_type: eventData.eventType,
        previous_status: eventData.previousStatus,
        new_status: eventData.newStatus,
        amount: eventData.amount || 0,
        reference_id: eventData.referenceId || '',
        reason: eventData.reason || '',
        admin_id: eventData.adminId || 'admin'
      });
    } catch (e) {
      logger.warn(`recordPaymentEvent notice: ${e.message}`);
    }
  },

  findPaymentByCaptureId: async (providerCaptureId) => {

    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('provider_capture_id', providerCaptureId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data;
  },

  updatePaymentByOrderId: async (providerOrderId, updateFields) => {
    const { data, error } = await supabase
      .from('payments')
      .update(updateFields)
      .eq('provider_order_id', providerOrderId)
      .select()
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data;
  },

  upsertPayPalPayment: async (paymentRow) => {
    const { data: existing } = await supabase
      .from('payments')
      .select('*')
      .eq('booking_id', paymentRow.booking_id)
      .maybeSingle();

    if (existing) {
      const { data, error } = await supabase
        .from('payments')
        .update(paymentRow)
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    } else {
      const { data, error } = await supabase
        .from('payments')
        .insert(paymentRow)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    }
  },

  getWebhookEvent: async (webhookId) => {
    try {
      const { data, error } = await supabase
        .from('webhook_events')
        .select('*')
        .eq('id', webhookId)
        .maybeSingle();
      if (error) return null;
      return data;
    } catch (e) {
      return null;
    }
  },

  recordWebhookEvent: async (eventRow) => {
    try {
      const { data, error } = await supabase
        .from('webhook_events')
        .insert(eventRow)
        .select()
        .maybeSingle();
      if (error) return null;
      return data;
    } catch (e) {
      return null;
    }
  },

  findBookingByCheckoutId: async (checkoutId) => {
    if (!checkoutId) return null;
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('provider_checkout_id', checkoutId)
      .maybeSingle();

    if (error || !data) return null;
    const relations = await bookingRepository.getRelations(data.id);
    return bookingRepository.enrichBookingRecord(data, relations);
  },

  findPaymentByCheckoutId: async (checkoutId) => {
    if (!checkoutId) return null;
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('provider_checkout_id', checkoutId)
      .maybeSingle();

    if (error || !data) return null;
    return data;
  },

  upsertWhopPayment: async (paymentRow) => {
    // Try updating by booking_id or provider_checkout_id first
    let existing = null;
    if (paymentRow.booking_id) {
      const { data } = await supabase
        .from('payments')
        .select('*')
        .eq('booking_id', paymentRow.booking_id)
        .maybeSingle();
      existing = data;
    }
    if (!existing && paymentRow.provider_checkout_id) {
      try {
        const { data } = await supabase
          .from('payments')
          .select('*')
          .eq('provider_checkout_id', paymentRow.provider_checkout_id)
          .maybeSingle();
        existing = data;
      } catch (e) {
        /* fallback if column missing in remote schema cache */
      }
    }

    if (existing) {
      const { data, error } = await supabase
        .from('payments')
        .update(paymentRow)
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        const coreRow = {
          payment_provider: paymentRow.payment_provider || 'whop',
          payment_amount: paymentRow.payment_amount,
          currency: paymentRow.currency || 'USD',
          payment_status: paymentRow.payment_status || 'paid',
          payment_date: paymentRow.payment_date || new Date().toISOString()
        };
        const { data: safeData, error: safeError } = await supabase
          .from('payments')
          .update(coreRow)
          .eq('id', existing.id)
          .select()
          .single();

        if (safeError) throw new Error(`Failed updating payment record: ${error.message}`);
        return safeData;
      }
      return data;
    } else {
      const { data, error } = await supabase
        .from('payments')
        .insert(paymentRow)
        .select()
        .single();

      if (error) {
        const coreRow = {
          booking_id: paymentRow.booking_id,
          payment_provider: paymentRow.payment_provider || 'whop',
          payment_amount: paymentRow.payment_amount,
          currency: paymentRow.currency || 'USD',
          payment_status: paymentRow.payment_status || 'paid',
          payment_date: paymentRow.payment_date || new Date().toISOString()
        };
        const { data: safeData, error: safeError } = await supabase
          .from('payments')
          .insert(coreRow)
          .select()
          .single();

        if (safeError) throw new Error(`Failed creating payment record: ${error.message}`);
        return safeData;
      }
      return data;
    }
  },


  executePaymentConfirmationTx: async ({
    bookingId,
    paymentProvider = 'whop',
    providerPaymentId,
    providerCheckoutId,
    paidAmount,
    currency = 'USD',
    paymentDate = new Date().toISOString()
  }) => {
    // 1. Update/upsert payments table row
    const paymentRow = {
      booking_id: bookingId,
      payment_provider: paymentProvider,
      provider_payment_id: providerPaymentId,
      provider_checkout_id: providerCheckoutId,
      payment_amount: paidAmount,
      currency: currency.toUpperCase(),
      payment_status: 'paid',
      payment_date: paymentDate
    };
    const paymentRecord = await bookingRepository.upsertWhopPayment(paymentRow);

    // 2. Update master bookings table row
    const bookingUpdateFields = {
      payment_status: 'paid',
      status: 'DONE',
      payment_provider: paymentProvider,
      provider_payment_id: providerPaymentId,
      provider_checkout_id: providerCheckoutId,
      paid_at: paymentDate
    };
    const updatedBooking = await bookingRepository.updateBookingStatus(bookingId, bookingUpdateFields);


    return { booking: updatedBooking, payment: paymentRecord };
  },

  getEmailDeliveryRecord: async (webhookId, bookingId) => {
    if (!webhookId || !bookingId) return null;
    try {
      const { data, error } = await supabase
        .from('email_deliveries')
        .select('*')
        .eq('webhook_id', String(webhookId))
        .eq('booking_id', bookingId)
        .maybeSingle();

      if (error) return null;
      return data;
    } catch (e) {
      return null;
    }
  },

  getEmailDeliveryStatus: async (bookingId, emailType = 'BOOKING_CONFIRMATION') => {
    try {
      const inMemKey = `${bookingId}_${emailType}`;
      const inMem = emailDeliveriesMemoryStore.get(inMemKey);
      if (inMem) return inMem;

      const { data, error } = await supabase
        .from('email_deliveries')
        .select('*')
        .eq('booking_id', bookingId)
        .eq('email_type', emailType)
        .maybeSingle();

      if (!error && data) {
        emailDeliveriesMemoryStore.set(inMemKey, data);
        return data;
      }
    } catch (e) {
      /* fallback */
    }
    return emailDeliveriesMemoryStore.get(`${bookingId}_${emailType}`) || null;
  },

  upsertEmailDeliveryRecord: async (record) => {
    try {
      const inMemKey = `${record.booking_id}_${record.email_type || 'BOOKING_CONFIRMATION'}`;
      const existing = emailDeliveriesMemoryStore.get(inMemKey) || {};
      const row = {
        id: existing.id || `email_del_${Date.now()}`,
        booking_id: record.booking_id,
        confirmation_code: record.confirmation_code,
        email_type: record.email_type || 'BOOKING_CONFIRMATION',
        recipient: record.recipient,
        status: record.status || 'PENDING',
        provider: record.provider || 'RESEND',
        provider_message_id: record.provider_message_id || existing.provider_message_id || null,
        error_code: record.error_code || existing.error_code || null,
        error_message: record.error_message || existing.error_message || null,
        attempt_count: record.attempt_count || ((existing.attempt_count || 0) + 1),
        last_attempt_at: new Date().toISOString(),
        sent_at: record.status === 'SENT' ? new Date().toISOString() : existing.sent_at,
        updated_at: new Date().toISOString()
      };

      emailDeliveriesMemoryStore.set(inMemKey, row);

      const { data, error } = await supabase
        .from('email_deliveries')
        .upsert(row, { onConflict: 'booking_id,email_type' })
        .select()
        .maybeSingle();

      if (error) {
        logger.warn(`[DB] email_deliveries upsert notice: ${error.message}`);
      }
      return data || row;
    } catch (e) {
      logger.warn(`[DB] email_deliveries upsert exception: ${e.message}`);
      return emailDeliveriesMemoryStore.get(`${record.booking_id}_${record.email_type || 'BOOKING_CONFIRMATION'}`);
    }
  },

  recordEmailDelivery: async (deliveryRow) => {
    try {
      const { data, error } = await supabase
        .from('email_deliveries')
        .insert({
          webhook_id: String(deliveryRow.webhook_id),
          booking_id: deliveryRow.booking_id,
          email_type: deliveryRow.email_type || 'booking_confirmation',
          recipient_email: deliveryRow.recipient_email,
          resend_message_id: deliveryRow.resend_message_id || null,
          status: deliveryRow.status || 'delivered',
          error_message: deliveryRow.error_message || null
        })
        .select()
        .maybeSingle();

      if (error) {
        console.warn('[DB] Non-blocking email delivery record warning:', error.message);
        return null;
      }
      return data;
    } catch (e) {
      return null;
    }
  },

  logAdminActivity: async (logData = {}) => {
    const entry = {
      action: logData.action || 'BOOKING_DELETED',
      booking_reference: logData.bookingReference || logData.booking_reference || '',
      deleted_by: logData.deletedBy || logData.deleted_by || 'admin',
      created_at: new Date().toISOString(),
      ip_address: logData.ipAddress || logData.ip_address || '127.0.0.1',
      details: logData.details || null
    };

    try {
      await supabase.from('admin_activity_logs').insert({
        action: entry.action,
        booking_reference: entry.booking_reference,
        admin_email: entry.deleted_by,
        timestamp: entry.created_at,
        ip_address: entry.ip_address,
        details: entry.details
      });
    } catch (err) {
      logger.warn(`admin_activity_logs insert notice: ${err.message}`);
    }

    return entry;
  },

  deleteBookingTransactional: async (idOrCode, adminEmail = 'admin@faretransit.com', ipAddress = '127.0.0.1') => {
    if (!idOrCode) {
      return { success: false, code: 'INVALID_ID', message: 'Booking ID is required.' };
    }

    const existingBooking = await bookingRepository.getById(idOrCode);
    if (!existingBooking) {
      return { success: false, code: 'BOOKING_NOT_FOUND', message: 'Booking not found.' };
    }

    const realId = existingBooking.id;
    const confirmationCode = existingBooking.confirmation_code || existingBooking.confirmationCode || realId;

    try {
      // Step 1: email_delivery_activity / email_logs
      await supabase.from('email_logs').delete().eq('booking_id', realId);
      await supabase.from('email_deliveries').delete().eq('booking_id', realId);

      // Step 2: passenger_authorization
      await supabase.from('passenger_authorizations').delete().eq('booking_id', realId);

      // Step 3: payment_splits
      await supabase.from('payment_authorization_splits').delete().eq('booking_id', realId);
      splitsMemoryStore.delete(realId);
      if (confirmationCode) splitsMemoryStore.delete(confirmationCode);

      // Step 4: payments
      await supabase.from('payments').delete().eq('booking_id', realId);

      // Step 5: airline_ticket_details
      await supabase.from('ticket_details').delete().eq('booking_id', realId);

      // Step 6: itinerary_segments / flights
      await supabase.from('booking_itinerary_segments').delete().eq('booking_id', realId);
      await supabase.from('flights').delete().eq('booking_id', realId);
      segmentsMemoryStore.delete(realId);

      // Step 7: passengers / travellers / contacts
      await supabase.from('travellers').delete().eq('booking_id', realId);
      await supabase.from('contacts').delete().eq('booking_id', realId);

      // Step 8: bookings
      const { error: deleteErr } = await supabase.from('bookings').delete().eq('id', realId);
      if (deleteErr) {
        logger.warn(`deleteBooking DB notice: ${deleteErr.message}`);
      }

      // Clear main booking memory stores and mark deleted
      const tombstone = { _deleted: true, id: realId, confirmation_code: confirmationCode };
      bookingsMemoryStore.set(realId, tombstone);
      if (confirmationCode) bookingsMemoryStore.set(confirmationCode, tombstone);
      if (existingBooking.confirmation_code) bookingsMemoryStore.set(existingBooking.confirmation_code, tombstone);
      if (existingBooking.confirmationCode) bookingsMemoryStore.set(existingBooking.confirmationCode, tombstone);
      if (existingBooking.bookingReference) bookingsMemoryStore.set(existingBooking.bookingReference, tombstone);

      // Step 9: Audit log creation
      await bookingRepository.recordAuditLog({
        bookingId: realId,
        action: 'BOOKING_DELETED',
        oldValue: existingBooking,
        newValue: null,
        actor: adminEmail,
        ipAddress
      });
      await bookingRepository.logAdminActivity({
        action: 'BOOKING_DELETED',
        bookingReference: confirmationCode,
        deletedBy: adminEmail,
        ipAddress
      });

      logger.info(`[DELETE_BOOKING] Booking ${confirmationCode} (${realId}) and all 7 dependency relations deleted cleanly by ${adminEmail}.`);

      return {
        success: true,
        message: `Booking ${confirmationCode} permanently deleted.`,
        deletedBookingId: realId,
        confirmationCode
      };
    } catch (err) {
      logger.error(`[DELETE_BOOKING] Transactional deletion failed for ${realId}:`, err);
      return {
        success: false,
        code: 'DELETE_TRANSACTION_FAILED',
        message: `Deletion failed: ${err.message}`
      };
    }
  },

  deleteBooking: async (idOrCode) => {
    return bookingRepository.deleteBookingTransactional(idOrCode, 'system-atomic-rollback@faretransit.com');
  },

  softDeleteBooking: async (idOrCode, adminEmail = 'admin@faretransit.com', ipAddress = '127.0.0.1', reason = 'Admin soft delete') => {
    const existingBooking = await bookingRepository.getById(idOrCode);
    if (!existingBooking) {
      return { success: false, code: 'BOOKING_NOT_FOUND', message: `Booking '${idOrCode}' not found.` };
    }

    const realId = existingBooking.id;
    const confirmationCode = existingBooking.confirmation_code || existingBooking.confirmationCode || realId;
    const deletedAt = new Date().toISOString();

    const updateFields = {
      status: 'CANCELLED',
      deleted_at: deletedAt,
      deleted_by: adminEmail,
      delete_reason: reason,
      updated_at: deletedAt
    };

    await bookingRepository.updateStatus(realId, updateFields);

    const updatedBooking = { ...existingBooking, ...updateFields, _softDeleted: true };
    bookingsMemoryStore.set(realId, updatedBooking);
    if (confirmationCode) bookingsMemoryStore.set(confirmationCode, updatedBooking);

    await bookingRepository.recordAuditLog({
      bookingId: realId,
      action: 'BOOKING_SOFT_DELETED',
      oldValue: existingBooking,
      newValue: updatedBooking,
      actor: adminEmail,
      ipAddress
    });

    logger.info(`[SOFT_DELETE] Booking ${confirmationCode} (${realId}) soft-deleted by ${adminEmail}.`);

    return {
      success: true,
      message: `Booking ${confirmationCode} soft-deleted cleanly.`,
      bookingId: realId,
      confirmationCode,
      deletedAt
    };
  },

  restoreBooking: async (idOrCode, adminEmail = 'admin@faretransit.com', ipAddress = '127.0.0.1') => {
    const existingBooking = await bookingRepository.getById(idOrCode);
    if (!existingBooking) {
      return { success: false, code: 'BOOKING_NOT_FOUND', message: `Booking '${idOrCode}' not found.` };
    }

    const realId = existingBooking.id;
    const confirmationCode = existingBooking.confirmation_code || existingBooking.confirmationCode || realId;
    const restoredAt = new Date().toISOString();

    const updateFields = {
      status: 'PENDING',
      deleted_at: null,
      deleted_by: null,
      delete_reason: null,
      updated_at: restoredAt
    };

    await bookingRepository.updateStatus(realId, updateFields);

    const restoredBooking = { ...existingBooking, ...updateFields, _softDeleted: false };
    bookingsMemoryStore.set(realId, restoredBooking);
    if (confirmationCode) bookingsMemoryStore.set(confirmationCode, restoredBooking);

    await bookingRepository.recordAuditLog({
      bookingId: realId,
      action: 'BOOKING_RESTORED',
      oldValue: existingBooking,
      newValue: restoredBooking,
      actor: adminEmail,
      ipAddress
    });

    logger.info(`[RESTORE_BOOKING] Booking ${confirmationCode} (${realId}) restored to active status by ${adminEmail}.`);

    return {
      success: true,
      message: `Booking ${confirmationCode} restored successfully.`,
      bookingId: realId,
      confirmationCode,
      restoredAt
    };
  },

  saveAuthorizationSnapshot: async (snapshotData) => {
    const snapId = snapshotData.id || `auth_snap_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const record = { ...snapshotData, id: snapId, created_at: snapshotData.created_at || new Date().toISOString() };
    authSnapshotsMemoryStore.set(snapId, record);
    try {
      await supabase.from('authorization_snapshots').insert(record);
    } catch (e) {
      logger.warn(`authorization_snapshots insert notice (stored in memory store): ${e.message}`);
    }
    return record;
  },

  getAuthorizationSnapshots: async (bookingId) => {
    try {
      const { data, error } = await supabase
        .from('authorization_snapshots')
        .select('*')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: true });

      if (!error && Array.isArray(data) && data.length > 0) return data;
    } catch (e) {
      // Fallback to in-memory store
    }
    return Array.from(authSnapshotsMemoryStore.values()).filter(s => s.booking_id === bookingId || s.bookingId === bookingId);
  },

  exportBookingJson: async (idOrCode) => {
    const booking = await bookingRepository.getById(idOrCode);
    if (!booking) return null;

    const realId = booking.id;
    const relations = await bookingRepository.getRelations(realId);
    const auditLogs = await bookingRepository.getAuditLogsForBooking(realId);
    const authSnapshots = await bookingRepository.getAuthorizationSnapshots(realId);
    const ticketSnapshots = await bookingRepository.getTicketSnapshotsForBooking(realId);

    return {
      exported_at: new Date().toISOString(),
      booking: bookingRepository.enrichBookingRecord(booking, relations),
      itinerary_segments: relations.itinerarySegments || [],
      travellers: relations.travellers || [],
      contacts: relations.contacts || [],
      payments: relations.payments || [],
      payment_splits: relations.paymentSplits || [],
      authorization_snapshots: authSnapshots || [],
      ticket_snapshots: ticketSnapshots || [],
      audit_logs: auditLogs || []
    };
  },

  getBookingHistory: async (idOrCode) => {
    const booking = await bookingRepository.getById(idOrCode);
    if (!booking) return null;

    const realId = booking.id;
    const auditLogs = await bookingRepository.getAuditLogsForBooking(realId);
    const authSnapshots = await bookingRepository.getAuthorizationSnapshots(realId);
    const ticketSnapshots = await bookingRepository.getTicketSnapshotsForBooking(realId);

    const timeline = [];

    (auditLogs || []).forEach(a => {
      timeline.push({
        type: 'AUDIT_EVENT',
        action: a.action,
        timestamp: a.created_at,
        actor: a.actor,
        ipAddress: a.ip_address,
        oldValue: a.old_value,
        newValue: a.new_value
      });
    });

    (authSnapshots || []).forEach(s => {
      timeline.push({
        type: 'AUTHORIZATION_SNAPSHOT',
        id: s.id,
        timestamp: s.created_at || s.accepted_at,
        pnr: s.confirmation_code,
        authorizedAmount: s.authorized_amount,
        consentHash: s.consent_hash
      });
    });

    (ticketSnapshots || []).forEach(t => {
      timeline.push({
        type: 'TICKET_SNAPSHOT',
        id: t.id,
        timestamp: t.issue_date || t.created_at,
        pnr: t.pnr,
        ticketNumber: t.ticket_number,
        airline: t.airline,
        finalPrice: t.final_price
      });
    });

    timeline.sort((a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime());

    return {
      bookingId: realId,
      confirmationCode: booking.confirmation_code,
      currentStatus: booking.status,
      timeline
    };
  },

  restoreFromSnapshot: async (idOrCode, targetSnapshot, adminEmail = 'admin@faretransit.com', ipAddress = '127.0.0.1') => {
    const booking = await bookingRepository.getById(idOrCode);
    if (!booking) {
      return { success: false, code: 'BOOKING_NOT_FOUND', message: `Booking '${idOrCode}' not found.` };
    }

    const realId = booking.id;
    const snapData = typeof targetSnapshot === 'object' ? targetSnapshot : null;

    if (!snapData) {
      return { success: false, code: 'INVALID_SNAPSHOT', message: 'Target snapshot payload is invalid or empty.' };
    }

    const updateFields = {
      passenger_name: snapData.passenger_name || booking.passenger_name,
      customer_price: snapData.authorized_amount || snapData.total_amount || snapData.final_price || booking.customer_price,
      total_amount: snapData.authorized_amount || snapData.total_amount || snapData.final_price || booking.total_amount,
      status: snapData.status || 'PENDING',
      updated_at: new Date().toISOString()
    };

    if (snapData.itinerary_snapshot && Array.isArray(snapData.itinerary_snapshot)) {
      await bookingRepository.saveItinerarySegments(realId, snapData.itinerary_snapshot);
    } else if (snapData.final_itinerary && Array.isArray(snapData.final_itinerary)) {
      await bookingRepository.saveItinerarySegments(realId, snapData.final_itinerary);
    }

    await bookingRepository.updateStatus(realId, updateFields);

    await bookingRepository.recordAuditLog({
      bookingId: realId,
      action: 'BOOKING_RESTORED_FROM_SNAPSHOT',
      oldValue: booking,
      newValue: snapData,
      actor: adminEmail,
      ipAddress
    });

    logger.info(`[RESTORE_SNAPSHOT] Booking ${realId} restored from snapshot by ${adminEmail}.`);

    return {
      success: true,
      message: `Booking ${realId} successfully restored from snapshot state.`,
      bookingId: realId,
      restoredAt: new Date().toISOString()
    };
  },

  // ──────────────────────────────────────────────────────────────────────
  //  BULK EXPORT — load complete booking data for multiple IDs
  // ──────────────────────────────────────────────────────────────────────
  exportBookingsBulk: async (bookingIds = []) => {
    const results = [];
    for (const id of bookingIds) {
      try {
        const data = await bookingRepository.exportBookingJson(id);
        if (data) {
          results.push(bookingRepository.sanitizeBookingForExport(data));
        }
      } catch (err) {
        logger.warn(`[BULK_EXPORT] Failed to export booking ${id}: ${err.message}`);
      }
    }
    return results;
  },

  // ──────────────────────────────────────────────────────────────────────
  //  SANITIZE — remove sensitive fields from exported booking data
  // ──────────────────────────────────────────────────────────────────────
  sanitizeBookingForExport: (exportData) => {
    if (!exportData) return exportData;

    const sensitivePatterns = [
      'cvv', 'cvc', 'pin', 'full_card_number', 'card_number', 'pan',
      'api_key', 'secret_key', 'private_key', 'access_token', 'refresh_token',
      'password', 'admin_password', 'webhook_secret', 'authorization_token'
    ];

    const redactObject = (obj, depth = 0) => {
      if (!obj || typeof obj !== 'object' || depth > 10) return obj;
      if (Array.isArray(obj)) return obj.map(item => redactObject(item, depth + 1));

      const cleaned = {};
      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();

        // Redact sensitive keys
        if (sensitivePatterns.some(pattern => lowerKey.includes(pattern))) {
          cleaned[key] = '[REDACTED]';
          continue;
        }

        // Mask card numbers — keep only last 4
        if ((lowerKey === 'card_last_four' || lowerKey === 'last_four' || lowerKey === 'lastfour') && value) {
          cleaned[key] = value;
          continue;
        }

        if (typeof value === 'string' && /^\d{13,19}$/.test(value.replace(/[\s-]/g, ''))) {
          const digits = value.replace(/[\s-]/g, '');
          if (digits.length >= 13) {
            cleaned[key] = `****${digits.slice(-4)}`;
            continue;
          }
        }

        cleaned[key] = redactObject(value, depth + 1);
      }
      return cleaned;
    };

    return redactObject(exportData);
  },

  // ──────────────────────────────────────────────────────────────────────
  //  FIND BY CONFIRMATION CODE — for duplicate detection
  // ──────────────────────────────────────────────────────────────────────
  findByConfirmationCode: async (confirmationCode) => {
    if (!confirmationCode) return null;
    try {
      const existing = await bookingRepository.getById(confirmationCode);
      return existing || null;
    } catch (err) {
      return null;
    }
  },

  // ──────────────────────────────────────────────────────────────────────
  //  RESTORE BOOKING FROM BACKUP — transactional per-booking restore
  // ──────────────────────────────────────────────────────────────────────
  restoreBookingFromBackup: async (bookingData, duplicateStrategy = 'SKIP', adminEmail = 'admin@faretransit.com', ipAddress = '127.0.0.1') => {
    const booking = bookingData.booking || bookingData;
    const confirmationCode = booking.confirmation_code || booking.confirmationCode || booking.booking_reference;

    if (!confirmationCode && !booking.id) {
      return { success: false, code: 'INVALID_BOOKING', message: 'Booking data missing confirmation code and ID.' };
    }

    // Check for duplicates
    const existing = await bookingRepository.findByConfirmationCode(confirmationCode || booking.id);

    if (existing && existing.id && !existing._deleted) {
      if (duplicateStrategy === 'SKIP') {
        return { success: true, status: 'SKIPPED', confirmationCode, message: `${confirmationCode} already exists — skipped.` };
      }

      if (duplicateStrategy === 'REPLACE') {
        // Delete the existing booking first
        const deleteResult = await bookingRepository.deleteBookingTransactional(existing.id, adminEmail, ipAddress);
        if (!deleteResult.success) {
          return { success: false, code: 'REPLACE_FAILED', confirmationCode, message: `Failed to remove existing ${confirmationCode}: ${deleteResult.message}` };
        }
        logger.info(`[BACKUP_RESTORE] Deleted existing booking ${confirmationCode} for replacement by ${adminEmail}.`);
      }

      // NEW_COPY — generate a new confirmation code
      if (duplicateStrategy === 'NEW_COPY') {
        const suffix = Math.random().toString(36).substring(2, 8).toUpperCase();
        const newCode = `${confirmationCode}-COPY-${suffix}`;
        booking.confirmation_code = newCode;
        booking.confirmationCode = newCode;
        // Clear IDs so Supabase generates new ones
        delete booking.id;
      }
    }

    try {
      // Step 1: Create the base booking record
      const bookingRow = { ...booking };
      // Remove nested/computed fields
      delete bookingRow.travellers;
      delete bookingRow.contacts;
      delete bookingRow.flights;
      delete bookingRow.payments;
      delete bookingRow.itinerary_segments;
      delete bookingRow.payment_splits;
      delete bookingRow.authorization_snapshots;
      delete bookingRow.ticket_snapshots;
      delete bookingRow.audit_logs;
      delete bookingRow.email_logs;
      delete bookingRow._deleted;

      // For REPLACE strategy, we already deleted. For NEW_COPY, ID was cleared.
      // For initial import (no existing), just insert.
      if (duplicateStrategy !== 'NEW_COPY') {
        // Try to use the original ID if it existed
      }

      bookingRow.updated_at = new Date().toISOString();
      if (!bookingRow.created_at) {
        bookingRow.created_at = new Date().toISOString();
      }

      // Upsert: insert or handle existing
      const { data: insertedBooking, error: insertErr } = await supabase
        .from('bookings')
        .upsert(bookingRow, { onConflict: 'id' })
        .select()
        .single();

      if (insertErr) {
        // Try without ID for new copy
        delete bookingRow.id;
        const { data: fallbackBooking, error: fallbackErr } = await supabase
          .from('bookings')
          .insert(bookingRow)
          .select()
          .single();

        if (fallbackErr) {
          throw new Error(`Booking insert failed: ${fallbackErr.message}`);
        }
        var restoredBookingId = fallbackBooking.id;
        var restoredCode = fallbackBooking.confirmation_code || confirmationCode;
      } else {
        var restoredBookingId = insertedBooking.id;
        var restoredCode = insertedBooking.confirmation_code || confirmationCode;
      }

      // Step 2: Restore travellers
      const travellers = bookingData.travellers || [];
      if (travellers.length > 0) {
        for (const t of travellers) {
          const row = { ...t, booking_id: restoredBookingId };
          delete row.id; // Let Supabase assign new IDs
          await supabase.from('travellers').insert(row);
        }
      }

      // Step 3: Restore contacts
      const contacts = bookingData.contacts || bookingData.contact ? [bookingData.contact].filter(Boolean) : [];
      if (contacts.length > 0) {
        for (const c of contacts) {
          const row = { ...c, booking_id: restoredBookingId };
          delete row.id;
          await supabase.from('contacts').insert(row);
        }
      }

      // Step 4: Restore itinerary segments
      const segments = bookingData.itinerary_segments || bookingData.itinerarySegments || [];
      if (segments.length > 0) {
        await bookingRepository.saveItinerarySegments(restoredBookingId, segments);
      }

      // Step 5: Restore payments (metadata only, no active tokens)
      const payments = bookingData.payments || [];
      if (payments.length > 0) {
        for (const p of payments) {
          const row = { ...p, booking_id: restoredBookingId };
          delete row.id;
          // Sanitize — never restore active tokens
          delete row.access_token;
          delete row.refresh_token;
          delete row.authorization_token;
          await supabase.from('payments').insert(row);
        }
      }

      // Step 6: Restore payment splits
      const splits = bookingData.payment_splits || bookingData.paymentSplits || [];
      if (splits.length > 0) {
        for (const s of splits) {
          const row = { ...s, booking_id: restoredBookingId };
          delete row.id;
          await supabase.from('payment_authorization_splits').insert(row);
        }
      }

      // Step 7: Restore ticket details (snapshots)
      const tickets = bookingData.ticket_snapshots || bookingData.ticketDetails || [];
      if (tickets.length > 0) {
        for (const t of tickets) {
          const row = { ...t, booking_id: restoredBookingId };
          delete row.id;
          await supabase.from('ticket_details').insert(row);
        }
      }

      // Step 8: Restore email activity metadata
      const emailLogs = bookingData.emailActivity || bookingData.email_logs || [];
      if (emailLogs.length > 0) {
        for (const e of emailLogs) {
          const row = { ...e, booking_id: restoredBookingId };
          if (!row.id) row.id = `email_restored_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          await supabase.from('email_logs').insert(row);
        }
      }

      // Step 9: Record audit event for the restoration
      await bookingRepository.recordAuditLog({
        bookingId: restoredBookingId,
        action: 'BOOKING_RESTORED_FROM_BACKUP',
        oldValue: null,
        newValue: { confirmationCode: restoredCode, duplicateStrategy, restoredAt: new Date().toISOString() },
        actor: adminEmail,
        ipAddress
      });

      await bookingRepository.logAdminActivity({
        action: 'BOOKING_RESTORED_FROM_BACKUP',
        bookingReference: restoredCode,
        deletedBy: adminEmail,
        ipAddress,
        details: { duplicateStrategy, source: 'backup_import' }
      });

      // Refresh memory store
      const freshBooking = await bookingRepository.getById(restoredBookingId);
      if (freshBooking) {
        bookingsMemoryStore.set(restoredBookingId, freshBooking);
        if (restoredCode) bookingsMemoryStore.set(restoredCode, freshBooking);
      }

      logger.info(`[BACKUP_RESTORE] Booking ${restoredCode} (${restoredBookingId}) successfully restored from backup by ${adminEmail}. Strategy: ${duplicateStrategy}`);

      return {
        success: true,
        status: 'RESTORED',
        confirmationCode: restoredCode,
        bookingId: restoredBookingId,
        message: `${restoredCode} restored successfully.`
      };
    } catch (err) {
      logger.error(`[BACKUP_RESTORE] Failed to restore ${confirmationCode}: ${err.message}`, err);

      // Rollback: attempt to delete partially restored booking
      if (typeof restoredBookingId !== 'undefined' && restoredBookingId) {
        try {
          await bookingRepository.deleteBookingTransactional(restoredBookingId, 'system-backup-rollback@faretransit.com', ipAddress);
          logger.info(`[BACKUP_RESTORE] Rolled back partial restore of ${confirmationCode} (${restoredBookingId}).`);
        } catch (rollbackErr) {
          logger.error(`[BACKUP_RESTORE] Rollback failed for ${confirmationCode}: ${rollbackErr.message}`);
        }
      }

      return {
        success: false,
        status: 'FAILED',
        confirmationCode,
        code: 'RESTORE_FAILED',
        message: `Failed to restore ${confirmationCode}: ${err.message}`
      };
    }
  }
};

export default bookingRepository;

