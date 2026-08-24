import axios from 'axios';
import env from '../../config/env.mjs';
import paypalService from '../../integrations/paypal/paypal.service.mjs';

function safeCurrency(value) {
  const currency = String(value || 'USD').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : 'USD';
}

function makeRequestId(requestId, quoteId) {
  return `addon_${requestId}_${quoteId}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 108);
}

export const addonPayPalService = {
  publicConfig() {
    const clientId = String(env.paypalClientId || '').trim();
    return {
      enabled: Boolean(clientId && env.paypalClientSecret),
      clientId: clientId || null,
      environment: String(env.paypalEnv || 'sandbox').toLowerCase() === 'live' ? 'live' : 'sandbox'
    };
  },

  async createOrder({ request, quote }) {
    const amount = Number(quote?.customer_price);
    if (!Number.isFinite(amount) || amount <= 0) {
      const err = new Error('This baggage offer does not have a valid payable amount.');
      err.status = 400;
      err.code = 'INVALID_ADDON_PAYPAL_AMOUNT';
      throw err;
    }
    const accessToken = await paypalService.generatePayPalAccessToken();
    const baseUrl = paypalService.getApiBaseUrl();
    const currency = safeCurrency(quote.currency || request?.booking?.currency);
    const reference = `ADDON:${request.id}`;
    const bookingRef = request?.booking?.confirmation_code || request?.booking_id || 'booking';
    const response = await axios.post(`${baseUrl}/v2/checkout/orders`, {
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: reference,
        custom_id: reference,
        invoice_id: `BAG-${String(request.id).replace(/-/g, '').slice(0, 16)}`,
        description: `Checked baggage add-on for ${bookingRef}`.slice(0, 127),
        amount: { currency_code: currency, value: amount.toFixed(2) }
      }]
    }, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': makeRequestId(request.id, quote.id) },
      timeout: 15000
    });
    return response.data;
  },

  async captureOrder(paypalOrderId) {
    return paypalService.captureOrder({ paypalOrderId, idempotencyKey: `addon_capture_${paypalOrderId}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 108) });
  },

  async getOrder(paypalOrderId) {
    return paypalService.getOrder(paypalOrderId);
  }
};

export default addonPayPalService;
