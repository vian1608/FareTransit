import React, { lazy, Suspense } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useLocation } from 'react-router-dom';
import seoContentPaths from '../data/seoContentPaths.json';

const SeoContentPage = lazy(() => import('./SeoContentPage'));
const SEO_CONTENT_PATHS = new Set(seoContentPaths);

export default function NotFoundPage() {
  const location = useLocation();
  const path = location.pathname.replace(/\/+$/, '') || '/';

  // New SEO content pages deliberately flow through the existing wildcard route.
  // The large editorial data bundle is lazy-loaded only when one of those pages is requested.
  if (SEO_CONTENT_PATHS.has(path)) {
    return (
      <Suspense fallback={<div style={{ minHeight: '50vh' }} aria-hidden="true" />}>
        <SeoContentPage />
      </Suspense>
    );
  }

  return (
    <section style={{ maxWidth: 760, margin: '4rem auto', padding: '2rem', textAlign: 'center' }}>
      <Helmet>
        <title>Page Not Found | FareTransit</title>
        <meta name="robots" content="noindex, nofollow, noarchive" />
        <meta name="googlebot" content="noindex, nofollow, noarchive" />
      </Helmet>
      <h1>Page Not Found</h1>
      <p>The page you requested does not exist or may have moved.</p>
      <Link to="/" style={{ display: 'inline-block', marginTop: '1rem', fontWeight: 700 }}>
        Return to FareTransit
      </Link>
    </section>
  );
}
