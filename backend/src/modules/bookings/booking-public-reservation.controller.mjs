import { resolveCanonicalReservation } from '../reservations/canonical-reservation.service.mjs';

function maskEmail(value) {
  const email = String(value || '').trim();
  const at = email.indexOf('@');
  if (at <= 0) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return `${local.slice(0, 1)}${'*'.repeat(Math.max(3, Math.min(8, local.length - 1)))}@${domain}`;
}

function maskPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 4 ? `••••${digits.slice(-4)}` : null;
}

export function sanitizePublicReservation(data) {
  if (!data || typeof data !== 'object') return data;
  const customer = data.customer && typeof data.customer === 'object'
    ? {
        name: data.customer.name || null,
        email: maskEmail(data.customer.email),
        phone: maskPhone(data.customer.phone)
      }
    : null;
  return {
    ...data,
    ...(customer ? { customer } : {})
  };
}

export async function resolvePublicReservation(reference) {
  const reservation = await resolveCanonicalReservation(reference);
  return sanitizePublicReservation(reservation);
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
