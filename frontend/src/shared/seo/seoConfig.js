export const CANONICAL_ORIGIN = 'https://www.faretransit.com';

export const CORE_SEO_PAGES = {
  '/': {
    pageName: 'FareTransit',
    title: 'FareTransit | Flights, Hotels & Car Rental Assistance',
    description: 'Plan flights, hotels and car rentals with clear travel information and real human reservation assistance from FareTransit.',
    socialImage: `${CANONICAL_ORIGIN}/favicon.png`,
  },
  '/flights': {
    pageName: 'Flight Booking Assistance',
    title: 'Flight Booking & Reservation Assistance | FareTransit',
    description: 'Compare flight options, routes, connections and travel times, with FareTransit specialists available to help with reservations, changes and cancellations.',
    socialImage: `${CANONICAL_ORIGIN}/images/hero/flight-slide.jpg`,
    service: {
      name: 'Flight Booking & Reservation Assistance',
      serviceType: 'Flight booking assistance',
    },
  },
  '/hotels': {
    pageName: 'Hotel Booking Assistance',
    title: 'Hotel Booking & Reservation Assistance | FareTransit',
    description: 'Search hotels and resorts by destination, dates and guests, then request reservation assistance from FareTransit for the stay that fits your trip.',
    socialImage: `${CANONICAL_ORIGIN}/favicon.png`,
    service: {
      name: 'Hotel Booking & Reservation Assistance',
      serviceType: 'Hotel booking assistance',
    },
  },
  '/car-rentals': {
    pageName: 'Car Rental Booking Assistance',
    title: 'Car Rental Booking Assistance | FareTransit',
    description: 'Explore airport and city car rental options, vehicle categories and major rental brands with personal reservation assistance from FareTransit.',
    socialImage: `${CANONICAL_ORIGIN}/favicon.png`,
    service: {
      name: 'Car Rental Booking Assistance',
      serviceType: 'Car rental booking assistance',
    },
  },
  '/flight-nyc-to-mia': {
    pageName: 'Flights from New York to Miami',
    title: 'Flights from New York to Miami | FareTransit',
    description: 'Review flight options from New York to Miami and request FareTransit assistance with schedules, connections, cabin choices and reservation details.',
    parent: '/flights',
    service: {
      name: 'Flight assistance from New York to Miami',
      serviceType: 'Flight booking assistance',
    },
  },
  '/flight-lax-to-jfk': {
    pageName: 'Flights from Los Angeles to New York',
    title: 'Flights from Los Angeles to New York | FareTransit',
    description: 'Review flight options from Los Angeles to New York JFK and request FareTransit assistance with schedules, cabins, baggage and reservation details.',
    parent: '/flights',
    service: {
      name: 'Flight assistance from Los Angeles to New York',
      serviceType: 'Flight booking assistance',
    },
  },
  '/travel-assistance': {
    pageName: 'Flight Booking Assistance',
    parent: '/flights',
  },
  '/booking-for-parents': {
    pageName: 'Booking Flights for Parents and Relatives',
    parent: '/flights',
  },
  '/urgent-travel': {
    pageName: 'Urgent Travel Assistance',
    parent: '/flights',
  },
  '/senior-travel/flight-deals': {
    pageName: 'Senior Flight Assistance',
    parent: '/flights',
  },
  '/contact': { pageName: 'Contact FareTransit' },
  '/terms': { pageName: 'Terms and Conditions' },
  '/privacy-policy': { pageName: 'Privacy Policy' },
  '/refund-policy': { pageName: 'Refund Policy' },
};

export function getCoreSeo(pathname) {
  return CORE_SEO_PAGES[pathname] || null;
}

export function serviceSchemaFor({ canonicalUrl, name, serviceType, areaServed = 'United States' }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': `${canonicalUrl}#service`,
    name,
    serviceType,
    url: canonicalUrl,
    provider: { '@id': `${CANONICAL_ORIGIN}/#organization` },
    areaServed: {
      '@type': 'Country',
      name: areaServed,
    },
  };
}
