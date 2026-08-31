import env from '../../config/env.mjs';

const PROVIDER_TIMEOUT_MS = 20000;
const BAGGAGE_MARKUP_RATE = 0.20;
const MAX_PRICED_BAGS = 6;

function money(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
}

function normalizeCurrency(value) {
  const currency = String(value || 'USD').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : 'USD';
}

function parseCheckedBagPrice(value) {
  const text = String(value || '').trim().replace(/,/g, '');
  if (!text || /\d+\s*[-–]\s*\d+/.test(text)) return null;

  const ordinalMatch = text.match(/\b(\d+)(?:st|nd|rd|th)\s+checked\s+bag\s*:\s*(?:[A-Z]{3}\s*)?[$€£]?\s*(\d+(?:\.\d{1,2})?)\s*$/i);
  if (ordinalMatch) {
    const bagNumber = Number.parseInt(ordinalMatch[1], 10);
    const price = money(ordinalMatch[2]);
    if (bagNumber >= 1 && bagNumber <= MAX_PRICED_BAGS && price > 0) {
      return { bagNumber, sourcePrice: price, sourceLabel: text };
    }
  }

  const genericMatch = text.match(/\bchecked\s+bag\s*:\s*(?:[A-Z]{3}\s*)?[$€£]?\s*(\d+(?:\.\d{1,2})?)\s*$/i);
  if (genericMatch) {
    const price = money(genericMatch[1]);
    if (price > 0) return { bagNumber: 1, sourcePrice: price, sourceLabel: text };
  }

  return null;
}

function parsePriceList(list = []) {
  if (!Array.isArray(list)) return [];
  const byBagNumber = new Map();
  list.forEach((entry) => {
    const parsed = parseCheckedBagPrice(entry);
    if (parsed && !byBagNumber.has(parsed.bagNumber)) byBagNumber.set(parsed.bagNumber, parsed);
  });
  return [...byBagNumber.values()].sort((a, b) => a.bagNumber - b.bagNumber);
}

function customerize(items, { currency, scope }) {
  return items.map((item) => ({
    bagNumber: item.bagNumber,
    label: `${item.bagNumber}${item.bagNumber === 1 ? 'st' : item.bagNumber === 2 ? 'nd' : item.bagNumber === 3 ? 'rd' : 'th'} checked bag`,
    sourcePrice: money(item.sourcePrice),
    customerPrice: money(item.sourcePrice * (1 + BAGGAGE_MARKUP_RATE)),
    currency,
    scope,
    sourceLabel: item.sourceLabel || null,
  }));
}

function combineRoundTrip(departing = [], returning = [], currency) {
  const outbound = new Map(parsePriceList(departing).map((item) => [item.bagNumber, item]));
  const inbound = new Map(parsePriceList(returning).map((item) => [item.bagNumber, item]));
  const commonBagNumbers = [...outbound.keys()].filter((bagNumber) => inbound.has(bagNumber)).sort((a, b) => a - b);
  return customerize(commonBagNumbers.map((bagNumber) => ({
    bagNumber,
    sourcePrice: money(outbound.get(bagNumber).sourcePrice + inbound.get(bagNumber).sourcePrice),
    sourceLabel: `${outbound.get(bagNumber).sourceLabel} + ${inbound.get(bagNumber).sourceLabel}`,
  })), { currency, scope: 'ROUND_TRIP' });
}

function firstAirlineBaggagePrices(data = {}) {
  const options = Array.isArray(data.booking_options) ? data.booking_options : [];
  for (const option of options) {
    const together = option?.together;
    if (together?.airline === true && Array.isArray(together?.baggage_prices)) return together.baggage_prices;
  }
  for (const option of options) {
    const together = option?.together;
    if (Array.isArray(together?.baggage_prices)) return together.baggage_prices;
  }
  return [];
}

export async function getPricedBaggageOptions({ bookingToken, currency = 'USD' } = {}) {
  const token = String(bookingToken || '').trim();
  const normalizedCurrency = normalizeCurrency(currency);
  if (!token || !env.serpapiApiKey) {
    return { available: false, currency: normalizedCurrency, markupRate: BAGGAGE_MARKUP_RATE, items: [] };
  }

  const params = new URLSearchParams({
    engine: 'google_flights',
    booking_token: token,
    api_key: env.serpapiApiKey,
    hl: 'en',
    gl: 'us',
    currency: normalizedCurrency,
  });

  const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`, {
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data?.error || 'Unable to retrieve airline baggage pricing.');
    error.code = 'BAGGAGE_PRICING_UNAVAILABLE';
    error.status = response.status || 502;
    throw error;
  }

  const baggagePrices = data?.baggage_prices || {};
  let items = customerize(parsePriceList(baggagePrices.together), {
    currency: normalizedCurrency,
    scope: 'ITINERARY',
  });

  if (!items.length && Array.isArray(baggagePrices.departing) && Array.isArray(baggagePrices.returning)) {
    items = combineRoundTrip(baggagePrices.departing, baggagePrices.returning, normalizedCurrency);
  }

  if (!items.length && Array.isArray(baggagePrices.departing) && !Array.isArray(baggagePrices.returning)) {
    items = customerize(parsePriceList(baggagePrices.departing), {
      currency: normalizedCurrency,
      scope: 'OUTBOUND',
    });
  }

  if (!items.length) {
    items = customerize(parsePriceList(firstAirlineBaggagePrices(data)), {
      currency: normalizedCurrency,
      scope: 'ITINERARY',
    });
  }

  return {
    available: items.length > 0,
    currency: normalizedCurrency,
    markupRate: BAGGAGE_MARKUP_RATE,
    items,
    source: 'GOOGLE_FLIGHTS',
    pricingNote: 'FareTransit baggage quotes are based on airline-provided baggage pricing and include FareTransit handling. Final availability is confirmed after booking.',
  };
}

export { BAGGAGE_MARKUP_RATE, parseCheckedBagPrice };
export default { getPricedBaggageOptions };
