import crypto from 'crypto';
import express from 'express';
import supabase from '../../integrations/supabase/supabase.client.mjs';

const router = express.Router();
const sha256 = value => crypto.createHash('sha256').update(String(value || '')).digest('hex');
const nowIso = () => new Date().toISOString();
const safeText = (value, max = 300) => String(value ?? '').trim().slice(0, max);

const SENSITIVE_KEYS = new Set([
  'cardnumber', 'card_number', 'fullcardnumber', 'full_card_number', 'pan', 'fullpan',
  'cvv', 'cvc', 'securitycode', 'security_code', 'cardsecuritycode', 'card_security_code',
  'trackdata', 'track_data', 'pin', 'cardpin', 'card_pin',
]);

function normalizeKey(key) {
  return String(key || '').replace(/[^a-z0-9_]/gi, '').toLowerCase();
}

function rejectSensitiveCardPayload(value, depth = 0) {
  if (depth > 12 || value == null) return;
  if (Array.isArray(value)) {
    value.forEach(item => rejectSensitiveCardPayload(item, depth + 1));
    return;
  }
  if (typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(normalizeKey(key))) {
      const error = new Error('Full card numbers and card security codes are not accepted by FareTransit manual payment storage.');
      error.status = 400;
      error.code = 'SENSITIVE_CARD_DATA_NOT_ACCEPTED';
      throw error;
    }
    rejectSensitiveCardPayload(child, depth + 1);
  }
}

