import logger from '../../config/logger.mjs';
import supabase from '../../config/supabase.mjs';
import parseEnterpriseClient from './parse-enterprise.client.mjs';
import { createCarQuoteToken } from './car-quote-token.mjs';

function serviceError(code, message, statusCode = 400, details = null) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isoDate(value, fieldName) {
  const stringValue = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
    throw serviceError('INVALID_CAR_SEARCH', `${fieldName} must use YYYY-MM-DD format.`);
  }
  return stringValue;
}

function timeValue(value, fallback = '10:00:00') {
  const candidate = String(value || fallback).trim();
  const match = candidate.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) throw serviceError('INVALID_CAR_SEARCH', 'Pickup and return times must use 24-hour HH:MM format.');
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] || 0);
  if (hour > 23 || minute > 59 || second > 59) {
    throw serviceError('INVALID_CAR_SEARCH', 'Pickup and return times must use a valid 24-hour time.');
  }
  return `${match[1]}:${match[2]}:${String(second).padStart(2, '0')}`;
}

function locationFromInput(value) {
  if (!value || typeof value !== 'object') return null;
  const id = text(value.id || value.locationId || value.location_id);
  if (!id) return null;
  return {
    id,
    label: text(value.label || value.name),
    name: text(value.name || value.label),
    airportCode: text(value.airportCode || value.airport_code || value.airport || value.code).toUpperCase(),
    address: text(value.address),
    city: text(value.city),
    state: text(value.state),
    country: text(value.country),
    type: text(value.type || 'branch')
  };
}

function formatAddress(address = {}) {
  if (typeof address === 'string') return address.trim();
  return [address.street, address.city, address.state, address.postal, address.country]
    .filter(Boolean)
    .join(', ');
}

function normalizeProviderLocation(value, fallback = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const address = source.address && typeof source.address === 'object' ? source.address : {};
  return {
    id: String(source.id || fallback.id || ''),
    name: text(source.name || fallback.name || fallback.label),
    label: text(source.name || fallback.label || fallback.name),
    airportCode: text(source.airport_code || fallback.airportCode).toUpperCase() || null,
    address: formatAddress(source.address) || fallback.address || '',
    city: text(address.city || fallback.city),
    state: text(address.state || fallback.state),
    country: text(address.country || fallback.country),
    type: text(source.type || fallback.type || 'branch')
  };
}

function normalizeVehicle(raw = {}, context = {}) {
  const vehicleCode = text(raw.vehicle_code || raw.code || raw.id);
  const name = text(raw.name || raw.vehicle_name || raw.make_model) || 'Rental car';
  const makeModel = text(raw.make_model || raw.model || raw.vehicle_description) || name;
  const category = text(raw.category || raw.vehicle_category || raw.class) || 'Standard';
  const transmission = text(raw.transmission || raw.transmission_type) || null;
  const passengers = numberOrNull(raw.passengers || raw.seats || raw.passenger_capacity);
  const luggage = numberOrNull(raw.luggage_capacity || raw.luggage || raw.bags);
  const doors = numberOrNull(raw.doors);
  const dailyRate = numberOrNull(raw.daily_rate || raw.rate_per_day || raw.price_per_day);
  const totalPrice = numberOrNull(raw.total_price || raw.rental_total || raw.total);
  const currency = text(raw.currency || context.currency || 'USD').toUpperCase();

  const pickupLocation = normalizeProviderLocation(context.pickupLocation, context.requestedLocation);
  const returnLocation = normalizeProviderLocation(context.returnLocation, context.requestedLocation);
  const pickupDatetime = context.pickupDatetime;
  const returnDatetime = context.returnDatetime;

  const quotePayload = {
    provider: 'parse-enterprise',
    supplier: 'Enterprise',
    vehicleCode: vehicleCode || `${category}:${name}`,
    vehicleName: name,
    makeModel,
    category,
    transmission,
    passengers,
    luggageCapacity: luggage,
    doors,
    currency,
    dailyRate,
    totalPrice,
    pickupLocation,
    returnLocation,
    pickupDatetime,
    returnDatetime,
    driverAge: context.driverAge,
    driverCountry: context.driverCountry,
    capturedAt: new Date().toISOString()
  };

  return {
    id: vehicleCode ? `enterprise:${vehicleCode}` : `enterprise:${Buffer.from(`${category}:${name}`).toString('base64url')}`,
    provider: 'parse-enterprise',
    vehicle_code: vehicleCode || null,
    supplier: {
      name: 'Enterprise',
      brand: 'ENTERPRISE'
    },
    vehicle: {
      name,
      make_model: makeModel,
      category,
      or_similar: raw.or_similar !== false,
      transmission,
      seats: passengers,
      doors,
      luggage_capacity: luggage,
      air_conditioning: raw.air_conditioning ?? raw.air_conditioned ?? null,
      features: Array.isArray(raw.features) ? raw.features : []
    },
    pickup_location: pickupLocation,
    return_location: returnLocation,
    pickup_datetime: pickupDatetime,
    return_datetime: returnDatetime,
    pricing: {
      currency,
      daily_rate: dailyRate,
      rental_total: totalPrice,
      estimated: true
    },
    quote_token: createCarQuoteToken(quotePayload),
    quote_expires_in_seconds: 900
  };
}

