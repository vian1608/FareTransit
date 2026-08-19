import crypto from 'node:crypto';
import supabase from '../../integrations/supabase/supabase.client.mjs';
import {
  GLOBAL_MINIMUM_BOOKING_AMOUNT,
  GLOBAL_MINIMUM_PAYABLE_PERCENT,
  calculateVoucherApplication,
} from './voucher-policy.mjs';

const REDEEMED_STATUSES = ['RESERVED', 'REDEEMED'];

function normalizeCode(value = '') {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
}

function normalizeEmail(value = '') {
  return String(value || '').trim().toLowerCase();
}

function voucherError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function numberOr(value, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function integerOr(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function makeCode(amount = null) {
  const prefix = amount && numberOr(amount) > 0 ? `TFS-${Math.round(numberOr(amount))}` : 'TFS';
  const token = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}-${token}`;
}

async function ensureUniqueCode(preferredCode, amount) {
  let candidate = normalizeCode(preferredCode) || makeCode(amount);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await supabase
      .from('vouchers')
      .select('id')
      .eq('code', candidate)
      .maybeSingle();
    if (error) throw voucherError('VOUCHER_LOOKUP_FAILED', error.message, 500);
    if (!data) return candidate;
    candidate = makeCode(amount);
  }
  throw voucherError('VOUCHER_CODE_GENERATION_FAILED', 'Unable to generate a unique voucher code.', 500);
}

async function getVoucherByCode(code) {
  const normalized = normalizeCode(code);
  if (!normalized) throw voucherError('VOUCHER_CODE_REQUIRED', 'Enter a voucher code.');

  const { data, error } = await supabase
    .from('vouchers')
    .select('*')
    .eq('code', normalized)
    .maybeSingle();

  if (error) throw voucherError('VOUCHER_LOOKUP_FAILED', error.message, 500);
  if (!data) throw voucherError('VOUCHER_NOT_FOUND', 'Voucher code was not found.');
  return data;
}

async function getUsage(voucherId, email = '') {
  let totalQuery = supabase
    .from('voucher_redemptions')
    .select('id', { count: 'exact', head: true })
    .eq('voucher_id', voucherId)
    .in('status', REDEEMED_STATUSES);

  const { count: totalCount, error: totalError } = await totalQuery;
  if (totalError) throw voucherError('VOUCHER_USAGE_LOOKUP_FAILED', totalError.message, 500);

  let customerCount = 0;
  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail) {
    const { count, error } = await supabase
      .from('voucher_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('voucher_id', voucherId)
      .eq('customer_email', normalizedEmail)
      .in('status', REDEEMED_STATUSES);
    if (error) throw voucherError('VOUCHER_USAGE_LOOKUP_FAILED', error.message, 500);
    customerCount = count || 0;
  }

  return { totalCount: totalCount || 0, customerCount };
}

function assertVoucherWindow(voucher) {
  if (!voucher.active) throw voucherError('VOUCHER_DISABLED', 'This voucher is currently disabled.');
  const now = new Date();
  const validFrom = safeDate(voucher.valid_from);
  const validUntil = safeDate(voucher.valid_until);
  if (validFrom && now < validFrom) throw voucherError('VOUCHER_NOT_STARTED', 'This voucher is not active yet.');
  if (validUntil && now > validUntil) throw voucherError('VOUCHER_EXPIRED', 'This voucher has expired.');
}

export const voucherService = {
  normalizeCode,

  validate: async ({ code, supplierPrice, priceBeforeVoucher, email }) => {
    const voucher = await getVoucherByCode(code);
    assertVoucherWindow(voucher);

    const normalizedEmail = normalizeEmail(email);
    const assignedEmail = normalizeEmail(voucher.assigned_email);
    if (assignedEmail && assignedEmail !== normalizedEmail) {
      throw voucherError('VOUCHER_CUSTOMER_RESTRICTED', 'This voucher is assigned to a different passenger email address.');
    }

    const usage = await getUsage(voucher.id, normalizedEmail);
    const maxRedemptions = Math.max(1, integerOr(voucher.max_redemptions, 1));
    const maxPerCustomer = Math.max(1, integerOr(voucher.max_redemptions_per_customer, 1));

    if (usage.totalCount >= maxRedemptions) {
      throw voucherError('VOUCHER_EXHAUSTED', 'This voucher has reached its maximum number of uses.');
    }
    if (normalizedEmail && usage.customerCount >= maxPerCustomer) {
      throw voucherError('VOUCHER_ALREADY_USED', 'This passenger has already used this voucher the maximum allowed number of times.');
    }

    const application = calculateVoucherApplication({
      supplierPrice,
      priceBeforeVoucher,
      voucherAmount: voucher.discount_value,
      minimumBookingAmount: voucher.minimum_booking_amount,
      minimumPayablePercent: voucher.minimum_payable_percent,
    });

    if (!application.eligible) {
      throw voucherError(application.code || 'VOUCHER_NOT_ELIGIBLE', application.message || 'This voucher cannot be applied to this booking.');
    }

    return {
      voucherId: voucher.id,
      code: voucher.code,
      discountType: voucher.discount_type || 'fixed',
      configuredDiscount: numberOr(voucher.discount_value),
      assignedEmail: voucher.assigned_email || null,
      usage,
      ...application,
    };
  },

  list: async () => {
    const { data: vouchers, error } = await supabase
      .from('vouchers')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw voucherError('VOUCHER_LIST_FAILED', error.message, 500);

    const { data: redemptions, error: redemptionError } = await supabase
      .from('voucher_redemptions')
      .select('voucher_id, status, discount_amount, final_amount');
    if (redemptionError) throw voucherError('VOUCHER_REDEMPTION_LIST_FAILED', redemptionError.message, 500);

    const usageByVoucher = new Map();
    for (const row of redemptions || []) {
      if (!REDEEMED_STATUSES.includes(String(row.status || '').toUpperCase())) continue;
      const current = usageByVoucher.get(row.voucher_id) || { used: 0, discountUsed: 0, bookingValue: 0 };
      current.used += 1;
      current.discountUsed += numberOr(row.discount_amount);
      current.bookingValue += numberOr(row.final_amount);
      usageByVoucher.set(row.voucher_id, current);
    }

    return (vouchers || []).map((voucher) => ({
      ...voucher,
      usage: usageByVoucher.get(voucher.id) || { used: 0, discountUsed: 0, bookingValue: 0 },
    }));
  },

  create: async (payload = {}, actor = 'admin') => {
    const discountValue = numberOr(payload.discountValue ?? payload.discount_value);
    if (discountValue <= 0) throw voucherError('INVALID_VOUCHER_AMOUNT', 'Voucher amount must be greater than $0.');

    const minimumBookingAmount = Math.max(
      GLOBAL_MINIMUM_BOOKING_AMOUNT,
      numberOr(payload.minimumBookingAmount ?? payload.minimum_booking_amount, GLOBAL_MINIMUM_BOOKING_AMOUNT),
    );
    const minimumPayablePercent = Math.max(
      GLOBAL_MINIMUM_PAYABLE_PERCENT,
      numberOr(payload.minimumPayablePercent ?? payload.minimum_payable_percent, GLOBAL_MINIMUM_PAYABLE_PERCENT),
    );
    const maxRedemptions = Math.max(1, integerOr(payload.maxRedemptions ?? payload.max_redemptions, 1));
    const maxPerCustomer = Math.max(1, integerOr(payload.maxRedemptionsPerCustomer ?? payload.max_redemptions_per_customer, 1));
    const code = await ensureUniqueCode(payload.code, discountValue);

    const row = {
      code,
      discount_type: 'fixed',
      discount_value: discountValue,
      currency: String(payload.currency || 'USD').toUpperCase(),
      minimum_booking_amount: minimumBookingAmount,
      minimum_payable_percent: minimumPayablePercent,
      valid_from: payload.validFrom || payload.valid_from || null,
      valid_until: payload.validUntil || payload.valid_until || null,
      max_redemptions: maxRedemptions,
      max_redemptions_per_customer: maxPerCustomer,
      assigned_email: normalizeEmail(payload.assignedEmail ?? payload.assigned_email) || null,
      active: payload.active !== false,
      notes: String(payload.notes || '').trim() || null,
      created_by: actor || 'admin',
    };

    const { data, error } = await supabase.from('vouchers').insert(row).select().single();
    if (error) {
      if (String(error.code || '') === '23505') throw voucherError('VOUCHER_CODE_EXISTS', 'That voucher code already exists.', 409);
      throw voucherError('VOUCHER_CREATE_FAILED', error.message, 500);
    }
    return data;
  },

  update: async (id, payload = {}) => {
    if (!id) throw voucherError('VOUCHER_ID_REQUIRED', 'Voucher id is required.');
    const patch = {};

    if (payload.discountValue !== undefined || payload.discount_value !== undefined) {
      const value = numberOr(payload.discountValue ?? payload.discount_value);
      if (value <= 0) throw voucherError('INVALID_VOUCHER_AMOUNT', 'Voucher amount must be greater than $0.');
      patch.discount_value = value;
    }
    if (payload.minimumBookingAmount !== undefined || payload.minimum_booking_amount !== undefined) {
      patch.minimum_booking_amount = Math.max(GLOBAL_MINIMUM_BOOKING_AMOUNT, numberOr(payload.minimumBookingAmount ?? payload.minimum_booking_amount));
    }
    if (payload.minimumPayablePercent !== undefined || payload.minimum_payable_percent !== undefined) {
      patch.minimum_payable_percent = Math.max(GLOBAL_MINIMUM_PAYABLE_PERCENT, numberOr(payload.minimumPayablePercent ?? payload.minimum_payable_percent));
    }
    if (payload.maxRedemptions !== undefined || payload.max_redemptions !== undefined) {
      patch.max_redemptions = Math.max(1, integerOr(payload.maxRedemptions ?? payload.max_redemptions, 1));
    }
    if (payload.maxRedemptionsPerCustomer !== undefined || payload.max_redemptions_per_customer !== undefined) {
      patch.max_redemptions_per_customer = Math.max(1, integerOr(payload.maxRedemptionsPerCustomer ?? payload.max_redemptions_per_customer, 1));
    }
    if (payload.assignedEmail !== undefined || payload.assigned_email !== undefined) {
      patch.assigned_email = normalizeEmail(payload.assignedEmail ?? payload.assigned_email) || null;
    }
    if (payload.validFrom !== undefined || payload.valid_from !== undefined) patch.valid_from = payload.validFrom ?? payload.valid_from ?? null;
    if (payload.validUntil !== undefined || payload.valid_until !== undefined) patch.valid_until = payload.validUntil ?? payload.valid_until ?? null;
    if (payload.active !== undefined) patch.active = Boolean(payload.active);
    if (payload.notes !== undefined) patch.notes = String(payload.notes || '').trim() || null;
    patch.updated_at = new Date().toISOString();

    const { data, error } = await supabase.from('vouchers').update(patch).eq('id', id).select().single();
    if (error) throw voucherError('VOUCHER_UPDATE_FAILED', error.message, 500);
    return data;
  },

  redemptions: async (voucherId) => {
    const { data, error } = await supabase
      .from('voucher_redemptions')
      .select('*')
      .eq('voucher_id', voucherId)
      .order('created_at', { ascending: false });
    if (error) throw voucherError('VOUCHER_REDEMPTION_LIST_FAILED', error.message, 500);
    return data || [];
  },

  redeem: async ({ voucherApplication, bookingId, confirmationCode, email }) => {
    if (!voucherApplication?.voucherId || !bookingId) return null;
    const row = {
      voucher_id: voucherApplication.voucherId,
      booking_id: bookingId,
      confirmation_code: confirmationCode || null,
      customer_email: normalizeEmail(email) || null,
      supplier_price: voucherApplication.supplierPrice,
      price_before_voucher: voucherApplication.priceBeforeVoucher,
      discount_amount: voucherApplication.appliedDiscount,
      final_amount: voucherApplication.finalPrice,
      minimum_payable_floor: voucherApplication.minimumPayableFloor,
      status: 'REDEEMED',
      redeemed_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from('voucher_redemptions').insert(row).select().single();
    if (error) {
      if (String(error.code || '') === '23505') return null;
      throw voucherError('VOUCHER_REDEMPTION_FAILED', error.message, 500);
    }
    return data;
  },
};

export default voucherService;
