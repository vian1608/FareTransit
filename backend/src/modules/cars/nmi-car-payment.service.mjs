import logger from '../../config/logger.mjs';

function paymentError(message, statusCode = 502, code = 'NMI_PAYMENT_ERROR') {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function config() {
  const environment = String(process.env.NMI_ENVIRONMENT || 'sandbox').toLowerCase() === 'production' ? 'production' : 'sandbox';
  const privateApiKey = process.env.NMI_PRIVATE_API_KEY || '';
  const publicTokenizationKey = process.env.NMI_PUBLIC_TOKENIZATION_KEY || '';
  const baseUrl = process.env.NMI_API_BASE_URL || (environment === 'production' ? 'https://secure.nmi.com/api/v5' : 'https://sandbox.nmi.com/api/v5');
  return {
    environment,
    privateApiKey,
    publicTokenizationKey,
    baseUrl: baseUrl.replace(/\/$/, ''),
    configured: Boolean(privateApiKey && publicTokenizationKey)
  };
}

async function post(path, payload) {
  const cfg = config();
  if (!cfg.privateApiKey) throw paymentError('Online card payments are not configured yet.', 503, 'NMI_NOT_CONFIGURED');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${cfg.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: cfg.privateApiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload || {}),
      signal: controller.signal
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      logger.warn(`[NMI-Car] ${path} returned ${response.status}: ${data?.response_text || data?.message || 'payment gateway error'}`);
      throw paymentError(data?.response_text || data?.message || 'The payment gateway rejected the request.', response.status >= 500 ? 502 : 402, 'NMI_REJECTED');
    }
    if (data && data.response !== undefined && String(data.response) !== '1') {
      throw paymentError(data.response_text || 'Payment was not approved.', 402, 'NMI_DECLINED');
    }
    return data || {};
  } catch (error) {
    if (error?.name === 'AbortError') throw paymentError('The payment gateway timed out. Please try again.', 504, 'NMI_TIMEOUT');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function billingAddress(customer = {}, billing = {}) {
  const address = {
    first_name: customer.firstName || '',
    last_name: customer.lastName || '',
    address1: billing.address1 || '',
    address2: billing.address2 || '',
    city: billing.city || '',
    state: billing.state || '',
    zip: billing.postal || '',
    country: billing.country || 'US',
    email: customer.email || '',
    phone: customer.phone || ''
  };
  return Object.fromEntries(Object.entries(address).filter(([, value]) => value !== ''));
}

async function authorize({ paymentToken, amount, currency = 'USD', customer = {}, billing = {}, orderReference }) {
  const token = String(paymentToken || '').trim();
  if (!token) throw paymentError('Payment token is required.', 400, 'PAYMENT_TOKEN_REQUIRED');
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) throw paymentError('Invalid payment amount.', 400, 'INVALID_PAYMENT_AMOUNT');

  const payload = {
    amount: Number(numericAmount.toFixed(2)),
    currency: String(currency || 'USD').toUpperCase(),
    industry: 'ecommerce',
    payment_details: { payment_token: token },
    billing_address: billingAddress(customer, billing),
    order_details: {
      order_id: String(orderReference || '').slice(0, 64),
      order_description: `FareTransit car rental ${String(orderReference || '')}`.slice(0, 255)
    }
  };
  return post('/payments/auth', payload);
}

async function capture({ paymentId, amount }) {
  const id = String(paymentId || '').trim();
  if (!id) throw paymentError('Payment authorization ID is required.', 400, 'PAYMENT_ID_REQUIRED');
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) throw paymentError('Invalid capture amount.', 400, 'INVALID_PAYMENT_AMOUNT');
  return post(`/payments/${encodeURIComponent(id)}/capture`, { amount: Number(numericAmount.toFixed(2)) });
}

async function refund({ paymentId, amount = 0 }) {
  const id = String(paymentId || '').trim();
  if (!id) throw paymentError('Payment ID is required.', 400, 'PAYMENT_ID_REQUIRED');
  const numericAmount = Number(amount || 0);
  if (!Number.isFinite(numericAmount) || numericAmount < 0) throw paymentError('Invalid refund amount.', 400, 'INVALID_PAYMENT_AMOUNT');
  return post(`/payments/${encodeURIComponent(id)}/refund`, { amount: Number(numericAmount.toFixed(2)), payment: 'creditcard' });
}

export const nmiCarPaymentService = {
  config,
  authorize,
  capture,
  refund
};

export default nmiCarPaymentService;
