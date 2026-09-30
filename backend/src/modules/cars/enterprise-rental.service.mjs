import crypto from 'crypto';
import supabase from '../../config/supabase.mjs';
import logger from '../../config/logger.mjs';

const PARSE_BASE_URL = process.env.PARSE_ENTERPRISE_BASE_URL || 'https://api.parse.bot/scraper/897a30e0-28fa-40f3-b343-38a2acbd144b';
const PARSE_SNAPSHOT_VERSION = process.env.PARSE_API_SNAPSHOT_VERSION || '6';
const LOCATION_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const QUOTE_TTL_MINUTES = Math.max(5, Math.min(Number.parseInt(process.env.CAR_QUOTE_TTL_MINUTES || '15', 10) || 15, 60));
const locationCache = new Map();

function httpError(message, statusCode = 400, code = 'ENTERPRISE_RENTAL_ERROR') {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function normalizeCountry(value = 'US') {
  const country = String(value || 'US').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw httpError('Country code must be a 2-letter ISO code.', 400, 'INVALID_COUNTRY');
  return country;
}

function normalizeCurrency(value = 'USD') {
  const currency = String(value || 'USD').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw httpError('Currency must be a 3-letter ISO code.', 400, 'INVALID_CURRENCY');
  return currency;
}

function normalizeDate(value, field) {
  const date = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw httpError(`${field} must use YYYY-MM-DD.`, 400, 'INVALID_DATE');
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) throw httpError(`${field} is not a valid date.`, 400, 'INVALID_DATE');
  return date;
}

function normalizeTime(value = '12:00') {
  const raw = String(value || '12:00').trim();
  const time = raw.length === 8 ? raw.slice(0, 5) : raw;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw httpError('Time must use HH:MM.', 400, 'INVALID_TIME');
  return time;
}

function normalizeAge(value = 25) {
  const age = Number.parseInt(value, 10);
  if (!Number.isInteger(age) || age < 18 || age > 99) throw httpError('Renter age must be between 18 and 99.', 400, 'INVALID_RENTER_AGE');
  return age;
}

