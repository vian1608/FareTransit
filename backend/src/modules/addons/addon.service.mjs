import addonRepository from './addon.repository.mjs';
import { sendBaggageOfferEmail, sendBaggageConfirmedEmail } from './addon-email.service.mjs';
import addonPayPalService from './addon-paypal.service.mjs';

const REQUEST_STATUSES = new Set([
  'REQUESTED', 'CHECKING_AVAILABILITY', 'AVAILABLE', 'PRICE_CONFIRMED',
  'OFFER_SENT', 'AWAITING_PAYMENT', 'PAID', 'PURCHASE_PENDING', 'CONFIRMED',
  'UNAVAILABLE', 'DECLINED_BY_CUSTOMER', 'PRICE_EXPIRED', 'PAYMENT_FAILED',
  'PURCHASE_FAILED', 'REFUNDED', 'CANCELLED'
]);

function assertStatus(status) {
  const normalized = String(status || '').trim().toUpperCase();
  if (!REQUEST_STATUSES.has(normalized)) {
    const err = new Error(`Invalid baggage status '${status}'.`);
    err.status = 400;
    err.code = 'INVALID_ADDON_STATUS';
    throw err;
  }
  return normalized;
}

function price(value, field) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    const err = new Error(`${field} must be a valid non-negative amount.`);
    err.status = 400;
    err.code = 'INVALID_ADDON_PRICE';
    throw err;
  }
  return Number(parsed.toFixed(2));
}

function latestQuote(request) {
  const quotes = Array.isArray(request?.quotes) ? request.quotes : [];
  return quotes.slice().sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))[0] || null;
}

function publicRequest(request) {
  if (!request) return null;
  return {
    id: request.id,
    booking_id: request.booking_id,
    addon_type: request.addon_type,
    journey_direction: request.journey_direction,
    quantity: request.quantity,
    requested_weight_kg: request.requested_weight_kg,
    status: request.status,
    traveller: request.traveller ? {
      id: request.traveller.id,
      first_name: request.traveller.first_name,
      middle_name: request.traveller.middle_name,
      last_name: request.traveller.last_name
    } : null,
    booking: request.booking ? {
      id: request.booking.id,
      confirmation_code: request.booking.confirmation_code,
      currency: request.booking.currency
    } : null
  };
}

function publicOffer(quote) {
  if (!quote) return null;
  return {
    id: quote.id,
    public_token: quote.public_token,
    customer_price: quote.customer_price,
    currency: quote.currency,
    valid_until: quote.valid_until,
    status: quote.status,
    request: publicRequest(quote.request)
  };
}

