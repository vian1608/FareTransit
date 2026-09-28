import parseEnterpriseClient from './parse-enterprise.client.mjs';

const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 250;
const cache = new Map();

function cacheKey(query, countryCode) {
  return `${String(countryCode || 'US').toUpperCase()}:${String(query || '').trim().toLowerCase()}`;
}

function readCache(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (item.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return item.data;
}

function writeCache(key, data) {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

function formatAddress(address = {}) {
  return [address.street, address.city, address.state, address.postal, address.country]
    .filter(Boolean)
    .join(', ');
}

function normalizeLocation(item = {}) {
  const id = String(item.id || '').trim();
  const name = String(item.name || '').trim();
  if (!id || !name) return null;

  const type = String(item.type || 'branch').toLowerCase();
  const airportCode = String(item.airport_code || '').trim().toUpperCase();
  const address = item.address && typeof item.address === 'object' ? item.address : {};
  const addressLabel = formatAddress(address);

  return {
    id,
    provider: 'parse-enterprise',
    supplier: 'Enterprise',
    type: type === 'airport' ? 'airport' : 'branch',
    code: airportCode || null,
    airport: airportCode || null,
    airportCode: airportCode || null,
    label: airportCode && !name.includes(`(${airportCode})`) ? `${name} (${airportCode})` : name,
    name,
    city: address.city || '',
    state: address.state || '',
    postalCode: address.postal || '',
    country: address.country || '',
    address: addressLabel,
    phone: item.phone || null,
    afterHoursReturn: Boolean(item.after_hours_return),
    gps: item.gps || null
  };
}

async function autocomplete(query, { countryCode = 'US' } = {}) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];

  const country = String(countryCode || 'US').trim().toUpperCase();
  const key = cacheKey(q, country);
  const cached = readCache(key);
  if (cached) return cached;

  const payload = await parseEnterpriseClient.searchLocations({ query: q, countryCode: country });
  const locations = Array.isArray(payload?.locations) ? payload.locations : [];
  const normalized = locations
    .map(normalizeLocation)
    .filter(Boolean)
    .slice(0, 20);

  writeCache(key, normalized);
  return normalized;
}

export { normalizeLocation };
export default { autocomplete };
