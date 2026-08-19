/**
 * Reusable Pricing Helper for FareTransit
 * Calculates 10% flight discount using integer cents math to eliminate floating point precision errors.
 */

export function calculateFlightDiscount({ originalPrice, isMock = false, currency = 'USD' }) {
  const parsedOriginal = parseFloat(originalPrice || 0);

  if (isNaN(parsedOriginal) || parsedOriginal <= 0) {
    return {
      originalPrice: '0.00',
      originalPriceNum: 0,
      discountPercent: 0,
      discountAmount: '0.00',
      discountAmountNum: 0,
      finalPrice: '0.00',
      finalPriceNum: 0,
      currency: currency.toUpperCase(),
      formattedOriginal: '$0.00',
      formattedDiscount: '$0.00',
      formattedFinal: '$0.00',
      isMock: true,
    };
  }

  const originalCents = Math.round(parsedOriginal * 100);

  if (isMock) {
    const originalPriceStr = (originalCents / 100).toFixed(2);
    const originalPriceNum = originalCents / 100;
    return {
      originalPrice: originalPriceStr,
      originalPriceNum,
      discountPercent: 0,
      discountAmount: '0.00',
      discountAmountNum: 0,
      finalPrice: originalPriceStr,
      finalPriceNum: originalPriceNum,
      currency: currency.toUpperCase(),
      formattedOriginal: `$${originalPriceStr}`,
      formattedDiscount: '$0.00',
      formattedFinal: `$${originalPriceStr}`,
      isMock: true,
    };
  }

  const discountPercent = 10;
  const discountAmountCents = Math.round(originalCents * (discountPercent / 100));
  const finalCents = originalCents - discountAmountCents;

  const originalPriceStr = (originalCents / 100).toFixed(2);
  const discountAmountStr = (discountAmountCents / 100).toFixed(2);
  const finalPriceStr = (finalCents / 100).toFixed(2);

  const originalPriceNum = originalCents / 100;
  const discountAmountNum = discountAmountCents / 100;
  const finalPriceNum = finalCents / 100;

  return {
    originalPrice: originalPriceStr,
    originalPriceNum,
    discountPercent,
    discountAmount: discountAmountStr,
    discountAmountNum,
    finalPrice: finalPriceStr,
    finalPriceNum,
    currency: currency.toUpperCase(),
    formattedOriginal: `$${originalPriceStr}`,
    formattedDiscount: `$${discountAmountStr}`,
    formattedFinal: `$${finalPriceStr}`,
    isMock: false,
  };
}

const numberOr = (value, fallback = 0) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const roundCents = (value) => Math.round(numberOr(value) * 100);

/**
 * Normalize a flight fare into PARTY-TOTAL cents.
 *
 * New supplier/search offers explicitly declare party_total pricing. Older
 * admin/imported booking objects are kept backward compatible and are treated
 * as per-traveler contributions, then multiplied by passenger count exactly
 * once.
 */
function resolveFlightPartyFare(flight, passCount, currency) {
  if (!flight) return null;

  const price = flight.price || {};
  const priceScope = price.priceScope || '';
  const sourcePriceScope = price.sourcePriceScope || '';
  const hasPreservedPartyFare = sourcePriceScope === 'party_total'
    && (price.partyOriginalPrice !== undefined || price.partyFinalPrice !== undefined);
  const isPartyTotal = priceScope === 'party_total' || hasPreservedPartyFare;

  const tripScope = price.tripScope || '';
  const selectionStage = price.selectionStage || '';
  const isMock = !!flight.isMock;

  if (isPartyTotal) {
    const partyOriginal = numberOr(
      price.partyOriginalPrice,
      numberOr(price.originalApiPrice ?? price.originalPrice ?? price.total, 0),
    );
    const partyFinalFromSource = numberOr(
      price.partyFinalPrice,
      numberOr(price.finalPrice ?? price.total, partyOriginal),
    );

    // Prefer the explicit supplier/member final when present. If an old party
    // object only contains an original fare, calculate the normal site discount.
    const hasExplicitFinal = price.partyFinalPrice !== undefined
      || price.finalPrice !== undefined
      || price.total !== undefined;
    const discountCalc = calculateFlightDiscount({
      originalPrice: partyOriginal,
      isMock,
      currency,
    });
    const partyFinal = hasExplicitFinal
      ? partyFinalFromSource
      : discountCalc.finalPriceNum;

    return {
      originalCents: roundCents(partyOriginal),
      finalCents: roundCents(partyFinal),
      isMock,
      tripScope,
      selectionStage,
      isPartyTotal: true,
    };
  }

  const perTravelerOriginal = numberOr(
    price.originalApiPrice ?? price.originalPrice ?? price.total,
    0,
  );
  const perTravelerFinal = numberOr(
    price.finalPrice ?? price.total,
    perTravelerOriginal,
  );

  return {
    originalCents: roundCents(perTravelerOriginal) * passCount,
    finalCents: roundCents(perTravelerFinal) * passCount,
    isMock,
    tripScope,
    selectionStage,
    isPartyTotal: false,
  };
}

