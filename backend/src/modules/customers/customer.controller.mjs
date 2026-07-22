import customerService from './customer.service.mjs';

export const customerController = {
  getProfile: async (req, res, next) => {
    try {
      const email = req.user?.email || req.params.email;
      if (!email) {
        return res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'Email identifier required' }
        });
      }

      const profile = await customerService.getCustomerProfile(email);
      res.json({
        success: true,
        data: {
          id: profile.id,
          email: profile.email,
          firstName: profile.first_name,
          lastName: profile.last_name,
          phone: profile.phone,
          nationality: profile.nationality,
          dateOfBirth: profile.date_of_birth,
          gender: profile.gender
        }
      });
    } catch (error) {
      next(error);
    }
  },

  getBookings: async (req, res, next) => {
    try {
      const email = req.user?.email || req.params.email;
      if (!email) {
        return res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'Email identifier required' }
        });
      }

      const bookings = await customerService.getCustomerBookings(email);
      res.json({
        success: true,
        data: bookings
      });
    } catch (error) {
      next(error);
    }
  }
};

export default customerController;
