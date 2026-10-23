import express from 'express';
import supabase from '../../config/supabase.mjs';
import { requirePermission } from './backoffice.middleware.mjs';
import auditBackOffice from './backoffice.audit.mjs';
import reservationService from '../reservations/reservation.service.mjs';
import { buildCarEticketEmail, sendCarEticketEmail } from '../reservations/car-eticket-email.service.mjs';

const router = express.Router();
const actor = req => req.staff?.email || req.user?.email || req.staff?.id || req.user?.id || 'admin';

function clean(value) {
  return String(value ?? '').trim();
}

function serviceError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.status = statusCode;
  return error;
}

async function resolveReference(idOrReference) {
  const value = clean(idOrReference);
  if (!value) return value;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    const { data, error } = await supabase.from('reservations').select('booking_reference').eq('id', value).maybeSingle();
    if (error) throw error;
    if (!data?.booking_reference) throw serviceError('RESERVATION_NOT_FOUND', 'Car reservation not found.', 404);
    return data.booking_reference;
  }
  return value.toUpperCase();
}

function validateTicketEligibility(bundle) {
  if (bundle?.reservation?.service_type !== 'CAR') throw serviceError('WRONG_SERVICE_TYPE', 'Only car reservations can use this e-ticket workflow.', 409);
  if (bundle?.latestAuthorization?.status !== 'AUTHORIZED') throw serviceError('AUTHORIZATION_REQUIRED', 'Customer authorization is required before sending the e-ticket.', 409);
  const recipient = clean(bundle?.travellers?.find(item => item.role === 'PRIMARY_DRIVER')?.email || bundle?.travellers?.[0]?.email || bundle?.reservation?.customer_email);
  if (!recipient) throw serviceError('CUSTOMER_EMAIL_REQUIRED', 'Customer email is required before sending the e-ticket.', 409);
}

async function recordActivity(bundle, action, actorId, metadata = {}) {
  if (!bundle?.reservation?.id) return;
  const { error } = await supabase.from('reservation_activity').insert({
    reservation_id: bundle.reservation.id,
    actor_type: 'ADMIN',
    actor_id: actorId || null,
    action,
    metadata
  });
  if (error) console.warn('[car-eticket-activity]', error.message);
}

router.get('/bookings/cars/:id/ticket/compose', requirePermission('bookings.cars.view'), async (req, res, next) => {
  try {
    const reference = await resolveReference(req.params.id);
    const bundle = await reservationService.getReservation(reference);
    validateTicketEligibility(bundle);
    const supplierConfirmation = clean(bundle?.car?.supplier_confirmation);
    const email = await buildCarEticketEmail({
      bundle,
      supplierConfirmation: supplierConfirmation || 'ENTER CONFIRMATION NUMBER',
      includeAttachment: false
    });
    await auditBackOffice(req, 'car_eticket.composer_opened', 'reservation', bundle.reservation.id, { bookingReference: reference });
    res.json({
      success: true,
      data: {
        ...email.preview,
        supplierConfirmation,
        canSend: Boolean(supplierConfirmation)
      }
    });
  } catch (error) { next(error); }
});

router.post('/bookings/cars/:id/ticket/send', requirePermission('bookings.cars.edit'), async (req, res, next) => {
  let bookedBundle = null;
  const actorId = actor(req);
  try {
    const reference = await resolveReference(req.params.id);
    const supplierConfirmation = clean(req.body?.supplierConfirmation).slice(0, 120);
    if (!supplierConfirmation) throw serviceError('SUPPLIER_CONFIRMATION_REQUIRED', 'Enter the rental-company reservation / confirmation number before sending the e-ticket.', 409);

    const currentBundle = await reservationService.getReservation(reference);
    validateTicketEligibility(currentBundle);

    const alreadyBookedWithSameConfirmation = String(currentBundle?.reservation?.reservation_status || '').toUpperCase() === 'BOOKED'
      && clean(currentBundle?.car?.supplier_confirmation) === supplierConfirmation;
    bookedBundle = alreadyBookedWithSameConfirmation
      ? currentBundle
      : await reservationService.markReservationBooked(reference, { supplierConfirmation }, actorId);

    const email = await sendCarEticketEmail({ bundle: bookedBundle, supplierConfirmation });

    await recordActivity(bookedBundle, 'CAR_ETICKET_SENT', actorId, {
      supplierConfirmation,
      recipient: email.to,
      provider: email.provider || null,
      providerMessageId: email.id || null,
      filename: email.filename || null,
      resend: alreadyBookedWithSameConfirmation
    });
    await auditBackOffice(req, 'car_eticket.sent', 'reservation', bookedBundle.reservation.id, {
      bookingReference: reference,
      supplierConfirmation,
      recipient: email.to,
      provider: email.provider || null,
      providerMessageId: email.id || null,
      resend: alreadyBookedWithSameConfirmation
    });

    res.json({
      success: true,
      data: {
        bookingReference: reference,
        reservationStatus: 'BOOKED',
        supplierConfirmation,
        recipient: email.to,
        provider: email.provider || null,
        providerMessageId: email.id || null,
        attachmentFilename: email.filename || null,
        resend: alreadyBookedWithSameConfirmation
      }
    });
  } catch (error) {
    if (bookedBundle) {
      await recordActivity(bookedBundle, 'CAR_ETICKET_SEND_FAILED', actorId, {
        supplierConfirmation: clean(req.body?.supplierConfirmation),
        errorCode: error?.code || 'EMAIL_SEND_FAILED',
        errorMessage: error?.message || 'Unable to send e-ticket'
      });
    }
    next(error);
  }
});

export default router;
export { router as carEticketRouter };
