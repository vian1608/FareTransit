export const GLOBAL_MINIMUM_BOOKING_AMOUNT = 150;
export const GLOBAL_MINIMUM_PAYABLE_PERCENT = 60;

const toCents = (value) => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed * 100));
};

const fromCents = (value) => Number((Math.max(0, Math.round(value || 0)) / 100).toFixed(2));

export function calculateVoucherApplication({
  supplierPrice,
  priceBeforeVoucher,
  voucherAmount,
  minimumBookingAmount = GLOBAL_MINIMUM_BOOKING_AMOUNT,
  minimumPayablePercent = GLOBAL_MINIMUM_PAYABLE_PERCENT,
} = {}) {
  const supplierCents = toCents(supplierPrice);
  const beforeVoucherCents = toCents(priceBeforeVoucher);
  const requestedVoucherCents = toCents(voucherAmount);
  const effectiveMinimumBookingCents = Math.max(
    toCents(GLOBAL_MINIMUM_BOOKING_AMOUNT),
    toCents(minimumBookingAmount),
  );
  const effectiveMinimumPayablePercent = Math.max(
    GLOBAL_MINIMUM_PAYABLE_PERCENT,
    Number.parseFloat(minimumPayablePercent) || GLOBAL_MINIMUM_PAYABLE_PERCENT,
  );

  if (supplierCents <= 0 || beforeVoucherCents <= 0) {
    return {
      eligible: false,
      code: 'INVALID_BOOKING_AMOUNT',
      message: 'A valid booking amount is required before a voucher can be applied.',
    };
  }

  if (requestedVoucherCents <= 0) {
    return {
      eligible: false,
      code: 'INVALID_VOUCHER_AMOUNT',
      message: 'This voucher does not contain a valid discount amount.',
    };
  }

  if (beforeVoucherCents < effectiveMinimumBookingCents) {
    return {
      eligible: false,
      code: 'VOUCHER_MINIMUM_NOT_MET',
      message: `Voucher requires a minimum booking amount of $${fromCents(effectiveMinimumBookingCents).toFixed(2)} after the standard website discount.`,
      minimumBookingAmount: fromCents(effectiveMinimumBookingCents),
    };
  }

  const minimumPayableFloorCents = Math.ceil(
    supplierCents * (effectiveMinimumPayablePercent / 100),
  );
  const maximumVoucherCents = Math.max(0, beforeVoucherCents - minimumPayableFloorCents);

  if (maximumVoucherCents <= 0) {
    return {
      eligible: false,
      code: 'VOUCHER_PAYMENT_FLOOR_REACHED',
      message: `This booking is already at the minimum payable amount of ${effectiveMinimumPayablePercent}% of the ticket value.`,
      minimumPayablePercent: effectiveMinimumPayablePercent,
      minimumPayableFloor: fromCents(minimumPayableFloorCents),
    };
  }

  const appliedVoucherCents = Math.min(requestedVoucherCents, maximumVoucherCents);
  const finalCents = beforeVoucherCents - appliedVoucherCents;

  return {
    eligible: true,
    requestedDiscount: fromCents(requestedVoucherCents),
    appliedDiscount: fromCents(appliedVoucherCents),
    capped: appliedVoucherCents < requestedVoucherCents,
    maximumVoucherDiscount: fromCents(maximumVoucherCents),
    minimumBookingAmount: fromCents(effectiveMinimumBookingCents),
    minimumPayablePercent: effectiveMinimumPayablePercent,
    minimumPayableFloor: fromCents(minimumPayableFloorCents),
    supplierPrice: fromCents(supplierCents),
    priceBeforeVoucher: fromCents(beforeVoucherCents),
    finalPrice: fromCents(finalCents),
    message: appliedVoucherCents < requestedVoucherCents
      ? `Voucher applied up to $${fromCents(appliedVoucherCents).toFixed(2)} so the final payment stays at or above ${effectiveMinimumPayablePercent}% of the ticket value.`
      : `Voucher applied: $${fromCents(appliedVoucherCents).toFixed(2)} off.`,
  };
}

export default {
  GLOBAL_MINIMUM_BOOKING_AMOUNT,
  GLOBAL_MINIMUM_PAYABLE_PERCENT,
  calculateVoucherApplication,
};
