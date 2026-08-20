import { stripeRequest, isStripeMockMode } from './stripe.client.mjs';
import logger from '../../config/logger.mjs';

export const stripeService = {
  createCheckoutSession: async ({ type, email, amount, currency = 'USD', metadata, successUrl, cancelUrl, lineItemName, lineItemDescription }) => {
    if (isStripeMockMode()) {
      const mockSessionId = 'mock_session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
      logger.info('Stripe mock mode enabled. Generating mock session ID:', mockSessionId);

      const redirectUrl = successUrl.replace('{CHECKOUT_SESSION_ID}', mockSessionId);
      return {
        success: true,
        url: redirectUrl,
        id: mockSessionId
      };
    }

    const normalizedCurrency = String(currency || 'USD').trim().toLowerCase();
    if (!/^[a-z]{3}$/.test(normalizedCurrency)) {
      throw new Error('Invalid Stripe checkout currency.');
    }

    const normalizedAmount = Number(amount);
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      throw new Error('Invalid Stripe checkout amount.');
    }

    const params = {};
    params['payment_method_types[0]'] = 'card';
    params.mode = 'payment';
    params.customer_email = email;
    params.success_url = successUrl;
    params.cancel_url = cancelUrl;

    params['line_items[0][price_data][currency]'] = normalizedCurrency;
    params['line_items[0][price_data][product_data][name]'] = lineItemName;
    if (lineItemDescription) {
      params['line_items[0][price_data][product_data][description]'] = lineItemDescription;
    }
    params['line_items[0][price_data][unit_amount]'] = Math.round(normalizedAmount * 100).toString();
    params['line_items[0][quantity]'] = '1';

    if (metadata) {
      Object.keys(metadata).forEach((key) => {
        params[`metadata[${key}]`] = String(metadata[key] ?? '').substring(0, 500);
      });
    }

    try {
      const session = await stripeRequest('post', '/checkout/sessions', params);
      return {
        success: true,
        url: session.url,
        id: session.id
      };
    } catch (error) {
      logger.error('Stripe Checkout session creation failed:', error.message);
      throw error;
    }
  },

  getSessionStatus: async (sessionId) => {
    const normalizedSessionId = String(sessionId || '').trim();
    if (!normalizedSessionId) throw new Error('Stripe session ID is required.');

    if (normalizedSessionId.startsWith('mock_session_')) {
      return {
        success: true,
        status: 'paid',
        customer_email: 'test@example.com',
        amount_total: 150.00,
        metadata: { type: 'booking' }
      };
    }

    try {
      const session = await stripeRequest('get', `/checkout/sessions/${encodeURIComponent(normalizedSessionId)}`);
      return {
        success: true,
        status: session.payment_status,
        customer_email: session.customer_details?.email || session.customer_email,
        amount_total: Number(session.amount_total || 0) / 100,
        currency: String(session.currency || '').toUpperCase() || null,
        metadata: session.metadata || {}
      };
    } catch (error) {
      logger.error(`Stripe session retrieval failed for ${normalizedSessionId}:`, error.message);
      throw error;
    }
  }
};

export default stripeService;
