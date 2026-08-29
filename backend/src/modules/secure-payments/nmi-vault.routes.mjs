import axios from 'axios';
import express from 'express';
import supabase from '../../integrations/supabase/supabase.client.mjs';

const router = express.Router();

const SENSITIVE_KEYS = new Set([
  'cardnumber', 'card_number', 'fullcardnumber', 'full_card_number', 'pan', 'fullpan',
  'cvv', 'cvc', 'securitycode', 'security_code', 'cardsecuritycode', 'card_security_code',
  'trackdata', 'track_data', 'pin', 'cardpin', 'card_pin',
]);

const safeText = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const normalizeKey = key => String(key || '').replace(/[^a-z0-9_]/gi, '').toLowerCase();

function rejectRawCardData(value, depth = 0) {
  if (depth > 12 || value == null) return;
  if (Array.isArray(value)) {
    value.forEach(item => rejectRawCardData(item, depth + 1));
    return;
  }
  if (typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(normalizeKey(key))) {
      const error = new Error('FareTransit does not accept raw card numbers or security codes. Use the NMI payment token.');
      error.status = 400;
      error.code = 'SENSITIVE_CARD_DATA_NOT_ACCEPTED';
      throw error;
    }
    rejectRawCardData(child, depth + 1);
  }
}

function nmiConfig() {
  const environment = safeText(process.env.NMI_ENVIRONMENT || 'sandbox', 20).toLowerCase();
  const defaultBase = environment === 'production'
    ? 'https://secure.nmi.com/api/v5'
    : 'https://sandbox.nmi.com/api/v5';
  return {
    environment,
    baseUrl: safeText(process.env.NMI_API_BASE_URL || defaultBase, 300).replace(/\/$/, ''),
    privateApiKey: safeText(process.env.NMI_PRIVATE_API_KEY || '', 500),
  };
}

function splitName(fullName) {
  const parts = safeText(fullName, 200).split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] || 'Traveler', lastName: parts[0] || 'Traveler' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

async function fetchBooking({ bookingId, bookingCode, customerEmail }) {
  let query = supabase
    .from('bookings')
    .select('id, confirmation_code, email, payment_status, status, client_request_id, idempotency_key');

  if (bookingId) query = query.eq('id', bookingId);
  else if (bookingCode) query = query.eq('confirmation_code', bookingCode);
  else {
    const error = new Error('Booking ID or confirmation code is required.');
    error.status = 400;
    error.code = 'BOOKING_REFERENCE_REQUIRED';
    throw error;
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) {
    const notFound = new Error('Booking not found.');
    notFound.status = 404;
    notFound.code = 'BOOKING_NOT_FOUND';
    throw notFound;
  }

  if (bookingCode && safeText(data.confirmation_code).toLowerCase() !== safeText(bookingCode).toLowerCase()) {
    const mismatch = new Error('Booking reference mismatch.');
    mismatch.status = 409;
    mismatch.code = 'BOOKING_REFERENCE_MISMATCH';
    throw mismatch;
  }

  if (customerEmail && data.email && safeText(data.email).toLowerCase() !== safeText(customerEmail).toLowerCase()) {
    const mismatch = new Error('Booking email does not match the reservation.');
    mismatch.status = 403;
    mismatch.code = 'BOOKING_EMAIL_MISMATCH';
    throw mismatch;
  }

  return data;
}

async function saveVaultReference({ booking, vaultId, paymentMethodId, cardholderName, cardBrand, last4, expMonth, expYear, customerEmail, customerPhone, billingAddress }) {
  const normalizedLast4 = String(last4 || '').replace(/\D/g, '');
  const method = {
    booking_id: booking.id,
    payment_provider: 'nmi',
    provider_customer_id: safeText(vaultId, 255),
    provider_payment_method_id: safeText(paymentMethodId || vaultId, 255),
    cardholder_name: safeText(cardholderName, 255) || null,
    card_brand: safeText(cardBrand, 60) || null,
    card_last4: /^\d{4}$/.test(normalizedLast4) ? normalizedLast4 : null,
    card_exp_month: Number(expMonth) >= 1 && Number(expMonth) <= 12 ? Number(expMonth) : null,
    card_exp_year: Number(expYear) >= new Date().getFullYear() ? Number(expYear) : null,
    billing_email: safeText(customerEmail, 255) || null,
    billing_phone: safeText(customerPhone, 80) || null,
    billing_address_line1: safeText(billingAddress?.line1, 300) || null,
    billing_address_line2: safeText(billingAddress?.line2, 300) || null,
    billing_city: safeText(billingAddress?.city, 120) || null,
    billing_state: safeText(billingAddress?.region, 120) || null,
    billing_postal_code: safeText(billingAddress?.postalCode, 40) || null,
    billing_country: safeText(billingAddress?.country, 120) || null,
    tokenization_status: 'TOKENIZED',
    removed_at: null,
    updated_at: new Date().toISOString(),
  };

  const { data: existing, error: existingError } = await supabase
    .from('booking_payment_methods')
    .select('id')
    .eq('booking_id', booking.id)
    .is('removed_at', null)
    .maybeSingle();
  if (existingError) throw existingError;

  let persisted;
  if (existing?.id) {
    const { data, error } = await supabase
      .from('booking_payment_methods')
      .update(method)
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw error;
    persisted = data;
  } else {
    const { data, error } = await supabase
      .from('booking_payment_methods')
      .insert(method)
      .select('*')
      .single();
    if (error) throw error;
    persisted = data;
  }

  const { error: bookingUpdateError } = await supabase
    .from('bookings')
    .update({ payment_status: 'PENDING', updated_at: new Date().toISOString() })
    .eq('id', booking.id);
  if (bookingUpdateError) throw bookingUpdateError;

  return persisted;
}

