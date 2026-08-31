import bookingService from './booking.service.mjs';
import supabase from '../../integrations/supabase/supabase.client.mjs';
import logger from '../../config/logger.mjs';

const BAGGAGE_MARKUP_RATE = 0.20;

const clean = (value, max = 1000) => {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
};

const normalizeBaggageCount = value => Math.max(0, Math.min(6, Number.parseInt(value, 10) || 0));
const money = value => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Number(parsed.toFixed(2)) : 0;
};

function normalizeBaggageQuote(rawQuote, requestedCount) {
  if (!rawQuote || typeof rawQuote !== 'object' || requestedCount <= 0) return null;
  const rawItems = Array.isArray(rawQuote.items) ? rawQuote.items.slice(0, requestedCount) : [];
  const items = rawItems.map((item, index) => {
    const sourcePrice = money(item?.sourcePrice);
    if (sourcePrice <= 0) return null;
    return {
      bagNumber: Math.max(1, Math.min(6, Number.parseInt(item?.bagNumber, 10) || index + 1)),
      label: clean(item?.label, 80) || `${index + 1} checked bag`,
      sourcePrice,
      customerPrice: money(sourcePrice * (1 + BAGGAGE_MARKUP_RATE)),
      currency: (clean(item?.currency || rawQuote.currency, 3) || 'USD').toUpperCase(),
      scope: clean(item?.scope || rawQuote.scope, 30),
      sourceLabel: clean(item?.sourceLabel, 250),
    };
  }).filter(Boolean);

  if (!items.length) return null;
  const currency = (clean(rawQuote.currency || items[0]?.currency, 3) || 'USD').toUpperCase();
  const sourceTotal = money(items.reduce((sum, item) => sum + item.sourcePrice, 0));
  const customerTotal = money(items.reduce((sum, item) => sum + item.customerPrice, 0));

  return {
    source: clean(rawQuote.source, 40) || 'GOOGLE_FLIGHTS',
    currency,
    markupRate: BAGGAGE_MARKUP_RATE,
    scope: clean(rawQuote.scope || items[0]?.scope, 30),
    items,
    sourceTotal,
    customerTotal,
    quotedAt: clean(rawQuote.quotedAt, 80) || new Date().toISOString(),
  };
}

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
  const baggageQuote = normalizeBaggageQuote(
    source.additionalBaggageQuote
    ?? source.additional_baggage_quote
    ?? source.baggageQuote,
    additionalBaggageCount
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
    additional_baggage_quote: baggageQuote,
    additional_baggage_source_total: baggageQuote?.sourceTotal ?? null,
    additional_baggage_customer_total: baggageQuote?.customerTotal ?? null,
    additional_baggage_currency: baggageQuote?.currency ?? null,
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
      additionalBaggageQuote: null,
      additionalBaggageSourceTotal: null,
      additionalBaggageCustomerTotal: null,
      additionalBaggageCurrency: null,
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
  const baggageQuote = row.additional_baggage_quote && typeof row.additional_baggage_quote === 'object'
    ? row.additional_baggage_quote
    : null;
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
    additionalBaggageQuote: baggageQuote,
    additionalBaggageSourceTotal: row.additional_baggage_source_total === null || row.additional_baggage_source_total === undefined ? null : money(row.additional_baggage_source_total),
    additionalBaggageCustomerTotal: row.additional_baggage_customer_total === null || row.additional_baggage_customer_total === undefined ? null : money(row.additional_baggage_customer_total),
    additionalBaggageCurrency: row.additional_baggage_currency || baggageQuote?.currency || null,
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
    additional_baggage_quote: normalized.additional_baggage_quote,
    additional_baggage_source_total: normalized.additional_baggage_source_total,
    additional_baggage_customer_total: normalized.additional_baggage_customer_total,
    additional_baggage_currency: normalized.additional_baggage_currency,
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
