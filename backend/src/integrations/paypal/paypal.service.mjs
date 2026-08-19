import axios from 'axios';
import env from '../../config/env.mjs';
import logger from '../../config/logger.mjs';

let cachedAccessToken = null;
let tokenExpiryTime = 0;

export const paypalService = {
  getApiBaseUrl: () => {
    const mode = (env.paypalEnv || process.env.PAYPAL_ENV || 'sandbox').toLowerCase();
    return mode === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';
  },

  generatePayPalAccessToken: async () => {
    // Return cached token if valid (with 60-second safety buffer)
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
            'Authorization': `Basic ${auth}`,
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
      const sanitizeMsg = status === 401 
        ? 'PayPal authentication failed. Invalid Client ID or Secret.' 
        : (error.response?.data?.error_description || error.message);
      logger.error(`PayPal OAuth token request failed [${status || 'NETWORK_ERROR'}]: ${sanitizeMsg}`);
      throw new Error(`PayPal authentication error: ${sanitizeMsg}`);
    }
  },

  createOrder: async ({ bookingId, amount, currency = 'USD', idempotencyKey }) => {
    const accessToken = await paypalService.generatePayPalAccessToken();
    const baseUrl = paypalService.getApiBaseUrl();

    const formattedAmount = typeof amount === 'number' ? amount.toFixed(2) : parseFloat(amount).toFixed(2);
    const invoiceId = `TFS-INV-${bookingId.substring(0, 8).toUpperCase()}-${Date.now().toString().slice(-4)}`;

    const payload = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: bookingId,
          custom_id: bookingId,
          invoice_id: invoiceId,
          description: 'Final Seat flight booking',
          amount: {
            currency_code: currency.toUpperCase(),
            value: formattedAmount,
          },
        },
      ],
    };

    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };

    if (idempotencyKey) {
      headers['PayPal-Request-Id'] = idempotencyKey;
    }

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
      throw new Error(`PayPal order creation failed: ${errorDetail}`);
    }
  },

  captureOrder: async ({ paypalOrderId, idempotencyKey }) => {
    const accessToken = await paypalService.generatePayPalAccessToken();
    const baseUrl = paypalService.getApiBaseUrl();

    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };

    if (idempotencyKey) {
      headers['PayPal-Request-Id'] = idempotencyKey;
    }

    try {
      const response = await axios.post(
        `${baseUrl}/v2/checkout/orders/${paypalOrderId}/capture`,
        {},
        {
          headers,
          timeout: 15000,
        }
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
    const accessToken = await paypalService.generatePayPalAccessToken();
    const baseUrl = paypalService.getApiBaseUrl();
    const webhookId = env.paypalWebhookId || process.env.PAYPAL_WEBHOOK_ID;

    if (!webhookId) {
      logger.warn('PAYPAL_WEBHOOK_ID not set. Skipping signature verification (dev fallback).');
      return true;
    }

    let parsedEvent;
    try {
      parsedEvent = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    } catch {
      return false;
    }

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
            'Authorization': `Bearer ${accessToken}`,
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
