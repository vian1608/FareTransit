import { itineraryMapper } from '../itineraries/itinerary.mapper.mjs';

export function resolvePositiveAmount(...values) {
  for (const value of values) {
    const amount = Number.parseFloat(value);
    if (Number.isFinite(amount) && amount > 0) return amount;
  }
  return 0;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberOrZero(value) {
  return numberOrNull(value) ?? 0;
}

function resolveDiscountPercent(value, fallback = 10) {
  const parsed = numberOrNull(value);
  return parsed !== null && parsed >= 0 ? parsed : fallback;
}

function hasAuthorization(booking = {}) {
  const status = String(booking.authorization_status || '').toUpperCase();
  return ['AUTHORIZED', 'APPROVED', 'COMPLETED'].includes(status);
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

    const isMock = Boolean(payload.isMock);
    const discountPercent = isMock ? 0 : resolveDiscountPercent(payload.discount_percent, 10);
    const voucherDiscount = Math.max(0, numberOrZero(payload.voucher_discount));
    const priceBeforeVoucher = resolvePositiveAmount(payload.price_before_voucher, rawCustomerPrice + voucherDiscount);
    const explicitDiscount = numberOrNull(payload.discount_amount);
    const discountAmount = isMock
      ? 0
      : Math.max(0, explicitDiscount ?? Math.max(0, rawSupplierPrice - priceBeforeVoucher));

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

    const hasCustomerPrice = booking.customer_price !== undefined && booking.customer_price !== null
      || booking.total_amount !== undefined && booking.total_amount !== null;
    const hasSupplierPrice = booking.supplier_price !== undefined && booking.supplier_price !== null
      || booking.original_api_price !== undefined && booking.original_api_price !== null;

    const customerTotal = hasCustomerPrice ? numberOrZero(booking.customer_price ?? booking.total_amount) : null;
    const supplierCost = hasSupplierPrice ? numberOrZero(booking.supplier_price ?? booking.original_api_price) : customerTotal;
    const voucherDiscount = Math.max(0, numberOrZero(booking.voucher_discount));
    const priceBeforeVoucher = booking.price_before_voucher !== undefined && booking.price_before_voucher !== null
      ? numberOrZero(booking.price_before_voucher)
      : (customerTotal !== null ? customerTotal + voucherDiscount : null);
    const explicitDiscount = numberOrNull(booking.discount_amount);
    const discount = explicitDiscount !== null
      ? Math.max(0, explicitDiscount)
      : (priceBeforeVoucher !== null && supplierCost !== null ? Math.max(0, supplierCost - priceBeforeVoucher) : 0);

    // Never invent fare components. If the supplier did not provide a breakdown,
    // expose the known supplier total as baseFare and leave unknown components at 0.
    const baseFare = numberOrNull(booking.base_fare) ?? supplierCost ?? customerTotal ?? 0;
    const taxes = numberOrNull(booking.taxes) ?? 0;
    const serviceFee = numberOrNull(booking.service_fee) ?? 0;
    const margin = customerTotal !== null && supplierCost !== null ? customerTotal - supplierCost : null;
    const currency = (booking.currency || 'USD').toUpperCase();

    const explicitAuthorizedAmount = numberOrNull(booking.authorized_amount ?? booking.authorization?.authorizedAmount);
    const authorizedAmount = explicitAuthorizedAmount !== null
      ? explicitAuthorizedAmount
      : (hasAuthorization(booking) ? customerTotal : null);

    const isPaid = String(booking.payment_status || paymentRecord.payment_status || '').toUpperCase() === 'PAID';
    const isRefunded = String(booking.payment_status || paymentRecord.payment_status || '').toUpperCase() === 'REFUNDED';

    const paidAmount = numberOrNull(booking.paid_amount)
      ?? numberOrNull(paymentRecord.paid_amount)
      ?? (isPaid ? (numberOrNull(paymentRecord.payment_amount) ?? customerTotal) : null);
    const refundedAmount = numberOrNull(booking.refund_amount)
      ?? numberOrNull(paymentRecord.refund_amount)
      ?? (isRefunded ? customerTotal : 0);

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
      discountPercent: resolveDiscountPercent(booking.discount_percent, 10),
      discountAmount: discount,
      voucherId: booking.voucher_id || null,
      voucherCode: booking.voucher_code || null,
      voucherDiscount,
      priceBeforeVoucher,
      minimumPayableFloor: numberOrNull(booking.minimum_payable_floor),
      priceCheckedAt: booking.price_checked_at || booking.created_at
    };

    const authorization = {
      authorizedAmount,
      status: booking.authorization_status || (booking.authorization_email_sent_at ? 'AWAITING_PASSENGER' : 'NOT_CREATED'),
      emailSentAt: booking.authorization_email_sent_at || null,
      token: booking.authorization_token || null
    };

    const paymentModel = {
      provider: paymentRecord.payment_provider || booking.payment_provider || null,
      stripeSessionId: paymentRecord.stripe_session_id || null,
      stripePaymentId: paymentRecord.stripe_payment_id || null,
      paymentAmount: numberOrNull(paymentRecord.payment_amount) ?? customerTotal ?? 0,
      paymentStatus: String(booking.payment_status || paymentRecord.payment_status || 'PENDING').toUpperCase(),
      status: String(booking.payment_status || paymentRecord.payment_status || 'PENDING').toUpperCase(),
      paymentDate: paymentRecord.payment_date || booking.paid_at || null,
      paidAmount,
      refundedAmount,
      transactionReference: booking.transaction_reference || booking.provider_payment_id || paymentRecord.provider_payment_id || paymentRecord.stripe_payment_id || null
    };

    const cardBrand = pm.card_brand || booking.card_brand || paymentRecord.card_brand || null;
    const cardLast4 = pm.card_last4 || booking.card_last4 || paymentRecord.card_last4 || null;
    const cardExpMonth = pm.card_exp_month || booking.card_exp_month || paymentRecord.card_exp_month || null;
    const cardExpYear = pm.card_exp_year || booking.card_exp_year || paymentRecord.card_exp_year || null;
    const cardExpDate = cardExpMonth && cardExpYear ? `${cardExpMonth}/${cardExpYear}` : (booking.card_exp_date || paymentRecord.card_exp_date || null);
    const cardholderName = pm.cardholder_name || booking.cardholder_name || paymentRecord.cardholder_name || booking.passenger_name || null;

    return {
      id: booking.id,
      confirmationCode: booking.confirmation_code,
      confirmation_code: booking.confirmation_code,
      bookingReference: booking.confirmation_code,
      transactionReference: paymentModel.transactionReference,
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
      currency,
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
      return_segments: (flights || []).filter(f => f.leg === 'return'),

      pricing,
      authorization,
      payment: paymentModel,
      contacts: contacts || [],
      payments: payments || [],

      bookingStatus: booking.status,
      status: booking.status,
      paymentStatus: String(booking.payment_status || 'PENDING').toUpperCase(),
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
        cardBrand,
        cardLast4,
        cardExpMonth,
        cardExpYear,
        cardExpDate,
        cardholderName,
        billingPhone: pm.billing_phone || booking.billing_phone || booking.phone || null,
        billingAddress: pm.billing_address_line1 || booking.billing_address || null
      },
      billingDetails: {
        cardholderName,
        cardBrand,
        cardLast4,
        cardExpMonth,
        cardExpYear,
        maskedCard: cardLast4 ? (cardBrand ? `${cardBrand} •••• ${cardLast4}` : `Card ending ${cardLast4}`) : null,
        billingEmail: pm.billing_email || null,
        billingPhone: pm.billing_phone || booking.billing_phone || booking.phone || null,
        addressLine1: pm.billing_address_line1 || null,
        addressLine2: pm.billing_address_line2 || null,
        city: pm.billing_city || null,
        stateProvince: pm.billing_state || null,
        postalCode: pm.billing_postal_code || null,
        country: pm.billing_country || null,
        paymentMethodType: pm.payment_provider || null,
        paymentMethodToken: pm.provider_payment_method_id || null,
        transactionReference: paymentModel.transactionReference,
        createdAt: pm.created_at || null,
        updatedAt: pm.updated_at || null
      },
      cardBrand,
      cardLast4,
      cardExpDate,
      paymentMethod: pm && pm.id ? pm : null,
      createdAt: booking.created_at,
      updatedAt: booking.updated_at,
      created_at: booking.created_at,
      updated_at: booking.updated_at
    };
  },

  toSummaryList: (bookings) => bookings.map(b => {
    const customerPrice = numberOrZero(b.customer_price ?? b.total_amount);
    const supplierPrice = numberOrNull(b.supplier_price ?? b.original_api_price) ?? customerPrice;
    const voucherDiscount = Math.max(0, numberOrZero(b.voucher_discount));
    const priceBeforeVoucher = numberOrNull(b.price_before_voucher) ?? (customerPrice + voucherDiscount);
    const explicitDiscount = numberOrNull(b.discount_amount);
    const discountAmount = Math.max(0, explicitDiscount ?? Math.max(0, supplierPrice - priceBeforeVoucher));
    const currency = (b.currency || 'USD').toUpperCase();
    const authorizedAmount = numberOrNull(b.authorized_amount) ?? (hasAuthorization(b) ? customerPrice : null);

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
      discount_percent: resolveDiscountPercent(b.discount_percent, 10),
      voucher_id: b.voucher_id || null,
      voucher_code: b.voucher_code || null,
      voucher_discount: voucherDiscount,
      price_before_voucher: priceBeforeVoucher,
      minimum_payable_floor: b.minimum_payable_floor ?? null,
      total_amount: customerPrice,
      currency,
      status: b.status,
      bookingStatus: b.status,
      paymentStatus: String(b.payment_status || 'PENDING').toUpperCase(),
      pricing: {
        baseFare: numberOrNull(b.base_fare) ?? supplierPrice,
        taxes: numberOrNull(b.taxes) ?? 0,
        serviceFee: numberOrNull(b.service_fee) ?? 0,
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
      authorization: { authorizedAmount },
      payment: {
        paidAmount: String(b.payment_status || '').toUpperCase() === 'PAID' ? customerPrice : null,
        refundedAmount: String(b.payment_status || '').toUpperCase() === 'REFUNDED' ? customerPrice : 0
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
  })
};

export default bookingMapper;
