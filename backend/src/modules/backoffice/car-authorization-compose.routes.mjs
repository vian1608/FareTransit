import express from 'express';
import supabase from '../../config/supabase.mjs';
import { requirePermission } from './backoffice.middleware.mjs';
import auditBackOffice from './backoffice.audit.mjs';
import carAuthorizationComposeService from '../reservations/car-authorization-compose.service.mjs';
import carAuthorizationEvidenceService from '../reservations/car-authorization-evidence.service.mjs';

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
      err.code = 'RESERVATION_NOT_FOUND';
      throw err;
    }
    return data.booking_reference;
  }
  return value.toUpperCase();
}

router.post('/bookings/cars/:id/authorization/compose', requirePermission('bookings.cars.edit'), async (req, res, next) => {
  try {
    const reference = await resolveReference(req.params.id);
    const data = await carAuthorizationComposeService.composeAuthorization(reference, req.body || {}, actor(req));
    await auditBackOffice(req, 'car_authorization.composer_opened', 'reservation', null, { bookingReference: reference, authorizationVersion: data?.preview?.authorizationVersion || null });
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

router.get('/bookings/cars/:id/authorization/email-draft', requirePermission('bookings.cars.view'), async (req, res, next) => {
  try {
    const reference = await resolveReference(req.params.id);
    res.json({ success: true, data: await carAuthorizationComposeService.getEmailComposer(reference) });
  } catch (error) { next(error); }
});

router.get('/bookings/cars/:id/authorization/evidence.pdf', requirePermission('bookings.cars.view'), async (req, res, next) => {
  try {
    const reference = await resolveReference(req.params.id);
    const evidence = await carAuthorizationEvidenceService.buildCarAuthorizationEvidencePdf(reference);
    await auditBackOffice(req, 'car_authorization.evidence_viewed', 'reservation', null, {
      bookingReference: reference,
      authorizationId: evidence.authorizationId,
      authorizationVersion: evidence.version,
      evidenceSha256: evidence.evidenceHash
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${evidence.filename}"`);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.send(evidence.buffer);
  } catch (error) { next(error); }
});

router.patch('/bookings/cars/:id/authorization/email-draft', requirePermission('bookings.cars.edit'), async (req, res, next) => {
  try {
    const reference = await resolveReference(req.params.id);
    const data = await carAuthorizationComposeService.saveEmailDraft(reference, req.body || {}, actor(req));
    await auditBackOffice(req, 'car_authorization.email_draft_saved', 'reservation', null, { bookingReference: reference });
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

// Mounted before the legacy car router so this is the canonical send path.
router.post('/bookings/cars/:id/authorization/send', requirePermission('bookings.cars.edit'), async (req, res, next) => {
  try {
    const reference = await resolveReference(req.params.id);
    const data = await carAuthorizationComposeService.sendAuthorizationWithEmailDraft(reference, req.body || {}, actor(req));
    await auditBackOffice(req, 'car_authorization.sent', 'reservation', null, {
      bookingReference: reference,
      version: data?.authorization?.version || null,
      recipient: data?.email?.to || null,
      composedEmail: true
    });
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

export default router;
export { router as carAuthorizationComposeRouter };
