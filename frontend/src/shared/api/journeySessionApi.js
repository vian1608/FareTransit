import api from './api';

const JOURNEY_SESSION_TIMEOUT_MS = 15000;
const timeoutConfig = { timeout: JOURNEY_SESSION_TIMEOUT_MS };

export const journeySessionAPI = {
  createQuote: async (payload) => {
    const response = await api.post('/journey-sessions/quote', payload, timeoutConfig);
    return response.data;
  },
  getQuote: async (token) => {
    const response = await api.get(`/journey-sessions/quote/${encodeURIComponent(token)}`, timeoutConfig);
    return response.data;
  },
  createCheckout: async (payload) => {
    const response = await api.post('/journey-sessions/checkout', payload, timeoutConfig);
    return response.data;
  },
  getCheckout: async (token) => {
    const response = await api.get(`/journey-sessions/checkout/${encodeURIComponent(token)}`, timeoutConfig);
    return response.data;
  },
  updateCheckout: async (token, patch) => {
    const response = await api.patch(`/journey-sessions/checkout/${encodeURIComponent(token)}`, patch, timeoutConfig);
    return response.data;
  },
  createPayment: async (payload = {}) => {
    const response = await api.post('/journey-sessions/payment', payload, timeoutConfig);
    return response.data;
  },
  getPayment: async (token) => {
    const response = await api.get(`/journey-sessions/payment/${encodeURIComponent(token)}`, timeoutConfig);
    return response.data;
  },
  updatePayment: async (token, patch) => {
    const response = await api.patch(`/journey-sessions/payment/${encodeURIComponent(token)}`, patch, timeoutConfig);
    return response.data;
  },
  getReservation: async (token) => {
    const response = await api.get(`/journey-sessions/reservation/${encodeURIComponent(token)}`, timeoutConfig);
    return response.data;
  },
};

export default journeySessionAPI;
