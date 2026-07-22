import airlinesData from '../data/airlinesData.json';

const airlinesBySlug = Object.fromEntries(airlinesData.map((a) => [a.slug, a]));

/** "american-airlines" → "American Airlines" (uses catalog when available) */
export function getAirlineFromSlug(slug) {
  if (!slug || !String(slug).trim()) return null;
  const normalized = slug.toLowerCase().trim();
  const record = airlinesBySlug[normalized];
  if (record) {
    return { slug: record.slug, name: record.name, domain: record.domain };
  }
  const name = normalized
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  return { slug: normalized, name, domain: null };
}

export function getAirlineDisplayName(slug) {
  return getAirlineFromSlug(slug)?.name || 'Airline';
}