async function parseGet(endpoint, params) {
  const apiKey = process.env.PARSE_API_KEY;
  if (!apiKey) throw httpError('Enterprise search is not configured.', 503, 'PARSE_API_NOT_CONFIGURED');

  const url = new URL(`${PARSE_BASE_URL.replace(/\/$/, '')}/${endpoint}`);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value) !== '') url.searchParams.set(key, String(value));
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-Key': apiKey,
        'API-Snapshot-Version': PARSE_SNAPSHOT_VERSION,
        Accept: 'application/json'
      },
      signal: controller.signal
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      logger.warn(`[EnterpriseRental] Parse ${endpoint} returned ${response.status}`);
      throw httpError(body?.error?.message || body?.message || 'Enterprise inventory provider returned an error.', 502, 'PARSE_UPSTREAM_ERROR');
    }
    if (!body || body.status === 'error') throw httpError(body?.error?.message || 'Enterprise inventory provider returned an invalid response.', 502, 'PARSE_UPSTREAM_ERROR');
    return body.data || body;
  } catch (error) {
    if (error?.name === 'AbortError') throw httpError('Enterprise inventory search timed out. Please try again.', 504, 'PARSE_TIMEOUT');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeLocation(location = {}) {
  return {
    id: String(location.id || ''),
    name: location.name || 'Enterprise location',
    type: location.type || 'rental',
    brand: location.brand || 'ENTERPRISE',
    airportCode: location.airport_code || null,
    phone: location.phone || null,
    afterHoursReturn: Boolean(location.after_hours_return),
    address: {
      street: location.address?.street || '',
      city: location.address?.city || '',
      state: location.address?.state || '',
      postal: location.address?.postal || '',
      country: location.address?.country || 'US'
    },
    gps: location.gps || null,
    hours: Array.isArray(location.hours) ? location.hours : []
  };
}

function normalizeVehicle(vehicle = {}) {
  return {
    provider: 'enterprise',
    vehicleCode: String(vehicle.vehicle_code || vehicle.code || ''),
    name: vehicle.name || vehicle.category || 'Rental Car',
    makeModel: vehicle.make_model || '',
    category: vehicle.category || '',
    subCategory: vehicle.sub_category || '',
    imageUrl: vehicle.image_url || '',
    passengers: Number(vehicle.passengers || 0),
    luggageCapacity: Number(vehicle.luggage_capacity || 0),
    largeBags: Number(vehicle.large_bags || 0),
    smallBags: Number(vehicle.small_bags || 0),
    transmission: vehicle.transmission || '',
    fuelType: vehicle.fuel_type || '',
    fuelEfficiencyMpg: vehicle.fuel_efficiency_mpg || null,
    features: Array.isArray(vehicle.features) ? vehicle.features : [],
    rateType: vehicle.rate_type || '',
    availabilityStatus: vehicle.availability_status || '',
    dailyRate: Number(vehicle.daily_rate || 0),
    totalPrice: Number(vehicle.total_price || 0),
    currency: vehicle.currency || 'USD'
  };
}

function normalizeSearch(input = {}) {
  const locationId = String(input.location_id || input.locationId || input.pickupLocationId || '').trim();
  if (!locationId) throw httpError('Pickup Enterprise location ID is required.', 400, 'LOCATION_REQUIRED');
  const pickupDate = normalizeDate(input.pickup_date || input.pickupDate, 'Pickup date');
  const returnDate = normalizeDate(input.return_date || input.returnDate || input.dropoffDate, 'Return date');
  const pickupTime = normalizeTime(input.pickup_time || input.pickupTime || '12:00');
  const returnTime = normalizeTime(input.return_time || input.returnTime || input.dropoffTime || '12:00');
  const pickup = new Date(`${pickupDate}T${pickupTime}:00`);
  const dropoff = new Date(`${returnDate}T${returnTime}:00`);
  if (dropoff <= pickup) throw httpError('Return date/time must be after pickup date/time.', 400, 'INVALID_RENTAL_WINDOW');

  return {
    location_id: locationId,
    return_location_id: String(input.return_location_id || input.returnLocationId || input.dropoffLocationId || locationId).trim(),
    pickup_date: pickupDate,
    pickup_time: pickupTime,
    return_date: returnDate,
    return_time: returnTime,
    renter_age: normalizeAge(input.renter_age || input.renterAge || input.driverAge || 25),
    currency: normalizeCurrency(input.currency || 'USD'),
    country_code: normalizeCountry(input.country_code || input.countryCode || 'US')
  };
}

async function searchLocations(query, countryCode = 'US') {
  const q = String(query || '').trim();
  if (q.length < 3) return { query: q, countryCode: normalizeCountry(countryCode), totalResults: 0, locations: [] };
  if (q.length > 120) throw httpError('Location search is too long.', 400, 'INVALID_QUERY');
  const country = normalizeCountry(countryCode);
  const key = `${country}:${q.toLowerCase()}`;
  const cached = locationCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const data = await parseGet('search_locations', { query: q, country_code: country });
  const value = {
    query: data.query || q,
    countryCode: data.country_code || country,
    totalResults: Number(data.total_results || data.locations?.length || 0),
    locations: (Array.isArray(data.locations) ? data.locations : []).map(normalizeLocation).slice(0, 12)
  };
  locationCache.set(key, { value, expiresAt: Date.now() + LOCATION_CACHE_TTL_MS });
  return value;
}

async function searchVehicles(input = {}) {
  const search = normalizeSearch(input);
  const data = await parseGet('search_vehicles', search);
  return {
    search,
    currency: data.currency || search.currency,
    renterAge: Number(data.renter_age || search.renter_age),
    totalVehicles: Number(data.total_vehicles || data.vehicles?.length || 0),
    pickupDatetime: data.pickup_datetime || `${search.pickup_date}T${search.pickup_time}`,
    returnDatetime: data.return_datetime || `${search.return_date}T${search.return_time}`,
    pickupLocation: data.pickup_location ? normalizeLocation(data.pickup_location) : null,
    returnLocation: data.return_location ? normalizeLocation(data.return_location) : null,
    vehicles: (Array.isArray(data.vehicles) ? data.vehicles : []).map(normalizeVehicle)
  };
}

function makeToken(prefix, bytes = 18) {
  return `${prefix}_${crypto.randomBytes(bytes).toString('base64url')}`;
}

async function createQuote(input = {}) {
  const vehicleCode = String(input.vehicleCode || input.vehicle_code || '').trim().toUpperCase();
  if (!vehicleCode) throw httpError('Vehicle code is required.', 400, 'VEHICLE_REQUIRED');
  const live = await searchVehicles(input.search || input);
  const vehicle = live.vehicles.find(item => item.vehicleCode.toUpperCase() === vehicleCode);
  if (!vehicle || vehicle.totalPrice <= 0) throw httpError('This vehicle is no longer available at the displayed rate.', 409, 'VEHICLE_RATE_CHANGED');

  const quoteToken = makeToken('q');
  const expiresAt = new Date(Date.now() + QUOTE_TTL_MINUTES * 60 * 1000).toISOString();
  const row = {
    quote_token: quoteToken,
    status: 'active',
    provider: 'enterprise',
    search_snapshot: live,
    vehicle_snapshot: vehicle,
    selling_price: vehicle.totalPrice,
    currency: vehicle.currency || live.currency || 'USD',
    expires_at: expiresAt
  };
  const { error } = await supabase.from('car_rental_quotes').insert(row);
  if (error) {
    logger.error(`[EnterpriseRental] quote insert failed: ${error.message}`);
    throw httpError('Unable to create a secure rental quote.', 500, 'QUOTE_PERSISTENCE_ERROR');
  }
  return { quoteToken, expiresAt, provider: 'enterprise', vehicle, search: live.search, pickupLocation: live.pickupLocation, returnLocation: live.returnLocation, total: vehicle.totalPrice, currency: row.currency };
}

async function getQuote(quoteToken, { allowExpired = false } = {}) {
  const token = String(quoteToken || '').trim();
  if (!token.startsWith('q_')) throw httpError('Invalid quote.', 404, 'QUOTE_NOT_FOUND');
  const { data, error } = await supabase.from('car_rental_quotes').select('*').eq('quote_token', token).maybeSingle();
  if (error || !data) throw httpError('Rental quote was not found.', 404, 'QUOTE_NOT_FOUND');
  const expired = new Date(data.expires_at).getTime() <= Date.now();
  if (expired && !allowExpired) throw httpError('This rental quote has expired. Please search again for current pricing.', 410, 'QUOTE_EXPIRED');
  return {
    quoteToken: data.quote_token,
    status: expired ? 'expired' : data.status,
    expiresAt: data.expires_at,
    provider: data.provider,
    search: data.search_snapshot?.search || data.search_snapshot,
    pickupLocation: data.search_snapshot?.pickupLocation || null,
    returnLocation: data.search_snapshot?.returnLocation || null,
    vehicle: data.vehicle_snapshot,
    total: Number(data.selling_price || 0),
    currency: data.currency || 'USD'
  };
}

function validateCustomer(customer = {}) {
  const firstName = String(customer.firstName || '').trim();
  const lastName = String(customer.lastName || '').trim();
  const email = String(customer.email || '').trim().toLowerCase();
  const phone = String(customer.phone || '').trim();
  if (!firstName || !lastName) throw httpError('Driver first and last name are required.', 400, 'CUSTOMER_NAME_REQUIRED');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw httpError('A valid email address is required.', 400, 'CUSTOMER_EMAIL_REQUIRED');
  if (phone.replace(/\D/g, '').length < 7) throw httpError('A valid phone number is required.', 400, 'CUSTOMER_PHONE_REQUIRED');
  return {
    firstName: firstName.slice(0, 80),
    lastName: lastName.slice(0, 80),
    email: email.slice(0, 180),
    phone: phone.slice(0, 40),
    age: normalizeAge(customer.age || 25)
  };
}

function sanitizeBilling(billing = {}) {
  return {
    address1: String(billing.address1 || '').trim().slice(0, 180),
    address2: String(billing.address2 || '').trim().slice(0, 180),
    city: String(billing.city || '').trim().slice(0, 100),
    state: String(billing.state || '').trim().slice(0, 80),
    postal: String(billing.postal || '').trim().slice(0, 24),
    country: normalizeCountry(billing.country || 'US')
  };
}

async function createOrder(input = {}) {
  const quote = await getQuote(input.quoteToken);
  const customer = validateCustomer(input.customer || {});
  const billing = sanitizeBilling(input.billing || {});
  const reference = `FTCAR-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const publicToken = makeToken('ro');
  const row = {
    order_reference: reference,
    public_token: publicToken,
    quote_token: quote.quoteToken,
    status: 'payment_pending',
    payment_status: 'not_started',
    provider: 'enterprise',
    customer,
    billing,
    search_snapshot: quote.search,
    vehicle_snapshot: quote.vehicle,
    pickup_location_snapshot: quote.pickupLocation,
    return_location_snapshot: quote.returnLocation,
    amount: quote.total,
    currency: quote.currency
  };
  const { error } = await supabase.from('car_rental_orders').insert(row);
  if (error) {
    logger.error(`[EnterpriseRental] order insert failed: ${error.message}`);
    throw httpError('Unable to create the rental order.', 500, 'ORDER_PERSISTENCE_ERROR');
  }
  await supabase.from('car_rental_quotes').update({ status: 'checkout_started', updated_at: new Date().toISOString() }).eq('quote_token', quote.quoteToken);
  return { orderReference: reference, publicToken, status: row.status, paymentStatus: row.payment_status, amount: row.amount, currency: row.currency, quote };
}

function publicOrder(row = {}) {
  return {
    orderReference: row.order_reference,
    publicToken: row.public_token,
    status: row.status,
    paymentStatus: row.payment_status,
    provider: row.provider,
    customer: row.customer ? { firstName: row.customer.firstName, lastName: row.customer.lastName, email: row.customer.email, phone: row.customer.phone } : null,
    search: row.search_snapshot,
    vehicle: row.vehicle_snapshot,
    pickupLocation: row.pickup_location_snapshot,
    returnLocation: row.return_location_snapshot,
    amount: Number(row.amount || 0),
    currency: row.currency,
    supplierConfirmation: row.supplier_confirmation || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function getOrderByPublicToken(publicToken) {
  const token = String(publicToken || '').trim();
  if (!token.startsWith('ro_')) throw httpError('Rental order was not found.', 404, 'ORDER_NOT_FOUND');
  const { data, error } = await supabase.from('car_rental_orders').select('*').eq('public_token', token).maybeSingle();
  if (error || !data) throw httpError('Rental order was not found.', 404, 'ORDER_NOT_FOUND');
  return publicOrder(data);
}

async function getOrderByReference(reference) {
  const { data, error } = await supabase.from('car_rental_orders').select('*').eq('order_reference', String(reference || '')).maybeSingle();
  if (error || !data) throw httpError('Rental order was not found.', 404, 'ORDER_NOT_FOUND');
  return data;
}

async function listOrders({ status, limit = 100 } = {}) {
  let query = supabase.from('car_rental_orders').select('*').order('created_at', { ascending: false }).limit(Math.min(Number(limit) || 100, 250));
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw httpError('Unable to load rental orders.', 500, 'ORDER_LIST_ERROR');
  return (data || []).map(row => ({
    ...publicOrder(row),
    customer: row.customer,
    billing: row.billing,
    nmiPaymentId: row.nmi_payment_id || null,
    nmiAuthorizationCode: row.nmi_authorization_code || null,
    supplierCost: row.supplier_cost === null || row.supplier_cost === undefined ? null : Number(row.supplier_cost),
    grossMargin: row.gross_margin === null || row.gross_margin === undefined ? null : Number(row.gross_margin)
  }));
}

async function updateOrder(reference, patch = {}) {
  const { data, error } = await supabase.from('car_rental_orders').update({ ...patch, updated_at: new Date().toISOString() }).eq('order_reference', reference).select('*').single();
  if (error || !data) throw httpError('Unable to update rental order.', 500, 'ORDER_UPDATE_ERROR');
  return data;
}

export const enterpriseRentalService = {
  normalizeSearch,
  searchLocations,
  searchVehicles,
  createQuote,
  getQuote,
  createOrder,
  getOrderByPublicToken,
  getOrderByReference,
  listOrders,
  updateOrder,
  publicOrder
};

export default enterpriseRentalService;
