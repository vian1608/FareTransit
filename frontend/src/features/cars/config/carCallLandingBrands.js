export const CAR_CALL_LANDING_CANONICAL = 'https://www.faretransit.com/car-rental/call-now';

export const CAR_CALL_BRANDS = Object.freeze({
  hertz: Object.freeze({
    key: 'hertz',
    displayName: 'Hertz',
    headline: 'Looking for a Hertz Rental?',
  }),
  avis: Object.freeze({
    key: 'avis',
    displayName: 'Avis',
    headline: 'Looking for an Avis Rental?',
  }),
  budget: Object.freeze({
    key: 'budget',
    displayName: 'Budget',
    headline: 'Looking for a Budget Rental?',
  }),
  enterprise: Object.freeze({
    key: 'enterprise',
    displayName: 'Enterprise',
    headline: 'Looking for an Enterprise Rental?',
  }),
  national: Object.freeze({
    key: 'national',
    displayName: 'National',
    headline: 'Looking for a National Rental?',
  }),
  dollar: Object.freeze({
    key: 'dollar',
    displayName: 'Dollar',
    headline: 'Looking for a Dollar Rental?',
  }),
  alamo: Object.freeze({
    key: 'alamo',
    displayName: 'Alamo',
    headline: 'Looking for an Alamo Rental?',
  }),
  sixt: Object.freeze({
    key: 'sixt',
    displayName: 'SIXT',
    headline: 'Looking for a SIXT Rental?',
  }),
  thrifty: Object.freeze({
    key: 'thrifty',
    displayName: 'Thrifty',
    headline: 'Looking for a Thrifty Rental?',
  }),
});

export const CAR_CALL_BRAND_KEYS = Object.freeze(Object.keys(CAR_CALL_BRANDS));

export function resolveCarCallBrand(rawBrand) {
  const normalized = String(rawBrand || '').trim().toLowerCase();
  return CAR_CALL_BRANDS[normalized] || null;
}

export function getCarCallLandingCopy(brand) {
  if (!brand) {
    return {
      headline: 'Need a Rental Car in the USA?',
      description: 'Call FareTransit to compare available rental rates, vehicle options and pickup locations before you book.',
      persuasion: 'Already found a rental price? Call to check available options with FareTransit before you book.',
      disclosure: 'FareTransit is an independent travel reservation assistance service.',
    };
  }

  return {
    headline: brand.headline,
    description: `Call FareTransit to compare available ${brand.displayName} and other rental options for your pickup location and dates.`,
    persuasion: 'Already found a rental price? Check available options with FareTransit before you book.',
    disclosure: `FareTransit is an independent travel reservation assistance service and is not affiliated with ${brand.displayName}.`,
  };
}
