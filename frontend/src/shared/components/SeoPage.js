import React from 'react';
import { Helmet } from 'react-helmet-async';

const ORIGIN = 'https://www.faretransit.com';

const organizationRef = { '@id': `${ORIGIN}/#organization` };
const websiteRef = { '@id': `${ORIGIN}/#website` };

export default function SeoPage({
  path,
  title,
  description,
  pageName,
  type = 'WebPage',
  image = '/favicon.png',
  breadcrumbs = [],
  dateModified,
}) {
  const canonicalPath = path === '/' ? '/' : path.replace(/\/+$/, '');
  const canonicalUrl = `${ORIGIN}${canonicalPath}`;
  const imageUrl = image.startsWith('http') ? image : `${ORIGIN}${image}`;

  const webPageSchema = {
    '@context': 'https://schema.org',
    '@type': type === 'Article' ? 'WebPage' : type,
    '@id': `${canonicalUrl}#webpage`,
    url: canonicalUrl,
    name: pageName || title,
    description,
    isPartOf: websiteRef,
    about: organizationRef,
    ...(dateModified ? { dateModified } : {}),
  };

  const articleSchema = type === 'Article' ? {
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': `${canonicalUrl}#article`,
    headline: pageName || title,
    description,
    mainEntityOfPage: { '@id': `${canonicalUrl}#webpage` },
    publisher: organizationRef,
    author: organizationRef,
    ...(dateModified ? { dateModified } : {}),
  } : null;

  const breadcrumbItems = breadcrumbs.length
    ? breadcrumbs
    : canonicalPath === '/'
      ? []
      : [{ name: 'Home', path: '/' }, { name: pageName || title, path: canonicalPath }];

  const breadcrumbSchema = breadcrumbItems.length > 1 ? {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbItems.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${ORIGIN}${item.path === '/' ? '/' : item.path}`,
    })),
  } : null;

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
      <meta name="googlebot" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
      <link rel="canonical" href={canonicalUrl} />

      <meta property="og:type" content={type === 'Article' ? 'article' : 'website'} />
      <meta property="og:site_name" content="FareTransit" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:image" content={imageUrl} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={imageUrl} />

      <script type="application/ld+json">{JSON.stringify(webPageSchema)}</script>
      {articleSchema && <script type="application/ld+json">{JSON.stringify(articleSchema)}</script>}
      {breadcrumbSchema && <script type="application/ld+json">{JSON.stringify(breadcrumbSchema)}</script>}
    </Helmet>
  );
}
