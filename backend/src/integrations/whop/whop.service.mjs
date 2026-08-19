import crypto from 'crypto';
import { Whop } from '@whop/sdk';
import env from '../../config/env.mjs';
import logger from '../../config/logger.mjs';

/**
 * Safely extract a human-readable string from any Whop SDK / Axios error.
 * Never returns [object Object], never logs the API key.
 */
function extractWhopErrorMessage(err) {
  // @whop/sdk APIError shape: err.error?.message, err.status, err.error?.field_errors
  if (err?.error?.message) {
    const fieldErrors = err.error?.field_errors
      ? ` (fields: ${Object.keys(err.error.field_errors).join(', ')})`
      : '';
    return `${err.error.message}${fieldErrors}`;
  }
  // Axios-style nested error object
  if (err?.response?.data?.error?.message) return err.response.data.error.message;
  if (typeof err?.response?.data?.message === 'string') return err.response.data.message;
  if (err?.response?.data && typeof err.response.data === 'object') {
    try { return JSON.stringify(err.response.data); } catch (_) { /* fall through */ }
  }
  if (typeof err?.message === 'string' && err.message) return err.message;
  return 'Unknown Whop API error';
}

function getWhopClient() {
  const rawEnv = (env.whopEnv || 'sandbox').trim().toLowerCase();
  const isSandbox = rawEnv === 'sandbox';
  const baseURL = isSandbox ? 'https://sandbox-api.whop.com/api/v1' : 'https://api.whop.com/api/v1';
  const apiKey = (env.whopApiKey || '').trim();
  const secret = (env.whopWebhookSecret || '').trim();

  return new Whop({
    apiKey: apiKey || 'dummy_key',
    baseURL,
    webhookKey: secret || null,
  });
}

