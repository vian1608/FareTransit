import supabase from '../../integrations/supabase/supabase.client.mjs';
import bookingRepository from '../bookings/booking.repository.mjs';
import logger from '../../config/logger.mjs';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AUTHORIZED_STATES = new Set(['AUTHORIZED', 'READY_FOR_TICKETING', 'TICKETED', 'DONE', 'COMPLETED']);

const cleanText = (value, max = 120) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
};

function validateDate(value, label) {
  if (!value) return null;
  const text = String(value).trim();
  if (!DATE_RE.test(text) || Number.isNaN(new Date(`${text}T00:00:00Z`).getTime())) {
    const error = new Error(`${label} must use YYYY-MM-DD format.`);
    error.code = 'INVALID_PASSENGER_DATE';
    throw error;
  }
  return text;
}

function normalizePassenger(raw = {}) {
  const firstName = cleanText(raw.firstName ?? raw.first_name, 80);
  const lastName = cleanText(raw.lastName ?? raw.last_name, 80);
  if (!firstName || !lastName) {
    const error = new Error('Every passenger must have a first name and last name.');
    error.code = 'PASSENGER_NAME_REQUIRED';
    throw error;
  }

  return {
    id: cleanText(raw.id, 80),
    role: (cleanText(raw.role ?? raw.passengerType ?? raw.passenger_type, 20) || 'adult').toLowerCase(),
    title: cleanText(raw.title, 20),
    first_name: firstName,
    middle_name: cleanText(raw.middleName ?? raw.middle_name, 80),
    last_name: lastName,
    date_of_birth: validateDate(raw.dateOfBirth ?? raw.date_of_birth, 'Date of birth'),
    gender: cleanText(raw.gender, 30),
    nationality: cleanText(raw.nationality, 80),
    passport_number: cleanText(raw.passportNumber ?? raw.passport_number, 40),
    passport_expiry: validateDate(raw.passportExpiry ?? raw.passport_expiry, 'Passport expiry')
  };
}

async function resolveBooking(identifier) {
  const booking = await bookingRepository.findBaseBookingRecord(identifier).catch(() => null);
  if (booking?.id) return booking;
  return bookingRepository.getById(identifier).catch(() => null);
}

