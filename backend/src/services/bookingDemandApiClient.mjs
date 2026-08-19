import env from '../config/env.mjs';
import logger from '../config/logger.mjs';

const DEFAULT_TIMEOUT_MS = 25000;
const CATALOG_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours for static reference catalogs

/** Simple in-memory cache with TTL for catalog reference data */
class CatalogCache {
  constructor() {
    this.cache = new Map();
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return item.data;
  }

  set(key, data, ttlMs = CATALOG_CACHE_TTL_MS) {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs
    });
  }
}

const catalogCache = new CatalogCache();

/**
 * Booking.com Demand API v3.1 Client
 * Strictly server-side implementation. Never exposes API Tokens or Affiliate IDs to client.
 */
export const bookingDemandApiClient = {
  /**
   * Helper to perform HTTP requests to Booking.com Demand API v3.1
   */
  request: async (endpoint, options = {}) => {
    const {
      method = 'POST',
      body = null,
      queryParams = null,
      timeoutMs = DEFAULT_TIMEOUT_MS,
      retryCount = 1
    } = options;

    const baseUrl = env.bookingDemandApiBaseUrl;
    const token = env.bookingDemandApiToken;
    const affiliateId = env.bookingAffiliateId;

    let url = `${baseUrl.replace(/\/$/, '')}${endpoint}`;
    if (queryParams && Object.keys(queryParams).length > 0) {
      const searchParams = new URLSearchParams();
      Object.entries(queryParams).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          searchParams.append(k, String(v));
        }
      });
      url += `?${searchParams.toString()}`;
    }

    const requestId = `bk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (affiliateId) {
      headers['X-Affiliate-Id'] = affiliateId;
    }

    let lastError = null;
    let attempt = 0;

    while (attempt <= retryCount) {
      attempt++;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const fetchOptions = {
          method,
          headers,
          signal: controller.signal
        };

        if (body && method !== 'GET' && method !== 'HEAD') {
          fetchOptions.body = JSON.stringify(body);
        }

        const res = await fetch(url, fetchOptions);
        clearTimeout(timeoutId);

        let data = null;
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          data = await res.json();
        } else {
          const text = await res.text();
          data = { message: text };
        }

        if (!res.ok) {
          const status = res.status;
          const errorMessage = data?.message || data?.error?.message || data?.errors?.[0]?.message || `Booking.com API error (${status})`;
          
          logger.warn(`[BookingDemandApi] HTTP ${status} for ${endpoint} (request_id: ${requestId}): ${errorMessage}`);

          // Retry on 5xx transient server errors
          if (status >= 500 && attempt <= retryCount) {
            await new Promise(r => setTimeout(r, 500 * attempt));
            continue;
          }

          const err = new Error(errorMessage);
          err.statusCode = status;
          err.requestId = requestId;
          err.bookingError = data;
          throw err;
        }

        return {
          success: true,
          requestId,
          data
        };

      } catch (err) {
        clearTimeout(timeoutId);
        lastError = err;

        if (err.name === 'AbortError') {
          const timeoutErr = new Error(`Booking.com API request timed out after ${timeoutMs}ms.`);
          timeoutErr.statusCode = 504;
          timeoutErr.requestId = requestId;
          lastError = timeoutErr;

          if (attempt <= retryCount) {
            logger.warn(`[BookingDemandApi] Timeout on attempt ${attempt} for ${endpoint}, retrying...`);
            continue;
          }
        }

        if (err.statusCode && err.statusCode < 500) {
          // Client errors (4xx) should not be retried endlessly
          break;
        }

        if (attempt <= retryCount) {
          logger.warn(`[BookingDemandApi] Exception on attempt ${attempt} for ${endpoint}: ${err.message}. Retrying...`);
          await new Promise(r => setTimeout(r, 500 * attempt));
        }
      }
    }

    // Mask sensitive secrets if present in error message
    let safeMessage = lastError?.message || 'Booking.com API request failed.';
    if (token) safeMessage = safeMessage.replace(token, '[REDACTED]');
    if (affiliateId) safeMessage = safeMessage.replace(affiliateId, '[REDACTED]');

    const finalErr = new Error(safeMessage);
    finalErr.statusCode = lastError?.statusCode || 502;
    finalErr.requestId = requestId;
    throw finalErr;
  },

  /**
   * Search Car Rentals
   * POST /cars/search
   */
  searchCars: async (payload) => {
    return bookingDemandApiClient.request('/cars/search', {
      method: 'POST',
      body: payload
    });
  },

  /**
   * Get Car Details Catalog
   * POST /cars/details
   */
  getCarDetails: async (payload) => {
    const cacheKey = `cars_details_${JSON.stringify(payload)}`;
    const cached = catalogCache.get(cacheKey);
    if (cached) return { success: true, cached: true, data: cached };

    const result = await bookingDemandApiClient.request('/cars/details', {
      method: 'POST',
      body: payload
    });

    if (result.data) {
      catalogCache.set(cacheKey, result.data);
    }
    return result;
  },

  /**
   * Get Depots
   * POST /cars/depots
   */
  getDepots: async (payload) => {
    const cacheKey = `cars_depots_${JSON.stringify(payload)}`;
    const cached = catalogCache.get(cacheKey);
    if (cached) return { success: true, cached: true, data: cached };

    const result = await bookingDemandApiClient.request('/cars/depots', {
      method: 'POST',
      body: payload
    });

    if (result.data) {
      catalogCache.set(cacheKey, result.data);
    }
    return result;
  },

  /**
   * Get Suppliers
   * POST /cars/suppliers
   */
  getSuppliers: async (payload) => {
    const cacheKey = `cars_suppliers_${JSON.stringify(payload)}`;
    const cached = catalogCache.get(cacheKey);
    if (cached) return { success: true, cached: true, data: cached };

    const result = await bookingDemandApiClient.request('/cars/suppliers', {
      method: 'POST',
      body: payload
    });

    if (result.data) {
      catalogCache.set(cacheKey, result.data);
    }
    return result;
  },

  /**
   * Get Depot Review Scores
   * POST /cars/depots/reviews/scores
   */
  getDepotScores: async (payload) => {
    const cacheKey = `cars_depot_scores_${JSON.stringify(payload)}`;
    const cached = catalogCache.get(cacheKey);
    if (cached) return { success: true, cached: true, data: cached };

    const result = await bookingDemandApiClient.request('/cars/depots/reviews/scores', {
      method: 'POST',
      body: payload
    });

    if (result.data) {
      catalogCache.set(cacheKey, result.data);
    }
    return result;
  },

  /**
   * Get Car Constants / Translated Labels
   * POST /cars/constants
   */
  getCarConstants: async (payload = {}) => {
    const cacheKey = `cars_constants_${JSON.stringify(payload)}`;
    const cached = catalogCache.get(cacheKey);
    if (cached) return { success: true, cached: true, data: cached };

    const result = await bookingDemandApiClient.request('/cars/constants', {
      method: 'POST',
      body: payload
    });

    if (result.data) {
      catalogCache.set(cacheKey, result.data);
    }
    return result;
  },

  /**
   * Common Locations: Airports
   * GET /common/locations/airports
   */
  getAirports: async (query) => {
    return bookingDemandApiClient.request('/common/locations/airports', {
      method: 'GET',
      queryParams: { q: query }
    });
  },

  /**
   * Common Locations: Cities
   * GET /common/locations/cities
   */
  getCities: async (query) => {
    return bookingDemandApiClient.request('/common/locations/cities', {
      method: 'GET',
      queryParams: { q: query }
    });
  }
};

export default bookingDemandApiClient;
