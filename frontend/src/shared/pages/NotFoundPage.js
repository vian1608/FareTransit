import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useLocation } from 'react-router-dom';
import SeoContentPage from './SeoContentPage';
import seoContent from '../data/seoContent.json';

export default function NotFoundPage() {
  const location = useLocation();
  const path = location.pathname.replace(/\/+$/, '') || '/';

  // New SEO content pages deliberately flow through the existing wildcard route.
  // This keeps the large application router stable while still giving each
  // registered path a first-class page, canonical URL and structured data.
  if (seoContent[path]) {
    return <SeoContentPage />;
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
