import supabase from '../../config/supabase.mjs';

const REQUEST_SELECT = `
  *,
  traveller:travellers(id, first_name, middle_name, last_name),
  booking:bookings(id, confirmation_code, email, currency, passenger_name),
  quotes:addon_quotes(*),
  payments:addon_payments(*),
  fulfillments:addon_fulfillments(*)
`;

function dbError(error, context) {
  if (!error) return;
  const err = new Error(`${context}: ${error.message}`);
  err.code = error.code || 'ADDON_DATABASE_ERROR';
  err.details = error.details || null;
  throw err;
}

function normalizeDirection(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized === 'RETURN' ? 'RETURN' : 'OUTBOUND';
}

function normalizeRequestRows(bookingId, travellers = [], rawRequests = []) {
  if (!bookingId || !Array.isArray(rawRequests)) return [];

  return rawRequests.map((request) => {
    const quantity = Math.max(0, Math.min(3, Number.parseInt(request?.quantity, 10) || 0));
    if (quantity < 1) return null;
    const passengerIndex = Math.max(0, Number.parseInt(request?.passengerIndex ?? request?.passenger_index, 10) || 0);
    const traveller = travellers[passengerIndex];
    if (!traveller?.id) return null;
    return {
      booking_id: bookingId,
      traveller_id: traveller.id,
      passenger_index: passengerIndex,
      addon_type: 'CHECKED_BAGGAGE',
      journey_direction: normalizeDirection(request?.journeyDirection ?? request?.journey_direction),
      quantity,
      requested_weight_kg: Number(request?.requestedWeightKg ?? request?.requested_weight_kg ?? 23) || 23,
      terms_version: request?.termsVersion || request?.terms_version || 'BAGGAGE_REQUEST_V1',
      metadata: request?.metadata && typeof request.metadata === 'object' ? request.metadata : {},
      status: 'REQUESTED',
      updated_at: new Date().toISOString()
    };
  }).filter(Boolean);
}

export const addonRepository = {
  async upsertBookingRequests(bookingId, travellers, rawRequests) {
    const rows = normalizeRequestRows(bookingId, travellers, rawRequests);
    if (rows.length === 0) return [];
    const { data, error } = await supabase.from('booking_addon_requests').upsert(rows, { onConflict: 'booking_id,traveller_id,addon_type,journey_direction', ignoreDuplicates: false }).select(REQUEST_SELECT);
    dbError(error, 'Unable to save baggage request');
    return data || [];
  },

  async listByBookingId(bookingId) {
    if (!bookingId) return [];
    const { data, error } = await supabase.from('booking_addon_requests').select(REQUEST_SELECT).eq('booking_id', bookingId).order('passenger_index', { ascending: true }).order('journey_direction', { ascending: true });
    dbError(error, 'Unable to load baggage requests');
    return data || [];
  },

  async listByBookingIds(bookingIds = []) {
    const ids = [...new Set((bookingIds || []).filter(Boolean))];
    if (ids.length === 0) return [];
    const { data, error } = await supabase.from('booking_addon_requests').select(REQUEST_SELECT).in('booking_id', ids).order('created_at', { ascending: true });
    dbError(error, 'Unable to load booking add-ons');
    return data || [];
  },

  async getRequest(requestId) {
    const { data, error } = await supabase.from('booking_addon_requests').select(REQUEST_SELECT).eq('id', requestId).maybeSingle();
    dbError(error, 'Unable to load baggage request');
    return data || null;
  },

  async updateRequestStatus(requestId, status) {
    const { data, error } = await supabase.from('booking_addon_requests').update({ status, updated_at: new Date().toISOString() }).eq('id', requestId).select(REQUEST_SELECT).single();
    dbError(error, 'Unable to update baggage request status');
    return data;
  },

  async upsertQuote(requestId, quote) {
    const row = { addon_request_id: requestId, supplier_cost: quote.supplierCost, customer_price: quote.customerPrice, currency: String(quote.currency || 'USD').toUpperCase(), valid_until: quote.validUntil || null, status: 'ACTIVE', updated_at: new Date().toISOString() };
    const { data, error } = await supabase.from('addon_quotes').upsert(row, { onConflict: 'addon_request_id' }).select('*').single();
    dbError(error, 'Unable to save baggage quote');
    return data;
  },

  async updateQuoteStatus(quoteId, status) {
    const { data, error } = await supabase.from('addon_quotes').update({ status, updated_at: new Date().toISOString() }).eq('id', quoteId).select('*').single();
    dbError(error, 'Unable to update baggage quote status');
    return data;
  },

  async insertPayment(requestId, quoteId, payment) {
    const status = String(payment.status || 'PAID').toUpperCase();
    const row = { addon_request_id: requestId, addon_quote_id: quoteId || null, booking_id: payment.bookingId, amount: payment.amount, currency: String(payment.currency || 'USD').toUpperCase(), payment_provider: payment.paymentProvider || 'manual', provider_transaction_id: payment.providerTransactionId || null, status, paid_at: status === 'PAID' ? (payment.paidAt || new Date().toISOString()) : null };
    const query = row.provider_transaction_id ? supabase.from('addon_payments').upsert(row, { onConflict: 'provider_transaction_id' }) : supabase.from('addon_payments').insert(row);
    const { data, error } = await query.select('*').single();
    dbError(error, 'Unable to record baggage payment');
    return data;
  },

  async getPaymentByProviderTransactionId(providerTransactionId) {
    if (!providerTransactionId) return null;
    const { data, error } = await supabase.from('addon_payments').select('*').eq('provider_transaction_id', providerTransactionId).maybeSingle();
    dbError(error, 'Unable to load baggage payment');
    return data || null;
  },

  async upsertFulfillment(requestId, fulfillment) {
    const { data, error } = await supabase.from('addon_fulfillments').upsert({ addon_request_id: requestId, supplier: fulfillment.supplier || null, supplier_reference: fulfillment.supplierReference || null, status: fulfillment.status || 'CONFIRMED', confirmed_at: fulfillment.confirmedAt || new Date().toISOString(), notes: fulfillment.notes || null, updated_at: new Date().toISOString() }, { onConflict: 'addon_request_id' }).select('*').single();
    dbError(error, 'Unable to save baggage fulfillment');
    return data;
  },

  async getQuoteByToken(token) {
    const { data, error } = await supabase.from('addon_quotes').select(`*, request:booking_addon_requests(${REQUEST_SELECT})`).eq('public_token', token).maybeSingle();
    dbError(error, 'Unable to load baggage offer');
    return data || null;
  }
};

export default addonRepository;