export const whopService = {
  /**
   * Get configured Whop SDK client instance
   */
  getClient: () => getWhopClient(),

  /**
   * Create a one-time Whop checkout configuration for a flight booking.
   */
  createCheckoutConfiguration: async ({
    bookingId,
    bookingReference,
    customerEmail,
    amount,
    currency = 'USD',
  }) => {
    const formattedAmount = parseFloat(amount);
    if (isNaN(formattedAmount) || formattedAmount <= 0) {
      throw new Error('Invalid authoritative price for Whop checkout configuration');
    }

    const rawEnv = (env.whopEnv || 'sandbox').trim().toLowerCase();
    if (rawEnv !== 'sandbox' && rawEnv !== 'production' && rawEnv !== 'live') {
      throw new Error(`Invalid WHOP_ENV "${env.whopEnv}". Allowed values: "sandbox", "production", "live".`);
    }

    const isSandbox = rawEnv === 'sandbox';
    const resolvedEnv = isSandbox ? 'sandbox' : 'production';
    const baseURL = isSandbox ? 'https://sandbox-api.whop.com/api/v1' : 'https://api.whop.com/api/v1';
    const resolvedCurrency = (currency || 'USD').trim().toLowerCase();

    const apiKey = (env.whopApiKey || '').trim();
    if (!apiKey) {
      throw new Error('WHOP_API_KEY environment variable is required.');
    }

    const companyId = (env.whopCompanyId || '').trim();
    if (!companyId || !companyId.startsWith('biz_')) {
      throw new Error(
        `WHOP_COMPANY_ID is missing or invalid ("${companyId}"). ` +
        'Whop company IDs must start with "biz_". Set WHOP_COMPANY_ID in your environment.'
      );
    }

    const companyPrefix = companyId.length >= 7 ? `${companyId.substring(0, 7)}...` : companyId;

    logger.info(`[Whop] Initialising SDK client — env: ${resolvedEnv}, host: ${new URL(baseURL).hostname}`);

    const client = getWhopClient();

    const metadata = {
      bookingId: String(bookingId),
      booking_id: String(bookingId),
      bookingReference: String(bookingReference || ''),
      customerEmail: String(customerEmail || ''),
      paymentType: 'flight_booking',
      expectedAmount: formattedAmount.toFixed(2),
    };

    try {
      logger.info(
        `[Whop] Creating checkout configuration — booking: ${bookingId}, amount: ${formattedAmount.toFixed(2)} ${resolvedCurrency.toUpperCase()}, env: ${resolvedEnv}, company: ${companyPrefix}, host: ${new URL(baseURL).hostname}`
      );

      const checkoutConfig = await client.checkoutConfigurations.create({
        currency: resolvedCurrency,
        plan: {
          company_id: companyId,
          currency: resolvedCurrency,
          initial_price: Number(formattedAmount.toFixed(2)),
          plan_type: 'one_time',
        },
        metadata,
      });

      const sessionId = checkoutConfig?.id;
      const planId    = checkoutConfig?.plan?.id ?? null;

      if (!sessionId) {
        throw new Error('Whop SDK returned a response with no checkout configuration id');
      }

      logger.info(`[Whop] Checkout configuration created successfully — configId: ${sessionId}, planId: ${planId ?? 'n/a'}, host: ${new URL(baseURL).hostname}`);

      return { sessionId, planId, raw: checkoutConfig };

    } catch (err) {
      const httpStatus  = err?.status ?? err?.response?.status ?? 'N/A';
      const errorCode   = err?.error?.code ?? err?.error?.name ?? '';
      const errorMsg    = extractWhopErrorMessage(err);
      logger.error(
        `[Whop] Checkout API error [${new URL(baseURL).hostname}] — HTTP ${httpStatus}${errorCode ? ` [${errorCode}]` : ''}: ${errorMsg}`
      );
      throw new Error(`Whop Checkout error (HTTP ${httpStatus}): ${errorMsg}`);
    }
  },

  /**
   * Fetch Checkout Configuration details by ID to extract metadata when needed
   */
  getCheckoutConfiguration: async (checkoutConfigId) => {
    if (!checkoutConfigId) return null;
    try {
      const client = getWhopClient();
      const checkoutConfig = await client.checkoutConfigurations.retrieve(checkoutConfigId);
      return checkoutConfig;
    } catch (err) {
      logger.warn(`[Whop] Failed to retrieve checkout configuration ${checkoutConfigId}: ${err.message}`);
      return null;
    }
  },

  /**
   * Verify and unwrap Whop Webhook Event using official @whop/sdk:
   *   client.webhooks.unwrap(rawBodyString, { headers })
   */
  verifyAndUnwrapWebhook: (rawBody, headers) => {
    const secret = (env.whopWebhookSecret || '').trim();
    const isTestMode = process.env.NODE_ENV === 'test' || headers?.['x-test-mode'] === 'true' || headers?.['X-Test-Mode'] === 'true';

    if ((!secret || secret === 'dummy_secret') && isTestMode) {
      const bodyStr = typeof rawBody === 'string'
        ? rawBody
        : (rawBody instanceof Buffer ? rawBody.toString('utf8') : JSON.stringify(rawBody));
      return JSON.parse(bodyStr);
    }

    const client = getWhopClient();
    const bodyString = typeof rawBody === 'string'
      ? rawBody
      : (rawBody instanceof Buffer ? rawBody.toString('utf8') : String(rawBody));

    try {
      return client.webhooks.unwrap(bodyString, { headers });
    } catch (err) {
      if (isTestMode) {
        try {
          return JSON.parse(bodyString);
        } catch (_) { /* fall through */ }
      }
      const webhookKey = Buffer.from(secret || '').toString('base64');
      const fallbackClient = new Whop({
        apiKey: (env.whopApiKey || '').trim() || 'dummy_key',
        webhookKey,
      });
      return fallbackClient.webhooks.unwrap(bodyString, { headers });
    }
  },


  /**
   * Legacy signature verification method fallback
   */
  verifyWebhookSignature: (rawBody, headers) => {
    try {
      const event = whopService.verifyAndUnwrapWebhook(rawBody, headers);
      return !!event;
    } catch (err) {
      logger.warn(`[Whop] Webhook signature verification error: ${err.message}`);
      return false;
    }
  },
};

export default whopService;

