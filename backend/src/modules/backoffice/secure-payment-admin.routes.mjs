import crypto from 'crypto';
import express from 'express';
import supabase from '../../integrations/supabase/supabase.client.mjs';
import { applyScope, requirePermission } from './backoffice.middleware.mjs';
import backofficeStaffService from './backoffice.service.mjs';
import { deleteVgsVolatileAlias, getSafeVgsVaultConfig, getVgsVaultConfig } from '../secure-payments/vgs-vault.service.mjs';
import { sendCustomerSecurePaymentLink, sendSecurePaymentOtp } from '../secure-payments/secure-payment-email.service.mjs';

const router = express.Router();
const ENTITY_TYPES = new Set(['FLIGHT','HOTEL','CAR','CRUISE','TOUR','ACTIVITY','PACKAGE','INSURANCE','TRIP','OTHER']);
const sha256 = value => crypto.createHash('sha256').update(String(value || '')).digest('hex');
const randomToken = bytes => crypto.randomBytes(bytes).toString('base64url');
const nowIso = () => new Date().toISOString();
const safeText = (value, max = 300) => String(value ?? '').trim().slice(0, max);

function requestIp(req) {
  return safeText(String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0], 120) || null;
}

function code(prefix) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `${prefix}-${stamp}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function frontendBase() {
  return String(process.env.FRONTEND_URL || 'https://www.faretransit.com').replace(/\/$/, '');
}

async function addAccessEvent(req, authorizationId, eventType, { sessionId = null, reason = null, metadata = {} } = {}) {
  await supabase.from('payment_access_events').insert({
    authorization_id: authorizationId,
    staff_user_id: req.staff?.id || null,
    staff_email: req.staff?.email || null,
    access_session_id: sessionId,
    event_type: eventType,
    reason,
    metadata,
    ip_address: requestIp(req),
    user_agent: safeText(req.headers['user-agent'], 500) || null,
  });
}

async function addAuthorizationEvent(authorizationId, eventType, metadata = {}) {
  await supabase.from('payment_authorization_events').insert({ authorization_id: authorizationId, event_type: eventType, metadata });
}

async function scopedContext(req, id) {
  const scope = backofficeStaffService.scopeFor(req.staff, 'payments.view') || (req.staff?.legacyOwner ? 'ALL' : null);
  if (!scope) return null;
  let query = supabase.from('payment_contexts').select('*').eq('id', id);
  query = applyScope(query, req.staff, scope);
  const result = await query.maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

async function authorizationWithScope(req, id) {
  const auth = await supabase.from('payment_authorizations').select('*').eq('id', id).maybeSingle();
  if (auth.error) throw auth.error;
  if (!auth.data) return null;
  const context = await scopedContext(req, auth.data.payment_context_id);
  if (!context) return null;
  return { authorization: auth.data, context };
}

async function paymentMethod(authorizationId) {
  const result = await supabase.from('vaulted_payment_methods').select('*').eq('authorization_id', authorizationId).maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

function safeMethod(method) {
  if (!method) return null;
  return {
    id: method.id,
    provider: method.provider,
    cardBrand: method.card_brand,
    last4: method.last4,
    panStatus: method.pan_status,
    cvvStatus: method.cvv_status,
    cvvCollectedAt: method.cvv_collected_at,
    cvvExpiresAt: method.cvv_expires_at,
    cardholderName: method.cardholder_name,
  };
}

function safeAuth(auth, context, method = null) {
  return {
    id: auth.id,
    authorizationCode: auth.authorization_code,
    paymentContextId: auth.payment_context_id,
    customerName: auth.customer_name,
    customerEmail: auth.customer_email,
    customerPhone: auth.customer_phone,
    authorizedAmount: auth.authorized_amount,
    currency: auth.currency,
    purpose: auth.purpose,
    status: auth.status,
    linkExpiresAt: auth.public_token_expires_at,
    termsVersion: auth.terms_version,
    signatureName: auth.signature_name,
    authorizedAt: auth.authorized_at,
    createdAt: auth.created_at,
    updatedAt: auth.updated_at,
    context: context ? {
      id: context.id,
      contextCode: context.context_code,
      entityType: context.entity_type,
      entityId: context.entity_id,
      entityCode: context.entity_code,
      tripId: context.trip_id,
      leadId: context.lead_id,
      assignedAgentId: context.assigned_agent_id,
      teamId: context.team_id,
    } : null,
    paymentMethod: safeMethod(method),
    vault: getSafeVgsVaultConfig(),
  };
}

async function issuePublicToken(authorizationId, hours) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  const updated = await supabase.from('payment_authorizations').update({
    public_token_hash: sha256(token), public_token_expires_at: expiresAt, updated_at: nowIso(),
  }).eq('id', authorizationId).select('id').single();
  if (updated.error) throw updated.error;
  return { token, expiresAt, publicUrl: `${frontendBase()}/secure-payment/${token}` };
}

async function verifyExistingProductScope(req, body, entityType) {
  if (req.staff?.legacyOwner) return null;
  const map = {
    FLIGHT: { table: 'bookings', permission: 'bookings.flights.view', code: 'confirmation_code' },
    HOTEL: { table: 'hotel_bookings', permission: 'bookings.hotels.view', code: 'hotel_code' },
    CAR: { table: 'car_bookings', permission: 'bookings.cars.view', code: 'car_code' },
  };
  const config = map[entityType];
  if (!config) {
    const error = new Error('This product type is ready in the payment architecture but can only be attached by the owner until its booking module is activated.');
    error.statusCode = 403; error.code = 'PRODUCT_MODULE_NOT_ACTIVE'; throw error;
  }
  const scope = backofficeStaffService.scopeFor(req.staff, config.permission);
  if (!scope) { const error = new Error('You do not have access to this booking type.'); error.statusCode = 403; error.code = 'BOOKING_SCOPE_DENIED'; throw error; }
  let query = supabase.from(config.table).select(`id,${config.code},assigned_agent_id,team_id`).limit(1);
  if (body.entityId) query = query.eq('id', body.entityId); else if (body.entityCode) query = query.eq(config.code, body.entityCode); else return null;
  query = applyScope(query, req.staff, scope);
  const result = await query.maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) { const error = new Error('The selected booking was not found in your data scope.'); error.statusCode = 404; error.code = 'BOOKING_NOT_FOUND'; throw error; }
  return result.data;
}

router.get('/payments/vault-config', requirePermission('authorization.view'), (req, res) => {
  res.json({ success: true, data: getSafeVgsVaultConfig() });
});

router.get('/payments/authorizations', requirePermission('authorization.view'), async (req, res, next) => {
  try {
    const scope = backofficeStaffService.scopeFor(req.staff, 'payments.view') || (req.staff?.legacyOwner ? 'ALL' : null);
    if (!scope) return res.status(403).json({ success: false, error: { code: 'PAYMENT_SCOPE_DENIED', message: 'Payment scope is unavailable.' } });
    let contextQuery = supabase.from('payment_contexts').select('*').order('created_at', { ascending: false });
    contextQuery = applyScope(contextQuery, req.staff, scope);
    if (req.query.entityType) contextQuery = contextQuery.eq('entity_type', safeText(req.query.entityType, 32).toUpperCase());
    if (req.query.entityCode) contextQuery = contextQuery.eq('entity_code', safeText(req.query.entityCode, 100));
    const contexts = await contextQuery.limit(500);
    if (contexts.error) throw contexts.error;
    if (!contexts.data?.length) return res.json({ success: true, data: [] });
    let authQuery = supabase.from('payment_authorizations').select('*').in('payment_context_id', contexts.data.map(row => row.id)).order('created_at', { ascending: false });
    if (req.query.status) authQuery = authQuery.eq('status', safeText(req.query.status, 40).toUpperCase());
    const auths = await authQuery.limit(500);
    if (auths.error) throw auths.error;
    const contextMap = new Map(contexts.data.map(row => [row.id, row]));
    const methods = await supabase.from('vaulted_payment_methods').select('id,authorization_id,provider,card_brand,last4,pan_status,cvv_status,cvv_collected_at,cvv_expires_at,cardholder_name').in('authorization_id', (auths.data || []).map(row => row.id));
    if (methods.error) throw methods.error;
    const methodMap = new Map((methods.data || []).map(row => [row.authorization_id, row]));
    res.json({ success: true, data: (auths.data || []).map(auth => safeAuth(auth, contextMap.get(auth.payment_context_id), methodMap.get(auth.id))) });
  } catch (error) { next(error); }
});

router.post('/payments/authorizations', requirePermission('payments.authorization.manage'), async (req, res, next) => {
  try {
    const body = req.body || {};
    const entityType = safeText(body.entityType || 'OTHER', 32).toUpperCase();
    const amount = Number(body.authorizedAmount || 0);
    const customerName = safeText(body.customerName, 180);
    const customerEmail = safeText(body.customerEmail, 240).toLowerCase();
    const purpose = safeText(body.purpose, 800);
    if (!ENTITY_TYPES.has(entityType) || !customerName || !/^\S+@\S+\.\S+$/.test(customerEmail) || !purpose || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_SECURE_AUTHORIZATION', message: 'Valid product type, customer name/email, purpose and positive authorized amount are required.' } });
    }
    const existingProduct = await verifyExistingProductScope(req, body, entityType);
    const contextPayload = {
      context_code: code('PAYCTX'),
      entity_type: entityType,
      entity_id: body.entityId || existingProduct?.id || null,
      entity_code: safeText(body.entityCode || (existingProduct && (existingProduct.confirmation_code || existingProduct.hotel_code || existingProduct.car_code)), 100) || null,
      trip_id: body.tripId || null,
      lead_id: body.leadId || null,
      assigned_agent_id: body.assignedAgentId || existingProduct?.assigned_agent_id || req.staff?.id || null,
      team_id: body.teamId || existingProduct?.team_id || req.staff?.team?.id || null,
      currency: safeText(body.currency || 'USD', 8).toUpperCase(),
      created_by: req.staff?.id || null,
    };
    const context = await supabase.from('payment_contexts').insert(contextPayload).select('*').single();
    if (context.error) throw context.error;
    const authPayload = {
      authorization_code: code('AUTH'),
      payment_context_id: context.data.id,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: safeText(body.customerPhone, 80) || null,
      authorized_amount: amount,
      currency: contextPayload.currency,
      purpose,
      status: 'SENT',
      terms_version: 'secure-payment-v1',
    };
    const auth = await supabase.from('payment_authorizations').insert(authPayload).select('*').single();
    if (auth.error) throw auth.error;
    const config = getVgsVaultConfig();
    const link = await issuePublicToken(auth.data.id, Math.max(1, Number(body.publicLinkHours || config.publicLinkHours)));
    auth.data.public_token_expires_at = link.expiresAt;
    await addAuthorizationEvent(auth.data.id, 'AUTHORIZATION_CREATED', { entityType, entityCode: contextPayload.entity_code, createdBy: req.staff?.email || 'owner' });
    res.status(201).json({ success: true, data: { authorization: safeAuth(auth.data, context.data), publicUrl: link.publicUrl } });
  } catch (error) { next(error); }
});

router.get('/payments/authorizations/:id', requirePermission('authorization.view'), async (req, res, next) => {
  try {
    const found = await authorizationWithScope(req, req.params.id);
    if (!found) return res.status(404).json({ success: false, error: { code: 'SECURE_AUTH_NOT_FOUND', message: 'Authorization not found in your scope.' } });
    const method = await paymentMethod(found.authorization.id);
    const events = await supabase.from('payment_access_events').select('id,event_type,staff_email,reason,metadata,created_at').eq('authorization_id', found.authorization.id).order('created_at', { ascending: false }).limit(100);
    if (events.error) throw events.error;
    const authEvents = await supabase.from('payment_authorization_events').select('id,event_type,metadata,created_at').eq('authorization_id', found.authorization.id).order('created_at', { ascending: false }).limit(100);
    if (authEvents.error) throw authEvents.error;
    const charges = await supabase.from('supplier_charge_attempts').select('id,supplier_id,supplier_name,amount,currency,charge_type,status,provider_reference,attempted_by_email,attempted_at,authorized_at,failure_reason,created_at').eq('authorization_id', found.authorization.id).order('created_at', { ascending: false }).limit(100);
    if (charges.error) throw charges.error;
    res.json({ success: true, data: { authorization: safeAuth(found.authorization, found.context, method), accessEvents: events.data || [], authorizationEvents: authEvents.data || [], supplierCharges: charges.data || [] } });
  } catch (error) { next(error); }
});

router.post('/payments/authorizations/:id/send', requirePermission('payments.authorization.manage'), async (req, res, next) => {
  try {
    const found = await authorizationWithScope(req, req.params.id);
    if (!found) return res.status(404).json({ success: false, error: { code: 'SECURE_AUTH_NOT_FOUND', message: 'Authorization not found.' } });
    const config = getVgsVaultConfig();
    const link = await issuePublicToken(found.authorization.id, config.publicLinkHours);
    await sendCustomerSecurePaymentLink({ to: found.authorization.customer_email, customerName: found.authorization.customer_name, publicUrl: link.publicUrl, purpose: found.authorization.purpose, amount: found.authorization.authorized_amount, currency: found.authorization.currency });
    await addAuthorizationEvent(found.authorization.id, 'AUTHORIZATION_LINK_SENT', { sentBy: req.staff?.email || null });
    res.json({ success: true, data: { publicUrl: link.publicUrl, expiresAt: link.expiresAt } });
  } catch (error) { next(error); }
});

router.post('/payments/authorizations/:id/recollect', requirePermission('payments.authorization.manage'), async (req, res, next) => {
  try {
    const found = await authorizationWithScope(req, req.params.id);
    if (!found) return res.status(404).json({ success: false, error: { code: 'SECURE_AUTH_NOT_FOUND', message: 'Authorization not found.' } });
    const method = await paymentMethod(found.authorization.id);
    if (!method?.pan_alias) return res.status(409).json({ success: false, error: { code: 'NO_VAULTED_CARD', message: 'There is no existing vaulted card to recollect a CVV for.' } });
    if (method.cvv_alias) await deleteVgsVolatileAlias(method.cvv_alias).catch(() => null);
    const methodUpdate = await supabase.from('vaulted_payment_methods').update({ cvv_alias: null, cvv_status: 'RECOLLECTION_REQUIRED', cvv_collected_at: null, cvv_expires_at: null, updated_at: nowIso() }).eq('id', method.id);
    if (methodUpdate.error) throw methodUpdate.error;
    const authUpdate = await supabase.from('payment_authorizations').update({ status: 'RECOLLECTION_REQUIRED', updated_at: nowIso() }).eq('id', found.authorization.id);
    if (authUpdate.error) throw authUpdate.error;
    const config = getVgsVaultConfig();
    const link = await issuePublicToken(found.authorization.id, config.publicLinkHours);
    if (req.body?.sendEmail === true) await sendCustomerSecurePaymentLink({ to: found.authorization.customer_email, customerName: found.authorization.customer_name, publicUrl: link.publicUrl, purpose: `${found.authorization.purpose} — security code refresh`, amount: found.authorization.authorized_amount, currency: found.authorization.currency });
    await addAuthorizationEvent(found.authorization.id, 'CVV_RECOLLECTION_REQUESTED', { requestedBy: req.staff?.email || null });
    res.json({ success: true, data: { publicUrl: link.publicUrl, expiresAt: link.expiresAt } });
  } catch (error) { next(error); }
});

router.post('/payments/authorizations/:id/access/request-otp', requirePermission('payments.secure_card_access'), async (req, res, next) => {
  try {
    const found = await authorizationWithScope(req, req.params.id);
    if (!found) return res.status(404).json({ success: false, error: { code: 'SECURE_AUTH_NOT_FOUND', message: 'Authorization not found.' } });
    const method = await paymentMethod(found.authorization.id);
    if (!method?.pan_alias) return res.status(409).json({ success: false, error: { code: 'CARD_NOT_READY', message: 'No vaulted payment method is ready for secure access.' } });
    const reason = safeText(req.body?.reason || 'Supplier booking', 160);
    const otp = String(crypto.randomInt(100000, 1000000));
    const sessionId = crypto.randomUUID();
    const config = getVgsVaultConfig();
    const otpExpiresAt = new Date(Date.now() + config.otpMinutes * 60 * 1000).toISOString();
    const otpHash = sha256(`${sessionId}:${otp}:${process.env.JWT_SECRET || 'secure-payment'}`);
    const created = await supabase.from('payment_access_sessions').insert({
      id: sessionId,
      authorization_id: found.authorization.id,
      staff_user_id: req.staff?.id || null,
      staff_email: req.staff?.email || process.env.ADMIN_EMAIL || 'owner@faretransit.com',
      reason,
      otp_hash: otpHash,
      otp_expires_at: otpExpiresAt,
      status: 'OTP_SENT',
      ip_address: requestIp(req),
      user_agent: safeText(req.headers['user-agent'], 500) || null,
    }).select('id,otp_expires_at').single();
    if (created.error) throw created.error;
    await sendSecurePaymentOtp({ to: req.staff?.email || process.env.ADMIN_EMAIL, code: otp, minutes: config.otpMinutes });
    await addAccessEvent(req, found.authorization.id, 'OTP_SENT', { sessionId, reason });
    res.json({ success: true, data: { accessSessionId: sessionId, expiresAt: created.data.otp_expires_at, destination: req.staff?.email || process.env.ADMIN_EMAIL } });
  } catch (error) { next(error); }
});

router.post('/payments/authorizations/:id/access/verify-otp', requirePermission('payments.secure_card_access'), async (req, res, next) => {
  try {
    const found = await authorizationWithScope(req, req.params.id);
    if (!found) return res.status(404).json({ success: false, error: { code: 'SECURE_AUTH_NOT_FOUND', message: 'Authorization not found.' } });
    const sessionId = safeText(req.body?.accessSessionId, 80);
    const otp = safeText(req.body?.otp, 12);
    const session = await supabase.from('payment_access_sessions').select('*').eq('id', sessionId).eq('authorization_id', found.authorization.id).maybeSingle();
    if (session.error) throw session.error;
    if (!session.data || session.data.status !== 'OTP_SENT' || new Date(session.data.otp_expires_at).getTime() <= Date.now()) return res.status(410).json({ success: false, error: { code: 'OTP_EXPIRED', message: 'The secure access code has expired.' } });
    const sameActor = req.staff?.id ? session.data.staff_user_id === req.staff.id : session.data.staff_email === (req.staff?.email || process.env.ADMIN_EMAIL);
    if (!sameActor) return res.status(403).json({ success: false, error: { code: 'OTP_ACTOR_MISMATCH', message: 'This access request belongs to another user.' } });
    const attempts = Number(session.data.otp_attempts || 0) + 1;
    const expected = sha256(`${sessionId}:${otp}:${process.env.JWT_SECRET || 'secure-payment'}`);
    if (attempts > 5 || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(session.data.otp_hash || ''.padEnd(expected.length, '0')))) {
      await supabase.from('payment_access_sessions').update({ otp_attempts: attempts, status: attempts >= 5 ? 'DENIED' : 'OTP_SENT' }).eq('id', sessionId);
      await addAccessEvent(req, found.authorization.id, 'ACCESS_DENIED', { sessionId, reason: session.data.reason, metadata: { cause: 'OTP_INVALID' } });
      return res.status(401).json({ success: false, error: { code: 'OTP_INVALID', message: 'The verification code is incorrect.' } });
    }
    const config = getVgsVaultConfig();
    const secureToken = randomToken(32);
    const secureExpiresAt = new Date(Date.now() + config.accessMinutes * 60 * 1000).toISOString();
    const updated = await supabase.from('payment_access_sessions').update({ otp_attempts: attempts, otp_verified_at: nowIso(), secure_session_hash: sha256(secureToken), secure_session_expires_at: secureExpiresAt, status: 'ACTIVE' }).eq('id', sessionId);
    if (updated.error) throw updated.error;
    await addAccessEvent(req, found.authorization.id, 'OTP_VERIFIED', { sessionId, reason: session.data.reason });
    await addAccessEvent(req, found.authorization.id, 'ACCESS_GRANTED', { sessionId, reason: session.data.reason });
    res.json({ success: true, data: { secureSessionToken: secureToken, expiresAt: secureExpiresAt, vault: getSafeVgsVaultConfig() } });
  } catch (error) { next(error); }
});

async function activeSecureSession(req, authorizationId) {
  const token = safeText(req.headers['x-tfs-secure-session'], 200);
  if (!token) return null;
  const result = await supabase.from('payment_access_sessions').select('*').eq('authorization_id', authorizationId).eq('secure_session_hash', sha256(token)).eq('status', 'ACTIVE').maybeSingle();
  if (result.error) throw result.error;
  if (!result.data || new Date(result.data.secure_session_expires_at).getTime() <= Date.now()) return null;
  const sameActor = req.staff?.id ? result.data.staff_user_id === req.staff.id : result.data.staff_email === (req.staff?.email || process.env.ADMIN_EMAIL);
  return sameActor ? result.data : null;
}

router.get('/payments/authorizations/:id/reveal', requirePermission('payments.secure_card_access'), async (req, res, next) => {
  try {
    const found = await authorizationWithScope(req, req.params.id);
    if (!found) return res.status(404).json({ success: false, error: { code: 'SECURE_AUTH_NOT_FOUND', message: 'Authorization not found.' } });
    const session = await activeSecureSession(req, found.authorization.id);
    if (!session) return res.status(401).json({ success: false, error: { code: 'SECURE_SESSION_REQUIRED', message: 'A fresh MFA secure session is required.' } });
    const method = await paymentMethod(found.authorization.id);
    const field = safeText(req.query.field, 20).toLowerCase();
    let alias = null; let eventType = null;
    if (field === 'pan') { alias = method?.pan_alias; eventType = 'PAN_REVEALED'; }
    else if (field === 'expiration') { alias = method?.expiration_alias; eventType = 'EXPIRY_REVEALED'; }
    else if (field === 'cvv') {
      if (!method?.cvv_alias || !method.cvv_expires_at || new Date(method.cvv_expires_at).getTime() <= Date.now()) {
        if (method) await supabase.from('vaulted_payment_methods').update({ cvv_alias: null, cvv_status: 'EXPIRED', cvv_expires_at: null, updated_at: nowIso() }).eq('id', method.id);
        await addAccessEvent(req, found.authorization.id, 'CVV_EXPIRED', { sessionId: session.id, reason: session.reason });
        return res.status(410).json({ success: false, error: { code: 'CVV_EXPIRED', message: 'The volatile CVV has expired. Request a new security code from the customer.' } });
      }
      alias = method.cvv_alias; eventType = 'CVV_REVEALED';
    } else return res.status(400).json({ success: false, error: { code: 'INVALID_REVEAL_FIELD', message: 'field must be pan, expiration or cvv.' } });
    if (!alias) return res.status(404).json({ success: false, error: { code: 'SECURE_FIELD_UNAVAILABLE', message: 'This secure field is unavailable.' } });
    await addAccessEvent(req, found.authorization.id, eventType, { sessionId: session.id, reason: session.reason });
    // This endpoint intentionally returns a VGS alias, never plaintext. VGS Show must call it through a VGS inbound route so reveal happens only inside the isolated iframe.
    res.json({ value: alias });
  } catch (error) { next(error); }
});

router.post('/payments/authorizations/:id/access/end', requirePermission('payments.secure_card_access'), async (req, res, next) => {
  try {
    const found = await authorizationWithScope(req, req.params.id);
    if (!found) return res.status(404).json({ success: false, error: { code: 'SECURE_AUTH_NOT_FOUND', message: 'Authorization not found.' } });
    const session = await activeSecureSession(req, found.authorization.id);
    if (session) {
      await supabase.from('payment_access_sessions').update({ status: 'ENDED', secure_session_hash: null }).eq('id', session.id);
      await addAccessEvent(req, found.authorization.id, 'ACCESS_ENDED', { sessionId: session.id, reason: session.reason });
    }
    res.json({ success: true, data: { ended: true } });
  } catch (error) { next(error); }
});

async function consumeCvv(req, authorizationId, method) {
  if (!method?.cvv_alias) return { deleted: true, alreadyMissing: true };
  try {
    const result = await deleteVgsVolatileAlias(method.cvv_alias);
    const update = await supabase.from('vaulted_payment_methods').update({ cvv_alias: null, cvv_status: 'DELETED', cvv_expires_at: null, updated_at: nowIso() }).eq('id', method.id);
    if (update.error) throw update.error;
    await addAccessEvent(req, authorizationId, 'CVV_CONSUMED', { metadata: { provider: 'VGS', deleted: true } });
    return result;
  } catch (error) {
    await supabase.from('vaulted_payment_methods').update({ cvv_status: 'DELETION_PENDING', updated_at: nowIso() }).eq('id', method.id);
    await addAccessEvent(req, authorizationId, 'CVV_DELETE_FAILED', { metadata: { provider: 'VGS', code: error.code || 'DELETE_FAILED' } });
    return { deleted: false, pending: true };
  }
}

router.post('/payments/authorizations/:id/supplier-charges', requirePermission('payments.supplier_charge'), async (req, res, next) => {
  try {
    const found = await authorizationWithScope(req, req.params.id);
    if (!found) return res.status(404).json({ success: false, error: { code: 'SECURE_AUTH_NOT_FOUND', message: 'Authorization not found.' } });
    const body = req.body || {};
    const amount = Number(body.amount || 0);
    const status = safeText(body.status || 'PENDING', 24).toUpperCase();
    if (!Number.isFinite(amount) || amount <= 0 || !['PENDING','PROCESSING','AUTHORIZED','DECLINED','FAILED','VOIDED','REFUNDED'].includes(status)) return res.status(400).json({ success: false, error: { code: 'INVALID_SUPPLIER_CHARGE', message: 'A positive amount and valid supplier-charge status are required.' } });
    const method = await paymentMethod(found.authorization.id);
    const inserted = await supabase.from('supplier_charge_attempts').insert({
      payment_context_id: found.context.id,
      authorization_id: found.authorization.id,
      payment_method_id: method?.id || null,
      supplier_id: body.supplierId || null,
      supplier_name: safeText(body.supplierName, 180) || null,
      amount,
      currency: safeText(body.currency || found.authorization.currency || 'USD', 8).toUpperCase(),
      charge_type: safeText(body.chargeType || 'PURCHASE', 40).toUpperCase(),
      status,
      provider_reference: safeText(body.providerReference, 200) || null,
      attempted_by: req.staff?.id || null,
      attempted_by_email: req.staff?.email || null,
      authorized_at: status === 'AUTHORIZED' ? nowIso() : null,
      failure_reason: safeText(body.failureReason, 500) || null,
    }).select('*').single();
    if (inserted.error) throw inserted.error;
    let cvvDeletion = null;
    if (status === 'AUTHORIZED') {
      cvvDeletion = await consumeCvv(req, found.authorization.id, method);
      await supabase.from('payment_authorizations').update({ status: 'PARTIALLY_USED', updated_at: nowIso() }).eq('id', found.authorization.id);
      await addAuthorizationEvent(found.authorization.id, 'SUPPLIER_TRANSACTION_AUTHORIZED', { supplier: inserted.data.supplier_name, amount, currency: inserted.data.currency, cvvDeleted: Boolean(cvvDeletion?.deleted) });
    }
    res.status(201).json({ success: true, data: { charge: inserted.data, cvvDeletion } });
  } catch (error) { next(error); }
});

router.post('/payments/authorizations/:id/consume-cvv', requirePermission('payments.secure_card_access'), async (req, res, next) => {
  try {
    const found = await authorizationWithScope(req, req.params.id);
    if (!found) return res.status(404).json({ success: false, error: { code: 'SECURE_AUTH_NOT_FOUND', message: 'Authorization not found.' } });
    const method = await paymentMethod(found.authorization.id);
    const result = await consumeCvv(req, found.authorization.id, method);
    res.status(result.deleted ? 200 : 502).json({ success: Boolean(result.deleted), data: result, error: result.deleted ? undefined : { code: 'CVV_DELETION_PENDING', message: 'VGS deletion did not complete. Retry before any further card use.' } });
  } catch (error) { next(error); }
});

export default router;
export { router as securePaymentAdminRouter };
