import api from './api';

export const voucherAPI = {
  validate: async (payload) => {
    const response = await api.post('/vouchers/validate', payload);
    return response.data;
  },
};

export const adminVoucherAPI = {
  list: async () => {
    const response = await api.get('/admin/vouchers');
    return response.data;
  },
  create: async (payload) => {
    const response = await api.post('/admin/vouchers', payload);
    return response.data;
  },
  update: async (id, payload) => {
    const response = await api.patch(`/admin/vouchers/${id}`, payload);
    return response.data;
  },
  redemptions: async (id) => {
    const response = await api.get(`/admin/vouchers/${id}/redemptions`);
    return response.data;
  },
};

export default voucherAPI;
