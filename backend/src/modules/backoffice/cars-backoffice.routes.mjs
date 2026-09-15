import express from 'express';
import supabase from '../../config/supabase.mjs';
import { requirePermission } from './backoffice.middleware.mjs';
import auditBackOffice from './backoffice.audit.mjs';
import reservationService from '../reservations/reservation.service.mjs';

const router = express.Router();
const actor = req => req.staff?.email || req.user?.email || req.staff?.id || req.user?.id || 'admin';

function clientRequestId(value) {
  const id = String(value || '').trim();
  if (!id) return null;
  if (id.length > 120 || !/^[a-zA-Z0-9:_-]+$/.test(id)) {
    const error = new Error('Invalid car reservation request id.');
    error.statusCode = 400;
    error.code = 'INVALID_CLIENT_REQUEST_ID';
    throw error;
  }
  return id;
}

function validationError(code, message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = code;
  return error;
}

function normalizeCardBrand(value) {
  const raw = String(value || '').trim();
  const key = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!key) return '';
  const brands = {
    visa: 'Visa',
    mastercard: 'Mastercard', master: 'Mastercard', mc: 'Mastercard',
    americanexpress: 'American Express', amex: 'American Express',
    discover: 'Discover', dinersclub: 'Diners Club', diners: 'Diners Club',
    jcb: 'JCB', unionpay: 'UnionPay'
  };
  return brands[key] || (raw.toLowerCase() === 'other' ? 'Other' : raw);
}

function normalizeCarPayload(body = {}) {
  const payload = { ...body };
  if (body.billing) payload.billing = { ...body.billing, cardBrand: normalizeCardBrand(body.billing.cardBrand) };
  return payload;
}

function validateHalfHourCarTimes(body, { requireBoth = false } = {}) {
  const car = body?.car || {};
  const parsed = {};
  for (const [field, label] of [['pickupAt', 'Pickup time'], ['dropoffAt', 'Drop-off time']]) {
    const value = car[field];
    if (!value) {
      if (requireBoth) throw validationError('RENTAL_TIME_REQUIRED', `${label} is required.`);
      continue;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw validationError('INVALID_RENTAL_TIME', `${label} is invalid.`);
    const minutes = date.getUTCMinutes();
    if (minutes !== 0 && minutes !== 30) throw validationError('INVALID_RENTAL_TIME', `${label} must be on the hour or half hour.`);
    parsed[field] = date;
  }
  if (parsed.pickupAt && parsed.dropoffAt && parsed.dropoffAt.getTime() <= parsed.pickupAt.getTime()) {
    throw validationError('INVALID_RENTAL_CHRONOLOGY', 'Drop-off date and time must be after pickup date and time.');
  }
}

function validateCreatePayload(body = {}) {
  const customer = body.customer || {};
  const car = body.car || {};
  if (!String(customer.fullName || '').trim()) throw validationError('CUSTOMER_NAME_REQUIRED', 'Customer name is required before creating a car reservation.');
  const email = String(customer.email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw validationError('CUSTOMER_EMAIL_REQUIRED', 'A valid customer email is required before creating a car reservation.');
  if (!String(car.pickupLocation || '').trim()) throw validationError('PICKUP_LOCATION_REQUIRED', 'Pickup location is required before creating a car reservation.');
  if (!String(car.dropoffLocation || '').trim()) throw validationError('DROPOFF_LOCATION_REQUIRED', 'Drop-off location is required before creating a car reservation.');
  validateHalfHourCarTimes(body, { requireBoth: true });
}

async function reservationForClientRequest(id) {
  if (!id) return null;
  const { data, error } = await supabase
    .from('reservations')
    .select('booking_reference')
    .eq('client_request_id', id)
    .maybeSingle();
  if (error) throw error;
  return data?.booking_reference ? reservationService.getReservation(data.booking_reference) : null;
}

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
    const normalized = normalizeCarPayload(req.body || {});
    validateCreatePayload(normalized);
    const requestId = clientRequestId(normalized.clientRequestId);
    const existing = await reservationForClientRequest(requestId);
    if (existing) return res.status(200).json({ success: true, data: existing, idempotentReplay: true });

    const payload = { ...normalized };
    delete payload.clientRequestId;
    const data = await reservationService.createCarReservation(payload, actor(req));

    if (data?.reservation?.id) {
      const ownershipPatch = {
        client_request_id: requestId,
        assigned_agent_id: req.staff?.id || null,
        team_id: req.staff?.team?.id || null,
        trip_id: payload.tripId || null,
        payment_status: String(payload.payment?.paymentStatus || 'PENDING').toUpperCase(),
        updated_at: new Date().toISOString()
      };
      const { data: ownedReservation, error: keyError } = await supabase
        .from('reservations')
        .update(ownershipPatch)
        .eq('id', data.reservation.id)
        .select('*')
        .single();
      if (keyError) {
        if (requestId && keyError.code === '23505') {
          const replay = await reservationForClientRequest(requestId);
          if (replay) {
            const { error: cleanupError } = await supabase.from('reservations').delete().eq('id', data.reservation.id).eq('service_type', 'CAR');
            if (cleanupError) console.warn('[car-idempotency-cleanup]', cleanupError.message);
            return res.status(200).json({ success: true, data: replay, idempotentReplay: true });
          }
        }
        throw keyError;
      }
      data.reservation = ownedReservation;
    }

    await auditBackOffice(req, 'car_reservation.created', 'reservation', data?.reservation?.id, {
      bookingReference: data?.reservation?.booking_reference,
      clientRequestId: requestId
    });
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
    const normalized = normalizeCarPayload(req.body || {});
    validateHalfHourCarTimes(normalized);
    const reference = await resolveReference(req.params.id);
    const data = await reservationService.updateCarReservation(reference, normalized, actor(req));
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
