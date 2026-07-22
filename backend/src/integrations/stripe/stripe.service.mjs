import { stripeRequest, isStripeMockMode } from './stripe.client.mjs';
import logger from '../../config/logger.mjs';

export const stripeService = {
  createCheckoutSession: async ({ type, email, amount, metadata, successUrl, cancelUrl, lineItemName, lineItemDescription }) => {
    if (isStripeMockMode()) {
      const mockSessionId = 'mock_session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
      logger.info('Stripe mock mode enabled. Generating mock session ID:', mockSessionId);
      
      // Inject checkout success redirect directly
      const delimiter = successUrl.includes('?') ? '&' : '?';
      const redirectUrl = successUrl.replace('{CHECKOUT_SESSION_ID}', mockSessionId) + delimiter + `session_id=${mockSessionId}`;
      
      return {
        success: true,
        url: redirectUrl,
        id: mockSessionId
      };
    }

    const params = {};
    params['payment_method_types[0]'] = 'card';
    params['mode'] = 'payment';
    params['customer_email'] = email;
    params['success_url'] = successUrl;
    params['cancel_url'] = cancelUrl;

    params['line_items[0][price_data][currency]'] = 'usd';
    params['line_items[0][price_data][product_data][name]'] = lineItemName;
    if (lineItemDescription) {
      params['line_items[0][price_data][product_data][description]'] = lineItemDescription;
    }
    params['line_items[0][price_data][unit_amount]'] = Math.round(amount * 100).toString();
    params['line_items[0][quantity]'] = '1';

    // Metadata mapping
    if (metadata) {
      Object.keys(metadata).forEach(key => {
        params[`metadata[${key}]`] = String(metadata[key] || '');
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
    if (sessionId.startsWith('mock_session_')) {
      return {
        success: true,
        status: 'paid',
        customer_email: 'test@example.com',
        amount_total: 150.00,
        metadata: { type: 'booking' }
      };
    }

    try {
      const session = await stripeRequest('get', `/checkout/sessions/${sessionId}`);
      return {
        success: true,
        status: session.payment_status,
        customer_email: session.customer_details?.email || session.customer_email,
        amount_total: session.amount_total / 100, // convert from cents
        metadata: session.metadata
      };
    } catch (error) {
      logger.error(`Stripe session retrieval failed for ${sessionId}:`, error.message);
      throw error;
    }
  }
};

export default stripeService;