router.get('/config', (req, res) => {
  const config = nmiConfig();
  res.json({
    success: true,
    data: {
      provider: 'nmi',
      environment: config.environment,
      configured: Boolean(config.privateApiKey),
      mode: 'customer_vault_only',
      authorizationPerformed: false,
      capturePerformed: false,
    },
  });
});

router.post('/attach', async (req, res, next) => {
  try {
    rejectRawCardData(req.body);
    const {
      bookingId,
      bookingCode,
      customerEmail,
      customerName,
      customerPhone,
      cardholderName,
      billingAddress = {},
      paymentToken,
      cardBrand,
      last4,
      expMonth,
      expYear,
    } = req.body || {};

    const token = safeText(paymentToken, 500);
    if (!token) {
      return res.status(400).json({ success: false, error: { code: 'NMI_PAYMENT_TOKEN_REQUIRED', message: 'Secure payment token is required.' } });
    }

    const config = nmiConfig();
    if (!config.privateApiKey) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'NMI_NOT_CONFIGURED',
          message: 'NMI Customer Vault is not configured on the FareTransit backend. Add NMI_PRIVATE_API_KEY before accepting card details.',
        },
      });
    }

    const booking = await fetchBooking({ bookingId, bookingCode, customerEmail });
    const name = splitName(cardholderName || customerName);

    const payload = {
      payment_details: { payment_token: token },
      billing_address: {
        first_name: name.firstName,
        last_name: name.lastName,
        email: safeText(customerEmail || booking.email, 255),
        phone: safeText(customerPhone, 80) || undefined,
        address1: safeText(billingAddress?.line1, 300) || undefined,
        address2: safeText(billingAddress?.line2, 300) || undefined,
        city: safeText(billingAddress?.city, 120) || undefined,
        state: safeText(billingAddress?.region, 120) || undefined,
        zip: safeText(billingAddress?.postalCode, 40) || undefined,
        country: safeText(billingAddress?.country, 120) || undefined,
      },
    };

    const response = await axios.post(`${config.baseUrl}/customers`, payload, {
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        Authorization: config.privateApiKey,
      },
    });

    const vaultId = safeText(response?.data?.id, 255);
    if (!vaultId) {
      const error = new Error(response?.data?.response_text || 'NMI did not return a Customer Vault ID.');
      error.status = 502;
      error.code = 'NMI_VAULT_CREATE_FAILED';
      throw error;
    }

    const paymentMethodId = response?.data?.billing?.id
      || response?.data?.billing_address?.id
      || response?.data?.payment_details?.id
      || vaultId;

    const persisted = await saveVaultReference({
      booking,
      vaultId,
      paymentMethodId,
      cardholderName: cardholderName || customerName,
      cardBrand,
      last4,
      expMonth,
      expYear,
      customerEmail: customerEmail || booking.email,
      customerPhone,
      billingAddress,
    });

    return res.status(201).json({
      success: true,
      data: {
        status: 'PAYMENT_METHOD_SAVED',
        provider: 'nmi',
        customerVaultId: vaultId,
        paymentMethodId: safeText(paymentMethodId, 255),
        cardBrand: persisted?.card_brand || null,
        last4: persisted?.card_last4 || null,
        expMonth: persisted?.card_exp_month || null,
        expYear: persisted?.card_exp_year || null,
        authorizationPerformed: false,
        capturePerformed: false,
      },
    });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const providerMessage = error?.response?.data?.response_text
        || error?.response?.data?.message
        || error?.response?.data?.error
        || 'NMI Customer Vault rejected the payment method.';
      error.status = error?.response?.status >= 400 && error?.response?.status < 500 ? 400 : 502;
      error.code = 'NMI_VAULT_REQUEST_FAILED';
      error.message = typeof providerMessage === 'string' ? providerMessage : 'NMI Customer Vault request failed.';
    }
    next(error);
  }
});

export { router as nmiVaultRouter };
export default router;
