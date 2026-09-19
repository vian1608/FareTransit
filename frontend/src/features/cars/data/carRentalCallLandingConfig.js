export const CAR_CALL_LANDING_PATH = '/car-rental/call-now';
export const CAR_CALL_LANDING_CANONICAL = 'https://www.faretransit.com/car-rental/call-now';

export const CAR_RENTAL_BRANDS = {
  hertz: { displayName: 'Hertz' },
  avis: { displayName: 'Avis' },
  budget: { displayName: 'Budget' },
  enterprise: { displayName: 'Enterprise' },
  national: { displayName: 'National' },
  dollar: { displayName: 'Dollar' },
  alamo: { displayName: 'Alamo' },
  sixt: { displayName: 'Sixt' },
  thrifty: { displayName: 'Thrifty' },
};

export const SUPPORTED_CAR_RENTAL_BRANDS = Object.freeze(Object.keys(CAR_RENTAL_BRANDS));

export function getCarRentalBrand(brandParam) {
  const key = String(brandParam || '').trim().toLowerCase();
  if (!key || !Object.prototype.hasOwnProperty.call(CAR_RENTAL_BRANDS, key)) return null;
  return { key, ...CAR_RENTAL_BRANDS[key] };
}

export function getCarRentalLandingCopy(brand) {
  if (!brand) {
    return {
      eyebrow: 'CAR RENTAL BOOKING ASSISTANCE',
      title: 'Need a Rental Car in the USA?',
      description: 'Call FareTransit to compare available rental rates, vehicle options and pickup locations before you book.',
      persuasion: 'Already found a rental price? Call to check available options with FareTransit before you book.',
      disclosure: 'FareTransit is an independent travel reservation assistance service.',
      metaTitle: 'Car Rental Booking Assistance by Phone | FareTransit',
      metaDescription: 'Need a rental car in the USA? Call FareTransit for independent reservation assistance and help comparing available rental rates, vehicle options and pickup locations.',
    };
  }

  return {
    eyebrow: 'CAR RENTAL BOOKING ASSISTANCE',
    title: `Looking for a ${brand.displayName} Rental?`,
    description: `Call FareTransit to compare available ${brand.displayName} and other rental options for your pickup location and dates.`,
    persuasion: 'Already found a rental price? Check available options with FareTransit before you book.',
    disclosure: `FareTransit is an independent travel reservation assistance service and is not affiliated with ${brand.displayName}.`,
    metaTitle: `${brand.displayName} Rental Booking Assistance | FareTransit`,
    metaDescription: `Looking for a ${brand.displayName} rental? Call FareTransit to compare available ${brand.displayName} and other rental options for your pickup location and dates.`,
  };
}

export const CAR_CALL_TRACKING_KEYS = Object.freeze([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'gclid',
  'gbraid',
  'wbraid',
]);

export const CAR_CALL_FINAL_URLS = Object.freeze({
  generic: CAR_CALL_LANDING_CANONICAL,
  ...Object.fromEntries(
    SUPPORTED_CAR_RENTAL_BRANDS.map((brand) => [
      brand,
      `${CAR_CALL_LANDING_CANONICAL}?brand=${brand}`,
    ])
  ),
});
