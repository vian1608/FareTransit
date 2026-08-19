import supabase from '../../integrations/supabase/supabase.client.mjs';
import logger from '../../config/logger.mjs';
import bookingRepository from '../bookings/booking.repository.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`${label} timed out after ${ms}ms`);
      error.code = 'BACKUP_QUERY_TIMEOUT';
      reject(error);
    }, ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

function isOptionalTableError(error) {
  const text = String(error?.message || error || '').toLowerCase();
  return text.includes('schema cache') || text.includes('does not exist') || text.includes('relation') || text.includes('not found');
}

async function requiredQuery(label, query) {
  const result = await withTimeout(query, 6000, label);
  if (result?.error) throw new Error(`${label}: ${result.error.message}`);
  return Array.isArray(result?.data) ? result.data : [];
}

async function optionalQuery(label, query) {
  try {
    const result = await withTimeout(query, 6000, label);
    if (result?.error) {
      if (!isOptionalTableError(result.error)) {
        logger.warn(`[BackupExport] ${label}: ${result.error.message}`);
      }
      return [];
    }
    return Array.isArray(result?.data) ? result.data : [];
  } catch (error) {
    logger.warn(`[BackupExport] ${label}: ${error.message}`);
    return [];
  }
}

function groupByBookingId(rows = []) {
  return rows.reduce((map, row) => {
    const id = row?.booking_id;
    if (!id) return map;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(row);
    return map;
  }, new Map());
}

function flightsToSegments(flights = []) {
  let outboundSeq = 1;
  let returnSeq = 1;
  return flights.map(flight => {
    const direction = ['return', 'inbound'].includes(String(flight.leg || flight.direction || '').toLowerCase()) ? 'return' : 'outbound';
    const sequence = direction === 'return' ? returnSeq++ : outboundSeq++;
    return {
      id: flight.id,
      booking_id: flight.booking_id,
      journey_direction: direction,
      direction,
      segment_sequence: sequence,
      carrier_name: flight.airline_name || flight.carrier_name || '',
      carrier_code: flight.carrier_code || flight.marketing_carrier_code || '',
      marketing_carrier_code: flight.carrier_code || flight.marketing_carrier_code || '',
      flight_number: flight.flight_number || '',
      origin_airport: flight.departure_airport || flight.origin_airport || '',
      destination_airport: flight.arrival_airport || flight.destination_airport || '',
      departure_date: flight.departure_date || '',
      departure_time: flight.departure_time_str || flight.departure_time || '',
      arrival_date: flight.arrival_date || flight.departure_date || '',
      arrival_time: flight.arrival_time_str || flight.arrival_time || '',
      cabin: flight.cabin_class || flight.cabin || 'Economy',
      stop_count: Number.parseInt(flight.stops || 0, 10) || 0,
      _source: 'flights_table'
    };
  });
}

async function loadBaseBookings(bookingIds) {
  const uuidIds = bookingIds.filter(id => UUID_RE.test(id));
  const referenceIds = bookingIds.filter(id => !UUID_RE.test(id));

  const requests = [];
  if (uuidIds.length) {
    requests.push(requiredQuery('load selected bookings by UUID', supabase.from('bookings').select('*').in('id', uuidIds)));
  }
  if (referenceIds.length) {
    requests.push(requiredQuery('load selected bookings by reference', supabase.from('bookings').select('*').in('confirmation_code', referenceIds)));
  }

  const groups = requests.length ? await Promise.all(requests) : [];
  const rows = groups.flat();
  const byId = new Map(rows.map(row => [row.id, row]));
  const byRef = new Map(rows.map(row => [row.confirmation_code, row]));

  return bookingIds
    .map(input => UUID_RE.test(input) ? byId.get(input) : byRef.get(input))
    .filter(Boolean);
}

