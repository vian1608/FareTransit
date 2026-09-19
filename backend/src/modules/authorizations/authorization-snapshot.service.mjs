import crypto from 'crypto';
import bookingRepository from '../bookings/booking.repository.mjs';
import { buildCanonicalItinerary, resolveAirlineName, getCarrierLogoUrl } from '../../shared/utils/airline-lookup.mjs';

const money = value => Math.round((Number(value) || 0) * 100) / 100;
const text = value => String(value ?? '').trim();

function inferMerchantCode(split = {}) {
  const explicit = text(split.merchant_code || split.merchantCode).toUpperCase();
  if (explicit) return explicit;
  const match = text(split.merchant_name || split.merchantName).match(/^([A-Z0-9]{2})\s+Airlines?$/i);
  return match ? match[1].toUpperCase() : '';
}

function normalizeSplit(split = {}, currency = 'USD') {
  const code = inferMerchantCode(split);
  const rawName = text(split.merchant_name || split.merchantName || split.name || split.merchant);
  const type = text(split.merchant_type || split.merchantType).toUpperCase()
    || (rawName.toLowerCase() === 'faretransit llc' ? 'FARETRANSIT' : (code ? 'AIRLINE' : 'OTHER'));
  const name = type === 'AIRLINE'
    ? (resolveAirlineName(code, rawName) || rawName || code)
    : (type === 'FARETRANSIT' ? 'FareTransit LLC' : rawName);
  return {
    merchantName: name || 'Merchant',
    merchant_name: name || 'Merchant',
    merchantType: type,
    merchant_type: type,
    merchantCode: code || null,
    merchant_code: code || null,
    amount: money(split.amount),
    currency: text(split.currency || currency || 'USD').toUpperCase()
  };
}

function normalizeSegment(segment = {}) {
  const code = text(segment.carrierCode || segment.carrier_code || segment.marketing_carrier_code).toUpperCase();
  const supplied = text(segment.airlineName || segment.carrier_name || segment.airline_name || segment.airline);
  const airlineName = resolveAirlineName(code, supplied) || supplied || code || 'Airline';
  return {
    id: segment.id || null,
    sequence: Number(segment.sequence || segment.segment_sequence || 1),
    journeyIndex: Number(segment.journeyIndex || segment.journey_index || 1),
    journeyRole: text(segment.journeyRole || segment.journey_role || 'OUTBOUND').toUpperCase(),
    carrierCode: code,
    airlineName,
    airlineLogoUrl: segment.airlineLogoUrl || getCarrierLogoUrl(code),
    flightNumber: text(segment.flightNumber || segment.flight_number),
    originCode: text(segment.originCode || segment.origin_airport || segment.departure_airport).toUpperCase(),
    originName: text(segment.originName || segment.origin_city || segment.originCode || segment.origin_airport),
    destinationCode: text(segment.destinationCode || segment.destination_airport || segment.arrival_airport).toUpperCase(),
    destinationName: text(segment.destinationName || segment.destination_city || segment.destinationCode || segment.destination_airport),
    departureDate: text(segment.departureDate || segment.departure_date),
    departureTime: text(segment.departureTime || segment.departure_time || segment.departure_time_str),
    arrivalDate: text(segment.arrivalDate || segment.arrival_date),
    arrivalTime: text(segment.arrivalTime || segment.arrival_time || segment.arrival_time_str),
    cabinClass: text(segment.cabinClass || segment.cabin || segment.cabin_class || 'Economy'),
    aircraft: text(segment.aircraft || segment.aircraft_type),
    stops: Number(segment.stops ?? segment.stop_count ?? 0)
  };
}

