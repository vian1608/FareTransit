import React, { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation, useNavigate } from 'react-router-dom';
import routesData from '../data/routesData.json';
import seoPages from '../data/seoPages.json';
import seoContent from '../data/seoContent.json';

const CANONICAL_ORIGIN = 'https://www.faretransit.com';

const PAGE_BY_PATH = new Map(seoPages.map((page) => [page.path, page]));
const INDEXABLE_EXACT = new Set(seoPages.map((page) => page.path));
const CONTENT_PATHS = new Set(Object.keys(seoContent));

const VALID_ROUTE_PATHS = new Set(
  routesData
    .filter((route) => route?.slug && route?.seoStatus !== 'noindex')
    .map((route) => `/routes/${route.slug}`)
);

const ROUTE_PAGE_NAMES = new Map(
  routesData
    .filter((route) => route?.slug)
    .map((route) => [`/routes/${route.slug}`, route.title || route.metaTitle || route.slug])
);

export const CANONICAL_ALIASES = {
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
  return INDEXABLE_EXACT.has(pathname) || VALID_ROUTE_PATHS.has(pathname);
}

function getPageName(pathname) {
  return PAGE_BY_PATH.get(pathname)?.pageName || ROUTE_PAGE_NAMES.get(pathname) || 'FareTransit';
}

export default function SeoRouteGuard() {
  const location = useLocation();
  const navigate = useNavigate();
  const normalizedPath = normalizePath(location.pathname);
  const canonicalPath = CANONICAL_ALIASES[normalizedPath] || normalizedPath;
  const indexable = isIndexablePath(canonicalPath);
  const handledBySeoContentPage = CONTENT_PATHS.has(canonicalPath);

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
  const pageName = getPageName(canonicalPath);
  const robotsValue = indexable
    ? 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
    : 'noindex, nofollow, noarchive';

  const genericWebPageData = indexable && !handledBySeoContentPage ? {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${canonicalUrl}#webpage`,
    url: canonicalUrl,
    name: pageName,
    isPartOf: { '@id': `${CANONICAL_ORIGIN}/#website` },
    about: { '@id': `${CANONICAL_ORIGIN}/#organization` },
  } : null;

  const breadcrumbData = indexable
    && !handledBySeoContentPage
    && canonicalPath !== '/'
    && canonicalPath !== '/senior-travel/flight-deals'
    ? {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: `${CANONICAL_ORIGIN}/`,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: pageName,
            item: canonicalUrl,
          },
        ],
      }
    : null;

  return (
    <Helmet>
      <meta name="robots" content={robotsValue} />
      <meta name="googlebot" content={robotsValue} />
      {indexable && !handledBySeoContentPage && <link rel="canonical" href={canonicalUrl} />}
      {indexable && !handledBySeoContentPage && <meta property="og:url" content={canonicalUrl} />}
      {genericWebPageData && <script type="application/ld+json">{JSON.stringify(genericWebPageData)}</script>}
      {breadcrumbData && <script type="application/ld+json">{JSON.stringify(breadcrumbData)}</script>}
    </Helmet>
  );
}
