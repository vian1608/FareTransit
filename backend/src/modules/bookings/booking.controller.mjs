import bookingService from './booking.service.mjs';

export const bookingController = {
  create: async (req, res, next) => {
    try {
      const result = await bookingService.create(req.body);
      res.status(201).json({
        success: true,
        message: 'Booking request created successfully.',
        data: result
      });
    } catch (error) {
      next(error);
    }
  },

  getByReference: async (req, res, next) => {
    try {
      const { reference } = req.params;
      const booking = await bookingService.getDetailsByCodeOrId(reference);
      if (!booking) {
        return res.status(404).json({
          success: false,
          error: { code: 'BOOKING_NOT_FOUND', message: 'Booking not found.' }
        });
      }
      res.json({
        success: true,
        data: booking
      });
    } catch (error) {
      next(error);
    }
  },

  getByUserEmail: async (req, res, next) => {
    try {
      const { email } = req.params;
      const bookings = await bookingService.getBookingsForEmail(email);
      res.json({
        success: true,
        data: bookings
      });
    } catch (error) {
      next(error);
    }
  },

  search: async (req, res, next) => {
    try {
      const { query } = req.query;
      if (!query) {
        return res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'Search query parameter is required.' }
        });
      }

      const bookings = await bookingService.search(query);
      res.json({
        success: true,
        data: bookings
      });
    } catch (error) {
      next(error);
    }
  }
};

export default bookingController;
