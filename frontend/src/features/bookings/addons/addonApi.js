function baseUrl() {
  if (typeof window !== 'undefined' && !['localhost', '127.0.0.1'].includes(window.location.hostname)) return '/api';
  return process.env.REACT_APP_API_URL || '/api';
}

async function request(path, options = {}, admin = false) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (admin && typeof window !== 'undefined') {
    const token = window.localStorage.getItem('token');
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${baseUrl()}${path}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success === false) {
    const error = new Error(body?.error?.message || body?.message || `Request failed (${response.status})`);
    error.status = response.status;
    error.code = body?.error?.code || 'REQUEST_FAILED';
    throw error;
  }
  return body;
}

export const addonAPI = {
  getOffer: (token) => request(`/addons/pay/${encodeURIComponent(token)}`),
  getPaymentConfig: () => request('/addons/pay/config'),
  createPayPalOrder: (token) => request(`/addons/pay/${encodeURIComponent(token)}/paypal/create-order`, { method: 'POST', body: '{}' }),
  capturePayPalOrder: (token, paypalOrderId) => request(`/addons/pay/${encodeURIComponent(token)}/paypal/capture-order`, { method: 'POST', body: JSON.stringify({ paypalOrderId }) }),
  declineOffer: (token) => request(`/addons/pay/${encodeURIComponent(token)}/decline`, { method: 'POST', body: '{}' }),
  adminListByBooking: (bookingId) => request(`/addons/admin/booking/${encodeURIComponent(bookingId)}`, {}, true),
  adminQuote: (requestId, payload) => request(`/addons/requests/${encodeURIComponent(requestId)}/quote`, { method: 'PATCH', body: JSON.stringify(payload) }, true),
  adminSendOffer: (requestId) => request(`/addons/requests/${encodeURIComponent(requestId)}/send-offer`, { method: 'POST', body: '{}' }, true),
  adminUpdateStatus: (requestId, status) => request(`/addons/requests/${encodeURIComponent(requestId)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }, true),
  adminRecordPayment: (requestId, payload) => request(`/addons/requests/${encodeURIComponent(requestId)}/payment`, { method: 'POST', body: JSON.stringify(payload) }, true),
  adminFulfill: (requestId, payload) => request(`/addons/requests/${encodeURIComponent(requestId)}/fulfillment`, { method: 'POST', body: JSON.stringify(payload) }, true),
};

export default addonAPI;
