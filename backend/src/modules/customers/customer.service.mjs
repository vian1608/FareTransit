import customerRepository from './customer.repository.mjs';

export const customerService = {
  getCustomerProfile: async (email) => {
    const customer = await customerRepository.findCustomerByEmail(email);
    if (!customer) {
      const err = new Error('Customer profile not found');
      err.statusCode = 404;
      err.code = 'CUSTOMER_NOT_FOUND';
      throw err;
    }
    return customer;
  },

  getCustomerBookings: async (email) => {
    return customerRepository.findCustomerBookings(email);
  }
};

export default customerService;
