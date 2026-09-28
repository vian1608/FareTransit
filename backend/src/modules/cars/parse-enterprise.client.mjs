import axios from 'axios';
import env from '../../config/env.mjs';
import logger from '../../config/logger.mjs';

const DEFAULT_BASE_URL = 'https://api.parse.bot/scraper/897a30e0-28fa-40f3-b343-38a2acbd144b';
const REQUEST_TIMEOUT_MS = 18000;

function providerError(code, message, statusCode = 502, details = null) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function cleanParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );
}

function extractData(payload) {
  if (payload?.status === 'success' && payload?.data) return payload.data;
  if (payload?.data?.status === 'success' && payload?.data?.data) return payload.data.data;
  if (payload?.data && typeof payload.data === 'object') return payload.data;
  return payload || {};
}

class ParseEnterpriseClient {
  constructor() {
    this.http = axios.create({
      timeout: REQUEST_TIMEOUT_MS,
      validateStatus: () => true
    });
  }

  get configured() {
    return Boolean(env.parseApiKey);
  }

  get baseUrl() {
    return String(env.parseEnterpriseApiBaseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
  }

  async request(endpoint, params = {}) {
    if (!this.configured) {
      throw providerError(
        'PARSE_API_NOT_CONFIGURED',
        'Car-rental inventory is not configured yet. Add PARSE_API_KEY to the server environment.',
        503
      );
    }

    const url = `${this.baseUrl}/${endpoint}`;
    let response;
    try {
      response = await this.http.get(url, {
        params: cleanParams(params),
        headers: {
          'X-API-Key': env.parseApiKey,
          Accept: 'application/json'
        }
      });
    } catch (error) {
      logger.warn(`[ParseEnterprise] ${endpoint} network failure: ${error.message}`);
      throw providerError('CAR_PROVIDER_UNAVAILABLE', 'Live rental inventory is temporarily unavailable.', 502);
    }

    if (response.status === 429) {
      throw providerError('CAR_PROVIDER_RATE_LIMITED', 'Live rental search is busy. Please wait a moment and retry.', 429);
    }

    if (response.status < 200 || response.status >= 300) {
      const upstreamMessage = response.data?.error?.message || response.data?.message || `HTTP ${response.status}`;
      logger.warn(`[ParseEnterprise] ${endpoint} returned ${response.status}: ${upstreamMessage}`);
      throw providerError('CAR_PROVIDER_ERROR', 'Live rental inventory could not be retrieved right now.', 502, {
        upstreamStatus: response.status
      });
    }

    if (response.data?.status && response.data.status !== 'success') {
      logger.warn(`[ParseEnterprise] ${endpoint} unsuccessful response: ${JSON.stringify(response.data).slice(0, 500)}`);
      throw providerError('CAR_PROVIDER_ERROR', 'Live rental inventory could not be retrieved right now.', 502);
    }

    return extractData(response.data);
  }

  async searchLocations({ query, countryCode = 'US' }) {
    return this.request('search_locations', {
      query,
      country_code: String(countryCode || 'US').toUpperCase()
    });
  }

  async searchVehicles({
    locationId,
    pickupDate,
    pickupTime,
    returnDate,
    returnTime,
    currency = 'USD',
    renterAge = 30,
    countryCode = 'US'
  }) {
    return this.request('search_vehicles', {
      location_id: locationId,
      pickup_date: pickupDate,
      pickup_time: pickupTime,
      return_date: returnDate,
      return_time: returnTime,
      currency: String(currency || 'USD').toUpperCase(),
      renter_age: renterAge,
      country_code: String(countryCode || 'US').toUpperCase()
    });
  }
}

const parseEnterpriseClient = new ParseEnterpriseClient();
export { ParseEnterpriseClient, providerError };
export default parseEnterpriseClient;
