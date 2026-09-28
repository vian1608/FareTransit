import crypto from 'crypto';
import supabase from '../../config/supabase.mjs';
import logger from '../../config/logger.mjs';
import env from '../../config/env.mjs';
import { verifyCarQuoteToken } from './car-quote-token.mjs';

const BOOKING_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_SPECIAL_REQUEST_LENGTH = 1500;
const MAX_FLIGHT_NUMBER_LENGTH = 32;

function serviceError(code, message, statusCode = 400, details = null) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function clean(value, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function formatAddress(location = {}) {
  return clean(location.address || [location.city, location.state, location.country].filter(Boolean).join(', '), 1000);
}

function randomBookingReference() {
  let suffix = '';
  for (let i = 0; i < 5; i += 1) {
    suffix += BOOKING_ALPHABET[crypto.randomInt(0, BOOKING_ALPHABET.length)];
  }
  return `C${suffix}`;
}

function hashPublicToken(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function publicReadTokenFor(reservation, clientRequestId) {
  const secret = env.carQuoteSigningSecret;
  if (!secret) throw serviceError('CAR_REQUEST_SIGNING_NOT_CONFIGURED', 'Car-rental request access is not configured yet.', 503);
  return crypto
    .createHmac('sha256', secret)
    .update(`${reservation.id}:${reservation.booking_reference}:${clientRequestId}`)
    .digest('base64url');
}

function validateCustomer(input = {}) {
  const firstName = clean(input.firstName, 80);
  const lastName = clean(input.lastName, 80);
  const email = clean(input.email, 254).toLowerCase();
  const phone = clean(input.phone, 40);
  const dateOfBirth = clean(input.dateOfBirth, 10);

  if (!firstName || !lastName) throw serviceError('CUSTOMER_NAME_REQUIRED', 'Driver first and last name are required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw serviceError('INVALID_EMAIL', 'Enter a valid email address.');
  if (phone.replace(/\D/g, '').length < 7) throw serviceError('INVALID_PHONE', 'Enter a valid phone number.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || !Number.isFinite(Date.parse(`${dateOfBirth}T00:00:00Z`))) {
    throw serviceError('INVALID_DATE_OF_BIRTH', 'Enter the primary driver date of birth.');
  }

  return {
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    email,
    phone,
    dateOfBirth
  };
}

function ageAt(dateOfBirth, atDate) {
  const dob = new Date(`${dateOfBirth}T00:00:00Z`);
  const dateOnly = String(atDate || '').slice(0, 10);
  const at = new Date(`${dateOnly}T00:00:00Z`);
  let age = at.getUTCFullYear() - dob.getUTCFullYear();
  const month = at.getUTCMonth() - dob.getUTCMonth();
  if (month < 0 || (month === 0 && at.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age;
}

async function loadExistingByClientRequestId(clientRequestId) {
  if (!clientRequestId) return null;
  const { data, error } = await supabase
    .from('reservations')
    .select('id,booking_reference,reservation_status,created_at,total_amount,currency,client_request_id')
    .eq('client_request_id', clientRequestId)
    .maybeSingle();
  if (error) throw serviceError('DATABASE_ERROR', 'Unable to check the reservation request.', 500);
  return data || null;
}

async function loadCarByReservationId(reservationId) {
  const { data, error } = await supabase
    .from('car_reservations')
    .select('rental_company_name,vehicle_name,vehicle_category,pickup_location,pickup_at,dropoff_location,dropoff_at,draft_payment_data')
    .eq('reservation_id', reservationId)
    .maybeSingle();
  if (error) throw serviceError('DATABASE_ERROR', 'Unable to load the car reservation.', 500);
  return data || null;
}

function publicSummary(reservation, car = null, requestToken = null, created = false) {
  const sourceQuote = car?.draft_payment_data?.sourceQuote || {};
  return {
    bookingReference: reservation.booking_reference,
    status: reservation.reservation_status,
    displayStatus: reservation.reservation_status === 'BOOKED' ? 'Confirmed' : 'Pending confirmation',
    createdAt: reservation.created_at,
    totalAmount: money(reservation.total_amount),
    currency: reservation.currency || 'USD',
    supplier: car?.rental_company_name || 'Enterprise',
    vehicleName: car?.vehicle_name || null,
    vehicleCategory: car?.vehicle_category || null,
    pickupLocation: car?.pickup_location || null,
    pickupAt: sourceQuote.pickupDatetime || car?.pickup_at || null,
    dropoffLocation: car?.dropoff_location || null,
    dropoffAt: sourceQuote.returnDatetime || car?.dropoff_at || null,
    requestToken: requestToken || undefined,
    created
  };
}

async function createReservationRow({ customer, quote, clientRequestId }) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const bookingReference = randomBookingReference();
    const { data, error } = await supabase.from('reservations').insert({
      booking_reference: bookingReference,
      service_type: 'CAR',
      reservation_status: 'READY_TO_BOOK',
      authorization_status: 'NONE',
      payment_status: 'PENDING',
      customer_name: customer.fullName,
      customer_email: customer.email,
      customer_phone: customer.phone,
      currency: quote.currency,
      total_amount: money(quote.totalPrice) || 0,
      client_request_id: clientRequestId,
      created_by: 'PUBLIC_WEB'
    }).select('*').single();

    if (!error) return data;
    if (error.code === '23505' && String(error.message || '').includes('client_request_id')) {
      const existing = await loadExistingByClientRequestId(clientRequestId);
      if (existing) return { ...existing, __idempotent: true };
    }
    if (error.code !== '23505') {
      logger.error(`[CarBooking] reservation insert failed: ${error.message}`);
      throw serviceError('DATABASE_ERROR', 'Unable to create the reservation request.', 500);
    }
  }
  throw serviceError('BOOKING_REFERENCE_EXHAUSTED', 'Could not generate a reservation reference. Please retry.', 503);
}

async function rollbackReservation(reservationId) {
  if (!reservationId) return;
  try {
    await supabase.from('reservations').delete().eq('id', reservationId);
  } catch (error) {
    logger.error(`[CarBooking] rollback failed for ${reservationId}: ${error.message}`);
  }
}

export async function createPublicCarBooking(payload = {}) {
  const quote = verifyCarQuoteToken(payload.quoteToken);
  const customer = validateCustomer(payload.customer || {});
  const clientRequestId = clean(payload.clientRequestId, 128);
  if (!/^[A-Za-z0-9:_-]{12,128}$/.test(clientRequestId)) {
    throw serviceError('INVALID_REQUEST_ID', 'The reservation request ID is invalid. Please refresh checkout and retry.');
  }
  if (payload.termsAccepted !== true) {
    throw serviceError('TERMS_REQUIRED', 'You must acknowledge the reservation-request terms before continuing.');
  }

  const total = money(quote.totalPrice);
  if (total === null || total <= 0) {
    throw serviceError('INVALID_CAR_QUOTE', 'This quote does not contain a valid rental total. Please search again.', 409);
  }

  const driverAge = ageAt(customer.dateOfBirth, quote.pickupDatetime);
  if (driverAge < 18 || Math.abs(driverAge - Number(quote.driverAge || driverAge)) > 1) {
    throw serviceError(
      'DRIVER_AGE_CHANGED',
      'The driver date of birth does not match the age used for pricing. Please search again using the correct driver age.',
      409
    );
  }

  const existing = await loadExistingByClientRequestId(clientRequestId);
  if (existing) {
    const existingCar = await loadCarByReservationId(existing.id);
    return publicSummary(existing, existingCar, publicReadTokenFor(existing, clientRequestId), false);
  }

  const reservation = await createReservationRow({ customer, quote, clientRequestId });
  if (reservation.__idempotent) {
    const existingCar = await loadCarByReservationId(reservation.id);
    return publicSummary(reservation, existingCar, publicReadTokenFor(reservation, clientRequestId), false);
  }

  const publicReadToken = publicReadTokenFor(reservation, clientRequestId);
  const publicReadTokenHash = hashPublicToken(publicReadToken);
  const flightNumber = clean(payload.flightNumber, MAX_FLIGHT_NUMBER_LENGTH);
  const specialRequests = clean(payload.specialRequests, MAX_SPECIAL_REQUEST_LENGTH);
  const quoteSnapshot = {
    provider: quote.provider,
    supplier: quote.supplier,
    vehicleCode: quote.vehicleCode,
    vehicleName: quote.vehicleName,
    makeModel: quote.makeModel,
    category: quote.category,
    transmission: quote.transmission,
    passengers: quote.passengers,
    luggageCapacity: quote.luggageCapacity,
    currency: quote.currency,
    dailyRate: quote.dailyRate,
    totalPrice: quote.totalPrice,
    pickupLocation: quote.pickupLocation,
    returnLocation: quote.returnLocation,
    pickupDatetime: quote.pickupDatetime,
    returnDatetime: quote.returnDatetime,
    driverAge: quote.driverAge,
    driverCountry: quote.driverCountry,
    capturedAt: quote.capturedAt,
    quoteExpiresAt: new Date(quote.exp * 1000).toISOString()
  };

  try {
    const { error: carError } = await supabase.from('car_reservations').insert({
      reservation_id: reservation.id,
      rental_company_name: quote.supplier || 'Enterprise',
      vehicle_name: quote.vehicleName || quote.makeModel || quote.category,
      vehicle_category: quote.category || null,
      vehicle_description: quote.makeModel || quote.vehicleName || null,
      or_similar: true,
      pickup_location: quote.pickupLocation?.name || quote.pickupLocation?.label || null,
      pickup_address: formatAddress(quote.pickupLocation),
      pickup_at: quote.pickupDatetime,
      dropoff_location: quote.returnLocation?.name || quote.returnLocation?.label || null,
      dropoff_address: formatAddress(quote.returnLocation),
      dropoff_at: quote.returnDatetime,
      driver_age: driverAge,
      draft_payment_data: {
        currency: quote.currency,
        totalAmount: total,
        dailyRate: money(quote.dailyRate),
        collectionMethod: 'NOT_COLLECTED',
        sourceProvider: 'PARSE_ENTERPRISE',
        sourceQuote: quoteSnapshot,
        publicReadTokenHash
      },
      draft_custom_sections: [
        {
          key: 'public_request',
          title: 'Customer reservation request',
          flightNumber: flightNumber || null,
          specialRequests: specialRequests || null,
          submittedAt: new Date().toISOString()
        }
      ],
      internal_notes: 'Public FareTransit web request. Supplier reservation has not yet been created; verify live availability and final price before confirming.'
    });
    if (carError) throw carError;

    const { error: travellerError } = await supabase.from('reservation_travellers').insert({
      reservation_id: reservation.id,
      role: 'PRIMARY_DRIVER',
      first_name: customer.firstName,
      last_name: customer.lastName,
      full_name: customer.fullName,
      date_of_birth: customer.dateOfBirth,
      email: customer.email,
      phone: customer.phone
    });
    if (travellerError) throw travellerError;

    const { error: financialError } = await supabase.from('reservation_internal_financials').insert({
      reservation_id: reservation.id,
      supplier_cost: null,
      selling_price: total,
      estimated_margin: null,
      admin_notes: 'Customer-facing total captured from Parse/Enterprise search; confirm before finalizing.'
    });
    if (financialError) throw financialError;

    const { error: activityError } = await supabase.from('reservation_activity').insert({
      reservation_id: reservation.id,
      actor_type: 'CUSTOMER',
      actor_id: null,
      action: 'PUBLIC_CAR_REQUEST_CREATED',
      metadata: {
        provider: 'parse-enterprise',
        vehicleCode: quote.vehicleCode || null,
        quotedTotal: total,
        currency: quote.currency
      }
    });
    if (activityError) logger.warn(`[CarBooking] activity log notice: ${activityError.message}`);
  } catch (error) {
    await rollbackReservation(reservation.id);
    logger.error(`[CarBooking] request creation failed: ${error.message}`);
    throw serviceError('DATABASE_ERROR', 'Unable to finish creating the reservation request.', 500);
  }

  const car = await loadCarByReservationId(reservation.id);
  return publicSummary(reservation, car, publicReadToken, true);
}

export async function getPublicCarBooking(reference, requestToken) {
  const normalizedReference = clean(reference, 32).toUpperCase();
  const token = clean(requestToken, 256);
  if (!normalizedReference || !token) throw serviceError('REQUEST_TOKEN_REQUIRED', 'A reservation access token is required.', 401);

  const { data: reservation, error } = await supabase
    .from('reservations')
    .select('id,booking_reference,reservation_status,created_at,total_amount,currency')
    .eq('booking_reference', normalizedReference)
    .eq('service_type', 'CAR')
    .maybeSingle();
  if (error) throw serviceError('DATABASE_ERROR', 'Unable to load the reservation request.', 500);
  if (!reservation) throw serviceError('CAR_REQUEST_NOT_FOUND', 'Reservation request not found.', 404);

  const car = await loadCarByReservationId(reservation.id);
  const expectedHash = car?.draft_payment_data?.publicReadTokenHash;
  if (!expectedHash) throw serviceError('REQUEST_TOKEN_REQUIRED', 'This reservation cannot be accessed from a public link.', 401);

  const actual = Buffer.from(hashPublicToken(token));
  const expected = Buffer.from(String(expectedHash));
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw serviceError('INVALID_REQUEST_TOKEN', 'The reservation access token is invalid.', 403);
  }

  return publicSummary(reservation, car, null, false);
}

export { serviceError };
