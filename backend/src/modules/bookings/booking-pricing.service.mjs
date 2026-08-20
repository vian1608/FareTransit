import supabase from '../../integrations/supabase/supabase.client.mjs';
import bookingRepository from './booking.repository.mjs';

function money(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    const err = new Error(`${label} must be a valid non-negative number.`);
    err.code = 'INVALID_PRICING_VALUE';
    err.status = 400;
    throw err;
  }
  return Math.round(parsed * 100) / 100;
}

export const bookingPricingService = {
  updatePricing: async ({
    bookingId,
    supplierFare,
    taxesAndFees = 0,
    agencyMarkup,
    customerTotal,
    currency = 'USD',
    reason,
    adminId = 'admin',
    expectedVersion = null,
  }) => {
    const booking = await bookingRepository.resolveBooking(bookingId);
    const supplierBase = money(supplierFare, 'Supplier fare');
    const taxesFees = money(taxesAndFees, 'Taxes and fees');
    const customer = money(customerTotal, 'Customer total');
    if (customer <= 0) {
      const err = new Error('Customer total must be greater than zero.');
      err.code = 'INVALID_CUSTOMER_TOTAL';
      err.status = 400;
      throw err;
    }

    const supplierCost = Math.round((supplierBase + taxesFees) * 100) / 100;
    const computedMargin = Math.round((customer - supplierCost) * 100) / 100;
    const suppliedMarkup = agencyMarkup === undefined || agencyMarkup === null || agencyMarkup === ''
      ? computedMargin
      : Math.round(Number(agencyMarkup) * 100) / 100;

    if (!Number.isFinite(suppliedMarkup)) {
      const err = new Error('Agency markup must be a valid number.');
      err.code = 'INVALID_AGENCY_MARKUP';
      err.status = 400;
      throw err;
    }
    // The server owns the arithmetic; do not persist a client markup that does not
    // reconcile to the authoritative customer total.
    if (Math.abs(suppliedMarkup - computedMargin) > 0.01) {
      const err = new Error(`Pricing does not reconcile: customer total must equal supplier fare + taxes/fees + agency markup.`);
      err.code = 'PRICING_TOTAL_MISMATCH';
      err.status = 400;
      throw err;
    }

    const normalizedCurrency = String(currency || 'USD').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
      const err = new Error('Currency must be a valid 3-letter code.');
      err.code = 'INVALID_CURRENCY';
      err.status = 400;
      throw err;
    }

    if (expectedVersion && booking.updated_at && String(expectedVersion) !== String(booking.updated_at)) {
      const err = new Error('This booking was updated elsewhere. Refresh it before saving pricing.');
      err.code = 'BOOKING_VERSION_CONFLICT';
      err.status = 409;
      throw err;
    }

    const now = new Date().toISOString();
    const bookingFields = {
      supplier_price: supplierCost,
      original_api_price: supplierCost,
      customer_price: customer,
      total_amount: customer,
      currency: normalizedCurrency,
      price_checked_at: now,
      updated_at: now,
    };

    let updateQuery = supabase.from('bookings').update(bookingFields).eq('id', booking.id);
    if (expectedVersion && booking.updated_at) updateQuery = updateQuery.eq('updated_at', booking.updated_at);
    const { data: updated, error: updateError } = await updateQuery.select().maybeSingle();
    if (updateError) {
      const err = new Error(`PRICING_UPDATE_FAILED: ${updateError.message}`);
      err.code = 'PRICING_UPDATE_FAILED';
      err.status = 400;
      throw err;
    }
    if (!updated) {
      const err = new Error('This booking changed before pricing could be saved. Refresh and retry.');
      err.code = 'BOOKING_VERSION_CONFLICT';
      err.status = 409;
      throw err;
    }

    const { error: revisionError } = await supabase.from('booking_price_revisions').insert({
      booking_id: booking.id,
      supplier_fare: supplierBase,
      base_fare: supplierBase,
      taxes: taxesFees,
      service_fee: 0,
      discount: 0,
      customer_total: customer,
      currency: normalizedCurrency,
      margin: computedMargin,
      reason: String(reason || 'Admin price update').trim(),
      admin_id: adminId,
      created_at: now,
    });
    if (revisionError) {
      // Roll the canonical totals back rather than reporting a partially-audited save.
      await supabase.from('bookings').update({
        supplier_price: booking.supplier_price,
        original_api_price: booking.original_api_price,
        customer_price: booking.customer_price,
        total_amount: booking.total_amount,
        currency: booking.currency,
        price_checked_at: booking.price_checked_at,
        updated_at: booking.updated_at,
      }).eq('id', booking.id);
      const err = new Error(`PRICING_REVISION_FAILED: ${revisionError.message}`);
      err.code = 'PRICING_REVISION_FAILED';
      err.status = 500;
      throw err;
    }

    await bookingRepository.recordAuditLog({
      bookingId: booking.id,
      action: 'PRICING_UPDATED',
      oldValue: {
        supplier_price: booking.supplier_price,
        customer_price: booking.customer_price ?? booking.total_amount,
        currency: booking.currency,
      },
      newValue: {
        supplier_base_fare: supplierBase,
        taxes_and_fees: taxesFees,
        supplier_price: supplierCost,
        agency_markup: computedMargin,
        customer_price: customer,
        currency: normalizedCurrency,
      },
      actor: adminId,
    });

    return {
      booking: await bookingRepository.getCompleteBookingById(booking.id),
      pricing: {
        supplierFare: supplierBase,
        taxesAndFees: taxesFees,
        supplierCost,
        agencyMarkup: computedMargin,
        customerTotal: customer,
        currency: normalizedCurrency,
        reason: String(reason || '').trim(),
      },
    };
  },
};

export default bookingPricingService;
