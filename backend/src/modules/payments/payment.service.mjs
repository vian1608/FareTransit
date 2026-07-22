import stripeService from '../../integrations/stripe/stripe.service.mjs';
import env from '../../config/env.mjs';

// Predefined catalog for pricing verification
export const CONSULTING_PLANS = {
  'express': { name: 'Express Logistics Plan', price: 150.00 },
  'premium': { name: 'Premium Logistics Plan', price: 250.00 },
  'first': { name: 'First Class Premium Plan', price: 500.00 }
};

export const paymentService = {
  getConfig: () => {
    return {
      publishableKey: env.stripePublishableKey || 'pk_test_placeholder'
    };
  },

  createSession: async (payload, hostOrigin) => {
    const { type, email, amount, planName } = payload;

    if (!type || !email) {
      throw new Error('Missing required checkout parameters: type and email');
    }

    let resolvedAmount = parseFloat(amount);
    
    // Server-calculated pricing validation
    if (type === 'consulting') {
      const planKey = String(planName || '').toLowerCase().split(' ')[0];
      if (CONSULTING_PLANS[planKey]) {
        resolvedAmount = CONSULTING_PLANS[planKey].price;
      } else {
        // Fallback checks
        if (isNaN(resolvedAmount) || resolvedAmount <= 0) {
          throw new Error('Invalid payment amount calculated by server');
        }
      }
    } else if (type === 'booking') {
      if (isNaN(resolvedAmount) || resolvedAmount <= 0) {
        throw new Error('Invalid booking total amount calculated by server');
      }
    }

    // Set checkout redirect paths
    const successUrl = `${hostOrigin}/confirmation/success?session_id={CHECKOUT_SESSION_ID}&type=${type}`;
    const cancelUrl = type === 'booking' 
      ? `${hostOrigin}/booking?status=cancelled`
      : `${hostOrigin}/payment?status=cancelled`;

    // Flatten metadata for Stripe (no nested JSON allowed in metadata)
    const metadata = { type };
    if (type === 'consulting') {
      metadata.name = payload.name || '';
      metadata.email = email;
      metadata.phone = payload.phone || '';
      metadata.origin = payload.origin || '';
      metadata.destination = payload.destination || '';
      metadata.notes = (payload.notes || '').substring(0, 400); // Stripe 500 limit
      metadata.plan_name = planName || '';
    } else if (type === 'booking') {
      const { passenger, flight } = payload;
      if (!passenger || !flight) {
        throw new Error('Passenger and flight details are required for booking payment');
      }

      // Customer info
      metadata.firstName = passenger.firstName || '';
      metadata.lastName = passenger.lastName || '';
      metadata.email = passenger.email || '';
      metadata.phone = passenger.phone || '';
      metadata.dateOfBirth = passenger.dateOfBirth || '';
      metadata.gender = passenger.gender || '';
      metadata.nationality = passenger.nationality || '';
      metadata.passportNumber = passenger.passportNumber || '';
      metadata.passportExpiry = passenger.passportExpiry || '';
      metadata.emergencyName = passenger.emergencyName || '';
      metadata.emergencyPhone = passenger.emergencyPhone || '';
      metadata.emergencyRelationship = passenger.emergencyRelationship || '';

      // Flight summary info
      metadata.flight_airline = flight.airline || '';
      metadata.flight_number = flight.flightNumber || '';
      metadata.flight_route = `${flight.departure?.airport || ''} to ${flight.arrival?.airport || ''}`;
      metadata.flight_dep_time = `${flight.departure?.date || ''} ${flight.departure?.time || ''}`;
      metadata.flight_arr_time = `${flight.arrival?.date || ''} ${flight.arrival?.time || ''}`;
      metadata.flight_class = flight.class || 'Economy';
      metadata.flight_stops = (flight.stops || 0).toString();
    }

    const lineItemName = type === 'booking'
      ? `Flight Ticket: ${payload.flight?.departure?.airport || 'Origin'} to ${payload.flight?.arrival?.airport || 'Destination'}`
      : (planName || 'Travel Logistics Consulting Fee');

    const lineItemDescription = type === 'booking'
      ? `Outbound Flight ${payload.flight?.flightNumber || ''} (${payload.flight?.class || 'Economy'})`
      : 'Urgent travel planning and itinerary support services';

    return stripeService.createCheckoutSession({
      type,
      email,
      amount: resolvedAmount,
      metadata,
      successUrl,
      cancelUrl,
      lineItemName,
      lineItemDescription
    });
  },

  getStatus: async (sessionId) => {
    return stripeService.getSessionStatus(sessionId);
  }
};

export default paymentService;
