import React, { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation, useNavigate } from 'react-router-dom';
import routesData from '../data/routesData.json';
import { hotelDestinationSlugs, hotelDestinations } from '../data/hotelDestinations';
import { carRentalLocationSlugs, carRentalLocations } from '../data/carRentalLocations';
import { CANONICAL_ORIGIN, getCoreSeo, serviceSchemaFor } from '../seo/seoConfig';

const INDEXABLE_EXACT = new Set([
  '/',
  '/flights',
  '/hotels',
  '/car-rentals',
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

const PAGE_NAMES = {
  '/train-nyc-to-dc': 'Train from New York to Washington, D.C.',
  '/train-dc-to-nyc': 'Train from Washington, D.C. to New York',
  '/train-philly-to-nyc': 'Train from Philadelphia to New York',
  '/train-boston-to-nyc': 'Train from Boston to New York',
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

const CANONICAL_ALIASES = {
  '/senior-travel': '/senior-travel/flight-deals',
  '/privacy': '/privacy-policy',
  '/privacypolicy': '/privacy-policy',
  '/refund': '/refund-policy',
  '/refundpolicy': '/refund-policy',
  '/amtrak': '/car-rentals',
  '/amtrak-assistance': '/car-rentals',
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
    || VALID_CAR_PATHS.has(pathname);
}

function getDestinationSeo(pathname) {
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
    service: {
      name: isFlight
        ? `Flight assistance from ${route.originCity} to ${route.destinationCity}`
        : `Train travel assistance from ${route.originCity} to ${route.destinationCity}`,
      serviceType: isFlight ? 'Flight booking assistance' : 'Train travel assistance',
    },
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
  return null;
}

export default function SeoRouteGuard() {
  const location = useLocation();
  const navigate = useNavigate();
  const normalizedPath = normalizePath(location.pathname);
  const canonicalPath = CANONICAL_ALIASES[normalizedPath] || normalizedPath;
  const indexable = isIndexablePath(canonicalPath);
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

    if (seo?.parent) {
      const label = parentLabel(seo.parent);
      if (label) {
        itemListElement.push({
          '@type': 'ListItem',
          position: itemListElement.length + 1,
          name: label,
          item: `${CANONICAL_ORIGIN}${seo.parent}`,
        });
      }
    }

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
      {indexable && <link rel="canonical" href={canonicalUrl} />}
      {indexable && <meta property="og:url" content={canonicalUrl} />}
      {indexable && <meta property="og:type" content="website" />}
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