function validateSearch(input = {}) {
  const pickup = locationFromInput(input.pickupLocation || input.pickup_location);
  const dropoff = locationFromInput(input.dropoffLocation || input.dropoff_location) || pickup;
  if (!pickup) {
    throw serviceError('CAR_LOCATION_REQUIRED', 'Please choose a pickup location from the Enterprise location suggestions.');
  }
  if (!dropoff) {
    throw serviceError('CAR_LOCATION_REQUIRED', 'Please choose a return location from the Enterprise location suggestions.');
  }
  if (pickup.id !== dropoff.id) {
    throw serviceError(
      'ONE_WAY_NOT_SUPPORTED',
      'Different return locations are not supported by the current Enterprise inventory connection yet.',
      409
    );
  }

  const pickupDate = isoDate(input.pickupDate || input.pickup_date, 'Pickup date');
  const returnDate = isoDate(input.dropoffDate || input.returnDate || input.return_date, 'Return date');
  const pickupTime = timeValue(input.pickupTime || input.pickup_time);
  const returnTime = timeValue(input.dropoffTime || input.returnTime || input.return_time);
  const pickupDatetime = `${pickupDate}T${pickupTime}`;
  const returnDatetime = `${returnDate}T${returnTime}`;
  const pickupStamp = Date.parse(pickupDatetime);
  const returnStamp = Date.parse(returnDatetime);
  if (!Number.isFinite(pickupStamp) || !Number.isFinite(returnStamp) || returnStamp <= pickupStamp) {
    throw serviceError('INVALID_CAR_DATES', 'Return date/time must be after pickup date/time.');
  }

  const driverAge = Number.parseInt(input.driverAge ?? input.renter_age ?? 30, 10);
  if (!Number.isFinite(driverAge) || driverAge < 18 || driverAge > 99) {
    throw serviceError('INVALID_DRIVER_AGE', 'Driver age must be between 18 and 99.');
  }

  const currency = String(input.currency || 'USD').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw serviceError('INVALID_CURRENCY', 'Currency must be a 3-letter ISO currency code.');
  }

  const driverCountry = String(input.driverCountry || input.countryCode || 'US').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(driverCountry)) {
    throw serviceError('INVALID_COUNTRY', 'Driver country must be a 2-letter country code.');
  }

  return {
    pickup,
    dropoff,
    pickupDate,
    pickupTime,
    returnDate,
    returnTime,
    pickupDatetime,
    returnDatetime,
    driverAge,
    driverCountry,
    currency
  };
}

async function recordSearch(context, resultCount) {
  try {
    await supabase.from('car_search_events').insert({
      pickup_reference: `parse-enterprise:${context.pickup.id}`,
      dropoff_reference: `parse-enterprise:${context.dropoff.id}`,
      pickup_datetime: context.pickupDatetime,
      dropoff_datetime: context.returnDatetime,
      driver_age_range: String(context.driverAge),
      currency: context.currency,
      result_count: resultCount,
      created_at: new Date().toISOString()
    });
  } catch (error) {
    logger.warn(`[CarRentals] Search analytics notice: ${error.message}`);
  }
}

export const carService = {
  validateSearch,

  search: async (input = {}) => {
    const context = validateSearch(input);
    const providerData = await parseEnterpriseClient.searchVehicles({
      locationId: context.pickup.id,
      pickupDate: context.pickupDate,
      pickupTime: context.pickupTime,
      returnDate: context.returnDate,
      returnTime: context.returnTime,
      currency: context.currency,
      renterAge: context.driverAge,
      countryCode: context.driverCountry
    });

    const rawVehicles = Array.isArray(providerData?.vehicles)
      ? providerData.vehicles
      : Array.isArray(providerData?.cars)
        ? providerData.cars
        : [];

    const providerPickup = providerData?.pickup_location || context.pickup;
    const providerReturn = providerData?.return_location || providerPickup;
    const providerPickupDatetime = providerData?.pickup_datetime || context.pickupDatetime;
    const providerReturnDatetime = providerData?.return_datetime || context.returnDatetime;

    const normalizedContext = {
      ...context,
      requestedLocation: context.pickup,
      pickupLocation: providerPickup,
      returnLocation: providerReturn,
      pickupDatetime: providerPickupDatetime,
      returnDatetime: providerReturnDatetime
    };

    const results = rawVehicles.map((vehicle) => normalizeVehicle(vehicle, normalizedContext));
    results.sort((a, b) => {
      const aPrice = Number(a.pricing?.rental_total);
      const bPrice = Number(b.pricing?.rental_total);
      if (!Number.isFinite(aPrice)) return 1;
      if (!Number.isFinite(bPrice)) return -1;
      return aPrice - bPrice;
    });

    void recordSearch(context, results.length);

    return {
      provider: 'parse-enterprise',
      supplier: 'Enterprise',
      results,
      metadata: {
        total_results: results.length,
        next_page: null,
        searched_at: new Date().toISOString(),
        price_disclaimer: 'Prices are estimates from live Enterprise inventory and are subject to final FareTransit confirmation.'
      },
      search: {
        pickup_location: normalizeProviderLocation(providerPickup, context.pickup),
        return_location: normalizeProviderLocation(providerReturn, context.dropoff),
        pickup_datetime: providerPickupDatetime,
        return_datetime: providerReturnDatetime,
        driver_age: context.driverAge,
        currency: context.currency
      }
    };
  }
};

export { normalizeVehicle, serviceError };
export default carService;