async function saveTravellers(realId, passengers, replacePassengers = true) {
  const { data: existingRows, error: existingError } = await supabase
    .from('travellers')
    .select('*')
    .eq('booking_id', realId)
    .order('passenger_sequence', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (existingError) throw new Error(`Unable to load existing passengers: ${existingError.message}`);

  const existing = Array.isArray(existingRows) ? existingRows : [];
  const existingById = new Map(existing.map(row => [String(row.id), row]));
  const retainedIds = new Set();
  const saved = [];

  for (let index = 0; index < passengers.length; index += 1) {
    const passenger = passengers[index];
    const explicitExisting = passenger.id ? existingById.get(String(passenger.id)) : null;
    const positionalExisting = !explicitExisting ? existing[index] : null;
    const target = explicitExisting || positionalExisting || null;
    const row = {
      booking_id: realId,
      passenger_sequence: index + 1,
      is_primary: index === 0,
      role: passenger.role,
      title: passenger.title,
      first_name: passenger.first_name,
      middle_name: passenger.middle_name,
      last_name: passenger.last_name,
      date_of_birth: passenger.date_of_birth,
      gender: passenger.gender,
      nationality: passenger.nationality,
      passport_number: passenger.passport_number,
      passport_expiry: passenger.passport_expiry
    };

    if (target?.id) {
      const { data, error } = await supabase
        .from('travellers')
        .update(row)
        .eq('id', target.id)
        .eq('booking_id', realId)
        .select()
        .single();
      if (error) throw new Error(`Unable to update passenger ${index + 1}: ${error.message}`);
      retainedIds.add(String(target.id));
      saved.push(data);
    } else {
      const { data, error } = await supabase
        .from('travellers')
        .insert(row)
        .select()
        .single();
      if (error) throw new Error(`Unable to add passenger ${index + 1}: ${error.message}`);
      if (data?.id) retainedIds.add(String(data.id));
      saved.push(data);
    }
  }

  if (replacePassengers) {
    const removeIds = existing
      .filter(row => row?.id && !retainedIds.has(String(row.id)))
      .map(row => row.id);
    if (removeIds.length > 0) {
      const { error } = await supabase.from('travellers').delete().in('id', removeIds).eq('booking_id', realId);
      if (error) throw new Error(`Unable to remove deleted passenger rows: ${error.message}`);
    }
  }

  return saved;
}

async function savePrimaryContact(realId, contactInput = {}, booking = {}) {
  const email = cleanText(contactInput.email ?? booking.email, 180);
  const phone = cleanText(contactInput.phone ?? contactInput.phoneNumber ?? contactInput.phone_number ?? booking.phone, 40);
  const countryCode = cleanText(contactInput.countryCode ?? contactInput.country_code, 10);

  if (email && !EMAIL_RE.test(email)) {
    const error = new Error('Passenger contact email is not valid.');
    error.code = 'INVALID_CONTACT_EMAIL';
    throw error;
  }

  const { data: contacts, error: loadError } = await supabase
    .from('contacts')
    .select('*')
    .eq('booking_id', realId)
    .limit(1);
  if (loadError) throw new Error(`Unable to load booking contact: ${loadError.message}`);

  const contactRow = { booking_id: realId, email, phone_number: phone, country_code: countryCode };
  const existing = contacts?.[0];
  if (existing?.id) {
    const { error } = await supabase.from('contacts').update(contactRow).eq('id', existing.id).eq('booking_id', realId);
    if (error) throw new Error(`Unable to update contact details: ${error.message}`);
  } else if (email || phone) {
    const { error } = await supabase.from('contacts').insert(contactRow);
    if (error) throw new Error(`Unable to create contact details: ${error.message}`);
  }

  return { email, phone, countryCode };
}

const adminPassengerController = {
  updatePassengerDetails: async (req, res) => {
    const identifier = req.params.id;
    try {
      const booking = await resolveBooking(identifier);
      if (!booking?.id) {
        return res.status(404).json({ success: false, error: { code: 'BOOKING_NOT_FOUND', message: 'Booking not found.' } });
      }

      const rawPassengers = Array.isArray(req.body?.passengers) ? req.body.passengers : [];
      if (rawPassengers.length === 0) {
        return res.status(400).json({ success: false, error: { code: 'PASSENGERS_REQUIRED', message: 'At least one passenger is required.' } });
      }
      if (rawPassengers.length > 12) {
        return res.status(400).json({ success: false, error: { code: 'TOO_MANY_PASSENGERS', message: 'A maximum of 12 passengers can be edited at once.' } });
      }

      const passengers = rawPassengers.map(normalizePassenger);
      const savedTravellers = await saveTravellers(booking.id, passengers, req.body?.replacePassengers !== false);
      const contact = await savePrimaryContact(booking.id, req.body?.contact || {}, booking);
      const primaryName = [passengers[0].first_name, passengers[0].middle_name, passengers[0].last_name].filter(Boolean).join(' ');

      const identityChanged = JSON.stringify((booking.travellers || []).map(t => [t.first_name, t.middle_name, t.last_name, t.date_of_birth, t.passport_number])) !==
        JSON.stringify(passengers.map(t => [t.first_name, t.middle_name, t.last_name, t.date_of_birth, t.passport_number]));
      const currentState = String(booking.status || '').toUpperCase();
      const updateFields = {
        passenger_name: primaryName,
        email: contact.email,
        phone: contact.phone,
        updated_at: new Date().toISOString()
      };

      let reauthorizationRequired = false;
      if (identityChanged && AUTHORIZED_STATES.has(currentState)) {
        updateFields.status = 'REAUTHORIZATION_REQUIRED';
        updateFields.authorization_status = 'REAUTHORIZATION_REQUIRED';
        updateFields.authorization_token = null;
        updateFields.authorization_expires_at = null;
        reauthorizationRequired = true;
      }

      const { error: bookingUpdateError } = await supabase.from('bookings').update(updateFields).eq('id', booking.id);
      if (bookingUpdateError) throw new Error(`Unable to synchronize booking passenger summary: ${bookingUpdateError.message}`);

      await bookingRepository.recordAuditLog?.({
        bookingId: booking.id,
        action: 'PASSENGER_DETAILS_UPDATED',
        oldValue: null,
        newValue: JSON.stringify({ passengerCount: savedTravellers.length, primaryPassenger: primaryName, reauthorizationRequired }),
        actor: req.user?.email || req.user?.id || 'admin',
        ipAddress: req.ip || null
      }).catch(() => null);

      const updated = await bookingRepository.getCompleteBookingById(booking.id);
      return res.json({
        success: true,
        message: reauthorizationRequired
          ? 'Passenger details saved. Existing authorization was invalidated because passenger identity changed.'
          : 'Passenger and contact details saved.',
        reauthorizationRequired,
        booking: updated,
        data: updated
      });
    } catch (error) {
      logger.error(`[AdminPassenger] Update failed for ${identifier}: ${error.message}`);
      return res.status(400).json({
        success: false,
        error: { code: error.code || 'PASSENGER_DETAILS_ERROR', message: error.message || 'Unable to save passenger details.' }
      });
    }
  }
};

export default adminPassengerController;
