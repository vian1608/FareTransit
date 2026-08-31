import React, { useEffect, useMemo } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import SeoPage from '../components/SeoPage';
import seoPages from '../data/seoPages.json';
import seoContent from '../data/seoContent.json';
import { trackSeoInternalClick, trackSeoPageView } from '../utils/ga4Seo';
import './SeoContentPage.css';

const pageByPath = new Map(seoPages.map((page) => [page.path, page]));

function buildBreadcrumbs(path) {
  if (path === '/') return [];
  const parts = path.split('/').filter(Boolean);
  const crumbs = [{ name: 'Home', path: '/' }];
  let current = '';

  parts.forEach((part, index) => {
    current += `/${part}`;
    const registryPage = pageByPath.get(current);
    const fallback = part
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    crumbs.push({
      name: registryPage?.pageName || fallback,
      path: current,
      current: index === parts.length - 1,
    });
  });

  return crumbs;
}

export const SEO_CONTENT_PATHS = Object.keys(seoContent);

export default function SeoContentPage() {
  const location = useLocation();
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const content = seoContent[path];
  const meta = pageByPath.get(path);
  const breadcrumbs = useMemo(() => buildBreadcrumbs(path), [path]);

  useEffect(() => {
    if (content && meta) trackSeoPageView(path);
  }, [content, meta, path]);

  const trackLink = (linkPath, linkType = 'internal') => {
    trackSeoInternalClick({ pagePath: path, linkPath, linkType });
  };

  if (!content || !meta) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="seo-content-page">
      <SeoPage
        path={path}
        title={meta.title}
        description={meta.description}
        pageName={meta.pageName}
        type={meta.type}
        dateModified={meta.lastmod}
        breadcrumbs={breadcrumbs.map(({ name, path: crumbPath }) => ({ name, path: crumbPath }))}
      />

      <div className="seo-content-shell">
        <nav className="seo-breadcrumbs" aria-label="Breadcrumb">
          {breadcrumbs.map((crumb, index) => (
            <React.Fragment key={crumb.path}>
              {index > 0 && <span className="seo-breadcrumbs__separator" aria-hidden="true">/</span>}
              {crumb.current ? (
                <span aria-current="page">{crumb.name}</span>
              ) : (
                <Link to={crumb.path} onClick={() => trackLink(crumb.path, 'breadcrumb')}>{crumb.name}</Link>
              )}
            </React.Fragment>
          ))}
        </nav>

        <header className="seo-content-hero">
          <p className="seo-content-eyebrow">{content.eyebrow}</p>
          <h1>{content.heroTitle}</h1>
          <p className="seo-content-lead">{content.heroText}</p>
        </header>

        <main className="seo-content-main">
          <div className="seo-content-article">
            {content.sections.map((section, index) => (
              <section className="seo-content-section" key={`${section.heading}-${index}`}>
                <h2>{section.heading}</h2>

                {section.paragraphs?.map((paragraph, paragraphIndex) => (
                  <p key={paragraphIndex}>{paragraph}</p>
                ))}

                {section.bullets?.length > 0 && (
                  <ul className="seo-content-list">
                    {section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
                  </ul>
                )}

                {section.links?.length > 0 && (
                  <div className="seo-inline-links">
                    {section.links.map((link) => (
                      <Link to={link.to} key={link.to} onClick={() => trackLink(link.to, 'contextual')}>
                        {link.label}<span aria-hidden="true"> →</span>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>

          <aside className="seo-content-aside" aria-label="Related travel information">
            <div className="seo-related-card">
              <span className="seo-related-card__label">RELATED</span>
              <h2>Continue planning</h2>
              <div className="seo-related-links">
                {content.relatedLinks?.map((link) => (
                  <Link to={link.to} key={link.to} onClick={() => trackLink(link.to, 'related')}>
                    {link.label}<span aria-hidden="true">→</span>
                  </Link>
                ))}
              </div>
            </div>

            <div className="seo-trust-card">
              <strong>Independent travel assistance</strong>
              <p>FareTransit is an independent travel agency/service provider. Airline names and trademarks belong to their respective owners.</p>
              <Link to="/about" onClick={() => trackLink('/about', 'trust')}>About FareTransit</Link>
            </div>
          </aside>
        </main>

        {content.cta && (
          <section className="seo-content-cta">
            <div>
              <p className="seo-content-eyebrow">NEXT STEP</p>
              <h2>{content.cta.title}</h2>
              <p>{content.cta.text}</p>
            </div>
            <Link
              className="seo-content-cta__button"
              to={content.cta.to}
              onClick={() => trackLink(content.cta.to, 'cta')}
            >
              {content.cta.label}
            </Link>
          </section>
        )}

        <div className="seo-reviewed-note">
          <span>Reviewed {meta.lastmod}</span>
          <span aria-hidden="true">•</span>
          <Link to="/editorial-policy" onClick={() => trackLink('/editorial-policy', 'editorial-policy')}>Editorial policy</Link>
        </div>
      </div>
    </div>
  );
}
