const toFiniteMoney = (value, fallback = 0) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const precisePerTraveler = (partyAmount, passengerCount) => {
  const count = Math.max(1, Number.parseInt(passengerCount || 1, 10));
  return (toFiniteMoney(partyAmount) / count).toFixed(6);
};

/**
 * Convert a supplier/search fare into the legacy checkout contribution contract.
 *
 * Supplier flight results use PARTY TOTAL pricing. BookingPage historically
 * expects each selected leg to contain a PER-TRAVELER contribution and then
 * multiplies by passenger count. This adapter is the only place allowed to
 * bridge those two meanings, preventing party totals from being multiplied
 * by the passenger count a second time.
 *
 * Round-trip Google Flights results are special: the outbound result is already
 * a quote for the complete round trip. Its contribution is deferred until the
 * user chooses a return flight through the provider departure token. The return
 * selection then carries the final complete-trip quote.
 */
export function prepareFlightForBooking(flight, travelersCount = 1) {
  if (!flight?.price) return flight;

  const price = flight.price;
  const sourceScope = price.priceScope || price.scope || '';

  // Legacy/admin/imported itineraries may already be per-traveler. Do not guess.
  if (sourceScope !== 'party_total') return flight;

  const passengerCount = Math.max(
    1,
    Number.parseInt(price.passengerCount || travelersCount || 1, 10),
  );

  const partyFinal = toFiniteMoney(price.total ?? price.finalPrice, 0);
  const partyOriginal = toFiniteMoney(
    price.originalApiPrice ?? price.originalPrice,
    partyFinal,
  );
  const partyDiscount = Math.max(
    0,
    toFiniteMoney(price.discountAmount, partyOriginal - partyFinal),
  );

  const isDeferredRoundTripOutbound =
    price.tripScope === 'roundtrip_total'
    && price.selectionStage === 'outbound';

  const bookingOriginal = isDeferredRoundTripOutbound
    ? '0.000000'
    : precisePerTraveler(partyOriginal, passengerCount);
  const bookingFinal = isDeferredRoundTripOutbound
    ? '0.000000'
    : precisePerTraveler(partyFinal, passengerCount);
  const bookingDiscount = isDeferredRoundTripOutbound
    ? '0.000000'
    : precisePerTraveler(partyDiscount, passengerCount);

  return {
    ...flight,
    price: {
      ...price,
      // Preserve exact supplier amounts for display/audit/debugging.
      partyOriginalPrice: partyOriginal.toFixed(2),
      partyFinalPrice: partyFinal.toFixed(2),
      partyDiscountAmount: partyDiscount.toFixed(2),
      sourcePriceScope: 'party_total',
      passengerCount,

      // Compatibility values consumed by BookingPage.calculateTotal().
      originalApiPrice: bookingOriginal,
      finalPrice: bookingFinal,
      total: bookingFinal,
      discountAmount: bookingDiscount,
      priceScope: 'per_traveler_booking_contribution',
      bookingContribution: isDeferredRoundTripOutbound
        ? 'deferred_until_return_selection'
        : 'selected_trip_total',
    },
  };
}

export default prepareFlightForBooking;