const adminBackupController = {
  exportBookingsBulk: async (req, res, next) => {
    const startedAt = Date.now();
    try {
      const rawIds = req.body?.bookingIds;
      if (!Array.isArray(rawIds) || rawIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_IDS', message: 'bookingIds must be a non-empty array.' }
        });
      }

      const bookingIds = [...new Set(rawIds.map(id => String(id || '').trim()).filter(Boolean))];
      if (bookingIds.length > 100) {
        return res.status(400).json({
          success: false,
          error: { code: 'TOO_MANY_IDS', message: 'Cannot export more than 100 bookings at once.' }
        });
      }

      const baseBookings = await loadBaseBookings(bookingIds);
      if (baseBookings.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'BOOKINGS_NOT_FOUND', message: 'None of the selected bookings could be found.' }
        });
      }

      const realIds = baseBookings.map(booking => booking.id);

      /*
       * Fetch every relation in parallel and in batches. The previous exporter
       * hydrated each booking one-by-one and re-entered getRelations through
       * getPaymentSplits, which could exceed the browser's 20 second timeout.
       */
      const [
        travellers,
        contacts,
        flights,
        payments,
        itinerarySegments,
        canonicalSplits,
        legacySplits,
        paymentMethods,
        authSnapshots,
        ticketSnapshots,
        auditEvents,
        emailLogs
      ] = await Promise.all([
        optionalQuery('travellers', supabase.from('travellers').select('*').in('booking_id', realIds)),
        optionalQuery('contacts', supabase.from('contacts').select('*').in('booking_id', realIds)),
        optionalQuery('flights', supabase.from('flights').select('*').in('booking_id', realIds)),
        optionalQuery('payments', supabase.from('payments').select('*').in('booking_id', realIds)),
        optionalQuery('itinerary segments', supabase.from('booking_itinerary_segments').select('*').in('booking_id', realIds).order('segment_sequence', { ascending: true })),
        optionalQuery('payment authorization splits', supabase.from('payment_authorization_splits').select('*').in('booking_id', realIds)),
        optionalQuery('legacy payment splits', supabase.from('payment_splits').select('*').in('booking_id', realIds)),
        optionalQuery('payment methods', supabase.from('booking_payment_methods').select('*').in('booking_id', realIds).is('removed_at', null)),
        optionalQuery('authorization snapshots', supabase.from('authorization_snapshots').select('*').in('booking_id', realIds)),
        optionalQuery('ticket snapshots', supabase.from('ticket_snapshots').select('*').in('booking_id', realIds)),
        optionalQuery('audit events', supabase.from('audit_events').select('*').in('booking_id', realIds)),
        optionalQuery('email logs', supabase.from('email_logs').select('*').in('booking_id', realIds))
      ]);

      const travellersById = groupByBookingId(travellers);
      const contactsById = groupByBookingId(contacts);
      const flightsById = groupByBookingId(flights);
      const paymentsById = groupByBookingId(payments);
      const segmentsById = groupByBookingId(itinerarySegments);
      const canonicalSplitsById = groupByBookingId(canonicalSplits);
      const legacySplitsById = groupByBookingId(legacySplits);
      const paymentMethodsById = groupByBookingId(paymentMethods);
      const authSnapshotsById = groupByBookingId(authSnapshots);
      const ticketSnapshotsById = groupByBookingId(ticketSnapshots);
      const auditEventsById = groupByBookingId(auditEvents);
      const emailLogsById = groupByBookingId(emailLogs);

      const bookings = baseBookings.map(baseBooking => {
        const id = baseBooking.id;
        const bookingFlights = flightsById.get(id) || [];
        const savedSegments = segmentsById.get(id) || [];
        const finalSegments = savedSegments.length ? savedSegments : flightsToSegments(bookingFlights);
        const paymentSplits = (canonicalSplitsById.get(id) || []).length
          ? canonicalSplitsById.get(id)
          : (legacySplitsById.get(id) || []);
        const paymentMethod = (paymentMethodsById.get(id) || [])[0] || null;

        const relations = {
          travellers: travellersById.get(id) || [],
          contacts: contactsById.get(id) || [],
          flights: bookingFlights,
          payments: paymentsById.get(id) || [],
          itinerarySegments: finalSegments,
          paymentSplits,
          paymentMethod,
          emailLogs: emailLogsById.get(id) || []
        };

        const enriched = bookingRepository.enrichBookingRecord(baseBooking, relations);
        const exportData = {
          exported_at: new Date().toISOString(),
          booking: enriched,
          itinerary_segments: finalSegments,
          travellers: relations.travellers,
          contacts: relations.contacts,
          flights: bookingFlights,
          payments: relations.payments,
          payment_splits: paymentSplits,
          payment_method: paymentMethod,
          authorization_snapshots: authSnapshotsById.get(id) || [],
          ticket_snapshots: ticketSnapshotsById.get(id) || [],
          audit_logs: auditEventsById.get(id) || [],
          email_logs: relations.emailLogs
        };

        return bookingRepository.sanitizeBookingForExport(exportData);
      });

      const backupDocument = {
        format: 'THE_FINAL_SEAT_BOOKING_BACKUP',
        version: 1,
        exportedAt: new Date().toISOString(),
        bookingCount: bookings.length,
        requestedCount: bookingIds.length,
        missingCount: Math.max(0, bookingIds.length - bookings.length),
        durationMs: Date.now() - startedAt,
        bookings
      };

      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = bookings.length === 1 && bookings[0]?.booking?.confirmation_code
        ? `fare-transit-booking-${bookings[0].booking.confirmation_code}.json`
        : `fare-transit-bookings-backup-${dateStr}.json`;

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-store');

      logger.info(`[BackupExport] Exported ${bookings.length}/${bookingIds.length} booking(s) in ${backupDocument.durationMs}ms.`);
      return res.status(200).json(backupDocument);
    } catch (error) {
      logger.error(`[BackupExport] Failed after ${Date.now() - startedAt}ms: ${error.message}`, error);
      if (error.code === 'BACKUP_QUERY_TIMEOUT') {
        return res.status(504).json({
          success: false,
          error: { code: 'BACKUP_EXPORT_TIMEOUT', message: 'The database took too long to prepare this backup. Please retry.' }
        });
      }
      return next(error);
    }
  }
};

export default adminBackupController;