function code(prefix) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `${prefix}-${stamp}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function publicTokenHash(req) {
  return sha256(String(req.params.token || '').trim());
}

function validPublicWindow(row) {
  return row && (!row.public_token_expires_at || new Date(row.public_token_expires_at).getTime() > Date.now());
}

function storageConfig() {
  return {
    mode: 'manual_masked_metadata',
    configured: true,
    collectEnabled: true,
    chargeableCredentialStored: false,
    acceptedFields: ['cardholderName', 'cardBrand', 'last4', 'expMonth', 'expYear', 'billingAddress'],
  };
}

function sanitizeBillingAddress(input = {}) {
  rejectSensitiveCardPayload(input);
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return {
    line1: safeText(input.line1 || input.address || input.addressLine1, 180) || null,
    line2: safeText(input.line2 || input.addressLine2, 180) || null,
    city: safeText(input.city, 100) || null,
    region: safeText(input.region || input.state, 100) || null,
    postalCode: safeText(input.postalCode || input.zip || input.zipCode, 32) || null,
    country: safeText(input.country, 80) || null,
    email: safeText(input.email, 240) || null,
    phone: safeText(input.phone, 80) || null,
  };
}

function normalizeManualMethod(body = {}, fallbackName = '') {
  rejectSensitiveCardPayload(body);
  const cardholderName = safeText(body.cardholderName || fallbackName, 180);
  const cardBrand = safeText(body.cardBrand, 40);
  const last4 = String(body.last4 || '').replace(/\D/g, '');
  const expMonth = Number.parseInt(body.expMonth, 10);
  let expYear = Number.parseInt(body.expYear, 10);
  if (expYear >= 0 && expYear < 100) expYear += 2000;
  const currentYear = new Date().getUTCFullYear();

  if (!cardholderName || !cardBrand || !/^\d{4}$/.test(last4) || expMonth < 1 || expMonth > 12 || expYear < currentYear || expYear > currentYear + 30) {
    const error = new Error('Cardholder name, card brand, last four digits, and a valid expiration month/year are required.');
    error.status = 400;
    error.code = 'INVALID_MANUAL_PAYMENT_METADATA';
    throw error;
  }

  return {
    cardholderName,
    cardBrand,
    last4,
    expMonth,
    expYear,
    billingAddress: sanitizeBillingAddress(body.billingAddress || {}),
  };
}

async function manualMethod(authorizationId) {
  const result = await supabase.from('manual_payment_methods')
    .select('id,authorization_id,cardholder_name,card_brand,last4,exp_month,exp_year,billing_address,source,notes,created_at,updated_at')
    .eq('authorization_id', authorizationId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

function publicMethod(method) {
  if (!method) return null;
  return {
    id: method.id,
    provider: 'MANUAL',
    cardholderName: method.cardholder_name,
    cardBrand: method.card_brand,
    last4: method.last4,
    expMonth: method.exp_month,
    expYear: method.exp_year,
    billingAddress: method.billing_address || {},
    source: method.source || 'MANUAL_METADATA',
    chargeable: false,
  };
}

function safeAuthorization(row, method = null) {
  const context = Array.isArray(row.payment_contexts) ? row.payment_contexts[0] : row.payment_contexts;
  return {
    id: row.id,
    authorizationCode: row.authorization_code,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    authorizedAmount: row.authorized_amount,
    currency: row.currency,
    purpose: row.purpose,
    status: row.status,
    termsVersion: row.terms_version,
    linkExpiresAt: row.public_token_expires_at,
    context: context ? { contextCode: context.context_code, entityType: context.entity_type, entityCode: context.entity_code } : null,
    paymentMethod: publicMethod(method),
    recollectionOnly: row.status === 'RECOLLECTION_REQUIRED',
    storage: storageConfig(),
  };
}

async function findByToken(req) {
  const result = await supabase.from('payment_authorizations')
    .select('id,authorization_code,payment_context_id,customer_name,customer_email,customer_phone,authorized_amount,currency,purpose,status,public_token_expires_at,terms_version,signature_name,authorized_at,payment_contexts(id,context_code,entity_type,entity_id,entity_code)')
    .eq('public_token_hash', publicTokenHash(req)).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) return null;
  result.data.manualPaymentMethod = await manualMethod(result.data.id);
  return result.data;
}

async function verifyCheckoutBooking(body) {
  const bookingId = safeText(body.bookingId, 80);
  const bookingCode = safeText(body.bookingCode, 100);
  const email = safeText(body.customerEmail, 240).toLowerCase();
  const idempotencyKey = safeText(body.idempotencyKey, 300);
  if (!bookingId || !bookingCode || !email || !idempotencyKey) return null;

  const result = await supabase.from('bookings')
    .select('id,confirmation_code,email,client_request_id,passenger_name,customer_price,total_amount,currency')
    .eq('id', bookingId).maybeSingle();
  if (result.error) throw result.error;
  const booking = result.data;
  if (!booking) return null;
  if (String(booking.confirmation_code || '') !== bookingCode) return null;
  if (String(booking.email || '').trim().toLowerCase() !== email) return null;
  if (String(booking.client_request_id || '') !== idempotencyKey) return null;
  return booking;
}

async function upsertManualMethod(authorizationId, method) {
  const payload = {
    authorization_id: authorizationId,
    cardholder_name: method.cardholderName,
    card_brand: method.cardBrand,
    last4: method.last4,
    exp_month: method.expMonth,
    exp_year: method.expYear,
    billing_address: method.billingAddress,
    source: 'MANUAL_METADATA',
    updated_at: nowIso(),
  };
  const existing = await supabase.from('manual_payment_methods').select('id').eq('authorization_id', authorizationId).maybeSingle();
  if (existing.error) throw existing.error;
  const result = existing.data
    ? await supabase.from('manual_payment_methods').update(payload).eq('id', existing.data.id).select('*').single()
    : await supabase.from('manual_payment_methods').insert(payload).select('*').single();
  if (result.error) throw result.error;
  return result.data;
}

async function persistBookingMethod(booking, body, method) {
  const billing = method.billingAddress || {};
  const payload = {
    payment_provider: 'manual',
    provider_customer_id: null,
    provider_payment_method_id: null,
    cardholder_name: method.cardholderName,
    card_brand: method.cardBrand,
    card_last4: method.last4,
    card_exp_month: method.expMonth,
    card_exp_year: method.expYear,
    billing_email: safeText(body.customerEmail || booking.email, 240) || null,
    billing_phone: safeText(body.customerPhone, 80) || null,
    billing_address_line1: billing.line1,
    billing_address_line2: billing.line2,
    billing_city: billing.city,
    billing_state: billing.region,
    billing_postal_code: billing.postalCode,
    billing_country: billing.country,
    tokenization_status: 'MANUAL_METADATA',
    removed_at: null,
    updated_at: nowIso(),
  };
  const existing = await supabase.from('booking_payment_methods').select('id').eq('booking_id', booking.id).is('removed_at', null).order('created_at', { ascending: false }).limit(1);
  if (existing.error) throw existing.error;
  const id = existing.data?.[0]?.id;
  const result = id
    ? await supabase.from('booking_payment_methods').update(payload).eq('id', id)
    : await supabase.from('booking_payment_methods').insert({ booking_id: booking.id, ...payload });
  if (result.error) throw result.error;
}

router.get('/checkout/config', (req, res) => {
  res.json({ success: true, data: storageConfig() });
});

router.post('/checkout/collect-token', (req, res) => {
  res.status(410).json({
    success: false,
    error: { code: 'TOKENIZATION_REMOVED', message: 'FareTransit no longer tokenizes card credentials. Use masked manual payment metadata instead.' },
  });
});

router.post('/checkout/attach', async (req, res, next) => {
  try {
    const body = req.body || {};
    rejectSensitiveCardPayload(body);
    const booking = await verifyCheckoutBooking(body);
    if (!booking) return res.status(404).json({ success: false, error: { code: 'CHECKOUT_BOOKING_NOT_FOUND', message: 'The checkout reservation could not be verified.' } });
    const method = normalizeManualMethod(body, body.customerName || booking.passenger_name);
    const customerName = safeText(body.customerName || booking.passenger_name || 'Valued Passenger', 180);
    const customerEmail = safeText(body.customerEmail || booking.email, 240).toLowerCase();
    const customerPhone = safeText(body.customerPhone, 80) || null;
    const currency = safeText(body.currency || booking.currency || 'USD', 8).toUpperCase();
    const bookingAmount = Number(booking.customer_price || booking.total_amount || body.authorizedAmount || 0);
    if (!Number.isFinite(bookingAmount) || bookingAmount <= 0) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_AUTHORIZED_AMOUNT', message: 'The booking does not have a valid amount.' } });
    }

    const contextLookup = await supabase.from('payment_contexts').select('*').eq('entity_type', 'FLIGHT').eq('entity_id', booking.id).like('context_code', 'PAYCTX-WEB-%').order('created_at', { ascending: false }).limit(1);
    if (contextLookup.error) throw contextLookup.error;
    let context = contextLookup.data?.[0] || null;
    if (!context) {
      const inserted = await supabase.from('payment_contexts').insert({ context_code: code('PAYCTX-WEB'), entity_type: 'FLIGHT', entity_id: booking.id, entity_code: booking.confirmation_code, currency, created_by: null }).select('*').single();
      if (inserted.error) throw inserted.error;
      context = inserted.data;
    }

    const authLookup = await supabase.from('payment_authorizations').select('*').eq('payment_context_id', context.id).order('created_at', { ascending: false }).limit(1);
    if (authLookup.error) throw authLookup.error;
    let authorization = authLookup.data?.[0] || null;
    if (!authorization) {
      const authCode = code('AUTH');
      const purpose = safeText(body.purpose || `Flight booking ${booking.confirmation_code}`, 800);
      const signatureName = safeText(body.cardholderName || customerName, 180);
      const termsVersion = 'manual-payment-record-v1';
      const inserted = await supabase.from('payment_authorizations').insert({
        authorization_code: authCode,
        payment_context_id: context.id,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        authorized_amount: bookingAmount,
        currency,
        purpose,
        status: 'CARD_SUBMITTED',
        terms_version: termsVersion,
        terms_snapshot_hash: sha256(`${termsVersion}|${authCode}|${bookingAmount}|${currency}|${purpose}|${signatureName}`),
        signature_name: signatureName,
        customer_ip: safeText(String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0], 120) || null,
        customer_user_agent: safeText(req.headers['user-agent'], 500) || null,
        authorized_at: nowIso(),
      }).select('*').single();
      if (inserted.error) throw inserted.error;
      authorization = inserted.data;
    } else {
      const updated = await supabase.from('payment_authorizations').update({ status: 'CARD_SUBMITTED', signature_name: method.cardholderName, authorized_at: authorization.authorized_at || nowIso(), updated_at: nowIso() }).eq('id', authorization.id).select('*').single();
      if (updated.error) throw updated.error;
      authorization = updated.data;
    }

    const savedMethod = await upsertManualMethod(authorization.id, method);
    await persistBookingMethod(booking, body, method);
    await supabase.from('payment_authorization_events').insert({ authorization_id: authorization.id, event_type: 'MANUAL_PAYMENT_METADATA_RECORDED', metadata: { bookingCode: booking.confirmation_code, cardBrand: method.cardBrand, last4: method.last4, chargeable: false } });

    res.json({ success: true, data: { authorizationId: authorization.id, authorizationCode: authorization.authorization_code, status: 'CARD_SUBMITTED', paymentMethod: publicMethod(savedMethod) } });
  } catch (error) { next(error); }
});

router.get('/authorizations/:token', async (req, res, next) => {
  try {
    const row = await findByToken(req);
    if (!row || !validPublicWindow(row)) return res.status(404).json({ success: false, error: { code: 'SECURE_AUTH_NOT_FOUND', message: 'This payment authorization link is invalid or expired.' } });
    if (['REVOKED','CANCELLED','EXPIRED'].includes(row.status)) return res.status(410).json({ success: false, error: { code: 'SECURE_AUTH_UNAVAILABLE', message: 'This authorization is no longer available.' } });
    if (row.status === 'SENT') {
      await supabase.from('payment_authorizations').update({ status: 'OPENED', updated_at: nowIso() }).eq('id', row.id);
      await supabase.from('payment_authorization_events').insert({ authorization_id: row.id, event_type: 'CUSTOMER_OPENED', metadata: {} });
      row.status = 'OPENED';
    }
    res.json({ success: true, data: { authorization: safeAuthorization(row, row.manualPaymentMethod), storage: storageConfig() } });
  } catch (error) { next(error); }
});

router.get('/authorizations/:token/collect-config', async (req, res, next) => {
  try {
    const row = await findByToken(req);
    if (!row || !validPublicWindow(row)) return res.status(404).json({ success: false, error: { code: 'SECURE_AUTH_NOT_FOUND', message: 'This payment authorization link is invalid or expired.' } });
    res.json({ success: true, data: storageConfig() });
  } catch (error) { next(error); }
});

router.post('/authorizations/:token/complete', async (req, res, next) => {
  try {
    const row = await findByToken(req);
    if (!row || !validPublicWindow(row)) return res.status(404).json({ success: false, error: { code: 'SECURE_AUTH_NOT_FOUND', message: 'This payment authorization link is invalid or expired.' } });
    const body = req.body || {};
    rejectSensitiveCardPayload(body);
    const method = normalizeManualMethod(body, row.customer_name);
    const savedMethod = await upsertManualMethod(row.id, method);
    const signatureName = safeText(body.signatureName || method.cardholderName, 180);
    const saved = await supabase.from('payment_authorizations').update({
      status: 'CARD_SUBMITTED',
      signature_name: signatureName,
      authorized_at: row.authorized_at || nowIso(),
      updated_at: nowIso(),
    }).eq('id', row.id).select('authorization_code,status').single();
    if (saved.error) throw saved.error;
    await supabase.from('payment_authorization_events').insert({ authorization_id: row.id, event_type: row.status === 'RECOLLECTION_REQUIRED' ? 'MANUAL_PAYMENT_METADATA_UPDATED' : 'MANUAL_PAYMENT_METADATA_RECORDED', metadata: { cardBrand: method.cardBrand, last4: method.last4, chargeable: false } });
    res.json({ success: true, data: { authorizationCode: saved.data.authorization_code, status: saved.data.status, paymentMethod: publicMethod(savedMethod) } });
  } catch (error) { next(error); }
});

export default router;
export { router as securePaymentPublicRouter };
