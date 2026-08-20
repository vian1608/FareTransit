import env from '../../config/env.mjs';
import flightService from '../flights/flight.service.mjs';
import bookingDemandApiClient from '../../services/bookingDemandApiClient.mjs';

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
let cityCatalogCache = { expiresAt: 0, items: [] };

const fallbackCities = [
  { type: 'city', city_id: -2125103, label: 'New York City, New York, United States', city: 'New York', country: 'United States' },
  { type: 'city', city_id: -2092174, label: 'Miami, Florida, United States', city: 'Miami', country: 'United States' },
  { type: 'city', city_id: -2140479, label: 'Amsterdam, Netherlands', city: 'Amsterdam', country: 'Netherlands' },
  { type: 'city', city_id: -2601889, label: 'London, United Kingdom', city: 'London', country: 'United Kingdom' },
  { type: 'city', city_id: -1456928, label: 'Paris, France', city: 'Paris', country: 'France' },
];

function localizedName(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    return String(value.fallback || value['en-us'] || value['en-gb'] || Object.values(value).find(Boolean) || '').trim();
  }
  return '';
}

function normalizeCity(item) {
  if (!item || typeof item !== 'object') return null;
  const id = Number(item.id ?? item.city);
  const city = localizedName(item.name);
  if (!Number.isFinite(id) || !city) return null;

  const country = localizedName(item.country?.name || item.country) || String(item.country_code || '').toUpperCase();
  const region = localizedName(item.region?.name || item.region);
  const label = [city, region, country].filter(Boolean).join(', ');

  return {
    type: 'city',
    city_id: id,
    label: label || city,
    city,
    country,
    coordinates: item.coordinates || null,
  };
}

function normalizeAirport(item) {
  if (!item) return null;
  const code = String(item.code || item.id || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return null;
  const name = String(item.name || item.label || `${code} Airport`).trim();
  const city = String(item.city || '').trim();
  const country = String(item.country || '').trim();
  return {
    type: 'airport',
    code,
    label: name.includes(`(${code})`) ? name : `${name} (${code})`,
    city,
    country,
  };
}

function score(item, query) {
  const q = query.toLowerCase();
  const code = String(item.code || '').toLowerCase();
  const city = String(item.city || '').toLowerCase();
  const label = String(item.label || '').toLowerCase();
  if (code === q) return 0;
  if (city === q) return 1;
  if (code.startsWith(q)) return 2;
  if (city.startsWith(q)) return 3;
  if (label.startsWith(q)) return 4;
  return 5;
}

function matches(item, query) {
  const q = query.toLowerCase();
  return [item.code, item.city, item.country, item.label]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(q));
}

async function fetchBookingCities() {
  if (!env.bookingDemandApiToken || !env.bookingAffiliateId) return fallbackCities;
  if (Date.now() < cityCatalogCache.expiresAt && cityCatalogCache.items.length) return cityCatalogCache.items;

  try {
    const response = await bookingDemandApiClient.request('/common/locations/cities', {
      method: 'POST',
      body: {},
      retryCount: 0,
    });
    const rawItems = Array.isArray(response?.data?.data) ? response.data.data : [];
    const items = rawItems.map(normalizeCity).filter(Boolean);
    if (items.length) {
      cityCatalogCache = { expiresAt: Date.now() + CACHE_TTL_MS, items };
      return items;
    }
  } catch {
    // Car-location autocomplete must remain usable even when the optional
    // Booking.com Demand API catalog is unavailable or not enabled.
  }

  return fallbackCities;
}

async function autocomplete(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];

  const [airportResult, cities] = await Promise.all([
    flightService.autocompleteAirports(q).catch(() => []),
    fetchBookingCities(),
  ]);

  const airports = (Array.isArray(airportResult) ? airportResult : [])
    .map(normalizeAirport)
    .filter(Boolean);

  const cityMatches = cities.filter((item) => matches(item, q));
  const merged = [...airports, ...cityMatches]
    .filter((item, index, all) => {
      const key = item.type === 'airport' ? `airport:${item.code}` : `city:${item.city_id}`;
      return all.findIndex((candidate) => (candidate.type === 'airport' ? `airport:${candidate.code}` : `city:${candidate.city_id}`) === key) === index;
    })
    .sort((a, b) => score(a, q) - score(b, q) || a.label.localeCompare(b.label));

  return merged.slice(0, 12);
}

export default { autocomplete };
