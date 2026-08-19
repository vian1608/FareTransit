const SERPAPI_ENDPOINT = 'https://serpapi.com/search.json';
const SEARCH_TIMEOUT_MS = 25000;

const allowedSearchParams = new Set([
  'q', 'check_in_date', 'check_out_date', 'adults', 'children', 'children_ages',
  'gl', 'hl', 'currency', 'sort_by', 'min_price', 'max_price', 'property_types',
  'amenities', 'rating', 'brands', 'hotel_class', 'free_cancellation', 'special_offers',
  'eco_certified', 'vacation_rentals', 'bedrooms', 'bathrooms', 'next_page_token'
]);

function requireApiKey() {
  const apiKey = String(process.env.SERPAPI_API_KEY || '').trim();
  if (!apiKey) {
    const error = new Error('Hotel search is temporarily unavailable because SERPAPI_API_KEY is not configured.');
    error.statusCode = 503;
    error.code = 'HOTEL_SEARCH_NOT_CONFIGURED';
    throw error;
  }
  return apiKey;
}

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeRate(rate) {
  if (!rate || typeof rate !== 'object') return null;
  return {
    lowest: rate.lowest || null,
    amount: asNumber(rate.extracted_lowest),
    beforeTaxesFees: rate.before_taxes_fees || null,
    beforeTaxesFeesAmount: asNumber(rate.extracted_before_taxes_fees)
  };
}

function normalizePriceSource(price) {
  if (!price || typeof price !== 'object') return null;
  return {
    source: price.source || null,
    logo: price.logo || null,
    numGuests: asNumber(price.num_guests),
    ratePerNight: normalizeRate(price.rate_per_night),
    totalRate: normalizeRate(price.total_rate),
    freeCancellation: Boolean(price.free_cancellation),
    freeCancellationUntilDate: price.free_cancellation_until_date || null,
    freeCancellationUntilTime: price.free_cancellation_until_time || null,
    breakfastIncluded: Boolean(price.breakfast_included),
    link: typeof price.link === 'string' && !price.link.includes('serpapi.com') ? price.link : null
  };
}

function normalizeProperty(property, { includeDetails = false } = {}) {
  if (!property || typeof property !== 'object') return null;
  const images = Array.isArray(property.images)
    ? property.images.slice(0, 8).map((image) => ({
        thumbnail: image?.thumbnail || null,
        original: image?.original_image || null
      }))
    : [];

  const normalized = {
    propertyToken: property.property_token || null,
    type: property.type || 'hotel',
    name: property.name || 'Hotel',
    description: property.description || null,
    website: typeof property.link === 'string' && !property.link.includes('serpapi.com') ? property.link : null,
    logo: property.logo || null,
    sponsored: Boolean(property.sponsored),
    ecoCertified: Boolean(property.eco_certified),
    coordinates: property.gps_coordinates ? {
      latitude: asNumber(property.gps_coordinates.latitude),
      longitude: asNumber(property.gps_coordinates.longitude)
    } : null,
    checkInTime: property.check_in_time || null,
    checkOutTime: property.check_out_time || null,
    hotelClass: property.hotel_class || property.extracted_hotel_class || null,
    overallRating: asNumber(property.overall_rating),
    reviews: asNumber(property.reviews),
    locationRating: asNumber(property.location_rating),
    amenities: Array.isArray(property.amenities) ? property.amenities.slice(0, 20) : [],
    ratePerNight: normalizeRate(property.rate_per_night),
    totalRate: normalizeRate(property.total_rate),
    images,
    image: images[0]?.thumbnail || images[0]?.original || property.thumbnail || property.logo || null,
    priceSources: Array.isArray(property.prices)
      ? property.prices.slice(0, 8).map(normalizePriceSource).filter(Boolean)
      : []
  };

  if (includeDetails) {
    normalized.address = property.address || null;
    normalized.phone = property.phone || null;
    normalized.typicalPriceRange = property.typical_price_range ? {
      lowest: property.typical_price_range.lowest || null,
      lowestAmount: asNumber(property.typical_price_range.extracted_lowest),
      highest: property.typical_price_range.highest || null,
      highestAmount: asNumber(property.typical_price_range.extracted_highest)
    } : null;
    normalized.rooms = Array.isArray(property.rooms)
      ? property.rooms.slice(0, 12).map((room) => ({
          name: room?.name || null,
          numGuests: asNumber(room?.num_guests),
          ratePerNight: normalizeRate(room?.rate_per_night),
          totalRate: normalizeRate(room?.total_rate),
          rates: Array.isArray(room?.rates) ? room.rates.slice(0, 6).map(normalizePriceSource).filter(Boolean) : []
        }))
      : [];
  }

  return normalized;
}

