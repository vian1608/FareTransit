import React, { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation, useNavigate } from 'react-router-dom';
import routesData from '../data/routesData.json';
import airportRows from '../data/carRentalAirports.json';
import { hotelDestinationSlugs, hotelDestinations } from '../data/hotelDestinations';
import { carRentalLocationSlugs, carRentalLocations } from '../data/carRentalLocations';
import { CANONICAL_ORIGIN, getCoreSeo, serviceSchemaFor } from '../seo/seoConfig';

const INDEXABLE_EXACT = new Set([
  '/',
  '/flights',
  '/hotels',
  '/car-rentals',
  '/car-rental/airport',
  '/contact',
  '/terms',
  '/privacy-policy',
  '/refund-policy',
  '/travel-assistance',
  '/booking-for-parents',
  '/urgent-travel',
  '/senior-travel/flight-deals',
  '/flight-nyc-to-mia',
  '/flight-lax-to-jfk',
  '/train-nyc-to-dc',
  '/train-dc-to-nyc',
  '/train-philly-to-nyc',
  '/train-boston-to-nyc',
]);

// Paid-search conversion pages intentionally remain outside the SEO index while
// still exposing a stable canonical URL and allowing crawlers to follow legal/help links.
const PPC_NO_INDEX_EXACT = new Set([
  '/car-rental/call-now',
]);

const PAGE_NAMES = {
  '/train-nyc-to-dc': 'Train from New York to Washington, D.C.',
  '/train-dc-to-nyc': 'Train from Washington, D.C. to New York',
  '/train-philly-to-nyc': 'Train from Philadelphia to New York',
  '/train-boston-to-nyc': 'Train from Boston to New York',
  '/car-rental/call-now': 'Car Rental Booking Assistance by Phone',
};

const VALID_ROUTE_PATHS = new Set(
  routesData.filter((route) => route?.slug).map((route) => `/routes/${route.slug}`)
);

const ROUTE_BY_PATH = new Map(
  routesData
    .filter((route) => route?.slug)
    .map((route) => [`/routes/${route.slug}`, route])
);

const VALID_HOTEL_PATHS = new Set(hotelDestinationSlugs.map((slug) => `/hotels/${slug}`));
const VALID_CAR_PATHS = new Set(carRentalLocationSlugs.map((slug) => `/car-rentals/${slug}`));
const AIRPORT_BY_PATH = new Map(
  airportRows.map((airport) => [`/car-rental/airport/${airport.code}`, airport])
);
const VALID_AIRPORT_PATHS = new Set(AIRPORT_BY_PATH.keys());

const CANONICAL_ALIASES = {
  '/senior-travel': '/senior-travel/flight-deals',
  '/privacy': '/privacy-policy',
  '/privacypolicy': '/privacy-policy',
  '/refund': '/refund-policy',
  '/refundpolicy': '/refund-policy',
  '/amtrak': '/car-rentals',
  '/amtrak-assistance': '/car-rentals',
  '/car-rentals/lax': '/car-rental/airport/lax',
  '/car-rentals/jfk': '/car-rental/airport/jfk',
  '/routes/train-nyc-to-dc': '/train-nyc-to-dc',
  '/routes/train-dc-to-nyc': '/train-dc-to-nyc',
  '/routes/train-philly-to-nyc': '/train-philly-to-nyc',
  '/routes/train-boston-to-nyc': '/train-boston-to-nyc',
};

const normalizePath = (pathname) => {
  if (!pathname || pathname === '/') return '/';
  return pathname.replace(/\/+$/, '') || '/';
};

function isIndexablePath(pathname) {
  return INDEXABLE_EXACT.has(pathname)
    || VALID_ROUTE_PATHS.has(pathname)
    || VALID_HOTEL_PATHS.has(pathname)
    || VALID_CAR_PATHS.has(pathname)
    || VALID_AIRPORT_PATHS.has(pathname);
}

function getDestinationSeo(pathname) {
  if (pathname === '/car-rental/airport') {
    return {
      pageName: 'Airport Car Rentals',
      title: 'Airport Car Rental Options Across the U.S. | FareTransit',
      description: 'Compare airport car rental planning guides for major U.S. airports, including vehicle categories, one-way rentals, weekly rentals and booking assistance.',
      parents: [{ path: '/car-rentals', label: 'Car Rentals' }],
      service: {
        name: 'Airport car rental comparison and reservation assistance',
        serviceType: 'Car rental booking assistance',
      },
    };
  }

  if (VALID_AIRPORT_PATHS.has(pathname)) {
    const airport = AIRPORT_BY_PATH.get(pathname);
    return {
      pageName: `Car Rental at ${airport.airportCode}`,
      title: airport.title,
      description: airport.description,
      parents: [
        { path: '/car-rentals', label: 'Car Rentals' },
        { path: '/car-rental/airport', label: 'Airport Car Rentals' },
      ],
      service: {
        name: `Car rental comparison and reservation assistance at ${airport.airportName}`,
        serviceType: 'Airport car rental booking assistance',
      },
    };
  }

  if (VALID_HOTEL_PATHS.has(pathname)) {
    const slug = pathname.split('/').pop();
    const destination = hotelDestinations[slug];
    return {
      pageName: destination.pageName,
      title: destination.title,
      description: destination.description,
      parent: '/hotels',
      service: {
        name: `Hotel booking assistance in ${destination.city}`,
        serviceType: 'Hotel booking assistance',
      },
    };
  }

  if (VALID_CAR_PATHS.has(pathname)) {
    const slug = pathname.split('/').pop();
    const rental = carRentalLocations[slug];
    return {
      pageName: rental.pageName,
      title: rental.title,
      description: rental.description,
      parent: '/car-rentals',
      service: {
        name: `Car rental booking assistance for ${rental.label}`,
        serviceType: 'Car rental booking assistance',
      },
    };
  }

  return null;
}

