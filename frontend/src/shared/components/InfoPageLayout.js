import React from 'react';
import { Link } from 'react-router-dom';
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_HREF } from '../constants/supportContact';
import '../styles/InfoPages.css';

export function InfoPageHero({
  eyebrow,
  title,
  description,
  updated,
  icon = 'fas fa-file-alt',
  actions = null,
}) {
  return (
    <section className="info-hero" aria-labelledby="info-page-title">
      <div className="info-hero__glow info-hero__glow--one" aria-hidden="true" />
      <div className="info-hero__glow info-hero__glow--two" aria-hidden="true" />
      <div className="container info-hero__inner">
        <nav className="info-breadcrumbs" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <i className="fas fa-chevron-right" aria-hidden="true" />
          <span aria-current="page">{title}</span>
        </nav>

        <div className="info-hero__body">
          <div className="info-hero__icon" aria-hidden="true">
            <i className={icon} />
          </div>
          <div className="info-hero__copy">
            {eyebrow && <span className="info-eyebrow">{eyebrow}</span>}
            <h1 id="info-page-title">{title}</h1>
            {description && <p>{description}</p>}
            {updated && (
              <div className="info-updated-pill">
                <i className="far fa-clock" aria-hidden="true" />
                <span>Last updated</span>
                <strong>{updated}</strong>
              </div>
            )}
            {actions && <div className="info-hero__actions">{actions}</div>}
          </div>
        </div>
      </div>
    </section>
  );
}

export function InfoSection({ number, id, title, icon, children }) {
  return (
    <section className="info-section" id={id}>
      <div className="info-section__heading">
        <span className="info-section__number" aria-hidden="true">{number}</span>
        <div>
          <h2>
            {icon && <i className={icon} aria-hidden="true" />}
            {title}
          </h2>
        </div>
      </div>
      <div className="info-section__content">{children}</div>
    </section>
  );
}

export function InfoSupportCTA({
  title = 'Questions about this information?',
  text = 'Our support team is available to help with your FareTransit travel questions.',
  primaryLabel = `Call ${SUPPORT_PHONE_DISPLAY}`,
  secondaryLabel = 'Contact Support',
  secondaryTo = '/contact',
}) {
  return (
    <section className="info-support" aria-label="FareTransit support">
      <div className="container">
        <div className="info-support__card">
          <div className="info-support__icon" aria-hidden="true">
            <i className="fas fa-headset" />
          </div>
          <div className="info-support__copy">
            <span className="info-eyebrow">Need assistance?</span>
            <h2>{title}</h2>
            <p>{text}</p>
          </div>
          <div className="info-support__actions">
            <a className="info-button info-button--primary" href={SUPPORT_PHONE_HREF}>
              <i className="fas fa-phone-alt" aria-hidden="true" />
              <span>{primaryLabel}</span>
            </a>
            <Link className="info-button info-button--secondary" to={secondaryTo}>
              <i className="fas fa-envelope" aria-hidden="true" />
              <span>{secondaryLabel}</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function InfoPageShell({
  eyebrow,
  title,
  description,
  updated,
  icon,
  toc = [],
  children,
  support = true,
  supportProps = {},
  variant = 'legal',
  heroActions = null,
}) {
  return (
    <div className={`info-page info-page--${variant}`}>
      <InfoPageHero
        eyebrow={eyebrow}
        title={title}
        description={description}
        updated={updated}
        icon={icon}
        actions={heroActions}
      />

      <div className="container info-layout">
        {toc.length > 0 && (
          <aside className="info-toc" aria-label="On this page">
            <div className="info-toc__card">
              <span className="info-toc__label">On this page</span>
              <nav>
                {toc.map((item, index) => (
                  <a key={item.id} href={`#${item.id}`}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <strong>{item.label}</strong>
                  </a>
                ))}
              </nav>
            </div>
          </aside>
        )}

        <article className={`info-document${toc.length === 0 ? ' info-document--wide' : ''}`}>
          {children}
        </article>
      </div>

      {support && <InfoSupportCTA {...supportProps} />}
    </div>
  );
}
