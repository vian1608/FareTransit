export function normalizeIataCode(value) {
  if (!value) return '';

  if (typeof value === 'object') {
    const code = String(value.code || value.iata || value.id || '').trim().toUpperCase();
    return /^[A-Z]{3}$/.test(code) ? code : '';
  }

  const text = String(value).trim();
  if (/^[A-Z]{3}$/i.test(text)) return text.toUpperCase();

  const parenthetical = text.match(/\(([A-Z]{3})\)/i);
  return parenthetical ? parenthetical[1].toUpperCase() : '';
}

export function isValidIataCode(value) {
  return Boolean(normalizeIataCode(value));
}

export function getAirportDisplayName(value) {
  if (!value) return '';
  if (typeof value === 'object') {
    return String(value.city || value.name || normalizeIataCode(value) || '').trim();
  }

  const text = String(value).trim();
  const withoutCode = text.replace(/\s*\([A-Z]{3}\)\s*$/i, '').trim();
  return withoutCode || normalizeIataCode(text) || '';
}

export function buildAirportSelection(rawValue, knownAirport = null) {
  if (knownAirport) {
    const code = normalizeIataCode(knownAirport);
    if (!code) return { code: '', city: String(rawValue || ''), name: String(rawValue || ''), unresolved: true };
    return {
      ...knownAirport,
      code,
      city: knownAirport.city || knownAirport.name || code,
      name: knownAirport.name || knownAirport.city || code,
      unresolved: false,
    };
  }

  const text = String(rawValue || '').trim();
  const code = normalizeIataCode(text);
  if (code && /^[A-Z]{3}$/i.test(text)) {
    return { code, city: code, name: code, manualCode: true, unresolved: false };
  }

  return { code: '', city: text, name: text, unresolved: true };
}

export function canonicalSearchAirport(searchParams, side) {
  const isFrom = side === 'from';
  const objectValue = isFrom
    ? (searchParams?.origin || searchParams?.fromAirport)
    : (searchParams?.destination || searchParams?.toAirport);
  const explicitCode = isFrom ? searchParams?.fromCode : searchParams?.toCode;
  const rawValue = isFrom ? searchParams?.from : searchParams?.to;

  return normalizeIataCode(explicitCode) || normalizeIataCode(objectValue) || normalizeIataCode(rawValue);
}
