import bcrypt from 'bcryptjs';
import env from '../../config/env.mjs';
import logger from '../../config/logger.mjs';
import supabase from '../../integrations/supabase/supabase.client.mjs';
import authRepository from '../auth/auth.repository.mjs';
import bookingRepository from '../bookings/booking.repository.mjs';

const DEFAULT_TIMEOUT_MS = 7000;

function withTimeout(promise, ms = DEFAULT_TIMEOUT_MS, label = 'operation') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${label} timed out after ${ms}ms`);
      err.code = 'OPERATION_TIMEOUT';
      reject(err);
    }, ms);
  });

  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

function isIgnorableSchemaError(error) {
  const text = String(error?.message || error || '').toLowerCase();
  return (
    text.includes('schema cache') ||
    text.includes('does not exist') ||
    text.includes('not found') ||
    text.includes('relation') && text.includes('does not exist')
  );
}

async function verifyAdminPassword(req, adminPassword) {
  if (!adminPassword) return false;

  if (req.user?.email) {
    try {
      const user = await withTimeout(
        authRepository.findUserByEmail(req.user.email),
        4000,
        'admin credential lookup'
      );
      if (user?.password && await bcrypt.compare(adminPassword, user.password)) {
        return true;
      }
    } catch (error) {
      logger.warn(`[AdminRepair] Admin password lookup failed: ${error.message}`);
    }
  }

  // Environment fallback is allowed only when explicitly configured.
  // There is deliberately no hard-coded default password.
  if (env.adminPassword && adminPassword === env.adminPassword) {
    return true;
  }

  return false;
}

async function deleteRows(table, column, value, timeoutMs = 5000) {
  if (!value) return { ok: true, skipped: true };

  try {
    const result = await withTimeout(
      supabase.from(table).delete().eq(column, value),
      timeoutMs,
      `delete ${table}`
    );

    if (result?.error && !isIgnorableSchemaError(result.error)) {
      return { ok: false, table, error: result.error.message };
    }

    return { ok: true, table, warning: result?.error?.message || null };
  } catch (error) {
    return { ok: false, table, error: error.message, timeout: error.code === 'OPERATION_TIMEOUT' };
  }
}

async function permanentlyDeleteBooking(idOrCode, adminEmail, ipAddress) {
  const booking = await withTimeout(
    bookingRepository.getById(idOrCode),
    7000,
    'booking lookup before delete'
  );

  if (!booking?.id) {
    return {
      success: false,
      code: 'BOOKING_NOT_FOUND',
      message: `Booking '${idOrCode}' was not found.`
    };
  }

  const realId = booking.id;
  const confirmationCode = booking.confirmation_code || booking.confirmationCode || realId;

  // Delete dependency rows concurrently. A missing legacy table must never make
  // the dashboard spinner hang forever; the booking-row delete below is the
  // authoritative operation and will still report any FK constraint failure.
  const dependencyDeletes = [
    ['email_logs', 'booking_id', realId],
    ['email_logs', 'booking_reference', confirmationCode],
    ['email_deliveries', 'booking_id', realId],
    ['passenger_authorizations', 'booking_id', realId],
    ['authorization_snapshots', 'booking_id', realId],
    ['payment_authorization_splits', 'booking_id', realId],
    ['payments', 'booking_id', realId],
    ['payment_methods', 'booking_id', realId],
    ['booking_payment_methods', 'booking_id', realId],
    ['ticket_details', 'booking_id', realId],
    ['ticket_snapshots', 'booking_id', realId],
    ['booking_itinerary_segments', 'booking_id', realId],
    ['flights', 'booking_id', realId],
    ['travellers', 'booking_id', realId],
    ['contacts', 'booking_id', realId],
    ['booking_status_audits', 'booking_id', realId]
  ];

  const dependencyResults = await Promise.all(
    dependencyDeletes.map(([table, column, value]) => deleteRows(table, column, value))
  );

  const dependencyFailures = dependencyResults.filter(result => !result.ok);
  if (dependencyFailures.length > 0) {
    logger.warn('[AdminRepair] Dependency delete notices', {
      bookingId: realId,
      failures: dependencyFailures
    });
  }

  const deleteResult = await withTimeout(
    supabase
      .from('bookings')
      .delete()
      .eq('id', realId)
      .select('id, confirmation_code'),
    8000,
    'delete booking row'
  );

  if (deleteResult?.error) {
    return {
      success: false,
      code: 'BOOKING_DELETE_FAILED',
      message: deleteResult.error.message,
      dependencyFailures
    };
  }

  const verifyResult = await withTimeout(
    supabase.from('bookings').select('id').eq('id', realId).maybeSingle(),
    5000,
    'verify booking deletion'
  );

  if (verifyResult?.data?.id) {
    return {
      success: false,
      code: 'BOOKING_DELETE_NOT_PERSISTED',
      message: 'The database still contains the booking after the delete request.',
      dependencyFailures
    };
  }

  // Mark the repository memory copy as deleted so subsequent detail reads do
  // not resurrect a row that has already been removed from Supabase.
  try {
    await withTimeout(
      bookingRepository.updateStatus(realId, {
        _deleted: true,
        status: 'DELETED',
        deleted_at: new Date().toISOString(),
        deleted_by: adminEmail
      }),
      2500,
      'mark deleted booking cache'
    );
  } catch (error) {
    logger.warn(`[AdminRepair] Could not mark memory tombstone for ${realId}: ${error.message}`);
  }

  // Admin activity logging is useful but must never block a successful delete.
  try {
    await withTimeout(
      bookingRepository.logAdminActivity({
        action: 'BOOKING_DELETED',
        bookingReference: confirmationCode,
        deletedBy: adminEmail,
        ipAddress,
        details: { dependencyFailures }
      }),
      2000,
      'delete audit log'
    );
  } catch (error) {
    logger.warn(`[AdminRepair] Delete audit log warning for ${realId}: ${error.message}`);
  }

  return {
    success: true,
    message: `Booking ${confirmationCode} permanently deleted.`,
    bookingId: realId,
    deletedBookingId: realId,
    confirmationCode,
    dependencyWarnings: dependencyFailures
  };
}

function extractSegments(body = {}) {
  if (Array.isArray(body.segments)) return body.segments;
  if (Array.isArray(body.allSegments)) return body.allSegments;
  if (Array.isArray(body.itinerarySegments)) return body.itinerarySegments;

  if (body.itinerary && typeof body.itinerary === 'object') {
    const outbound = Array.isArray(body.itinerary.outbound) ? body.itinerary.outbound : [];
    const inbound = Array.isArray(body.itinerary.return)
      ? body.itinerary.return
      : (Array.isArray(body.itinerary.inbound) ? body.itinerary.inbound : []);

    return [
      ...outbound.map((segment, index) => ({
        ...segment,
        journey_direction: 'outbound',
        direction: 'outbound',
        segment_sequence: index + 1
      })),
      ...inbound.map((segment, index) => ({
        ...segment,
        journey_direction: 'return',
        direction: 'return',
        segment_sequence: index + 1
      }))
    ];
  }

  return [];
}

function normalizeItineraryType(value, rawSegments = []) {
  const raw = String(value || '').trim().toUpperCase().replace(/[-\s]+/g, '_');
  if (raw === 'MULTI_CITY' || raw === 'MULTICITY') return 'MULTI_CITY';
  if (raw === 'ROUND_TRIP' || raw === 'ROUNDTRIP') return 'ROUND_TRIP';
  if (raw === 'ONE_WAY' || raw === 'ONEWAY') return 'ONE_WAY';
  const hasReturn = rawSegments.some(segment => ['return', 'inbound'].includes(String(segment?.journey_direction || segment?.direction || segment?.leg || '').toLowerCase()));
  return hasReturn ? 'ROUND_TRIP' : 'ONE_WAY';
}

function normalizeSegments(rawSegments = [], itineraryType = 'ONE_WAY') {
  const type = normalizeItineraryType(itineraryType, rawSegments);
  const counters = new Map();

  return rawSegments.map((segment, index) => {
    const rawDirection = String(segment.journey_role || segment.journeyRole || segment.journey_direction || segment.direction || segment.leg || '').toUpperCase();
    let journeyIndex = Number(segment.journey_index || segment.journeyIndex || 0);
    let journeyRole;
    let direction;
    if (type === 'ONE_WAY') {
      journeyIndex = 1; journeyRole = 'OUTBOUND'; direction = 'outbound';
    } else if (type === 'ROUND_TRIP') {
      const isReturn = ['RETURN', 'INBOUND'].includes(rawDirection);
      journeyIndex = isReturn ? 2 : 1; journeyRole = isReturn ? 'RETURN' : 'OUTBOUND'; direction = isReturn ? 'return' : 'outbound';
    } else {
      journeyIndex = journeyIndex > 0 ? journeyIndex : 1; journeyRole = 'TRIP'; direction = 'multi_city';
    }
    const sequence = (counters.get(journeyIndex) || 0) + 1;
    counters.set(journeyIndex, sequence);
    const origin = String(segment.origin_airport || segment.originCode || segment.origin_code || segment.departureAirport || segment.departure_airport || '').trim().toUpperCase();
    const destination = String(segment.destination_airport || segment.destinationCode || segment.destination_code || segment.arrivalAirport || segment.arrival_airport || '').trim().toUpperCase();
    return {
      ...segment, itinerary_type: type, trip_type: type, journey_index: journeyIndex, journey_role: journeyRole,
      journey_direction: direction, direction, segment_sequence: sequence, segment_order: index + 1,
      origin_airport: origin, destination_airport: destination,
      carrier_code: String(segment.carrier_code || segment.marketing_carrier_code || segment.marketingAirlineCode || segment.airlineCode || '').trim().toUpperCase(),
      carrier_name: segment.carrier_name || segment.airline_name || segment.marketingAirlineName || segment.airlineName || '',
      flight_number: String(segment.flight_number || segment.flightNumber || '').trim(),
      departure_date: segment.departure_date || segment.departureDate || '', departure_time: segment.departure_time || segment.departureTime || '',
      arrival_date: segment.arrival_date || segment.arrivalDate || segment.departure_date || segment.departureDate || '', arrival_time: segment.arrival_time || segment.arrivalTime || '',
      cabin: segment.cabin || segment.cabin_class || segment.cabinClass || 'Economy'
    };
  }).filter(segment => segment.origin_airport && segment.destination_airport);
}

function validateJourneyContinuity(segments = []) {
  const groups = new Map();
  for (const segment of segments) {
    const index = Number(segment.journey_index || 1);
    if (!groups.has(index)) groups.set(index, []);
    groups.get(index).push(segment);
  }
  for (const [journeyIndex, group] of groups) {
    group.sort((a, b) => Number(a.segment_sequence || 0) - Number(b.segment_sequence || 0));
    for (let i = 0; i < group.length - 1; i += 1) {
      if (group[i].destination_airport !== group[i + 1].origin_airport) {
        return { valid: false, message: `Trip ${journeyIndex}: segment ${i + 1} ends at ${group[i].destination_airport}, but segment ${i + 2} starts at ${group[i + 1].origin_airport}.` };
      }
    }
  }
  return { valid: true };
}

async function getPersistedSegments(bookingId) {
  const normalized = await withTimeout(
    supabase
      .from('booking_itinerary_segments')
      .select('*')
      .eq('booking_id', bookingId)
      .order('segment_order', { ascending: true }),
    5000,
    'verify normalized itinerary persistence'
  );

  if (!normalized?.error && Array.isArray(normalized?.data) && normalized.data.length > 0) {
    return normalized.data;
  }

  // saveItinerarySegments intentionally falls back to the production `flights`
  // table if the normalized table is unavailable. Verification must recognize
  // that durable fallback, otherwise a successful multi-segment save is falsely
  // reported as ITINERARY_PERSISTENCE_MISMATCH.
  const fallback = await withTimeout(
    supabase
      .from('flights')
      .select('*')
      .eq('booking_id', bookingId)
      .order('departure_date', { ascending: true })
      .order('departure_time_str', { ascending: true }),
    5000,
    'verify legacy itinerary persistence'
  );

  if (fallback?.error) {
    const primaryMessage = normalized?.error?.message ? ` Normalized store: ${normalized.error.message}.` : '';
    throw new Error(`Unable to verify itinerary persistence.${primaryMessage} Legacy store: ${fallback.error.message}`);
  }

  return (fallback?.data || []).map((flight, index) => ({
    id: flight.id,
    booking_id: flight.booking_id,
    journey_direction: ['return', 'inbound'].includes(String(flight.leg || '').toLowerCase()) ? 'return' : 'outbound',
    direction: ['return', 'inbound'].includes(String(flight.leg || '').toLowerCase()) ? 'return' : 'outbound',
    segment_sequence: index + 1,
    segment_order: index + 1,
    carrier_name: flight.airline_name || '',
    carrier_code: flight.carrier_code || '',
    marketing_carrier_code: flight.carrier_code || '',
    flight_number: flight.flight_number || '',
    origin_airport: flight.departure_airport || '',
    destination_airport: flight.arrival_airport || '',
    departure_date: flight.departure_date || '',
    departure_time: flight.departure_time_str || '',
    arrival_date: flight.arrival_date || '',
    arrival_time: flight.arrival_time_str || '',
    cabin: flight.cabin_class || 'Economy',
    stop_count: Number.parseInt(flight.stops || 0, 10)
  }));
}

export const adminRepairController = {
  deleteBooking: async (req, res) => {
    const bookingId = req.params.id || req.params.bookingId;
    const { adminPassword } = req.body || {};

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_BOOKING_ID', message: 'A booking ID is required.' }
      });
    }

    if (!adminPassword) {
      return res.status(400).json({
        success: false,
        error: { code: 'PASSWORD_REQUIRED', message: 'Admin password is required.' }
      });
    }

    const validPassword = await verifyAdminPassword(req, adminPassword);
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_PASSWORD', message: 'Incorrect admin password. Deletion cancelled.' }
      });
    }

    try {
      const adminEmail = req.user?.email || env.adminEmail || 'admin';
      const ipAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || 'unknown';
      const result = await permanentlyDeleteBooking(bookingId, adminEmail, ipAddress);

      if (!result.success) {
        return res.status(result.code === 'BOOKING_NOT_FOUND' ? 404 : 409).json({
          success: false,
          error: { code: result.code, message: result.message },
          details: result
        });
      }

      return res.json(result);
    } catch (error) {
      const status = error.code === 'OPERATION_TIMEOUT' ? 504 : 500;
      logger.error(`[AdminRepair] Single delete failed: ${error.message}`);
      return res.status(status).json({
        success: false,
        error: {
          code: error.code || 'DELETE_FAILED',
          message: error.code === 'OPERATION_TIMEOUT'
            ? 'Deletion took too long. Refresh the booking list to verify whether it completed.'
            : error.message
        }
      });
    }
  },

  bulkDeleteBookings: async (req, res) => {
    const { bookingIds, adminPassword, confirmationText } = req.body || {};

    if (!Array.isArray(bookingIds) || bookingIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_IDS', message: 'Select at least one booking to delete.' }
      });
    }

    if (bookingIds.length > 50) {
      return res.status(400).json({
        success: false,
        error: { code: 'TOO_MANY_IDS', message: 'Delete at most 50 bookings at a time.' }
      });
    }

    if (confirmationText !== 'DELETE') {
      return res.status(400).json({
        success: false,
        error: { code: 'CONFIRMATION_REQUIRED', message: 'Type DELETE to confirm deletion.' }
      });
    }

    if (!adminPassword) {
      return res.status(400).json({
        success: false,
        error: { code: 'PASSWORD_REQUIRED', message: 'Admin password is required.' }
      });
    }

    const validPassword = await verifyAdminPassword(req, adminPassword);
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_PASSWORD', message: 'Incorrect admin password. Deletion cancelled.' }
      });
    }

    const adminEmail = req.user?.email || env.adminEmail || 'admin';
    const ipAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || 'unknown';
    const protectedReference = 'TFS-2026-HQ39GA';

    const results = await Promise.all(
      bookingIds.map(async id => {
        try {
          const booking = await withTimeout(bookingRepository.getById(id), 6000, 'bulk delete booking lookup');
          const reference = booking?.confirmation_code || booking?.confirmationCode || id;

          if (reference === protectedReference) {
            return {
              confirmationCode: reference,
              bookingId: booking?.id || id,
              status: 'PROTECTED',
              message: `${protectedReference} is protected and was not deleted.`
            };
          }

          const result = await permanentlyDeleteBooking(id, adminEmail, ipAddress);
          return result.success
            ? {
                confirmationCode: result.confirmationCode,
                bookingId: result.bookingId,
                status: 'DELETED',
                message: result.message
              }
            : {
                confirmationCode: reference,
                bookingId: booking?.id || id,
                status: 'FAILED',
                message: result.message,
                errorCode: result.code
              };
        } catch (error) {
          return {
            confirmationCode: id,
            bookingId: id,
            status: 'FAILED',
            message: error.code === 'OPERATION_TIMEOUT'
              ? 'Delete timed out. Refresh the list to verify current database state.'
              : error.message,
            errorCode: error.code || 'DELETE_FAILED'
          };
        }
      })
    );

    const deleted = results.filter(item => item.status === 'DELETED').length;
    const protectedCount = results.filter(item => item.status === 'PROTECTED').length;
    const failed = results.filter(item => item.status === 'FAILED').length;

    return res.json({
      success: true,
      summary: {
        requested: bookingIds.length,
        deleted,
        protected: protectedCount,
        failed
      },
      results
    });
  },

  updateItinerary: async (req, res) => {
    const bookingId = req.params.id || req.params.identifier;
    const body = req.body || {};

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_BOOKING_ID', message: 'A booking ID is required.' }
      });
    }

    try {
      const existing = await withTimeout(
        bookingRepository.getById(bookingId),
        7000,
        'load booking before itinerary save'
      );

      if (!existing?.id) {
        return res.status(404).json({
          success: false,
          error: { code: 'BOOKING_NOT_FOUND', message: 'Booking not found.' }
        });
      }

      if (body.clear === true || body.clearItinerary === true) {
        const deleteResult = await withTimeout(
          supabase.from('booking_itinerary_segments').delete().eq('booking_id', existing.id),
          7000,
          'clear itinerary segments'
        );
        if (deleteResult?.error) throw new Error(deleteResult.error.message);

        // Legacy flights are itinerary material too; clear both representations.
        const flightDelete = await withTimeout(
          supabase.from('flights').delete().eq('booking_id', existing.id),
          7000,
          'clear legacy flights'
        );
        if (flightDelete?.error && !isIgnorableSchemaError(flightDelete.error)) {
          throw new Error(flightDelete.error.message);
        }

        const refreshed = await bookingRepository.getCompleteBookingById(existing.id);
        return res.json({
          success: true,
          message: 'Itinerary cleared successfully.',
          booking: refreshed,
          data: refreshed,
          segments: []
        });
      }

      const rawSegments = extractSegments(body);
      const itineraryType = normalizeItineraryType(body.itineraryType || body.tripType || existing.itinerary_type, rawSegments);
      const segments = normalizeSegments(rawSegments, itineraryType);
      if (segments.length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'BOOKING_ITINERARY_MISSING',
            message: 'At least one valid flight segment is required. Import or enter a flight before saving.'
          }
        });
      }

      const continuity = validateJourneyContinuity(segments);
      if (!continuity.valid) {
        return res.status(400).json({ success: false, error: { code: 'DISCONNECTED_ITINERARY_JOURNEY', message: continuity.message } });
      }

      const invalid = segments.find(segment =>
        !/^[A-Z]{3}$/.test(segment.origin_airport) ||
        !/^[A-Z]{3}$/.test(segment.destination_airport)
      );
      if (invalid) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_AIRPORT_CODE',
            message: 'Every itinerary segment must contain valid 3-letter origin and destination airport codes.'
          }
        });
      }

      let saveTimedOut = false;
      try {
        await withTimeout(
          bookingRepository.saveItinerarySegments(existing.id, segments),
          12000,
          'save itinerary'
        );
      } catch (error) {
        if (error.code === 'OPERATION_TIMEOUT') {
          saveTimedOut = true;
        } else {
          throw error;
        }
      }

      const persisted = await getPersistedSegments(existing.id);
      if (persisted.length !== segments.length) {
        return res.status(saveTimedOut ? 504 : 409).json({
          success: false,
          error: {
            code: 'ITINERARY_PERSISTENCE_MISMATCH',
            message: `Itinerary save could not be verified. Expected ${segments.length} segment(s), database contains ${persisted.length}.`
          }
        });
      }

      const materialAuthorizationState = String(
        existing.authorization_status || existing.authorization?.status || existing.status || ''
      ).toUpperCase();
      const shouldRequireReauthorization = [
        'AUTHORIZED',
        'ACCEPTED',
        'READY_FOR_TICKETING',
        'TICKETED'
      ].includes(materialAuthorizationState);

      const bookingUpdate = { itinerary_type: itineraryType, updated_at: new Date().toISOString() };
      if (shouldRequireReauthorization) {
        bookingUpdate.status = 'REAUTHORIZATION_REQUIRED';
        bookingUpdate.authorization_status = 'REAUTHORIZATION_REQUIRED';
      }
      await withTimeout(
        bookingRepository.updateStatus(existing.id, bookingUpdate),
        6000,
        shouldRequireReauthorization ? 'invalidate authorization after itinerary change' : 'save itinerary type'
      );

      const refreshed = await bookingRepository.getCompleteBookingById(existing.id);
      return res.json({
        success: true,
        message: shouldRequireReauthorization
          ? 'Itinerary saved. Existing passenger authorization was invalidated because flight details changed.'
          : 'Itinerary saved successfully.',
        booking: refreshed,
        data: refreshed,
        segments: persisted,
        itineraryType,
        reauthorizationRequired: shouldRequireReauthorization,
        persistenceVerified: true
      });
    } catch (error) {
      logger.error(`[AdminRepair] Itinerary update failed for ${bookingId}: ${error.message}`);
      const status = error.code === 'OPERATION_TIMEOUT' ? 504 : 500;
      return res.status(status).json({
        success: false,
        error: {
          code: error.code || 'ITINERARY_SAVE_FAILED',
          message: error.code === 'OPERATION_TIMEOUT'
            ? 'Itinerary save took too long and could not be verified. Please retry.'
            : error.message
        }
      });
    }
  }
};

export default adminRepairController;