function getRouteSeo(pathname) {
  const route = ROUTE_BY_PATH.get(pathname);
  if (!route) return null;
  const isFlight = route.type === 'flight';
  return {
    pageName: route.title || route.metaTitle || route.slug,
    title: route.metaTitle,
    description: route.metaDescription,
    parent: isFlight ? '/flights' : null,
  };
}

function getSeo(pathname) {
  return getCoreSeo(pathname)
    || getDestinationSeo(pathname)
    || getRouteSeo(pathname)
    || (PAGE_NAMES[pathname] ? { pageName: PAGE_NAMES[pathname] } : null);
}

function getPageName(pathname, seo) {
  return seo?.pageName || PAGE_NAMES[pathname] || 'FareTransit';
}

function parentLabel(parentPath) {
  if (parentPath === '/flights') return 'Flights';
  if (parentPath === '/hotels') return 'Hotels';
  if (parentPath === '/car-rentals') return 'Car Rentals';
  if (parentPath === '/car-rental/airport') return 'Airport Car Rentals';
  return null;
}

function breadcrumbParents(seo) {
  if (Array.isArray(seo?.parents)) return seo.parents;
  if (!seo?.parent) return [];
  const label = parentLabel(seo.parent);
  return label ? [{ path: seo.parent, label }] : [];
}

export default function SeoRouteGuard() {
  const location = useLocation();
  const navigate = useNavigate();
  const normalizedPath = normalizePath(location.pathname);
  const canonicalPath = CANONICAL_ALIASES[normalizedPath] || normalizedPath;
  const indexable = isIndexablePath(canonicalPath);
  const paidLanding = PPC_NO_INDEX_EXACT.has(canonicalPath);
  const seo = getSeo(canonicalPath);

  useEffect(() => {
    if (normalizedPath !== '/search') return;
    const params = new URLSearchParams(location.search);
    let changed = false;

    if (params.get('return') && !params.get('returnDate')) {
      params.set('returnDate', params.get('return'));
      changed = true;
    }
    if (params.get('cabin') && !params.get('travelClass')) {
      params.set('travelClass', params.get('cabin'));
      changed = true;
    }

    if (changed) {
      navigate({ pathname: '/search', search: `?${params.toString()}` }, { replace: true });
    }
  }, [location.search, navigate, normalizedPath]);

  const canonicalUrl = `${CANONICAL_ORIGIN}${canonicalPath === '/' ? '/' : canonicalPath}`;
  const pageName = getPageName(canonicalPath, seo);
  const robotsValue = indexable
    ? 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
    : paidLanding
      ? 'noindex, follow, noarchive'
      : 'noindex, nofollow, noarchive';

  const webPageData = indexable ? {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${canonicalUrl}#webpage`,
    url: canonicalUrl,
    name: pageName,
    ...(seo?.description ? { description: seo.description } : {}),
    isPartOf: { '@id': `${CANONICAL_ORIGIN}/#website` },
    about: seo?.service
      ? { '@id': `${canonicalUrl}#service` }
      : { '@id': `${CANONICAL_ORIGIN}/#organization` },
  } : null;

  let breadcrumbData = null;
  if (indexable && canonicalPath !== '/') {
    const itemListElement = [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: `${CANONICAL_ORIGIN}/`,
      },
    ];

    breadcrumbParents(seo).forEach((parent) => {
      itemListElement.push({
        '@type': 'ListItem',
        position: itemListElement.length + 1,
        name: parent.label,
        item: `${CANONICAL_ORIGIN}${parent.path}`,
      });
    });

    itemListElement.push({
      '@type': 'ListItem',
      position: itemListElement.length + 1,
      name: pageName,
      item: canonicalUrl,
    });

    breadcrumbData = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement,
    };
  }

  const serviceData = indexable && seo?.service
    ? serviceSchemaFor({ canonicalUrl, ...seo.service })
    : null;

  return (
    <Helmet>
      <meta name="robots" content={robotsValue} />
      <meta name="googlebot" content={robotsValue} />
      {(indexable || paidLanding) && <link rel="canonical" href={canonicalUrl} />}
      {(indexable || paidLanding) && <meta property="og:url" content={canonicalUrl} />}
      {(indexable || paidLanding) && <meta property="og:type" content="website" />}
      {seo?.title && <title>{seo.title}</title>}
      {seo?.description && <meta name="description" content={seo.description} />}
      {seo?.title && <meta property="og:title" content={seo.title} />}
      {seo?.description && <meta property="og:description" content={seo.description} />}
      {seo?.socialImage && <meta property="og:image" content={seo.socialImage} />}
      {seo?.title && <meta name="twitter:title" content={seo.title} />}
      {seo?.description && <meta name="twitter:description" content={seo.description} />}
      {seo?.socialImage && <meta name="twitter:image" content={seo.socialImage} />}
      {seo?.title && <meta name="twitter:card" content={seo.socialImage ? 'summary_large_image' : 'summary'} />}
      {webPageData && <script type="application/ld+json">{JSON.stringify(webPageData)}</script>}
      {serviceData && <script type="application/ld+json">{JSON.stringify(serviceData)}</script>}
      {breadcrumbData && <script type="application/ld+json">{JSON.stringify(breadcrumbData)}</script>}
    </Helmet>
  );
}
