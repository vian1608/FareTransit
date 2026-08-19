import { getAirportDisplayName, normalizeIataCode } from './airportIdentity';

export function resolveSearchAirport(value, selectedAirport) {
  const selectedCode = normalizeIataCode(selectedAirport);
  if (selectedCode) {
    return {
      code: selectedCode,
      display: getAirportDisplayName(selectedAirport) || selectedCode,
      airport: { ...selectedAirport, code: selectedCode },
    };
  }

  const typedCode = normalizeIataCode(value);
  if (typedCode && /^[A-Z]{3}$/i.test(String(value || '').trim())) {
    return {
      code: typedCode,
      display: typedCode,
      airport: { code: typedCode, name: typedCode, city: typedCode, manualCode: true },
    };
  }

  return null;
}

export function buildFlightSearchQuery({ origin, destination, departure, returnDate, adults = 1, children = 0, infants = 0, travelClass = 'economy', currency = 'USD', tripType = 'oneway' }) {
  if (!origin?.code || !destination?.code || !departure) {
    throw new Error('A valid origin, destination and departure date are required.');
  }

  const params = new URLSearchParams({
    from: origin.code,
    to: destination.code,
    fromDisplay: origin.display || origin.code,
    toDisplay: destination.display || destination.code,
    departure,
    adults: String(Math.max(1, Number(adults) || 1)),
    children: String(Math.max(0, Number(children) || 0)),
    infants: String(Math.max(0, Number(infants) || 0)),
    travelClass,
    currency,
    tripType,
  });

  if (returnDate) params.set('returnDate', returnDate);
  return params;
}
