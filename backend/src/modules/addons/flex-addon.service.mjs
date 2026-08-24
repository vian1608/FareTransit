import supabase from '../../config/supabase.mjs';
import bookingRepository from '../bookings/booking.repository.mjs';

const TYPES = new Set(['TRAVEL_DATE','FLIGHT_TIME','FLIGHT','DESTINATION','OTHER']);
const STATUSES = new Set(['REQUESTED','REVIEWING','OPTION_FOUND','CUSTOMER_APPROVAL','REBOOKING','COMPLETED','DECLINED','CANCELLED']);

function flowError(message, code, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function publicFlex(row) {
  if (!row) return { addonType: 'FLEX_ASSIST', selected: false, rate: 0.10, price: 0, status: 'NOT_SELECTED', termsVersion: 'FLEX_V1' };
  return {
    addonType: 'FLEX_ASSIST',
    selected: true,
    rate: Number(row.metadata?.rate) || 0.10,
    price: Number(row.total_price || 0),
    status: row.status || 'ACTIVE',
    termsVersion: row.terms_version || 'FLEX_V1',
    disclaimer: row.metadata?.disclaimer || 'Flex Assist is an agency service, not travel insurance or an airline flexible fare. Airline rules and fare differences may still apply.',
  };
}

async function getBooking(reference) {
  const booking = await bookingRepository.getById(reference);
  if (!booking) throw flowError('Booking not found.', 'BOOKING_NOT_FOUND', 404);
  return booking;
}

async function verifyEmail(booking, email) {
  const expected = String(booking?.email || '').trim().toLowerCase();
  const provided = String(email || '').trim().toLowerCase();
  if (!expected || !provided || expected !== provided) throw flowError('The booking email is required to use Flex Assist.', 'BOOKING_EMAIL_VERIFICATION_FAILED', 403);
}

export const flexAddonService = {
  TYPES: [...TYPES],
  STATUSES: [...STATUSES],

  async persistForBooking(bookingId, quote = {}) {
    if (!bookingId) return null;
    if (!quote?.flexAssist?.selected) {
      await supabase.from('booking_addons').delete().eq('booking_id', bookingId).eq('addon_type', 'FLEX_ASSIST');
      return null;
    }
    const row = {
      booking_id: bookingId,
      addon_type: 'FLEX_ASSIST',
      quantity: 1,
      unit_price: Number(quote.flexAssist.price || 0),
      total_price: Number(quote.flexAssist.price || 0),
      currency: quote.currency || 'USD',
      pricing_source: 'FORMULA',
      status: quote.flexAssist.status || 'ACTIVE',
      terms_version: quote.flexAssist.termsVersion || 'FLEX_V1',
      metadata: quote.flexAssist,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('booking_addons').upsert(row, { onConflict: 'booking_id,addon_type' }).select('*').single();
    if (error) throw error;
    return data;
  },

  async getForBooking(bookingId) {
    if (!bookingId) return publicFlex(null);
    const { data, error } = await supabase.from('booking_addons').select('*').eq('booking_id', bookingId).eq('addon_type', 'FLEX_ASSIST').maybeSingle();
    if (error) {
      if (error.code === '42P01') return publicFlex(null);
      throw error;
    }
    return publicFlex(data);
  },

  async getForBookings(bookingIds = []) {
    const ids = [...new Set((bookingIds || []).filter(Boolean))];
    if (!ids.length) return new Map();
    const { data, error } = await supabase.from('booking_addons').select('*').in('booking_id', ids).eq('addon_type', 'FLEX_ASSIST');
    if (error) {
      if (error.code === '42P01') return new Map();
      throw error;
    }
    return new Map((data || []).map((row) => [row.booking_id, publicFlex(row)]));
  },

  async createChangeRequest(reference, input = {}) {
    const booking = await getBooking(reference);
    await verifyEmail(booking, input.email);
    const { data: flexRow, error: flexError } = await supabase.from('booking_addons').select('*').eq('booking_id', booking.id).eq('addon_type', 'FLEX_ASSIST').maybeSingle();
    if (flexError) throw flexError;
    if (!flexRow || !['ACTIVE','USED'].includes(String(flexRow.status || '').toUpperCase()) || String(flexRow.status).toUpperCase() === 'USED') {
      throw flowError('Flex Assist is not active on this booking.', 'FLEX_ASSIST_NOT_ACTIVE', 409);
    }
    const requestType = String(input.requestType || '').trim().toUpperCase();
    if (!TYPES.has(requestType)) throw flowError('Choose a valid change request type.', 'INVALID_FLEX_REQUEST_TYPE');
    const requestedDetails = input.requestedDetails && typeof input.requestedDetails === 'object' ? input.requestedDetails : { notes: String(input.notes || '').trim() };
    const { data, error } = await supabase.from('flex_change_requests').insert({
      booking_addon_id: flexRow.id,
      booking_id: booking.id,
      request_type: requestType,
      requested_details: requestedDetails,
      status: 'REQUESTED',
    }).select('*').single();
    if (error) throw error;
    return { id: data.id, requestType: data.request_type, requestedDetails: data.requested_details, status: data.status, createdAt: data.created_at, updatedAt: data.updated_at };
  },

  async listCustomer(reference, email) {
    const booking = await getBooking(reference);
    await verifyEmail(booking, email);
    const { data, error } = await supabase.from('flex_change_requests').select('*').eq('booking_id', booking.id).order('created_at', { ascending: false });
    if (error) {
      if (error.code === '42P01') return [];
      throw error;
    }
    return (data || []).map((row) => ({ id: row.id, requestType: row.request_type, requestedDetails: row.requested_details, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at }));
  },

  async listAdmin(reference) {
    const booking = await getBooking(reference);
    const { data, error } = await supabase.from('flex_change_requests').select('*').eq('booking_id', booking.id).order('created_at', { ascending: false });
    if (error) {
      if (error.code === '42P01') return [];
      throw error;
    }
    return data || [];
  },

  async updateChangeRequest(reference, requestId, input = {}) {
    const booking = await getBooking(reference);
    const status = String(input.status || '').trim().toUpperCase();
    if (!STATUSES.has(status)) throw flowError('Invalid Flex change-request status.', 'INVALID_FLEX_STATUS');
    const patch = { status, updated_at: new Date().toISOString() };
    if (input.adminNotes !== undefined) patch.admin_notes = String(input.adminNotes || '').trim() || null;
    const { data, error } = await supabase.from('flex_change_requests').update(patch).eq('id', requestId).eq('booking_id', booking.id).select('*').maybeSingle();
    if (error) throw error;
    if (!data) throw flowError('Flex change request not found.', 'FLEX_REQUEST_NOT_FOUND', 404);
    if (status === 'COMPLETED') await supabase.from('booking_addons').update({ status: 'USED', updated_at: new Date().toISOString() }).eq('id', data.booking_addon_id);
    return data;
  },
};

export default flexAddonService;
