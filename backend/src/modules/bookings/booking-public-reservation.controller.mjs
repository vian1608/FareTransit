import { resolveCanonicalReservation } from '../reservations/canonical-reservation.service.mjs';

export async function resolvePublicReservation(reference) {
  return resolveCanonicalReservation(reference);
}

export const bookingPublicReservationController = {
  get: async (req, res, next) => {
    try {
      const data = await resolvePublicReservation(req.params.reference);
      if (!data) {
        return res.status(404).json({
          success: false,
          error: { code: 'RESERVATION_NOT_FOUND', message: 'Reservation reference not found.' }
        });
      }
      return res.json({ success: true, data });
    } catch (error) {
      return next(error);
    }
  }
};

export default bookingPublicReservationController;