function mapLegacySegment(segment) {
  const s = normalizeSegment(segment);
  return {
    id: s.id,
    sequence: s.sequence,
    journey_index: s.journeyIndex,
    journey_role: s.journeyRole,
    carrier_code: s.carrierCode,
    carrier_name: s.airlineName,
    airline: s.airlineName,
    airlineName: s.airlineName,
    airlineLogoUrl: s.airlineLogoUrl,
    flight_number: s.flightNumber,
    flightNumber: s.flightNumber,
    origin_airport: s.originCode,
    originCode: s.originCode,
    origin_city: s.originName,
    originCity: s.originName,
    destination_airport: s.destinationCode,
    destinationCode: s.destinationCode,
    destination_city: s.destinationName,
    destinationCity: s.destinationName,
    departure_date: s.departureDate,
    departureDate: s.departureDate,
    departure_time: s.departureTime,
    departureTime: s.departureTime,
    arrival_date: s.arrivalDate,
    arrivalDate: s.arrivalDate,
    arrival_time: s.arrivalTime,
    arrivalTime: s.arrivalTime,
    cabin: s.cabinClass,
    cabinClass: s.cabinClass,
    aircraft: s.aircraft,
    stops: s.stops
  };
}

export function authorizationSnapshotHash(snapshot) {
  const stable = { ...snapshot };
  delete stable.createdAt;
  return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

export function authorizationSnapshotToLegacyItinerary(snapshot = {}) {
  const journeys = Array.isArray(snapshot?.itinerary?.journeys) ? snapshot.itinerary.journeys : [];
  const outboundJourney = journeys.find(j => String(j.role).toUpperCase() === 'OUTBOUND') || journeys[0] || null;
  const returnJourney = journeys.find(j => String(j.role).toUpperCase() === 'RETURN') || null;
  const outboundSegments = (outboundJourney?.segments || []).map(mapLegacySegment);
  const returnSegments = (returnJourney?.segments || []).map(mapLegacySegment);
  return {
    tripType: snapshot?.itinerary?.tripType || 'ONE_WAY',
    outboundSegments,
    returnSegments,
    outbound: outboundSegments[0] || null,
    return: returnSegments[0] || null,
    canonical: {
      tripType: snapshot?.itinerary?.tripType || 'ONE_WAY',
      journeys,
      outbound: outboundSegments,
      return: returnSegments
    }
  };
}

export function authorizationSnapshotToBookingLike(snapshot = {}) {
  const journeys = Array.isArray(snapshot?.itinerary?.journeys) ? snapshot.itinerary.journeys : [];
  const segments = journeys.flatMap(journey => (journey.segments || []).map((segment, index) => ({
    ...mapLegacySegment({ ...segment, journeyIndex: journey.journeyIndex, journeyRole: journey.role }),
    booking_id: snapshot.bookingId,
    trip_type: snapshot?.itinerary?.tripType || 'ONE_WAY',
    itinerary_type: snapshot?.itinerary?.tripType || 'ONE_WAY',
    journey_index: Number(journey.journeyIndex || 1),
    journey_role: String(journey.role || 'OUTBOUND').toUpperCase(),
    journey_direction: String(journey.role || 'OUTBOUND').toUpperCase() === 'RETURN' ? 'return' : 'outbound',
    direction: String(journey.role || 'OUTBOUND').toUpperCase() === 'RETURN' ? 'return' : 'outbound',
    segment_sequence: Number(segment.sequence || index + 1)
  })));
  return {
    id: snapshot.bookingId,
    confirmation_code: snapshot.confirmationCode,
    itinerary_type: snapshot?.itinerary?.tripType || 'ONE_WAY',
    itinerary_segments: segments,
    currency: snapshot?.paymentAuthorization?.currency || snapshot?.pricing?.currency || 'USD'
  };
}

export const authorizationSnapshotService = {
  toBookingLike: authorizationSnapshotToBookingLike,
  toLegacyItinerary: authorizationSnapshotToLegacyItinerary,
  build: async (bookingInput) => {
    const rawId = typeof bookingInput === 'object'
      ? (bookingInput.id || bookingInput.booking_id || bookingInput.confirmation_code)
      : bookingInput;
    const booking = (typeof bookingInput === 'object' && bookingInput?.id && (bookingInput.itinerary_segments || bookingInput.itinerary))
      ? bookingInput
      : await bookingRepository.getCompleteBookingById(rawId);
    if (!booking?.id) throw new Error('BOOKING_NOT_FOUND');

    const canonical = buildCanonicalItinerary(booking);
    if (!canonical?.journeys?.length) throw new Error('AUTHORIZATION_SNAPSHOT_ITINERARY_REQUIRED');

    const currency = text(booking.currency || 'USD').toUpperCase();
    const rawSplits = await bookingRepository.getPaymentSplits(booking.id).catch(() => []);
    const splits = (rawSplits || []).map(s => normalizeSplit(s, currency));
    const splitTotal = money(splits.reduce((sum, s) => sum + money(s.amount), 0));
    const customerTotal = money(booking.customer_price || booking.total_amount || 0);
    const authorizedAmount = money(booking.authorized_amount || splitTotal || customerTotal);
    if (!splits.length) throw new Error('AUTHORIZATION_SNAPSHOT_SPLITS_REQUIRED');
    if (Math.abs(splitTotal - authorizedAmount) > 0.01) {
      throw new Error(`AUTHORIZATION_SNAPSHOT_TOTAL_MISMATCH: Split total ${splitTotal.toFixed(2)} does not match authorized amount ${authorizedAmount.toFixed(2)}.`);
    }

    const paymentMethod = booking.paymentMethod || booking.payment_method || await bookingRepository.getPaymentMethodByBookingId(booking.id).catch(() => null) || {};
    const rawLast4 = text(paymentMethod.card_last4 || paymentMethod.cardLast4).replace(/\D/g, '');
    const last4 = /^\d{4}$/.test(rawLast4) ? rawLast4 : null;
    const travellers = Array.isArray(booking.travellers) ? booking.travellers : (Array.isArray(booking.passengers) ? booking.passengers : []);
    const primaryContact = booking.contacts?.[0] || {};

    const journeys = canonical.journeys.map(journey => ({
      journeyIndex: Number(journey.journeyIndex || 1),
      role: text(journey.role || 'OUTBOUND').toUpperCase(),
      label: journey.label || (canonical.tripType === 'MULTI_CITY' ? `Trip ${journey.journeyIndex}` : journey.role),
      segments: (journey.segments || []).map(normalizeSegment)
    }));

    const snapshot = {
      schemaVersion: 'AUTHORIZATION_SNAPSHOT_V2',
      bookingId: booking.id,
      confirmationCode: booking.confirmation_code || booking.confirmationCode || booking.id,
      bookingRevision: Number(booking.booking_revision || 1),
      createdAt: new Date().toISOString(),
      passenger: {
        name: booking.passenger_name || booking.passengerName || 'Valued Passenger',
        email: booking.email || primaryContact.email || '',
        phone: booking.phone || primaryContact.phone_number || primaryContact.phone || '',
        travellers: travellers.map(t => ({
          title: t.title || null,
          firstName: t.first_name || t.firstName || '',
          middleName: t.middle_name || t.middleName || null,
          lastName: t.last_name || t.lastName || '',
          dateOfBirth: t.date_of_birth || t.dateOfBirth || null,
          gender: t.gender || null,
          nationality: t.nationality || null,
          passportLast4: (() => { const v = text(t.passport_number || t.passportNumber); return v ? v.slice(-4) : null; })()
        }))
      },
      itinerary: {
        tripType: canonical.tripType || 'ONE_WAY',
        journeys
      },
      pricing: {
        customerTotal,
        currency
      },
      paymentAuthorization: {
        authorizedAmount,
        currency,
        splits
      },
      paymentMethod: {
        brand: paymentMethod.card_brand || paymentMethod.cardBrand || 'Card',
        last4,
        label: last4 ? `${paymentMethod.card_brand || paymentMethod.cardBrand || 'Card'} ending in ${last4}` : 'Saved payment method'
      },
      policies: {
        authorizationScope: 'This authorization is valid only for the passenger, itinerary and payment amounts shown in this request.',
        reauthorization: 'Any material change to itinerary, passenger details, payment method or authorized amount requires a new authorization.'
      }
    };
    return snapshot;
  }
};

export default authorizationSnapshotService;
