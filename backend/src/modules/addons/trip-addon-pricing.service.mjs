const FLEX_RATE = 0.10;
const FLEX_TERMS_VERSION = 'FLEX_V1';
const BAGGAGE_TERMS_VERSION = 'BAGGAGE_REQUEST_V1';
const ADDON_VERSION = 'TRIP_ADDONS_V1';
const MAX_BAGS_PER_TRAVELER_DIRECTION = 3;

function money(value) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? Number(number.toFixed(2)) : 0;
}

function positive(value) {
  return Math.max(0, money(value));
}

function flightSellingPrice(flight = null) {
  if (!flight || typeof flight !== 'object') return 0;
  const candidates = [
    flight?.price?.finalPrice,
    flight?.price?.total,
    flight?.price?.customerPrice,
    flight?.finalPrice,
    flight?.totalPrice,
    flight?.price,
  ];
  for (const candidate of candidates) {
    const amount = positive(candidate);
    if (amount > 0) return amount;
  }
  return 0;
}

export function getPassengerCount(searchParams = {}) {
  const adults = Number.parseInt(searchParams?.adults ?? 1, 10) || 0;
  const children = Number.parseInt(searchParams?.children ?? 0, 10) || 0;
  const infants = Number.parseInt(searchParams?.infants ?? 0, 10) || 0;
  return Math.max(1, adults + children + infants);
}

export function calculateTicketSellingBase(checkoutPayload = {}) {
  const passengerCount = getPassengerCount(checkoutPayload.searchParams || {});
  const outbound = flightSellingPrice(checkoutPayload.selectedFlight);
  const returned = flightSellingPrice(checkoutPayload.returnFlight || checkoutPayload.selectedReturnFlight);
  return money((outbound + returned) * passengerCount);
}

function normalizeBaggage(rawBaggage, { passengerCount, hasReturn }) {
  if (!Array.isArray(rawBaggage)) return [];
  const deduped = new Map();
  rawBaggage.forEach((entry) => {
    const travelerIndex = Number.parseInt(entry?.travelerIndex ?? entry?.passengerIndex, 10);
    const direction = String(entry?.direction || entry?.journeyDirection || 'OUTBOUND').trim().toUpperCase();
    const quantity = Math.min(MAX_BAGS_PER_TRAVELER_DIRECTION, Math.max(0, Number.parseInt(entry?.quantity, 10) || 0));
    if (!Number.isInteger(travelerIndex) || travelerIndex < 0 || travelerIndex >= passengerCount) return;
    if (!['OUTBOUND','RETURN'].includes(direction)) return;
    if (direction === 'RETURN' && !hasReturn) return;
    if (quantity <= 0) return;
    deduped.set(`${travelerIndex}:${direction}`, {
      addonType: 'CHECKED_BAGGAGE',
      travelerIndex,
      direction,
      quantity,
      weightKg: 23,
      priceMode: 'REQUEST_ONLY',
      unitPrice: 0,
      totalPrice: 0,
      currency: 'USD',
      status: 'REQUESTED',
      termsVersion: BAGGAGE_TERMS_VERSION,
      message: 'This submits a baggage request only. Airline availability and the exact fee are confirmed after the flight reservation and paid separately.',
    });
  });
  return [...deduped.values()];
}

export function buildAuthoritativeTripAddonQuote(checkoutPayload = {}) {
  const ticketBase = calculateTicketSellingBase(checkoutPayload);
  const passengerCount = getPassengerCount(checkoutPayload.searchParams || {});
  const requested = checkoutPayload.addons || checkoutPayload.tripAddons || {};
  const flexSelected = requested?.flexAssist?.selected === true;
  const flexPrice = flexSelected ? money(ticketBase * FLEX_RATE) : 0;
  const baggage = normalizeBaggage(requested?.baggage, {
    passengerCount,
    hasReturn: Boolean(checkoutPayload.returnFlight || checkoutPayload.selectedReturnFlight),
  });
  return {
    version: ADDON_VERSION,
    currency: 'USD',
    ticketBase,
    passengerCount,
    flexAssist: {
      addonType: 'FLEX_ASSIST',
      selected: flexSelected,
      rate: FLEX_RATE,
      price: flexPrice,
      status: flexSelected ? 'ACTIVE' : 'NOT_SELECTED',
      termsVersion: FLEX_TERMS_VERSION,
      serviceScope: 'CHANGE_ASSISTANCE',
      disclaimer: 'Flex Assist is an agency service, not travel insurance or an airline flexible fare. Airline fare differences, penalties, taxes, availability and fare rules may still apply.',
    },
    baggage,
    baggageTotal: 0,
    addOnTotal: flexPrice,
  };
}

export function applyAuthoritativeTripAddonPricing(bookingPayload = {}, quote = {}) {
  const ticketBase = positive(quote.ticketBase);
  const voucherDiscount = Math.min(ticketBase, positive(bookingPayload.voucher_discount));
  const minimumFloor = positive(bookingPayload.minimum_payable_floor);
  const ticketDueAfterVoucher = Math.max(ticketBase - voucherDiscount, minimumFloor || 0);
  const addOnTotal = positive(quote.addOnTotal);
  const finalCustomerTotal = money(ticketDueAfterVoucher + addOnTotal);
  const priceBeforeVoucher = money(ticketBase + addOnTotal);
  return {
    ...bookingPayload,
    customer_price: finalCustomerTotal,
    customerPrice: finalCustomerTotal,
    total_amount: finalCustomerTotal,
    totalAmount: finalCustomerTotal,
    amount: finalCustomerTotal,
    price: finalCustomerTotal,
    displayedWebsitePrice: finalCustomerTotal,
    displayedPrice: finalCustomerTotal,
    price_before_voucher: priceBeforeVoucher,
    ticket_component_total: ticketDueAfterVoucher,
    add_on_total: addOnTotal,
    flex_assist_fee: positive(quote?.flexAssist?.price),
    trip_addons: quote,
    pricing: {
      ...(bookingPayload.pricing || {}),
      ticketComponentTotal: ticketDueAfterVoucher,
      addOnTotal,
      totalPrice: finalCustomerTotal,
      finalCustomerTotal,
      tripAddons: quote,
    },
  };
}

export default {
  FLEX_RATE,
  FLEX_TERMS_VERSION,
  BAGGAGE_TERMS_VERSION,
  ADDON_VERSION,
  getPassengerCount,
  calculateTicketSellingBase,
  buildAuthoritativeTripAddonQuote,
  applyAuthoritativeTripAddonPricing,
};
