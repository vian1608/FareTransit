import bookingService from './booking.service.mjs';
import { getReservation } from '../reservations/reservation.service.mjs';
import { buildCanonicalItinerary } from '../../shared/utils/airline-lookup.mjs';

const text = value => value === null || value === undefined ? '' : String(value).trim();
const amount = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function safeTravellerName(traveller = {}) {
  if (traveller.full_name) return text(traveller.full_name);
  return [traveller.first_name, traveller.middle_name, traveller.last_name]
    .map(text)
    .filter(Boolean)
    .join(' ');
}

function normalizeFlightSegment(segment = {}) {
  return {
    leg: segment.leg || segment.journey_direction || 'outbound',
    airlineName: segment.airline_name || segment.carrier_name || segment.airline || null,
    carrierCode: segment.carrier_code || segment.airline_code || null,
    flightNumber: segment.flight_number || segment.flightNumber || null,
    departureAirport: segment.departure_airport || segment.origin_airport || segment.origin_code || null,
    arrivalAirport: segment.arrival_airport || segment.destination_airport || segment.destination_code || null,
    departureDate: segment.departure_date || segment.departureDate || null,
    departureTime: segment.departure_time_str || segment.departure_time || segment.departureTime || null,
    arrivalDate: segment.arrival_date || segment.arrivalDate || null,
    arrivalTime: segment.arrival_time_str || segment.arrival_time || segment.arrivalTime || null,
    cabinClass: segment.cabin_class || segment.cabinClass || null,
    duration: segment.duration || null,
    stops: segment.stops ?? null
  };
}

function buildFlightPublicReservation(booking = {}) {
  const rawFlights = Array.isArray(booking.flights)
    ? booking.flights
    : (Array.isArray(booking.itinerary_segments) ? booking.itinerary_segments : []);
  const customerTotal = amount(booking.customer_price ?? booking.total_amount);
  const travellers = Array.isArray(booking.travellers) ? booking.travellers : [];
  const primaryTraveller = travellers[0] || {};
  const contact = Array.isArray(booking.contacts) ? booking.contacts[0] : null;

  return {
    reference: booking.confirmation_code || booking.confirmationCode || null,
    serviceType: 'FLIGHT',
    status: booking.status || 'PENDING',
    paymentStatus: booking.payment_status || booking.paymentStatus || 'PENDING',
    authorizationStatus: null,
    createdAt: booking.created_at || null,
    customer: {
      name: safeTravellerName(primaryTraveller) || text(booking.passenger_name || booking.customerName) || null,
      email: contact?.email || booking.email || null,
      phone: contact?.phone_number || contact?.phone || booking.phone || null
    },
    pricing: {
      total: customerTotal,
      currency: text(booking.currency || 'USD').toUpperCase() || 'USD'
    },
    flight: {
      airlineName: booking.airline_name || booking.airlineName || null,
      airlineConfirmationNumber: booking.airline_confirmation_number || booking.airlineConfirmationNumber || null,
      ticketNumber: booking.ticket_number || booking.ticketNumber || null,
      itinerary: buildCanonicalItinerary(booking),
      flights: rawFlights.map(normalizeFlightSegment)
    }
  };
}

function buildCarPublicReservation(bundle = {}) {
  const reservation = bundle.reservation || {};
  const car = bundle.car || {};
  const traveller = Array.isArray(bundle.travellers) ? (bundle.travellers[0] || {}) : {};
  const authorization = bundle.latestAuthorization || null;

  return {
    reference: reservation.booking_reference || null,
    serviceType: 'CAR',
    status: reservation.reservation_status || 'DRAFT',
    paymentStatus: 'PENDING',
    authorizationStatus: reservation.authorization_status || authorization?.status || 'NONE',
    createdAt: reservation.created_at || null,
    customer: {
      name: safeTravellerName(traveller) || reservation.customer_name || null,
      email: traveller.email || reservation.customer_email || null,
      phone: traveller.phone || reservation.customer_phone || null
    },
    pricing: {
      total: amount(reservation.total_amount),
      currency: text(reservation.currency || 'USD').toUpperCase() || 'USD'
    },
    car: {
      rentalCompanyName: car.rental_company_name || null,
      vehicleName: car.vehicle_name || null,
      vehicleCategory: car.vehicle_category || null,
      driverAge: car.driver_age ?? null,
      pickupLocation: car.pickup_location || null,
      pickupAt: car.pickup_at || null,
      dropoffLocation: car.dropoff_location || null,
      dropoffAt: car.dropoff_at || null,
      mileagePolicy: car.mileage_policy || null,
      fuelPolicy: car.fuel_policy || null,
      depositTerms: car.deposit_terms || null,
      cancellationPolicy: car.cancellation_policy || null,
      supplierConfirmation: car.supplier_confirmation || null
    },
    authorization: authorization ? {
      status: authorization.status || reservation.authorization_status || 'NONE',
      version: authorization.version || 1,
      totalAmount: amount(authorization.total_amount),
      currency: text(authorization.currency || reservation.currency || 'USD').toUpperCase() || 'USD',
      sentAt: authorization.sent_at || null,
      viewedAt: authorization.viewed_at || null,
      authorizedAt: authorization.authorized_at || null
    } : null
  };
}

async function tryFlight(reference) {
  try {
    return await bookingService.getDetailsByCodeOrId(reference);
  } catch (error) {
    if (error?.status === 404 || error?.code === 'BOOKING_NOT_FOUND') return null;
    throw error;
  }
}

async function tryCar(reference) {
  try {
    return await getReservation(reference);
  } catch (error) {
    if (error?.status === 404 || error?.code === 'RESERVATION_NOT_FOUND') return null;
    throw error;
  }
}

export async function resolvePublicReservation(reference) {
  const normalized = text(reference).toUpperCase();
  if (!normalized) return null;

  const flight = await tryFlight(normalized);
  if (flight) return buildFlightPublicReservation(flight);

  const car = await tryCar(normalized);
  if (car) return buildCarPublicReservation(car);

  return null;
}

export const bookingPublicReservationController = {
  get: async (req, res, next) => {
    try {
      const data = await resolvePublicReservation(req.params.reference);
      if (!data) {
        return res.status(404).json({
          success: false,
          error: { code: 'RESERVATION_NOT_FOUND', message: 'Reservation reference not found.' }
        });
      }
      return res.json({ success: true, data });
    } catch (error) {
      return next(error);
    }
  }
};

export default bookingPublicReservationController;
