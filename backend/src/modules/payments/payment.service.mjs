import stripeService from '../../integrations/stripe/stripe.service.mjs';
import env from '../../config/env.mjs';
import { calculateBookingTotal } from '../../shared/utils/pricing.helper.mjs';

// Predefined catalog for pricing verification
export const CONSULTING_PLANS = {
  express: { name: 'Express Logistics Plan', price: 150.00 },
  premium: { name: 'Premium Logistics Plan', price: 250.00 },
  first: { name: 'First Class Premium Plan', price: 500.00 }
};

function cleanCurrency(value) {
  const currency = String(value || 'USD').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : 'USD';
}

function cleanMetadataValue(value, max = 200) {
  return String(value || '').trim().substring(0, max);
}

export const paymentService = {
  getConfig: () => {
    const key = String(env.stripePublishableKey || '').trim();
    const enabled = /^pk_(test|live)_/.test(key);
    return {
      success: true,
      enabled,
      publishableKey: enabled ? key : null,
      mockMode: env.stripeMockMode || !env.stripeSecretKey
    };
  },

  createSession: async (payload, hostOrigin) => {
    const { type, email, amount, planName } = payload;
    const normalizedType = String(type || '').trim().toLowerCase();
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!['booking', 'consulting'].includes(normalizedType) || !normalizedEmail) {
      throw new Error('Missing or invalid checkout parameters: type and email are required.');
    }

    let resolvedAmount = Number.parseFloat(amount);
    const currency = cleanCurrency(payload.currency);

    if (normalizedType === 'consulting') {
      const planKey = String(planName || '').toLowerCase().split(' ')[0];
      if (CONSULTING_PLANS[planKey]) {
        resolvedAmount = CONSULTING_PLANS[planKey].price;
      } else if (!Number.isFinite(resolvedAmount) || resolvedAmount <= 0) {
        throw new Error('Invalid payment amount calculated by server');
      }
    } else {
      if (payload.flight?.isMock || payload.returnFlight?.isMock || payload.isMock) {
        const err = new Error('Offline / sample flight routes cannot be booked online. Please contact our support team.');
        err.code = 'MOCK_FLIGHT_NOT_BOOKABLE';
        throw err;
      }

      if (payload.flight) {
        const pricing = calculateBookingTotal({
          outboundFlight: payload.flight,
          returnFlight: payload.returnFlight,
          passengersCount: payload.passengersCount || 1,
          currency
        });
        resolvedAmount = pricing.customerPriceNum;
      }

      if (!Number.isFinite(resolvedAmount) || resolvedAmount <= 0) {
        throw new Error('Invalid booking total amount calculated by server');
      }
    }

    const successUrl = `${hostOrigin}/confirmation/success?session_id={CHECKOUT_SESSION_ID}&type=${normalizedType}`;
    const cancelUrl = normalizedType === 'booking'
      ? `${hostOrigin}/booking?status=cancelled`
      : `${hostOrigin}/payment?status=cancelled`;

    // Payment-provider metadata must stay minimal. Passport, DOB, nationality,
    // emergency contacts, billing secrets and other travel-document data belong
    // in FareTransit only and must never be copied to Stripe metadata.
    const metadata = { type: normalizedType };
    if (normalizedType === 'consulting') {
      metadata.customer_name = cleanMetadataValue(payload.name, 100);
      metadata.plan_name = cleanMetadataValue(planName, 100);
      metadata.origin = cleanMetadataValue(payload.origin, 50);
      metadata.destination = cleanMetadataValue(payload.destination, 50);
    } else {
      const { passenger = {}, flight = {} } = payload;
      if (!flight || Object.keys(flight).length === 0) {
        throw new Error('Flight details are required for booking payment');
      }
      metadata.booking_reference = cleanMetadataValue(payload.bookingId || payload.bookingReference || payload.clientRequestId, 100);
      metadata.customer_name = cleanMetadataValue([passenger.firstName, passenger.lastName].filter(Boolean).join(' '), 100);
      metadata.flight_number = cleanMetadataValue(flight.flightNumber, 30);
      metadata.flight_route = cleanMetadataValue(`${flight.departure?.airport || ''} to ${flight.arrival?.airport || ''}`, 50);
      metadata.travel_date = cleanMetadataValue(flight.departure?.date, 30);
    }

    const lineItemName = normalizedType === 'booking'
      ? `Flight Ticket: ${payload.flight?.departure?.airport || 'Origin'} to ${payload.flight?.arrival?.airport || 'Destination'}`
      : (planName || 'Travel Logistics Consulting Fee');

    const lineItemDescription = normalizedType === 'booking'
      ? `Outbound Flight ${payload.flight?.flightNumber || ''} (${payload.flight?.class || 'Economy'})`
      : 'Travel planning and itinerary support services';

    return stripeService.createCheckoutSession({
      type: normalizedType,
      email: normalizedEmail,
      amount: resolvedAmount,
      currency,
      metadata,
      successUrl,
      cancelUrl,
      lineItemName,
      lineItemDescription
    });
  },

  getStatus: async (sessionId) => stripeService.getSessionStatus(sessionId)
};

export default paymentService;
