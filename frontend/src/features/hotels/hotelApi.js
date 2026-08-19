const API_BASE = (() => {
  if (typeof window === 'undefined') return '/api';
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  return isLocal ? (process.env.REACT_APP_API_URL || 'http://localhost:5001/api') : '/api';
})();

const TIMEOUT_MS = 30000;

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.success === false) {
      const error = new Error(payload?.error?.message || 'Hotel request failed. Please try again.');
      error.code = payload?.error?.code || `HTTP_${response.status}`;
      throw error;
    }
    return payload?.data ?? payload;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Hotel request timed out. Please retry.');
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export const hotelApi = {
  search: async (params) => {
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
    });
    return request(`/hotels/search?${query.toString()}`);
  },
  details: async (params) => {
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
    });
    return request(`/hotels/details?${query.toString()}`);
  },
  requestBooking: async (payload) => request('/hotels/booking-requests', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
};

export default hotelApi;
