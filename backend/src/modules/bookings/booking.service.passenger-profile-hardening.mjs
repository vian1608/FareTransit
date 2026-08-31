import bookingService from './booking.service.mjs';
import supabase from '../../integrations/supabase/supabase.client.mjs';
import logger from '../../config/logger.mjs';

const clean = (value, max = 100) => {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
};

function profileFromPassenger(passenger = {}) {
  return {
    suffix: clean(passenger.suffix, 20),
    loyalty_program: clean(passenger.loyaltyProgram ?? passenger.loyalty_program, 100),
    frequent_flyer_number: clean(passenger.frequentFlyerNumber ?? passenger.frequent_flyer_number, 100),
    known_traveler_number: clean(passenger.knownTravelerNumber ?? passenger.known_traveler_number, 100),
    redress_number: clean(passenger.redressNumber ?? passenger.redress_number, 100),
  };
}

function enrichTraveller(traveller = {}, raw = {}) {
  return {
    ...traveller,
    suffix: raw.suffix ?? traveller.suffix ?? null,
    loyaltyProgram: raw.loyalty_program ?? traveller.loyaltyProgram ?? null,
    frequentFlyerNumber: raw.frequent_flyer_number ?? traveller.frequentFlyerNumber ?? null,
    knownTravelerNumber: raw.known_traveler_number ?? traveller.knownTravelerNumber ?? null,
    redressNumber: raw.redress_number ?? traveller.redressNumber ?? null,
  };
}

function enrichBooking(booking) {
  if (!booking || typeof booking !== 'object') return booking;
  const raw = Array.isArray(booking.traveller_details) ? booking.traveller_details : [];
  const travellers = Array.isArray(booking.travellers) ? booking.travellers : [];
  if (!raw.length || !travellers.length) return booking;
  const byId = new Map(raw.filter((row) => row?.id).map((row) => [row.id, row]));
  const nextTravellers = travellers.map((traveller, index) => enrichTraveller(traveller, byId.get(traveller?.id) || raw[index] || {}));
  return { ...booking, travellers: nextTravellers };
}

async function persistProfiles(bookingId, passengers = [], bookingResult = null) {
  if (!bookingId || !Array.isArray(passengers) || !passengers.length) return bookingResult;

  let rawRows = Array.isArray(bookingResult?.traveller_details) ? bookingResult.traveller_details : [];
  if (!rawRows.length) {
    const lookup = await supabase
      .from('travellers')
      .select('id,booking_id,created_at')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true });
    if (lookup.error) throw lookup.error;
    rawRows = lookup.data || [];
  }

  const updatedRaw = [...rawRows];
  for (let index = 0; index < passengers.length; index += 1) {
    const row = rawRows[index];
    if (!row?.id) continue;
    const profile = profileFromPassenger(passengers[index]);
    const update = await supabase
      .from('travellers')
      .update(profile)
      .eq('id', row.id)
      .eq('booking_id', bookingId)
      .select('*')
      .single();
    if (update.error) throw update.error;
    updatedRaw[index] = update.data;
  }

  if (!bookingResult || typeof bookingResult !== 'object') return bookingResult;
  return enrichBooking({ ...bookingResult, traveller_details: updatedRaw });
}

if (!bookingService.__fareTransitPassengerProfileHardening) {
  const coreCreate = bookingService.create?.bind(bookingService);
  const coreDetails = bookingService.getDetailsByCodeOrId?.bind(bookingService);

  if (coreCreate) {
    bookingService.create = async (payload = {}) => {
      const result = await coreCreate(payload);
      const bookingId = result?.id || result?.booking?.id;
      const passengers = Array.isArray(payload.passengers)
        ? payload.passengers
        : (() => {
            try { return JSON.parse(payload.passengers || '[]'); } catch { return []; }
          })();
      if (!bookingId || !passengers.length) return result;
      try {
        return await persistProfiles(bookingId, passengers, result);
      } catch (error) {
        logger.error(`[PassengerProfile] Unable to persist passenger profile fields for ${bookingId}: ${error.message}`);
        throw error;
      }
    };
  }

  if (coreDetails) {
    bookingService.getDetailsByCodeOrId = async (...args) => enrichBooking(await coreDetails(...args));
  }

  Object.defineProperty(bookingService, '__fareTransitPassengerProfileHardening', {
    value: true,
    enumerable: false,
    writable: false,
    configurable: false,
  });
}

export default bookingService;
