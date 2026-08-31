import supabase from '../../config/supabase.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ASSISTANCE_STATUSES = new Set(['NONE', 'REQUESTED', 'ACKNOWLEDGED', 'COMPLETED']);

const cleanRef = value => String(value || '').trim();

function hasSpecialAssistance(row = {}) {
  return Boolean(
    row.wheelchair_required
    || (row.meal_preference && row.meal_preference !== 'none')
    || (row.seat_preference && row.seat_preference !== 'none')
    || String(row.additional_request || '').trim()
  );
}

function publicAssistance(row = null) {
  const source = row || {};
  const hasRequest = hasSpecialAssistance(source);
  return {
    mealPreference: source.meal_preference || 'none',
    seatPreference: source.seat_preference || 'none',
    wheelchairRequired: Boolean(source.wheelchair_required),
    additionalRequest: source.additional_request || null,
    assistanceStatus: source.assistance_status || (hasRequest ? 'REQUESTED' : 'NONE'),
    hasSpecialAssistance: hasRequest,
    updatedAt: source.updated_at || null,
  };
}

function publicTraveller(row = {}) {
  return {
    id: row.id,
    role: row.role || 'adult',
    title: row.title || '',
    firstName: row.first_name || '',
    middleName: row.middle_name || '',
    lastName: row.last_name || '',
    suffix: row.suffix || '',
    dateOfBirth: row.date_of_birth || null,
    gender: row.gender || '',
    nationality: row.nationality || '',
    passportNumber: row.passport_number || '',
    passportExpiry: row.passport_expiry || null,
    loyaltyProgram: row.loyalty_program || '',
    frequentFlyerNumber: row.frequent_flyer_number || '',
    knownTravelerNumber: row.known_traveler_number || '',
    redressNumber: row.redress_number || '',
  };
}

function publicFlex(row = null) {
  if (!row) return { selected: false, amount: 0, status: 'NOT_SELECTED' };
  return {
    selected: true,
    amount: Number(row.total_price || 0),
    currency: row.currency || 'USD',
    status: row.status || 'ACTIVE',
    termsVersion: row.terms_version || 'FLEX_V1',
  };
}

async function resolveBooking(reference) {
  const value = cleanRef(reference);
  if (!value) return null;
  let query = supabase.from('bookings').select('id,confirmation_code,status,payment_status,passenger_name,email');
  query = UUID_RE.test(value) ? query.eq('id', value) : query.eq('confirmation_code', value);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data || null;
}

async function loadOperations(booking) {
  const [assistanceResult, flexResult, travellersResult] = await Promise.all([
    supabase.from('booking_service_requests').select('*').eq('booking_id', booking.id).maybeSingle(),
    supabase.from('booking_addons').select('*').eq('booking_id', booking.id).eq('addon_type', 'FLEX_ASSIST').maybeSingle(),
    supabase.from('travellers').select('id,role,title,first_name,middle_name,last_name,suffix,date_of_birth,gender,nationality,passport_number,passport_expiry,loyalty_program,frequent_flyer_number,known_traveler_number,redress_number,created_at').eq('booking_id', booking.id).order('created_at', { ascending: true }),
  ]);

  if (assistanceResult.error) throw assistanceResult.error;
  if (flexResult.error) throw flexResult.error;
  if (travellersResult.error) throw travellersResult.error;

  return {
    bookingId: booking.id,
    confirmationCode: booking.confirmation_code,
    assistance: publicAssistance(assistanceResult.data),
    flexAssist: publicFlex(flexResult.data),
    travellers: (travellersResult.data || []).map(publicTraveller),
  };
}

