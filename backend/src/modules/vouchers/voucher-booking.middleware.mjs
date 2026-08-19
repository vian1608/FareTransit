import { calculateBookingTotal } from '../../shared/utils/pricing.helper.mjs';
import voucherService from './voucher.service.mjs';

/**
 * Customer booking pricing guard.
 *
 * Recalculates the normal website fare from the selected itinerary, then applies
 * a voucher only after server-side validation. The browser cannot lower the
 * amount by posting its own customer_price or voucher_discount values.
 */
export async function applyVoucherPricingToBooking(req, res, next) {
  try {
    const payload = req.body || {};
    const requestedCode = String(payload.voucher_code || payload.voucherCode || '').trim();
    const passengers = Array.isArray(payload.passengers) ? payload.passengers : [];
    const passengerCount = Math.max(1, passengers.length || Number.parseInt(payload.passengersCount || 1, 10));
    const currency = String(payload.currency || 'USD').toUpperCase();

    const canonicalPricing = calculateBookingTotal({
      outboundFlight: payload.flight,
      returnFlight: payload.returnFlight || payload.flight?.returnFlight || null,
      passengersCount: passengerCount,
      currency,
    });

    if (canonicalPricing.customerPriceNum <= 0) {
      const error = new Error('Unable to verify a valid booking price for voucher validation.');
      error.code = 'INVALID_BOOKING_PRICE';
      error.status = 400;
      throw error;
    }

    // Always replace customer-posted pricing with the server-derived standard
    // website price before any voucher is considered.
    payload.supplier_price = canonicalPricing.supplierPrice;
    payload.originalApiPrice = canonicalPricing.supplierPrice;
    payload.discount_percent = canonicalPricing.discountPercent;
    payload.discount_amount = canonicalPricing.discountAmount;
    payload.price_before_voucher = canonicalPricing.customerPrice;
    payload.customer_price = canonicalPricing.customerPrice;
    payload.displayedWebsitePrice = canonicalPricing.customerPrice;
    payload.total_amount = canonicalPricing.customerPrice;
    payload.voucher_id = null;
    payload.voucher_code = null;
    payload.voucher_discount = 0;
    payload.minimum_payable_floor = null;

    if (requestedCode) {
      const application = await voucherService.validate({
        code: requestedCode,
        supplierPrice: canonicalPricing.supplierPrice,
        priceBeforeVoucher: canonicalPricing.customerPrice,
        email: payload.email,
      });

      payload.voucher_id = application.voucherId;
      payload.voucher_code = application.code;
      payload.voucher_discount = application.appliedDiscount;
      payload.minimum_payable_floor = application.minimumPayableFloor;
      payload.customer_price = application.finalPrice;
      payload.displayedWebsitePrice = application.finalPrice;
      payload.total_amount = application.finalPrice;

      res.locals.voucherApplication = application;
      res.locals.voucherCustomerEmail = payload.email || null;
    }

    req.body = payload;

    // Record redemption after the booking controller has successfully produced a
    // booking id. This remains non-blocking so a history-write issue can never
    // turn a successfully persisted booking into a duplicate customer retry.
    if (res.locals.voucherApplication) {
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        const bookingId = body?.data?.booking?.id || body?.data?.id || body?.data?.booking_id || null;
        const confirmationCode = body?.data?.booking?.confirmation_code
          || body?.data?.booking?.confirmationCode
          || body?.data?.confirmation_code
          || body?.data?.confirmationCode
          || null;

        if (body?.success && bookingId) {
          voucherService.redeem({
            voucherApplication: res.locals.voucherApplication,
            bookingId,
            confirmationCode,
            email: res.locals.voucherCustomerEmail,
          }).catch((error) => {
            console.error('[Voucher] Non-blocking redemption history warning:', error.message);
          });
        }
        return originalJson(body);
      };
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

export default applyVoucherPricingToBooking;