function publicBookingRequest(request) {
  const quote = latestQuote(request);
  const payments = Array.isArray(request?.payments) ? request.payments : [];
  const payment = payments.slice().sort((a,b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0] || null;
  const fulfillments = Array.isArray(request?.fulfillments) ? request.fulfillments : [];
  const fulfillment = fulfillments.slice().sort((a,b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))[0] || null;
  return {
    ...publicRequest(request),
    quote: quote ? {
      id: quote.id,
      customer_price: quote.customer_price,
      currency: quote.currency,
      valid_until: quote.valid_until,
      public_token: quote.public_token,
      status: quote.status
    } : null,
    payment_status: payment?.status || null,
    fulfillment: fulfillment ? {
      status: fulfillment.status,
      supplier_reference: fulfillment.supplier_reference || null,
      confirmed_at: fulfillment.confirmed_at || null
    } : null
  };
}

export const addonService = {
  async createForBooking(bookingId, travellers, rawRequests) {
    return addonRepository.upsertBookingRequests(bookingId, travellers, rawRequests);
  },

  async attachToBooking(booking) {
    if (!booking?.id) return booking;
    const addonRequests = (await addonRepository.listByBookingId(booking.id)).map(publicBookingRequest);
    return { ...booking, addonRequests, addon_requests: addonRequests };
  },

  async attachToBookings(bookings = []) {
    if (!Array.isArray(bookings) || bookings.length === 0) return bookings || [];
    const requests = await addonRepository.listByBookingIds(bookings.map((b) => b?.id));
    const byBooking = new Map();
    for (const request of requests) {
      if (!byBooking.has(request.booking_id)) byBooking.set(request.booking_id, []);
      byBooking.get(request.booking_id).push(publicBookingRequest(request));
    }
    return bookings.map((booking) => {
      const addonRequests = byBooking.get(booking?.id) || [];
      return { ...booking, addonRequests, addon_requests: addonRequests };
    });
  },

  async listAdminByBookingId(bookingId) {
    return addonRepository.listByBookingId(bookingId);
  },

  async quoteRequest(requestId, input = {}) {
    const supplierCost = price(input.supplierCost, 'Supplier cost');
    const customerPrice = price(input.customerPrice, 'Customer price');
    if (customerPrice < supplierCost) {
      const err = new Error('Customer price cannot be lower than supplier cost.');
      err.status = 400;
      err.code = 'ADDON_MARGIN_NEGATIVE';
      throw err;
    }

    const request = await addonRepository.getRequest(requestId);
    if (!request) {
      const err = new Error('Baggage request not found.');
      err.status = 404;
      err.code = 'ADDON_REQUEST_NOT_FOUND';
      throw err;
    }

    await addonRepository.upsertQuote(requestId, {
      supplierCost,
      customerPrice,
      currency: input.currency || request.booking?.currency || 'USD',
      validUntil: input.validUntil || null
    });
    return addonRepository.updateRequestStatus(requestId, 'PRICE_CONFIRMED');
  },

  async sendOffer(requestId) {
    const request = await addonRepository.getRequest(requestId);
    if (!request) {
      const err = new Error('Baggage request not found.');
      err.status = 404;
      err.code = 'ADDON_REQUEST_NOT_FOUND';
      throw err;
    }
    const quote = latestQuote(request);
    if (!quote || quote.status !== 'ACTIVE') {
      const err = new Error('Create an active baggage quote before sending the offer.');
      err.status = 409;
      err.code = 'ADDON_QUOTE_REQUIRED';
      throw err;
    }
    if (quote.valid_until && new Date(quote.valid_until).getTime() <= Date.now()) {
      await addonRepository.updateQuoteStatus(quote.id, 'EXPIRED');
      await addonRepository.updateRequestStatus(requestId, 'PRICE_EXPIRED');
      const err = new Error('This baggage quote has expired. Create a fresh quote before sending it.');
      err.status = 409;
      err.code = 'ADDON_QUOTE_EXPIRED';
      throw err;
    }

    const email = await sendBaggageOfferEmail(request, quote);
    const updated = await addonRepository.updateRequestStatus(requestId, 'AWAITING_PAYMENT');
    return { ...updated, offerDelivery: email };
  },

  async updateStatus(requestId, status) {
    return addonRepository.updateRequestStatus(requestId, assertStatus(status));
  },

  async recordPayment(requestId, input = {}) {
    const request = await addonRepository.getRequest(requestId);
    if (!request) {
      const err = new Error('Baggage request not found.');
      err.status = 404;
      err.code = 'ADDON_REQUEST_NOT_FOUND';
      throw err;
    }
    const quote = latestQuote(request);
    const amount = price(input.amount ?? quote?.customer_price, 'Payment amount');
    if (quote?.valid_until && new Date(quote.valid_until).getTime() <= Date.now()) {
      const err = new Error('The baggage quote has expired and cannot be paid.');
      err.status = 409;
      err.code = 'ADDON_QUOTE_EXPIRED';
      throw err;
    }
    if (quote && Math.abs(Number(quote.customer_price) - amount) > 0.01) {
      const err = new Error('Recorded payment must match the confirmed baggage quote.');
      err.status = 400;
      err.code = 'ADDON_PAYMENT_AMOUNT_MISMATCH';
      throw err;
    }

    const payment = await addonRepository.insertPayment(requestId, quote?.id, {
      bookingId: request.booking_id,
      amount,
      currency: input.currency || quote?.currency || request.booking?.currency || 'USD',
      paymentProvider: input.paymentProvider,
      providerTransactionId: input.providerTransactionId,
      status: 'PAID',
      paidAt: input.paidAt
    });
    if (quote?.id) await addonRepository.updateQuoteStatus(quote.id, 'ACCEPTED');
    await addonRepository.updateRequestStatus(requestId, 'PURCHASE_PENDING');
    return { request: await addonRepository.getRequest(requestId), payment };
  },

  async recordFulfillment(requestId, input = {}) {
    const request = await addonRepository.getRequest(requestId);
    if (!request) {
      const err = new Error('Baggage request not found.');
      err.status = 404;
      err.code = 'ADDON_REQUEST_NOT_FOUND';
      throw err;
    }
    const status = assertStatus(input.status || 'CONFIRMED');
    const allowed = new Set(['PURCHASE_PENDING', 'CONFIRMED', 'PURCHASE_FAILED', 'REFUNDED', 'CANCELLED']);
    if (!allowed.has(status)) {
      const err = new Error('Invalid fulfillment status.');
      err.status = 400;
      err.code = 'INVALID_FULFILLMENT_STATUS';
      throw err;
    }
    const fulfillment = await addonRepository.upsertFulfillment(requestId, { ...input, status });
    await addonRepository.updateRequestStatus(requestId, status);
    const updatedRequest = await addonRepository.getRequest(requestId);
    let confirmationDelivery = null;
    if (status === 'CONFIRMED') confirmationDelivery = await sendBaggageConfirmedEmail(updatedRequest, fulfillment);
    return { request: updatedRequest, fulfillment, confirmationDelivery };
  },

  async getPublicOffer(token) {
    const quote = await addonRepository.getQuoteByToken(token);
    if (!quote || !quote.request) return null;
    if (quote.valid_until && new Date(quote.valid_until).getTime() < Date.now()) {
      if (quote.status === 'ACTIVE') await addonRepository.updateQuoteStatus(quote.id, 'EXPIRED');
      await addonRepository.updateRequestStatus(quote.request.id, 'PRICE_EXPIRED');
      return { ...publicOffer(quote), expired: true, status: 'PRICE_EXPIRED' };
    }
    return publicOffer(quote);
  },

  async getPaymentConfig() {
    return addonPayPalService.publicConfig();
  },

  async createPayPalOrder(token) {
    const quote = await addonRepository.getQuoteByToken(token);
    if (!quote?.request?.id) {
      const err = new Error('Baggage offer not found.');
      err.status = 404;
      err.code = 'ADDON_OFFER_NOT_FOUND';
      throw err;
    }
    if (quote.status !== 'ACTIVE') {
      const err = new Error('This baggage offer is no longer available for payment.');
      err.status = 409;
      err.code = 'ADDON_OFFER_NOT_PAYABLE';
      throw err;
    }
    if (quote.valid_until && new Date(quote.valid_until).getTime() <= Date.now()) {
      await addonRepository.updateQuoteStatus(quote.id, 'EXPIRED');
      await addonRepository.updateRequestStatus(quote.request.id, 'PRICE_EXPIRED');
      const err = new Error('This baggage offer has expired.');
      err.status = 409;
      err.code = 'ADDON_QUOTE_EXPIRED';
      throw err;
    }
    const config = addonPayPalService.publicConfig();
    if (!config.enabled) {
      const err = new Error('Online baggage payment is not currently configured.');
      err.status = 503;
      err.code = 'ADDON_PAYMENT_PROVIDER_UNAVAILABLE';
      throw err;
    }
    const order = await addonPayPalService.createOrder({ request: quote.request, quote });
    await addonRepository.insertPayment(quote.request.id, quote.id, {
      bookingId: quote.request.booking_id,
      amount: Number(quote.customer_price),
      currency: quote.currency,
      paymentProvider: 'paypal',
      providerTransactionId: order.id,
      status: 'PENDING'
    });
    return { orderId: order.id };
  },

  async capturePayPalOrder(token, paypalOrderId) {
    const quote = await addonRepository.getQuoteByToken(token);
    if (!quote?.request?.id) {
      const err = new Error('Baggage offer not found.');
      err.status = 404;
      err.code = 'ADDON_OFFER_NOT_FOUND';
      throw err;
    }
    if (!paypalOrderId) {
      const err = new Error('paypalOrderId is required.');
      err.status = 400;
      err.code = 'ADDON_PAYPAL_ORDER_REQUIRED';
      throw err;
    }

    const existing = await addonRepository.getPaymentByProviderTransactionId(paypalOrderId);
    if (existing?.status === 'PAID') return { payment: existing, request: await addonRepository.getRequest(quote.request.id), alreadyCaptured: true };

    let response;
    try {
      response = await addonPayPalService.captureOrder(paypalOrderId);
    } catch (error) {
      if (error.issue === 'ORDER_ALREADY_CAPTURED') response = await addonPayPalService.getOrder(paypalOrderId);
      else throw error;
    }

    const purchaseUnit = response?.purchase_units?.[0] || {};
    const capture = purchaseUnit?.payments?.captures?.[0] || {};
    const captureStatus = String(capture.status || response?.status || '').toUpperCase();
    const expectedReference = `ADDON:${quote.request.id}`;
    const providerReference = String(purchaseUnit.custom_id || purchaseUnit.reference_id || '');
    if (providerReference && providerReference !== expectedReference) {
      const err = new Error('PayPal order does not belong to this baggage request.');
      err.status = 403;
      err.code = 'ADDON_PAYPAL_OWNERSHIP_MISMATCH';
      throw err;
    }
    if (captureStatus !== 'COMPLETED') {
      const err = new Error(`PayPal baggage payment status is ${captureStatus || 'UNKNOWN'}.`);
      err.status = captureStatus === 'PENDING' ? 202 : 422;
      err.code = captureStatus === 'PENDING' ? 'ADDON_CAPTURE_PENDING' : 'ADDON_PAYMENT_NOT_COMPLETED';
      throw err;
    }

    const capturedAmount = Number(capture.amount?.value || 0);
    const expectedAmount = Number(quote.customer_price);
    const capturedCurrency = String(capture.amount?.currency_code || '').toUpperCase();
    const expectedCurrency = String(quote.currency || 'USD').toUpperCase();
    if (!Number.isFinite(capturedAmount) || Math.abs(capturedAmount - expectedAmount) > 0.01 || capturedCurrency !== expectedCurrency) {
      const err = new Error('Captured PayPal amount or currency does not match the baggage offer.');
      err.status = 400;
      err.code = 'ADDON_PAYPAL_AMOUNT_MISMATCH';
      throw err;
    }

    const payment = await addonRepository.insertPayment(quote.request.id, quote.id, {
      bookingId: quote.request.booking_id,
      amount: capturedAmount,
      currency: capturedCurrency,
      paymentProvider: 'paypal',
      providerTransactionId: paypalOrderId,
      status: 'PAID',
      paidAt: new Date().toISOString()
    });
    await addonRepository.updateQuoteStatus(quote.id, 'ACCEPTED');
    await addonRepository.updateRequestStatus(quote.request.id, 'PURCHASE_PENDING');
    return { payment, request: await addonRepository.getRequest(quote.request.id), captureId: capture.id || null };
  },

  async declineOffer(token) {
    const quote = await addonRepository.getQuoteByToken(token);
    if (!quote?.request?.id) {
      const err = new Error('Baggage offer not found.');
      err.status = 404;
      err.code = 'ADDON_OFFER_NOT_FOUND';
      throw err;
    }
    if (quote.id) await addonRepository.updateQuoteStatus(quote.id, 'DECLINED');
    return addonRepository.updateRequestStatus(quote.request.id, 'DECLINED_BY_CUSTOMER');
  }
};

export default addonService;
