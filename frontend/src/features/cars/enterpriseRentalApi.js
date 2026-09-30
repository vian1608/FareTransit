const API_BASE = typeof window !== 'undefined' && !['localhost', '127.0.0.1'].includes(window.location.hostname)
  ? '/api'
  : (process.env.REACT_APP_API_URL || 'http://localhost:5001/api');

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeout || 25000);
  const token = options.admin ? localStorage.getItem('token') : null;
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: options.method || 'GET',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
      credentials: 'same-origin'
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.success === false) {
      const error = new Error(payload?.error?.message || `Request failed (HTTP ${response.status})`);
      error.code = payload?.error?.code || 'ENTERPRISE_RENTAL_REQUEST_FAILED';
      error.status = response.status;
      throw error;
    }
    return payload?.data ?? payload;
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('The request timed out. Please try again.');
      timeoutError.code = 'REQUEST_TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export const enterpriseRentalApi = {
  searchLocations: (query, countryCode = 'US') => request(`/cars/enterprise/locations?q=${encodeURIComponent(query)}&country_code=${encodeURIComponent(countryCode)}`, { timeout: 15000 }),
  searchVehicles: (search) => request('/cars/enterprise/vehicles', { method: 'POST', body: search, timeout: 25000 }),
  createQuote: (vehicleCode, search) => request('/cars/enterprise/quotes', { method: 'POST', body: { vehicleCode, search }, timeout: 30000 }),
  getQuote: (quoteToken) => request(`/cars/enterprise/quotes/${encodeURIComponent(quoteToken)}`, { timeout: 15000 }),
  createOrder: (payload) => request('/cars/enterprise/orders', { method: 'POST', body: payload, timeout: 20000 }),
  getOrder: (publicToken) => request(`/cars/enterprise/orders/${encodeURIComponent(publicToken)}`, { timeout: 15000 }),
  getPaymentConfig: () => request('/cars/enterprise/payment-config', { timeout: 10000 }),
  authorizeOrder: (publicToken, paymentToken) => request(`/cars/enterprise/orders/${encodeURIComponent(publicToken)}/authorize`, {
    method: 'POST',
    body: { paymentToken },
    timeout: 30000
  }),
  admin: {
    listOrders: (status = '') => request(`/cars/enterprise/admin/orders${status ? `?status=${encodeURIComponent(status)}` : ''}`, { admin: true, timeout: 15000 }),
    getOrder: (reference) => request(`/cars/enterprise/admin/orders/${encodeURIComponent(reference)}`, { admin: true, timeout: 15000 }),
    updateOrder: (reference, payload) => request(`/cars/enterprise/admin/orders/${encodeURIComponent(reference)}`, { method: 'PATCH', body: payload, admin: true, timeout: 20000 }),
    confirmAndCapture: (reference, payload) => request(`/cars/enterprise/admin/orders/${encodeURIComponent(reference)}/confirm-and-capture`, { method: 'POST', body: payload, admin: true, timeout: 35000 }),
    markUnavailable: (reference) => request(`/cars/enterprise/admin/orders/${encodeURIComponent(reference)}/mark-unavailable`, { method: 'POST', body: {}, admin: true, timeout: 20000 })
  }
};

export default enterpriseRentalApi;
