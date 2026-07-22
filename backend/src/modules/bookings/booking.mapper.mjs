import { itineraryMapper } from '../itineraries/itinerary.mapper.mjs';

export const bookingMapper = {
  toDatabaseInsert: (bookingReference, payload) => {
    return {
      confirmation_code: bookingReference,
      status: payload.status || 'PENDING',
      payment_status: payload.paymentStatus || 'paid',
      total_amount: parseFloat(payload.displayedWebsitePrice) || 0,
      currency: payload.currency || 'USD',
      passenger_name: payload.customerName,
      email: payload.email,
      phone: payload.phone,
      original_api_price: parseFloat(payload.originalApiPrice) || 0,
    };
  },

  toCanonicalModel: (booking, travellers = [], contacts = [], flights = [], payments = []) => {
    if (!booking) return null;

    const contact = contacts[0] || {};
    const payment = payments[0] || {};
    const itinerary = itineraryMapper.toDomainModel(flights);

    // Group pricing properties
    const pricing = {
      total: parseFloat(booking.total_amount) || 0,
      originalApiPrice: parseFloat(booking.original_api_price) || 0,
      currency: booking.currency
    };

    return {
      id: booking.id,
      confirmationCode: booking.confirmation_code,
      bookingReference: booking.confirmation_code, // legacy compatibility
      customer: {
        name: booking.passenger_name,
        email: booking.email,
        phone: booking.phone,
        contactDetail: contact
      },
      // Legacy primary fields for compatibility
      passenger_name: booking.passenger_name,
      email: booking.email,
      phone: booking.phone,
      amount: booking.total_amount,
      currency: booking.currency,
      
      travellers: travellers.map(t => ({
        id: t.id,
        role: t.role,
        title: t.title,
        firstName: t.first_name,
        middleName: t.middle_name,
        lastName: t.last_name,
        dateOfBirth: t.date_of_birth,
        gender: t.gender,
        nationality: t.nationality,
        passportNumber: t.passport_number,
        passportExpiry: t.passport_expiry
      })),
      // Legacy field for compatibility
      traveller_details: travellers,

      itinerary,
      flight_details: itinerary, // legacy compatibility
      
      pricing,
      payment: {
        provider: payment.payment_provider || 'stripe',
        stripeSessionId: payment.stripe_session_id || null,
        stripePaymentId: payment.stripe_payment_id || null,
        paymentAmount: parseFloat(payment.payment_amount) || 0,
        paymentStatus: payment.payment_status || 'paid',
        paymentDate: payment.payment_date
      },
      payment_details: payment, // legacy compatibility
      
      bookingStatus: booking.status,
      status: booking.status, // legacy compatibility
      paymentStatus: booking.payment_status,
      internalNotes: booking.internal_notes,
      createdAt: booking.created_at,
      updatedAt: booking.updated_at,
      created_at: booking.created_at, // legacy compatibility
      updated_at: booking.updated_at // legacy compatibility
    };
  },

  toSummaryList: (bookings) => {
    return bookings.map(b => ({
      id: b.id,
      confirmationCode: b.confirmation_code,
      bookingReference: b.confirmation_code,
      passenger_name: b.passenger_name,
      customerName: b.passenger_name,
      email: b.email,
      phone: b.phone,
      amount: b.total_amount,
      total_amount: b.total_amount,
      currency: b.currency,
      status: b.status,
      bookingStatus: b.status,
      paymentStatus: b.payment_status,
      created_at: b.created_at,
      updated_at: b.updated_at
    }));
  }
};

export default bookingMapper;
