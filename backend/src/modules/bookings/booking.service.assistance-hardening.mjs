import bookingService from './booking.service.mjs';
import supabase from '../../integrations/supabase/supabase.client.mjs';
import logger from '../../config/logger.mjs';

const clean = (value, max = 1000) => {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
};

const normalizeBaggageCount = value => Math.max(0, Math.min(6, Number.parseInt(value, 10) || 0));

function normalizeAssistance(payload = {}) {
  const source = payload.assistance
    || payload.specialRequests
    || payload.special_requests
    || payload.flight?.specialRequests
    || payload.flight?.special_requests
    || {};

  const mealPreference = clean(source.mealPreference ?? source.meal_preference, 60) || 'none';
  const seatPreference = clean(source.seatingPreference ?? source.seatPreference ?? source.seat_preference, 60) || 'none';
  const wheelchairRequired = Boolean(source.wheelchair ?? source.wheelchairRequired ?? source.wheelchair_required);
  const additionalRequest = clean(source.notes ?? source.additionalRequest ?? source.additional_request, 3000);
  const additionalBaggageCount = normalizeBaggageCount(
    source.additionalBaggageCount
    ?? source.baggageCount
    ?? source.additional_baggage_count
    ?? 0
  );
  const hasSpecialAssistance = wheelchairRequired
    || mealPreference !== 'none'
    || seatPreference !== 'none'
    || additionalBaggageCount > 0
    || Boolean(additionalRequest);

  return {
    meal_preference: mealPreference,
    seat_preference: seatPreference,
    wheelchair_required: wheelchairRequired,
    additional_baggage_count: additionalBaggageCount,
    additional_request: additionalRequest,
    assistance_status: hasSpecialAssistance ? 'REQUESTED' : 'NONE',
    hasSpecialAssistance,
  };
}

function publicAssistance(row = null) {
  if (!row) {
    return {
      mealPreference: 'none',
      seatPreference: 'none',
      wheelchairRequired: false,
      additionalBaggageCount: 0,
      additionalRequest: null,
      assistanceStatus: 'NONE',
      hasSpecialAssistance: false,
    };
  }

  const mealPreference = row.meal_preference || 'none';
  const seatPreference = row.seat_preference || 'none';
  const wheelchairRequired = Boolean(row.wheelchair_required);
  const additionalBaggageCount = normalizeBaggageCount(row.additional_baggage_count);
  const additionalRequest = row.additional_request || null;
  const hasSpecialAssistance = wheelchairRequired
    || mealPreference !== 'none'
    || seatPreference !== 'none'
    || additionalBaggageCount > 0
    || Boolean(additionalRequest);

  return {
    id: row.id || null,
    mealPreference,
    seatPreference,
    wheelchairRequired,
    additionalBaggageCount,
    additionalRequest,
    assistanceStatus: row.assistance_status || (hasSpecialAssistance ? 'REQUESTED' : 'NONE'),
    hasSpecialAssistance,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function attachAssistance(booking, row) {
  if (!booking || typeof booking !== 'object') return booking;
  const assistance = publicAssistance(row);
  return {
    ...booking,
    assistance,
    specialAssistance: assistance,
    special_assistance: assistance,
    hasSpecialAssistance: assistance.hasSpecialAssistance,
    has_special_assistance: assistance.hasSpecialAssistance,
  };
}

async function getRow(bookingId) {
  if (!bookingId) return null;
  const { data, error } = await supabase
    .from('booking_service_requests')
    .select('*')
    .eq('booking_id', bookingId)
    .maybeSingle();
  if (error) {
    if (error.code === '42P01') return null;
    throw error;
  }
  return data || null;
}

async function persistAssistance(bookingId, payload) {
  if (!bookingId) return null;
  const normalized = normalizeAssistance(payload);
  const row = {
    booking_id: bookingId,
    meal_preference: normalized.meal_preference,
    seat_preference: normalized.seat_preference,
    wheelchair_required: normalized.wheelchair_required,
    additional_baggage_count: normalized.additional_baggage_count,
    additional_request: normalized.additional_request,
    assistance_status: normalized.assistance_status,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('booking_service_requests')
    .upsert(row, { onConflict: 'booking_id' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

if (!bookingService.__fareTransitAssistanceHardening) {
  const coreCreate = bookingService.create?.bind(bookingService);
  const coreDetails = bookingService.getDetailsByCodeOrId?.bind(bookingService);

  if (coreCreate) {
    bookingService.create = async (payload = {}) => {
      const result = await coreCreate(payload);
      const bookingId = result?.id || result?.booking?.id;
      if (!bookingId) return result;
      try {
        const row = await persistAssistance(bookingId, payload);
        return attachAssistance(result, row);
      } catch (error) {
        logger.error(`[Assistance] Unable to persist booking service request for ${bookingId}: ${error.message}`);
        throw error;
      }
    };
  }

  if (coreDetails) {
    bookingService.getDetailsByCodeOrId = async (...args) => {
      const booking = await coreDetails(...args);
      if (!booking?.id) return booking;
      try {
        return attachAssistance(booking, await getRow(booking.id));
      } catch (error) {
        logger.warn(`[Assistance] Unable to enrich booking ${booking.id}: ${error.message}`);
        return booking;
      }
    };
  }

  Object.defineProperty(bookingService, '__fareTransitAssistanceHardening', {
    value: true,
    enumerable: false,
    writable: false,
    configurable: false,
  });
}

export { normalizeAssistance, publicAssistance };
export default bookingService;
