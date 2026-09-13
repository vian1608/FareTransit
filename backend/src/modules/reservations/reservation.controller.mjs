import reservationService from './reservation.service.mjs';
import { sendCarAuthorizationEmail } from './car-authorization-email.service.mjs';

const actor = req => req.user?.email || req.user?.id || 'admin';

function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, ...data });
}

function fail(res, error) {
  const status = Number(error?.status) || 500;
  return res.status(status).json({ success: false, error: { code: error?.code || 'RESERVATION_ERROR', message: error?.message || 'Reservation request failed.', details: error?.details || null } });
}

const controller = {
  async list(req, res) {
    try { return ok(res, await reservationService.listReservations(req.query)); } catch (e) { return fail(res, e); }
  },
  async listAuthorizations(req, res) {
    try { return ok(res, await reservationService.listAuthorizations(req.query)); } catch (e) { return fail(res, e); }
  },
  async companies(req, res) {
    try { return ok(res, { companies: await reservationService.listRentalCompanies() }); } catch (e) { return fail(res, e); }
  },
  async get(req, res) {
    try { return ok(res, { data: await reservationService.getReservation(req.params.reference) }); } catch (e) { return fail(res, e); }
  },
  async createCar(req, res) {
    try { return ok(res, { data: await reservationService.createCarReservation(req.body || {}, actor(req)) }, 201); } catch (e) { return fail(res, e); }
  },
  async updateCar(req, res) {
    try { return ok(res, { data: await reservationService.updateCarReservation(req.params.reference, req.body || {}, actor(req)) }); } catch (e) { return fail(res, e); }
  },
  async saveDraft(req, res) {
    try { return ok(res, { authorization: await reservationService.saveAuthorizationDraft(req.params.reference, req.body || {}, actor(req)) }); } catch (e) { return fail(res, e); }
  },
  async createRevision(req, res) {
    try { return ok(res, { authorization: await reservationService.createAuthorizationRevision(req.params.reference, actor(req)) }, 201); } catch (e) { return fail(res, e); }
  },
  async send(req, res) {
    let prepared;
    try {
      prepared = await reservationService.prepareAuthorizationForSend(req.params.reference, actor(req));
      const email = await sendCarAuthorizationEmail({ recipient: prepared.recipient, bookingReference: prepared.bundle.reservation.booking_reference, authorization: prepared.authorization, token: prepared.token });
      const authorization = await reservationService.markAuthorizationSent(req.params.reference, prepared.authorization.id, actor(req));
      return ok(res, { authorization, email });
    } catch (e) {
      if (prepared?.authorization?.id) await reservationService.resetAuthorizationSendPreparation(prepared.authorization.id);
      return fail(res, e);
    }
  },
  async markBooked(req, res) {
    try { return ok(res, { data: await reservationService.markReservationBooked(req.params.reference, req.body || {}, actor(req)) }); } catch (e) { return fail(res, e); }
  },
  async uploadAsset(req, res) {
    try { return ok(res, { asset: await reservationService.saveUploadedAsset(req.body || {}) }, 201); } catch (e) { return fail(res, e); }
  },
  async publicGet(req, res) {
    try { return ok(res, { data: await reservationService.getPublicAuthorization(req.params.token) }); } catch (e) { return fail(res, e); }
  },
  async publicAuthorize(req, res) {
    try {
      const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
      const ip = forwarded || req.ip || req.socket?.remoteAddress || null;
      const userAgent = req.headers['user-agent'] || null;
      return ok(res, { data: await reservationService.acceptPublicAuthorization(req.params.token, { ip, userAgent }) });
    } catch (e) { return fail(res, e); }
  }
};

export default controller;
