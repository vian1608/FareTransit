import crypto from 'crypto';
import express from 'express';
import supabase from '../../integrations/supabase/supabase.client.mjs';
import { applyScope, requirePermission } from './backoffice.middleware.mjs';
import backofficeStaffService from './backoffice.service.mjs';
import { sendCustomerSecurePaymentLink } from '../secure-payments/secure-payment-email.service.mjs';

const router = express.Router();
const ENTITY_TYPES = new Set(['FLIGHT','HOTEL','CAR','CRUISE','TOUR','ACTIVITY','PACKAGE','INSURANCE','TRIP','OTHER']);
const sha256 = value => crypto.createHash('sha256').update(String(value || '')).digest('hex');
const randomToken = bytes => crypto.randomBytes(bytes).toString('base64url');
const nowIso = () => new Date().toISOString();
const safeText = (value, max = 300) => String(value ?? '').trim().slice(0, max);

function code(prefix) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `${prefix}-${stamp}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function frontendBase() {
  return String(process.env.FRONTEND_URL || 'https://www.faretransit.com').replace(/\/$/, '');
}

function storageConfig() {
  return {
    mode: 'manual_masked_metadata',
    configured: true,
    chargeableCredentialStored: false,
    fullCardRevealAvailable: false,
  };
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
  const result = await supabase.from('manual_payment_methods').select('*').eq('authorization_id', authorizationId).maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

function safeMethod(method) {
  if (!method) return null;
  return {
    id: method.id,
    provider: 'MANUAL',
    cardBrand: method.card_brand,
    last4: method.last4,
    expMonth: method.exp_month,
    expYear: method.exp_year,
    cardholderName: method.cardholder_name,
    billingAddress: method.billing_address || {},
    source: method.source || 'MANUAL_METADATA',
    chargeable: false,
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
    storage: storageConfig(),
  };
}

async function issuePublicToken(authorizationId, hours = 24) {
  const token = randomToken(32);
  const safeHours = Math.max(1, Math.min(168, Number(hours) || 24));
  const expiresAt = new Date(Date.now() + safeHours * 60 * 60 * 1000).toISOString();
  const updated = await supabase.from('payment_authorizations').update({ public_token_hash: sha256(token), public_token_expires_at: expiresAt, updated_at: nowIso() }).eq('id', authorizationId).select('id').single();
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
    const error = new Error('This product type can only be attached by the owner until its booking module is activated.');
    error.statusCode = 403;
    error.code = 'PRODUCT_MODULE_NOT_ACTIVE';
    throw error;
  }
  const scope = backofficeStaffService.scopeFor(req.staff, config.permission);
  if (!scope) {
    const error = new Error('You do not have access to this booking type.');
    error.statusCode = 403;
    error.code = 'BOOKING_SCOPE_DENIED';
    throw error;
  }
  let query = supabase.from(config.table).select(`id,${config.code},assigned_agent_id,team_id`).limit(1);
  if (body.entityId) query = query.eq('id', body.entityId);
  else if (body.entityCode) query = query.eq(config.code, body.entityCode);
  else return null;
  query = applyScope(query, req.staff, scope);
  const result = await query.maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) {
    const error = new Error('The selected booking was not found in your data scope.');
    error.statusCode = 404;
    error.code = 'BOOKING_NOT_FOUND';
    throw error;
  }
  return result.data;
}

router.get('/payments/vault-config', requirePermission('authorization.view'), (req, res) => {
  res.json({ success: true, data: storageConfig() });
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
    const ids = (auths.data || []).map(row => row.id);
    const methods = ids.length ? await supabase.from('manual_payment_methods').select('*').in('authorization_id', ids) : { data: [], error: null };
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
      return res.status(400).json({ success: false, error: { code: 'INVALID_PAYMENT_AUTHORIZATION', message: 'Valid product type, customer name/email, purpose and positive authorized amount are required.' } });
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
    const auth = await supabase.from('payment_authorizations').insert({
      authorization_code: code('AUTH'),
      payment_context_id: context.data.id,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: safeText(body.customerPhone, 80) || null,
      authorized_amount: amount,
      currency: contextPayload.currency,
      purpose,
      status: 'SENT',
      terms_version: 'manual-payment-record-v1',
    }).select('*').single();
    if (auth.error) throw auth.error;
    const link = await issuePublicToken(auth.data.id, body.publicLinkHours || 24);
    auth.data.public_token_expires_at = link.expiresAt;
    await addAuthorizationEvent(auth.data.id, 'AUTHORIZATION_CREATED', { entityType, entityCode: contextPayload.entity_code, createdBy: req.staff?.email || 'owner', storageMode: 'manual_masked_metadata' });
    res.status(201).json({ success: true, data: { authorization: safeAuth(auth.data, context.data), publicUrl: link.publicUrl } });
  } catch (error) { next(error); }
});

router.get('/payments/authorizations/:id', requirePermission('authorization.view'), async (req, res, next) => {
  try {
    const found = await authorizationWithScope(req, req.params.id);
    if (!found) return res.status(404).json({ success: false, error: { code: 'PAYMENT_AUTH_NOT_FOUND', message: 'Authorization not found in your scope.' } });
    const method = await paymentMethod(found.authorization.id);
    const authEvents = await supabase.from('payment_authorization_events').select('id,event_type,metadata,created_at').eq('authorization_id', found.authorization.id).order('created_at', { ascending: false }).limit(100);
    if (authEvents.error) throw authEvents.error;
    const charges = await supabase.from('supplier_charge_attempts').select('id,supplier_id,supplier_name,amount,currency,charge_type,status,provider_reference,attempted_by_email,attempted_at,authorized_at,failure_reason,created_at').eq('authorization_id', found.authorization.id).order('created_at', { ascending: false }).limit(100);
    if (charges.error) throw charges.error;
    res.json({ success: true, data: { authorization: safeAuth(found.authorization, found.context, method), authorizationEvents: authEvents.data || [], supplierCharges: charges.data || [] } });
  } catch (error) { next(error); }
});

router.post('/payments/authorizations/:id/send', requirePermission('payments.authorization.manage'), async (req, res, next) => {
  try {
    const found = await authorizationWithScope(req, req.params.id);
    if (!found) return res.status(404).json({ success: false, error: { code: 'PAYMENT_AUTH_NOT_FOUND', message: 'Authorization not found.' } });
    const link = await issuePublicToken(found.authorization.id, req.body?.publicLinkHours || 24);
    await sendCustomerSecurePaymentLink({ to: found.authorization.customer_email, customerName: found.authorization.customer_name, publicUrl: link.publicUrl, purpose: found.authorization.purpose, amount: found.authorization.authorized_amount, currency: found.authorization.currency });
    await addAuthorizationEvent(found.authorization.id, 'AUTHORIZATION_LINK_SENT', { sentBy: req.staff?.email || null });
    res.json({ success: true, data: { publicUrl: link.publicUrl, expiresAt: link.expiresAt } });
  } catch (error) { next(error); }
});

router.post('/payments/authorizations/:id/recollect', requirePermission('payments.authorization.manage'), async (req, res, next) => {
  try {
    const found = await authorizationWithScope(req, req.params.id);
    if (!found) return res.status(404).json({ success: false, error: { code: 'PAYMENT_AUTH_NOT_FOUND', message: 'Authorization not found.' } });
    const updated = await supabase.from('payment_authorizations').update({ status: 'RECOLLECTION_REQUIRED', updated_at: nowIso() }).eq('id', found.authorization.id);
    if (updated.error) throw updated.error;
    const link = await issuePublicToken(found.authorization.id, req.body?.publicLinkHours || 24);
    if (req.body?.sendEmail) {
      await sendCustomerSecurePaymentLink({ to: found.authorization.customer_email, customerName: found.authorization.customer_name, publicUrl: link.publicUrl, purpose: found.authorization.purpose, amount: found.authorization.authorized_amount, currency: found.authorization.currency });
    }
    await addAuthorizationEvent(found.authorization.id, 'PAYMENT_METADATA_UPDATE_REQUESTED', { requestedBy: req.staff?.email || null });
    res.json({ success: true, data: { publicUrl: link.publicUrl, expiresAt: link.expiresAt } });
  } catch (error) { next(error); }
});

router.post('/payments/authorizations/:id/supplier-charges', requirePermission('payments.supplier_charge'), async (req, res, next) => {
  try {
    const found = await authorizationWithScope(req, req.params.id);
    if (!found) return res.status(404).json({ success: false, error: { code: 'PAYMENT_AUTH_NOT_FOUND', message: 'Authorization not found.' } });
    return res.status(409).json({
      success: false,
      error: {
        code: 'MANUAL_PAYMENT_RECORD_ONLY',
        message: 'The stored manual payment record is masked metadata, not a chargeable credential. Process the payment through an approved external payment channel and record the transaction reference in finance.',
      },
    });
  } catch (error) { next(error); }
});

router.post('/payments/authorizations/:id/consume-cvv', requirePermission('payments.secure_card_access'), (req, res) => {
  res.status(410).json({ success: false, error: { code: 'SECURE_CARD_REVEAL_REMOVED', message: 'Full card credential access is not available in manual payment storage mode.' } });
});

export default router;
export { router as securePaymentAdminRouter };
