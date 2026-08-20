import axios from 'axios';
import env from '../../config/env.mjs';
import logger from '../../config/logger.mjs';

let cachedAccessToken = null;
let tokenExpiryTime = 0;

function isProductionDeployment() {
  const vercelEnv = String(process.env.VERCEL_ENV || '').toLowerCase();
  if (vercelEnv) return vercelEnv === 'production';
  return String(process.env.NODE_ENV || 'development').toLowerCase() === 'production';
}

export const paypalService = {
  getApiBaseUrl: () => {
    const mode = (env.paypalEnv || process.env.PAYPAL_ENV || 'sandbox').toLowerCase();
    return mode === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';
  },

  generatePayPalAccessToken: async () => {
    if (cachedAccessToken && Date.now() < tokenExpiryTime - 60000) {
      return cachedAccessToken;
    }

    const clientId = env.paypalClientId || process.env.PAYPAL_CLIENT_ID;
    const clientSecret = env.paypalClientSecret || process.env.PAYPAL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('PayPal API credentials (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET) are not configured.');
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const baseUrl = paypalService.getApiBaseUrl();

    try {
      const response = await axios.post(
        `${baseUrl}/v1/oauth2/token`,
        'grant_type=client_credentials',
        {
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 10000,
        }
      );

      const { access_token, expires_in } = response.data;
      cachedAccessToken = access_token;
      tokenExpiryTime = Date.now() + (expires_in || 3600) * 1000;
      return cachedAccessToken;
    } catch (error) {
      const status = error.response?.status;
      const safeMessage = status === 401
        ? 'PayPal authentication failed. Invalid Client ID or Secret.'
        : (error.response?.data?.error_description || error.message);
      logger.error(`PayPal OAuth token request failed [${status || 'NETWORK_ERROR'}]: ${safeMessage}`);
      throw new Error(`PayPal authentication error: ${safeMessage}`);
    }
  },

  createOrder: async ({ bookingId, amount, currency = 'USD', idempotencyKey }) => {
    const accessToken = await paypalService.generatePayPalAccessToken();
    const baseUrl = paypalService.getApiBaseUrl();

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      throw new Error('Invalid PayPal order amount.');
    }
    const normalizedCurrency = String(currency || 'USD').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
      throw new Error('Invalid PayPal order currency.');
    }

    const formattedAmount = numericAmount.toFixed(2);
    const bookingFragment = String(bookingId || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 12).toUpperCase() || 'BOOKING';
    const invoiceSuffix = String(idempotencyKey || Date.now()).replace(/[^A-Za-z0-9]/g, '').slice(-12).toUpperCase();
    const invoiceId = `FT-INV-${bookingFragment}-${invoiceSuffix}`.slice(0, 127);

    const payload = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: bookingId,
          custom_id: bookingId,
          invoice_id: invoiceId,
          description: 'FareTransit flight booking',
          amount: {
            currency_code: normalizedCurrency,
            value: formattedAmount,
          },
        },
      ],
    };

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
    if (idempotencyKey) headers['PayPal-Request-Id'] = idempotencyKey;

    try {
      const response = await axios.post(`${baseUrl}/v2/checkout/orders`, payload, {
        headers,
        timeout: 15000,
      });
      return response.data;
    } catch (error) {
      const status = error.response?.status;
      const errorDetail = error.response?.data?.details?.[0]?.description || error.response?.data?.message || error.message;
      logger.error(`PayPal Create Order failed [${status || 'ERROR'}]: ${errorDetail}`);
      const wrapped = new Error(`PayPal order creation failed: ${errorDetail}`);
      wrapped.status = status || 502;
      wrapped.issue = error.response?.data?.details?.[0]?.issue || error.response?.data?.name || 'ORDER_CREATE_FAILED';
      throw wrapped;
    }
  },

  captureOrder: async ({ paypalOrderId, idempotencyKey }) => {
    const accessToken = await paypalService.generatePayPalAccessToken();
    const baseUrl = paypalService.getApiBaseUrl();

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
    if (idempotencyKey) headers['PayPal-Request-Id'] = idempotencyKey;

    try {
      const response = await axios.post(
        `${baseUrl}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`,
        {},
        { headers, timeout: 15000 }
      );
      return response.data;
    } catch (error) {
      const status = error.response?.status;
      const errorData = error.response?.data;
      const issue = errorData?.details?.[0]?.issue || errorData?.name || 'CAPTURE_FAILED';
      const description = errorData?.details?.[0]?.description || errorData?.message || error.message;
      logger.error(`PayPal Capture Order failed [${status || 'ERROR'}] [${issue}]: ${description}`);

      const errObj = new Error(description);
      errObj.status = status || 500;
      errObj.issue = issue;
      throw errObj;
    }
  },

  verifyWebhookSignature: async ({ headers, rawBody }) => {
    const webhookId = env.paypalWebhookId || process.env.PAYPAL_WEBHOOK_ID;

    // Never accept unverifiable provider callbacks in production.
    if (!webhookId) {
      if (isProductionDeployment()) {
        logger.error('PAYPAL_WEBHOOK_ID is missing in production; rejecting PayPal webhook.');
        return false;
      }
      logger.warn('PAYPAL_WEBHOOK_ID not set; allowing webhook verification bypass outside production only.');
      return true;
    }

    const accessToken = await paypalService.generatePayPalAccessToken();
    const baseUrl = paypalService.getApiBaseUrl();

    let parsedEvent;
    try {
      parsedEvent = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    } catch {
      return false;
    }

    const requiredHeaders = [
      'paypal-transmission-id',
      'paypal-transmission-time',
      'paypal-cert-url',
      'paypal-auth-algo',
      'paypal-transmission-sig'
    ];
    if (requiredHeaders.some((name) => !headers?.[name])) return false;

    const payload = {
      transmission_id: headers['paypal-transmission-id'],
      transmission_time: headers['paypal-transmission-time'],
      cert_url: headers['paypal-cert-url'],
      auth_algo: headers['paypal-auth-algo'],
      transmission_sig: headers['paypal-transmission-sig'],
      webhook_id: webhookId,
      webhook_event: parsedEvent,
    };

    try {
      const response = await axios.post(
        `${baseUrl}/v1/notifications/verify-webhook-signature`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );
      return response.data?.verification_status === 'SUCCESS';
    } catch (error) {
      logger.error(`PayPal webhook signature verification failed: ${error.message}`);
      return false;
    }
  }
};

export default paypalService;
