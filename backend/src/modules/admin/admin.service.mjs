import jwt from 'jsonwebtoken';
import env from '../../config/env.mjs';
import bookingService from '../bookings/booking.service.mjs';
import bookingRepository from '../bookings/booking.repository.mjs';

export const adminService = {
  login: async (email, password) => {
    if (email === env.adminEmail && password === env.adminPassword) {
      const token = jwt.sign(
        { email, role: 'admin' },
        env.jwtSecret,
        { expiresIn: env.jwtExpiresIn }
      );
      return {
        token,
        admin: { email }
      };
    } else {
      const err = new Error('Invalid admin credentials.');
      err.statusCode = 401;
      err.code = 'INVALID_CREDENTIALS';
      throw err;
    }
  },

  getAllBookings: async (filters) => {
    return bookingRepository.findAllBookings(filters);
  },

  getBookingDetails: async (id) => {
    return bookingService.getDetailsByCodeOrId(id);
  },

  updateBooking: async (id, updateFields) => {
    return bookingRepository.updateStatus(id, updateFields);
  },

  getDashboardStats: async () => {
    return bookingRepository.getStats();
  }
};

export default adminService;
