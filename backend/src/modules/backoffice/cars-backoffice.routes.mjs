import express from 'express';
import supabase from '../../config/supabase.mjs';
import { requirePermission } from './backoffice.middleware.mjs';
import auditBackOffice from './backoffice.audit.mjs';
import reservationService from '../reservations/reservation.service.mjs';
import { sendCarAuthorizationEmail } from '../reservations/car-authorization-email.service.mjs';

const router = express.Router();
const actor = req => req.staff?.email || req.user?.email || req.staff?.id || req.user?.id || 'admin';

async function resolveReference(idOrReference) {
  const value = String(idOrReference || '').trim();
  if (!value) return value;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    const { data, error } = await supabase.from('reservations').select('booking_reference').eq('id', value).maybeSingle();
    if (error) throw error;
    if (!data?.booking_reference) {
      const err = new Error('Car reservation not found.');
      err.statusCode = 404;
      throw err;
    }
    return data.booking_reference;
  }
  return value.toUpperCase();
}

router.get('/bookings/cars', requirePermission('bookings.cars.view'), async (req, res, next) => {
  try {
    const result = await reservationService.listReservations({
      serviceType: 'CAR',
      q: req.query.q,
      status: req.query.status,
      authorizationStatus: req.query.authorizationStatus,
      page: req.query.page || 1,
      pageSize: Math.min(100, Number(req.query.pageSize || 100))
    });
    const reservations = result.reservations || [];
    const ids = reservations.map(item => item.id).filter(Boolean);
    let carByReservation = new Map();
    if (ids.length) {
      const { data, error } = await supabase
        .from('car_reservations')
        .select('reservation_id,rental_company_name,vehicle_name,vehicle_category,pickup_location,pickup_at,dropoff_location,dropoff_at,supplier_confirmation')
        .in('reservation_id', ids);
      if (error) throw error;
      carByReservation = new Map((data || []).map(item => [item.reservation_id, item]));
    }
    const rows = reservations.map(item => ({ ...item, ...(carByReservation.get(item.id) || {}) }));
    res.json({ success: true, data: rows, meta: { total: result.total || rows.length } });
  } catch (error) { next(error); }
});

router.get('/bookings/cars/companies', requirePermission('bookings.cars.view'), async (req, res, next) => {
  try { res.json({ success: true, data: await reservationService.listRentalCompanies() }); }
  catch (error) { next(error); }
});

router.post('/bookings/cars/assets', requirePermission('bookings.cars.edit'), async (req, res, next) => {
  try { res.status(201).json({ success: true, data: await reservationService.saveUploadedAsset(req.body || {}) }); }
  catch (error) { next(error); }
});

router.post('/bookings/cars', requirePermission('bookings.cars.create'), async (req, res, next) => {
  try {
    const data = await reservationService.createCarReservation(req.body || {}, actor(req));
    await auditBackOffice(req, 'car_reservation.created', 'reservation', data?.reservation?.id, { bookingReference: data?.reservation?.booking_reference });
    res.status(201).json({ success: true, data });
  } catch (error) { next(error); }
});

router.get('/bookings/cars/:id', requirePermission('bookings.cars.view'), async (req, res, next) => {
  try {
    const reference = await resolveReference(req.params.id);
    res.json({ success: true, data: await reservationService.getReservation(reference) });
  } catch (error) { next(error); }
});

router.patch('/bookings/cars/:id', requirePermission('bookings.cars.edit'), async (req, res, next) => {
  try {
    const reference = await resolveReference(req.params.id);
    const data = await reservationService.updateCarReservation(reference, req.body || {}, actor(req));
    await auditBackOffice(req, 'car_reservation.updated', 'reservation', data?.reservation?.id, { bookingReference: reference });
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

router.post('/bookings/cars/:id/authorization/draft', requirePermission('bookings.cars.edit'), async (req, res, next) => {
  try {
    const reference = await resolveReference(req.params.id);
    const authorization = await reservationService.saveAuthorizationDraft(reference, req.body || {}, actor(req));
    await auditBackOffice(req, 'car_authorization.draft_saved', 'reservation', authorization?.reservation_id, { bookingReference: reference, version: authorization?.version });
    res.json({ success: true, data: authorization });
  } catch (error) { next(error); }
});

router.post('/bookings/cars/:id/authorization/revision', requirePermission('bookings.cars.edit'), async (req, res, next) => {
  try {
    const reference = await resolveReference(req.params.id);
    const authorization = await reservationService.createAuthorizationRevision(reference, actor(req));
    await auditBackOffice(req, 'car_authorization.revision_created', 'reservation', authorization?.reservation_id, { bookingReference: reference, version: authorization?.version });
    res.status(201).json({ success: true, data: authorization });
  } catch (error) { next(error); }
});

router.post('/bookings/cars/:id/authorization/send', requirePermission('bookings.cars.edit'), async (req, res, next) => {
  let prepared;
  try {
    const reference = await resolveReference(req.params.id);
    prepared = await reservationService.prepareAuthorizationForSend(reference, actor(req));
    const email = await sendCarAuthorizationEmail({
      recipient: prepared.recipient,
      bookingReference: prepared.bundle.reservation.booking_reference,
      authorization: prepared.authorization,
      token: prepared.token
    });
    const authorization = await reservationService.markAuthorizationSent(reference, prepared.authorization.id, actor(req));
    await auditBackOffice(req, 'car_authorization.sent', 'reservation', prepared.bundle?.reservation?.id, { bookingReference: reference, version: authorization?.version, recipient: prepared.recipient });
    res.json({ success: true, data: { authorization, email } });
  } catch (error) {
    if (prepared?.authorization?.id) await reservationService.resetAuthorizationSendPreparation(prepared.authorization.id);
    next(error);
  }
});

router.post('/bookings/cars/:id/booked', requirePermission('bookings.cars.edit'), async (req, res, next) => {
  try {
    const reference = await resolveReference(req.params.id);
    const data = await reservationService.markReservationBooked(reference, req.body || {}, actor(req));
    await auditBackOffice(req, 'car_reservation.booked', 'reservation', data?.reservation?.id, { bookingReference: reference, supplierConfirmation: req.body?.supplierConfirmation || null });
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

export default router;
export { router as carsBackofficeRouter };
