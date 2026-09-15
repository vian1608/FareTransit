import supabase from '../../config/supabase.mjs';
import reservationService from './reservation.service.mjs';
import { sendCarAuthorizationEmail } from './car-authorization-email.service.mjs';

function clean(value, max = 10000) {
  return String(value ?? '').trim().slice(0, max);
}

function defaultEmailDraft(bundle = {}) {
  const reservation = bundle.reservation || {};
  const traveller = (bundle.travellers || []).find(item => item.role === 'PRIMARY_DRIVER') || (bundle.travellers || [])[0] || {};
  const fullName = clean(traveller.full_name || reservation.customer_name || 'Traveler', 160);
  const firstName = fullName.split(/\s+/).filter(Boolean)[0] || 'Traveler';
  const reference = clean(reservation.booking_reference || '', 32);
  return {
    to: clean(traveller.email || reservation.customer_email || '', 320).toLowerCase(),
    subject: `Please review and authorize car rental ${reference}`,
    message: `Hello ${firstName},\n\nPlease review and authorize your FareTransit car rental reservation ${reference}. Confirm the rental details, total amount, merchant information and Terms & Conditions using the secure Review & Authorize button in this email.\n\nIf anything needs to be changed, please contact FareTransit before authorizing.\n\nThank you,\nFareTransit`
  };
}

function normalizeEmailDraft(payload = {}, fallback = {}) {
  const subject = clean(payload.subject ?? fallback.subject, 180);
  const message = clean(payload.message ?? fallback.message, 8000);
  if (!subject) {
    const error = new Error('Email subject is required.');
    error.status = 400;
    error.code = 'AUTHORIZATION_EMAIL_SUBJECT_REQUIRED';
    throw error;
  }
  if (!message) {
    const error = new Error('Email message is required.');
    error.status = 400;
    error.code = 'AUTHORIZATION_EMAIL_MESSAGE_REQUIRED';
    throw error;
  }
  return { subject, message };
}

function previewFromBundle(bundle = {}) {
  const reservation = bundle.reservation || {};
  const car = bundle.car || {};
  const authorization = bundle.latestAuthorization || {};
  const traveller = (bundle.travellers || []).find(item => item.role === 'PRIMARY_DRIVER') || (bundle.travellers || [])[0] || {};
  return {
    bookingReference: reservation.booking_reference || '',
    renterName: traveller.full_name || reservation.customer_name || '',
    rentalCompany: car.rental_company_name || '',
    vehicle: car.vehicle_name || car.vehicle_category || '',
    pickupLocation: car.pickup_location || '',
    pickupAt: car.pickup_at || null,
    dropoffLocation: car.dropoff_location || '',
    dropoffAt: car.dropoff_at || null,
    totalAmount: authorization.total_amount ?? reservation.total_amount ?? 0,
    currency: authorization.currency || reservation.currency || 'USD',
    transactions: (authorization.transactions || []).map(item => ({
      amount: item.amount,
      currency: item.currency || authorization.currency || reservation.currency || 'USD',
      merchantName: item.merchant_name || '',
      collectionMethod: item.collection_method || 'PAY_NOW',
      description: item.description || ''
    })),
    authorizationVersion: authorization.version || null,
    authorizationStatus: authorization.status || reservation.authorization_status || 'NONE'
  };
}

async function persistDraftOnAuthorization(authorization, draft) {
  const serviceSnapshot = {
    ...(authorization.service_snapshot || {}),
    emailDraft: {
      subject: draft.subject,
      message: draft.message,
      updatedAt: new Date().toISOString()
    }
  };
  const { data, error } = await supabase
    .from('authorizations')
    .update({ service_snapshot: serviceSnapshot, updated_at: new Date().toISOString() })
    .eq('id', authorization.id)
    .eq('status', 'DRAFT')
    .select('*')
    .single();
  if (error) {
    const wrapped = new Error(`Unable to save authorization email draft: ${error.message}`);
    wrapped.status = 500;
    wrapped.code = 'AUTHORIZATION_EMAIL_DRAFT_SAVE_FAILED';
    throw wrapped;
  }
  return data;
}

export async function getEmailComposer(reference) {
  const bundle = await reservationService.getReservation(reference);
  const fallback = defaultEmailDraft(bundle);
  const saved = bundle.latestAuthorization?.service_snapshot?.emailDraft || {};
  const emailDraft = {
    to: fallback.to,
    subject: clean(saved.subject || fallback.subject, 180),
    message: clean(saved.message || fallback.message, 8000)
  };
  return { emailDraft, preview: previewFromBundle(bundle) };
}

export async function composeAuthorization(reference, payload = {}, actorId = null) {
  const before = await reservationService.getReservation(reference);
  const previousEmailDraft = before.latestAuthorization?.status === 'DRAFT'
    ? before.latestAuthorization?.service_snapshot?.emailDraft
    : null;

  const authorization = await reservationService.saveAuthorizationDraft(reference, payload, actorId);
  if (previousEmailDraft?.subject || previousEmailDraft?.message) {
    const fallback = defaultEmailDraft(before);
    const draft = normalizeEmailDraft(previousEmailDraft, fallback);
    await persistDraftOnAuthorization(authorization, draft);
  }
  return getEmailComposer(reference);
}

export async function saveEmailDraft(reference, payload = {}, actorId = null) {
  const bundle = await reservationService.getReservation(reference);
  const authorization = bundle.latestAuthorization;
  if (!authorization || authorization.status !== 'DRAFT') {
    const error = new Error('Create an editable authorization draft before saving the email.');
    error.status = 409;
    error.code = 'AUTHORIZATION_DRAFT_REQUIRED';
    throw error;
  }
  const fallback = defaultEmailDraft(bundle);
  const draft = normalizeEmailDraft(payload, {
    subject: authorization.service_snapshot?.emailDraft?.subject || fallback.subject,
    message: authorization.service_snapshot?.emailDraft?.message || fallback.message
  });
  await persistDraftOnAuthorization(authorization, draft);
  return {
    emailDraft: { to: fallback.to, ...draft },
    preview: previewFromBundle(bundle),
    actorId
  };
}

export async function sendAuthorizationWithEmailDraft(reference, payload = {}, actorId = null) {
  const saved = await saveEmailDraft(reference, payload, actorId);
  let prepared;
  try {
    prepared = await reservationService.prepareAuthorizationForSend(reference, actorId);
    const email = await sendCarAuthorizationEmail({
      recipient: prepared.recipient,
      bookingReference: prepared.bundle.reservation.booking_reference,
      authorization: prepared.authorization,
      token: prepared.token,
      subject: saved.emailDraft.subject,
      message: saved.emailDraft.message
    });
    const authorization = await reservationService.markAuthorizationSent(reference, prepared.authorization.id, actorId);
    return { authorization, email, emailDraft: saved.emailDraft };
  } catch (error) {
    if (prepared?.authorization?.id) await reservationService.resetAuthorizationSendPreparation(prepared.authorization.id);
    throw error;
  }
}

export default {
  getEmailComposer,
  composeAuthorization,
  saveEmailDraft,
  sendAuthorizationWithEmailDraft
};
