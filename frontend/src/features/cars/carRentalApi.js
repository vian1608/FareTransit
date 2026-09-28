import axios from 'axios';

function resolveApiBaseUrl() {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1';
    if (!isLocal) return '/api';
  }
  return process.env.REACT_APP_API_URL || '/api';
}

const client = axios.create({
  baseURL: resolveApiBaseUrl(),
  timeout: 25000,
  headers: { 'Content-Type': 'application/json' }
});

function unwrap(response) {
  return response?.data || {};
}

export const carRentalApi = {
  autocompleteLocations: async (query, countryCode = 'US') => {
    const response = await client.get('/cars/locations/autocomplete', {
      params: { q: query, countryCode }
    });
    return unwrap(response);
  },

  search: async (payload) => {
    const response = await client.post('/cars/search', payload);
    return unwrap(response);
  },

  createBooking: async (payload) => {
    const response = await client.post('/cars/bookings', payload);
    return unwrap(response);
  },

  getBooking: async (reference, token) => {
    const response = await client.get(`/cars/bookings/${encodeURIComponent(reference)}`, {
      params: { token }
    });
    return unwrap(response);
  }
};

export function carApiErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  const message = error?.response?.data?.error?.message || error?.response?.data?.message;
  if (message) return message;
  if (error?.code === 'ECONNABORTED') return 'The request timed out. Please try again.';
  if (!error?.response && error?.request) return 'We could not reach FareTransit. Check your connection and retry.';
  return error?.message || fallback;
}

export default carRentalApi;