export const adminAssistanceController = {
  getOperationalDetails: async (req, res, next) => {
    try {
      const booking = await resolveBooking(req.params.id);
      if (!booking) {
        return res.status(404).json({ success: false, error: { code: 'BOOKING_NOT_FOUND', message: 'Booking not found.' } });
      }
      return res.json({ success: true, data: await loadOperations(booking) });
    } catch (error) {
      return next(error);
    }
  },

  updateAssistance: async (req, res, next) => {
    try {
      const booking = await resolveBooking(req.params.id);
      if (!booking) {
        return res.status(404).json({ success: false, error: { code: 'BOOKING_NOT_FOUND', message: 'Booking not found.' } });
      }

      const { data: current, error: readError } = await supabase
        .from('booking_service_requests')
        .select('*')
        .eq('booking_id', booking.id)
        .maybeSingle();
      if (readError) throw readError;

      const requestedStatus = String(req.body?.assistanceStatus || req.body?.status || '').trim().toUpperCase();
      const status = requestedStatus || current?.assistance_status || (hasSpecialAssistance(current) ? 'REQUESTED' : 'NONE');
      if (!ASSISTANCE_STATUSES.has(status)) {
        return res.status(400).json({ success: false, error: { code: 'INVALID_ASSISTANCE_STATUS', message: 'Assistance status must be REQUESTED, ACKNOWLEDGED or COMPLETED.' } });
      }
      if (!hasSpecialAssistance(current) && status !== 'NONE') {
        return res.status(409).json({ success: false, error: { code: 'NO_SPECIAL_ASSISTANCE', message: 'This booking does not currently contain a special-assistance request.' } });
      }

      const { data, error } = await supabase
        .from('booking_service_requests')
        .upsert({
          booking_id: booking.id,
          meal_preference: current?.meal_preference || 'none',
          seat_preference: current?.seat_preference || 'none',
          wheelchair_required: Boolean(current?.wheelchair_required),
          additional_request: current?.additional_request || null,
          assistance_status: status,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'booking_id' })
        .select('*')
        .single();
      if (error) throw error;

      return res.json({ success: true, data: { ...await loadOperations(booking), assistance: publicAssistance(data) } });
    } catch (error) {
      return next(error);
    }
  },

  getOperationalFlags: async (req, res, next) => {
    try {
      const references = [...new Set((req.body?.references || []).map(cleanRef).filter(Boolean))].slice(0, 100);
      if (!references.length) return res.json({ success: true, data: { flags: {} } });

      const ids = references.filter(value => UUID_RE.test(value));
      const codes = references.filter(value => !UUID_RE.test(value));
      const bookings = [];

      if (ids.length) {
        const { data, error } = await supabase.from('bookings').select('id,confirmation_code').in('id', ids);
        if (error) throw error;
        bookings.push(...(data || []));
      }
      if (codes.length) {
        const { data, error } = await supabase.from('bookings').select('id,confirmation_code').in('confirmation_code', codes);
        if (error) throw error;
        bookings.push(...(data || []));
      }

      const bookingIds = [...new Set(bookings.map(row => row.id).filter(Boolean))];
      if (!bookingIds.length) return res.json({ success: true, data: { flags: {} } });

      const [assistanceResult, flexResult] = await Promise.all([
        supabase.from('booking_service_requests').select('*').in('booking_id', bookingIds),
        supabase.from('booking_addons').select('booking_id,total_price,currency,status').in('booking_id', bookingIds).eq('addon_type', 'FLEX_ASSIST'),
      ]);
      if (assistanceResult.error) throw assistanceResult.error;
      if (flexResult.error) throw flexResult.error;

      const assistanceMap = new Map((assistanceResult.data || []).map(row => [row.booking_id, row]));
      const flexMap = new Map((flexResult.data || []).map(row => [row.booking_id, row]));
      const flags = {};

      for (const booking of bookings) {
        const assistance = publicAssistance(assistanceMap.get(booking.id));
        const flexAssist = publicFlex(flexMap.get(booking.id));
        const value = {
          hasSpecialAssistance: assistance.hasSpecialAssistance,
          assistanceStatus: assistance.assistanceStatus,
          wheelchairRequired: assistance.wheelchairRequired,
          flexAssistSelected: flexAssist.selected,
          flexAssistAmount: flexAssist.amount,
        };
        if (booking.confirmation_code) flags[booking.confirmation_code] = value;
        flags[booking.id] = value;
      }

      return res.json({ success: true, data: { flags } });
    } catch (error) {
      return next(error);
    }
  },
};

export default adminAssistanceController;