function validateSearchParams(input = {}) {
  const q = String(input.q || '').trim();
  const checkIn = String(input.check_in_date || '').trim();
  const checkOut = String(input.check_out_date || '').trim();
  if (!q || !/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) {
    const error = new Error('Destination, check-in date and check-out date are required.');
    error.statusCode = 400;
    error.code = 'INVALID_HOTEL_SEARCH';
    throw error;
  }
  if (checkOut <= checkIn) {
    const error = new Error('Check-out date must be after check-in date.');
    error.statusCode = 400;
    error.code = 'INVALID_HOTEL_DATES';
    throw error;
  }

  const children = Number(input.children || 0);
  const ages = String(input.children_ages || '').trim();
  if (ages) {
    const values = ages.split(',').map((item) => item.trim()).filter(Boolean);
    if (values.length !== children || values.some((age) => !/^\d+$/.test(age) || Number(age) < 1 || Number(age) > 17)) {
      const error = new Error('Children ages must match the number of children and each age must be from 1 to 17.');
      error.statusCode = 400;
      error.code = 'INVALID_CHILDREN_AGES';
      throw error;
    }
  }
}

async function requestSerpApi(params, { includeDetails = false } = {}) {
  const apiKey = requireApiKey();
  const url = new URL(SERPAPI_ENDPOINT);
  url.searchParams.set('engine', 'google_hotels');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('output', 'json');

  for (const [key, rawValue] of Object.entries(params || {})) {
    if (rawValue === undefined || rawValue === null || rawValue === '') continue;
    if (!allowedSearchParams.has(key) && key !== 'property_token') continue;
    url.searchParams.set(key, String(rawValue));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.error) {
      const error = new Error(data?.error || `Hotel provider returned HTTP ${response.status}.`);
      error.statusCode = response.status >= 400 && response.status < 500 ? 502 : 503;
      error.code = 'HOTEL_PROVIDER_ERROR';
      throw error;
    }

    if (includeDetails) return normalizeProperty(data, { includeDetails: true });

    return {
      properties: Array.isArray(data.properties)
        ? data.properties.map((property) => normalizeProperty(property)).filter(Boolean)
        : [],
      nextPageToken: data?.serpapi_pagination?.next_page_token || null,
      totalResults: asNumber(data?.search_information?.total_results),
      brands: Array.isArray(data.brands) ? data.brands.slice(0, 100) : []
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('Hotel search provider timed out. Please try again.');
      timeoutError.statusCode = 504;
      timeoutError.code = 'HOTEL_SEARCH_TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function search(input) {
  validateSearchParams(input);
  const params = {};
  for (const key of allowedSearchParams) {
    if (input[key] !== undefined && input[key] !== null && input[key] !== '') params[key] = input[key];
  }
  params.gl = params.gl || 'us';
  params.hl = params.hl || 'en';
  params.currency = params.currency || 'USD';
  params.adults = params.adults || 2;
  params.children = params.children || 0;
  return requestSerpApi(params);
}

async function details(input) {
  validateSearchParams(input);
  const propertyToken = String(input.property_token || '').trim();
  if (!propertyToken) {
    const error = new Error('property_token is required.');
    error.statusCode = 400;
    error.code = 'HOTEL_PROPERTY_TOKEN_REQUIRED';
    throw error;
  }
  return requestSerpApi({
    q: input.q,
    check_in_date: input.check_in_date,
    check_out_date: input.check_out_date,
    adults: input.adults || 2,
    children: input.children || 0,
    children_ages: input.children_ages || undefined,
    currency: input.currency || 'USD',
    gl: input.gl || 'us',
    hl: input.hl || 'en',
    property_token: propertyToken
  }, { includeDetails: true });
}

export default { search, details, validateSearchParams };
