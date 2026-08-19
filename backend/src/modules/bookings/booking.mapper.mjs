import { itineraryMapper } from '../itineraries/itinerary.mapper.mjs';

export function resolvePositiveAmount(...values) {
  for (const value of values) {
    const amount = Number.parseFloat(value);
    if (Number.isFinite(amount) && amount > 0) {
      return amount;
    }
  }
  return 0;
}

export const bookingMapper = {
  toDatabaseInsert: (bookingReference, payload) => {
    const rawCustomerPrice = resolvePositiveAmount(
      payload.customer_price,
      payload.customerPrice,
      payload.total_amount,
      payload.totalAmount,
      payload.amount,
      payload.price,
      payload.pricing?.totalPrice,
      payload.pricing?.finalCustomerTotal,
      payload.pricing?.customerTotal,
      payload.pricing?.total,
      payload.displayedWebsitePrice,
      payload.flight?.price,
      payload.flight?.totalPrice
    );

    const rawSupplierPrice = resolvePositiveAmount(
      payload.supplier_price,
      payload.supplierPrice,
      payload.pricing?.supplierCost,
      payload.originalApiPrice,
      payload.original_api_price,
      rawCustomerPrice
    );

    if (payload.actionType !== 'create_draft' && rawCustomerPrice <= 0) {
      const err = new Error(`INVALID_BOOKING_PRICE: Customer total reservation price must be greater than zero. Received: ${rawCustomerPrice}`);
      err.code = 'INVALID_BOOKING_PRICE';
      throw err;
    }

    const isMock = !!payload.isMock;
    const discountPercent = isMock ? 0 : (parseFloat(payload.discount_percent) || 10);
    const voucherDiscount = Math.max(0, parseFloat(payload.voucher_discount) || 0);
    const priceBeforeVoucher = resolvePositiveAmount(payload.price_before_voucher, rawCustomerPrice + voucherDiscount);
    // Keep the normal website discount separate from voucher savings.
    const discountAmount = isMock ? 0 : (parseFloat(payload.discount_amount) || Math.max(0, rawSupplierPrice - priceBeforeVoucher));

    const clientReqId = payload.clientRequestId || payload.client_request_id || payload.idempotencyKey || payload.idempotency_key || null;

    return {
      confirmation_code: bookingReference,
      status: payload.status || 'PENDING',
      payment_status: String(payload.paymentStatus || 'PENDING').toUpperCase(),
      total_amount: rawCustomerPrice,
      customer_price: rawCustomerPrice,
      supplier_price: rawSupplierPrice,
      discount_percent: discountPercent,
      discount_amount: discountAmount,
      voucher_id: payload.voucher_id || null,
      voucher_code: payload.voucher_code || null,
      voucher_discount: voucherDiscount,
      price_before_voucher: priceBeforeVoucher,
      minimum_payable_floor: payload.minimum_payable_floor ?? null,
      price_checked_at: new Date().toISOString(),
      currency: (payload.currency || 'USD').toUpperCase(),
      passenger_name: payload.customerName,
      email: payload.email,
      phone: payload.phone,
      original_api_price: rawSupplierPrice,
      client_request_id: clientReqId,
      idempotency_key: clientReqId,
    };
  },

  toCanonicalModel: (booking, travellers = [], contacts = [], flights = [], payments = [], paymentMethod = null) => {
    if (!booking) return null;

    const contact = contacts[0] || {};
    const paymentRecord = payments[0] || {};
    const pm = paymentMethod || {};
    const itinerary = itineraryMapper.toDomainModel(flights);

    const hasCustomerPrice = (booking.customer_price !== undefined && booking.customer_price !== null) || (booking.total_amount !== undefined && booking.total_amount !== null);
    const hasSupplierPrice = (booking.supplier_price !== undefined && booking.supplier_price !== null) || (booking.original_api_price !== undefined && booking.original_api_price !== null);

    const customerTotal = hasCustomerPrice ? (parseFloat(booking.customer_price ?? booking.total_amount) || 0) : null;
    const supplierCost = hasSupplierPrice ? (parseFloat(booking.supplier_price ?? booking.original_api_price) || 0) : customerTotal;
    const voucherDiscount = Math.max(0, parseFloat(booking.voucher_discount) || 0);
    const priceBeforeVoucher = booking.price_before_voucher !== undefined && booking.price_before_voucher !== null
      ? parseFloat(booking.price_before_voucher)
      : (customerTotal !== null ? customerTotal + voucherDiscount : null);
    const discount = booking.discount_amount !== undefined && booking.discount_amount !== null
      ? parseFloat(booking.discount_amount)
      : (priceBeforeVoucher !== null && supplierCost !== null ? Math.max(0, supplierCost - priceBeforeVoucher) : null);

    const baseFare = booking.base_fare !== undefined && booking.base_fare !== null ? parseFloat(booking.base_fare) : supplierCost;
    const taxes = booking.taxes !== undefined && booking.taxes !== null ? parseFloat(booking.taxes) : 45.00;
    const serviceFee = booking.service_fee !== undefined && booking.service_fee !== null ? parseFloat(booking.service_fee) : 15.00;
    const margin = (customerTotal !== null && supplierCost !== null) ? (customerTotal - supplierCost) : null;
    const currency = (booking.currency || 'USD').toUpperCase();

    const authorizedAmount = booking.authorized_amount !== undefined && booking.authorized_amount !== null
      ? parseFloat(booking.authorized_amount)
      : (booking.authorized_amount ?? (booking.authorization?.authorizedAmount ?? customerTotal));

    const isPaid = (booking.payment_status || '').toLowerCase() === 'paid' || (paymentRecord.payment_status || '').toLowerCase() === 'paid';
    const isRefunded = (booking.payment_status || '').toLowerCase() === 'refunded' || (paymentRecord.payment_status || '').toLowerCase() === 'refunded';

    const paidAmount = booking.paid_amount !== undefined && booking.paid_amount !== null
      ? parseFloat(booking.paid_amount)
      : (paymentRecord.payment_amount ? parseFloat(paymentRecord.payment_amount) : (isPaid ? customerTotal : null));

    const refundedAmount = booking.refund_amount !== undefined && booking.refund_amount !== null
      ? parseFloat(booking.refund_amount)
      : (paymentRecord.refund_amount ? parseFloat(paymentRecord.refund_amount) : (isRefunded ? customerTotal : 0));

    const pricing = {
      baseFare,
      taxes,
      serviceFee,
      discount,
      customerTotal,
      supplierCost,
      margin,
      currency,
      total: customerTotal ?? 0,
      customerPrice: customerTotal ?? 0,
      supplierPrice: supplierCost ?? 0,
      originalApiPrice: supplierCost ?? 0,
      discountPercent: typeof booking.discount_percent === 'number' ? booking.discount_percent : 10,
      discountAmount: discount ?? 0,
      voucherId: booking.voucher_id || null,
      voucherCode: booking.voucher_code || null,
      voucherDiscount,
      priceBeforeVoucher,
      minimumPayableFloor: booking.minimum_payable_floor !== undefined && booking.minimum_payable_floor !== null
        ? parseFloat(booking.minimum_payable_floor)
        : null,
      priceCheckedAt: booking.price_checked_at || booking.created_at
    };

    const authorization = {
      authorizedAmount,
      status: booking.authorization_status || (booking.authorization_email_sent_at ? 'AWAITING_PASSENGER' : 'NOT_SENT'),
      emailSentAt: booking.authorization_email_sent_at || null,
      token: booking.authorization_token || null
    };

    const paymentModel = {
      provider: paymentRecord.payment_provider || booking.payment_provider || 'stripe',
      stripeSessionId: paymentRecord.stripe_session_id || null,
      stripePaymentId: paymentRecord.stripe_payment_id || null,
      paymentAmount: parseFloat(paymentRecord.payment_amount || customerTotal || 0) || 0,
      paymentStatus: (booking.payment_status || paymentRecord.payment_status || 'PENDING').toUpperCase(),
      status: (booking.payment_status || paymentRecord.payment_status || 'PENDING').toUpperCase(),
      paymentDate: paymentRecord.payment_date || booking.paid_at || null,
      paidAmount,
      refundedAmount,
      transactionReference: booking.transaction_reference || booking.provider_payment_id || paymentRecord.stripe_payment_id || null
    };

    return {
      id: booking.id,
      confirmationCode: booking.confirmation_code,
      confirmation_code: booking.confirmation_code,
      bookingReference: booking.confirmation_code,
      transactionReference: booking.transaction_reference || booking.provider_payment_id || null,
      customer: {
        name: booking.passenger_name,
        email: booking.email,
        phone: booking.phone,
        contactDetail: contact
      },
      passenger_name: booking.passenger_name,
      email: booking.email,
      phone: booking.phone,
      amount: customerTotal ?? 0,
      currency: booking.currency || 'USD',
      voucher_id: booking.voucher_id || null,
      voucher_code: booking.voucher_code || null,
      voucher_discount: voucherDiscount,
      price_before_voucher: priceBeforeVoucher,
      minimum_payable_floor: booking.minimum_payable_floor ?? null,
      
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
        passportExpiry: t.passport_expiry,
        infantType: t.infant_type || null
      })),
      traveller_details: travellers,

      itinerary,
      flight_details: itinerary,
      flights: flights || [],
      itinerary_segments: flights || [],
      outbound_segments: (flights || []).filter(f => f.leg === 'outbound'),
      
      pricing,
      authorization,
      payment: paymentModel,
      contacts: contacts || [],
      payments: payments || [],
      
      bookingStatus: booking.status,
      status: booking.status,
      paymentStatus: booking.payment_status,
      internalNotes: booking.internal_notes,
      airline_code: booking.airline_code,
      airline_name: booking.airline_name,
      airline_logo_url: booking.airline_logo_url,
      airline_confirmation_number: booking.airline_confirmation_number,
      airline_pnr: booking.airline_confirmation_number,
      pnr: booking.airline_confirmation_number,
      ticket_number: booking.ticket_number,
      ticket_issued_at: booking.ticket_issued_at,
      ticket_notes: booking.ticket_notes,
      supplier_confirmation: booking.supplier_confirmation,
      airlineCode: booking.airline_code,
      airlineName: booking.airline_name,
      airlineLogoUrl: booking.airline_logo_url,
      airlineConfirmationNumber: booking.airline_confirmation_number,
      ticketNumber: booking.ticket_number,
      ticketIssuedAt: booking.ticket_issued_at,
      ticketNotes: booking.ticket_notes,
      supplierConfirmation: booking.supplier_confirmation,
      cardReference: {
        cardBrand: pm.card_brand || booking.card_brand || paymentRecord.card_brand || null,
        cardLast4: pm.card_last4 || booking.card_last4 || paymentRecord.card_last4 || null,
        cardExpMonth: pm.card_exp_month || booking.card_exp_month || paymentRecord.card_exp_month || null,
        cardExpYear: pm.card_exp_year || booking.card_exp_year || paymentRecord.card_exp_year || null,
        cardExpDate: (pm.card_exp_month && pm.card_exp_year)
          ? `${pm.card_exp_month}/${pm.card_exp_year}`
          : (booking.card_exp_date || paymentRecord.card_exp_date || null),
        cardholderName: pm.cardholder_name || booking.cardholder_name || paymentRecord.cardholder_name || booking.passenger_name || null,
        billingPhone: pm.billing_phone || booking.billing_phone || booking.phone || null,
        billingAddress: pm.billing_address_line1 || booking.billing_address || null
      },
      billingDetails: {
        cardholderName: pm.cardholder_name || booking.cardholder_name || paymentRecord.cardholder_name || booking.passenger_name || null,
        cardBrand: pm.card_brand || booking.card_brand || paymentRecord.card_brand || null,
        cardLast4: pm.card_last4 || booking.card_last4 || paymentRecord.card_last4 || null,
        cardExpMonth: pm.card_exp_month || booking.card_exp_month || paymentRecord.card_exp_month || null,
        cardExpYear: pm.card_exp_year || booking.card_exp_year || paymentRecord.card_exp_year || null,
        maskedCard: (() => {
          const brand = pm.card_brand || booking.card_brand || paymentRecord.card_brand;
          const last4 = pm.card_last4 || booking.card_last4 || paymentRecord.card_last4;
          if (brand && last4) return `${brand} •••• ${last4}`;
          if (last4) return `Card ending ${last4}`;
          return null;
        })(),
        billingEmail: pm.billing_email || null,
        billingPhone: pm.billing_phone || booking.billing_phone || booking.phone || null,
        addressLine1: pm.billing_address_line1 || null,
        addressLine2: pm.billing_address_line2 || null,
        city: pm.billing_city || null,
        stateProvince: pm.billing_state || null,
        postalCode: pm.billing_postal_code || null,
        country: pm.billing_country || null,
        paymentMethodType: pm.payment_provider || 'card',
        paymentMethodToken: pm.provider_payment_method_id || null,
        transactionReference: booking.transaction_reference || paymentRecord.provider_payment_id || null,
        createdAt: pm.created_at || null,
        updatedAt: pm.updated_at || null
      },
      cardBrand: pm.card_brand || booking.card_brand || paymentRecord.card_brand || null,
      cardLast4: pm.card_last4 || booking.card_last4 || paymentRecord.card_last4 || null,
      cardExpDate: (pm.card_exp_month && pm.card_exp_year)
        ? `${pm.card_exp_month}/${pm.card_exp_year}`
        : (booking.card_exp_date || paymentRecord.card_exp_date || null),
      paymentMethod: pm && pm.id ? pm : null,
      createdAt: booking.created_at,
      updatedAt: booking.updated_at,
      created_at: booking.created_at,
      updated_at: booking.updated_at
    };
  },

  toSummaryList: (bookings) => {
    return bookings.map(b => {
      const customerPrice = parseFloat(b.customer_price || b.total_amount) || 0;
      const supplierPrice = parseFloat(b.supplier_price || b.original_api_price || customerPrice) || 0;
      const voucherDiscount = Math.max(0, parseFloat(b.voucher_discount) || 0);
      const priceBeforeVoucher = parseFloat(b.price_before_voucher) || (customerPrice + voucherDiscount);
      const discountAmount = parseFloat(b.discount_amount) || Math.max(0, supplierPrice - priceBeforeVoucher);
      const currency = (b.currency || 'USD').toUpperCase();
      return {
        id: b.id,
        confirmationCode: b.confirmation_code,
        bookingReference: b.confirmation_code,
        passenger_name: b.passenger_name,
        customerName: b.passenger_name,
        email: b.email,
        phone: b.phone,
        amount: customerPrice,
        customer_price: customerPrice,
        supplier_price: supplierPrice,
        discount_amount: discountAmount,
        discount_percent: typeof b.discount_percent === 'number' ? b.discount_percent : 10,
        voucher_id: b.voucher_id || null,
        voucher_code: b.voucher_code || null,
        voucher_discount: voucherDiscount,
        price_before_voucher: priceBeforeVoucher,
        minimum_payable_floor: b.minimum_payable_floor ?? null,
        total_amount: customerPrice,
        currency,
        status: b.status,
        bookingStatus: b.status,
        paymentStatus: b.payment_status,
        pricing: {
          baseFare: supplierPrice,
          taxes: 45.00,
          serviceFee: 15.00,
          discount: discountAmount,
          customerTotal: customerPrice,
          supplierCost: supplierPrice,
          voucherCode: b.voucher_code || null,
          voucherDiscount,
          priceBeforeVoucher,
          minimumPayableFloor: b.minimum_payable_floor ?? null,
          margin: customerPrice - supplierPrice,
          currency
        },
        authorization: {
          authorizedAmount: parseFloat(b.authorized_amount ?? b.customer_price ?? b.total_amount ?? 0) || customerPrice
        },
        payment: {
          paidAmount: (b.payment_status || '').toLowerCase() === 'paid' ? customerPrice : null,
          refundedAmount: (b.payment_status || '').toLowerCase() === 'refunded' ? customerPrice : 0
        },
        airline_code: b.airline_code,
        airline_name: b.airline_name,
        airline_logo_url: b.airline_logo_url,
        airline_confirmation_number: b.airline_confirmation_number,
        airline_pnr: b.airline_confirmation_number,
        pnr: b.airline_confirmation_number,
        ticket_number: b.ticket_number,
        ticket_issued_at: b.ticket_issued_at,
        ticket_notes: b.ticket_notes,
        supplier_confirmation: b.supplier_confirmation,
        airlineCode: b.airline_code,
        airlineName: b.airline_name,
        airlineLogoUrl: b.airline_logo_url,
        airlineConfirmationNumber: b.airline_confirmation_number,
        ticketNumber: b.ticket_number,
        ticketIssuedAt: b.ticket_issued_at,
        created_at: b.created_at,
        updated_at: b.updated_at
      };
    });
  }
};

export default bookingMapper;