const makeBookingPricingResult = ({ originalCents, finalCents, passCount, currency, isMock }) => {
  const safeOriginalCents = Math.max(0, Math.round(originalCents || 0));
  const safeFinalCents = Math.max(0, Math.round(finalCents || 0));
  const discountCents = isMock ? 0 : Math.max(0, safeOriginalCents - safeFinalCents);

  const supplierPriceStr = (safeOriginalCents / 100).toFixed(2);
  const discountAmountStr = (discountCents / 100).toFixed(2);
  const customerPriceStr = (safeFinalCents / 100).toFixed(2);

  return {
    supplierPrice: supplierPriceStr,
    supplierPriceNum: safeOriginalCents / 100,
    discountPercent: isMock || discountCents <= 0 ? 0 : 10,
    discountAmount: discountAmountStr,
    discountAmountNum: discountCents / 100,
    customerPrice: customerPriceStr,
    customerPriceNum: safeFinalCents / 100,
    passengersCount: passCount,
    currency: currency.toUpperCase(),
    formattedSupplierPrice: `$${supplierPriceStr}`,
    formattedDiscountAmount: `$${discountAmountStr}`,
    formattedCustomerPrice: `$${customerPriceStr}`,
    isMock: !!isMock,
  };
};

/**
 * Calculates the booking total while respecting the fare's declared scope.
 *
 * Rules:
 *  - party_total is already the total for all travelers: never multiply again.
 *  - legacy/per-traveler fares are multiplied by passenger count once.
 *  - a round-trip return result selected through the supplier departure token
 *    is the final complete-trip quote, so it replaces (not adds to) the
 *    provisional outbound round-trip quote.
 */
export function calculateBookingTotal({ outboundFlight, returnFlight = null, passengersCount = 1, currency = 'USD' }) {
  const passCount = Math.max(1, parseInt(passengersCount || 1, 10));
  const outbound = resolveFlightPartyFare(outboundFlight, passCount, currency);
  const returning = resolveFlightPartyFare(returnFlight, passCount, currency);

  if (!outbound && !returning) {
    return makeBookingPricingResult({
      originalCents: 0,
      finalCents: 0,
      passCount,
      currency,
      isMock: true,
    });
  }

  // The return-token response is the complete selected round-trip quote. Using
  // outbound + return here would double count the same trip.
  if (
    returning?.isPartyTotal
    && returning.tripScope === 'roundtrip_total'
    && returning.selectionStage === 'return'
  ) {
    return makeBookingPricingResult({
      originalCents: returning.originalCents,
      finalCents: returning.finalCents,
      passCount,
      currency,
      isMock: returning.isMock,
    });
  }

  // A raw outbound round-trip offer is already a complete-trip party quote.
  // Treat it as one quote when no finalized return-token selection is present.
  if (
    outbound?.isPartyTotal
    && outbound.tripScope === 'roundtrip_total'
    && outbound.selectionStage === 'outbound'
  ) {
    return makeBookingPricingResult({
      originalCents: outbound.originalCents,
      finalCents: outbound.finalCents,
      passCount,
      currency,
      isMock: outbound.isMock,
    });
  }

  const originalCents = (outbound?.originalCents || 0) + (returning?.originalCents || 0);
  const finalCents = (outbound?.finalCents || 0) + (returning?.finalCents || 0);
  const isMockBooking = !!outbound?.isMock || !!returning?.isMock;

  return makeBookingPricingResult({
    originalCents,
    finalCents,
    passCount,
    currency,
    isMock: isMockBooking,
  });
}

export const moneyToCents = (value) => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).replace(/[$,\s]/g, '');
  const number = Number(normalized);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 100);
};

export const centsToMoney = (cents) => {
  return (Number(cents || 0) / 100).toFixed(2);
};

export default {
  calculateFlightDiscount,
  calculateBookingTotal,
  moneyToCents,
  centsToMoney,
};
