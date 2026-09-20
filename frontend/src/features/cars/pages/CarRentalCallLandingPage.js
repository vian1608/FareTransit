import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useLocation } from 'react-router-dom';
import {
  SUPPORT_PHONE_DISPLAY,
  SUPPORT_PHONE_HREF,
  SUPPORT_PHONE_SCHEMA,
} from '../../../shared/constants/supportContact';
import {
  CAR_CALL_LANDING_CANONICAL,
  getCarCallLandingCopy,
  resolveCarCallBrand,
} from '../config/carCallLandingBrands';
import './CarRentalCallLandingPage.css';

const BENEFITS = [
  ['fa-plane-arrival', 'Airport & city rentals', 'Major airports and downtown locations'],
  ['fa-route', 'One-way & weekly rentals', 'Flexible options for different trips'],
  ['fa-car-side', 'Economy, SUV & premium', 'Vehicle categories for different needs'],
  ['fa-headset', 'Human booking assistance', 'Real people. Real answers.'],
];

const HOW_IT_WORKS = [
  {
    number: '1',
    icon: 'fa-phone',
    title: 'Call us',
    text: 'Share your pickup location, dates and rental preferences.',
  },
  {
    number: '2',
    icon: 'fa-message',
    title: 'Tell us your needs',
    text: 'We help you review available rental choices for your trip.',
  },
  {
    number: '3',
    icon: 'fa-car-side',
    title: 'Review your option',
    text: 'Choose the rental option that works for you before booking.',
  },
];

const TRUST_ITEMS = [
  ['fa-user-group', 'Human Assistance', 'Talk with a real travel specialist'],
  ['fa-shield-halved', 'Independent Service', 'Clear FareTransit identity'],
  ['fa-location-dot', 'Nationwide Rental Needs', 'Airport and city pickup assistance'],
  ['fa-lock', 'Clear & Secure', 'Transparent reservation support'],
];

const FAQS = [
  {
    question: 'Are you a car rental company?',
    answer: 'No. FareTransit is an independent travel reservation assistance service. We help customers review available reservation options and do not present ourselves as the rental company.',
  },
  {
    question: 'What should I have ready when I call?',
    answer: 'Have your pickup location, pickup and return dates, approximate times, driver details and preferred vehicle category ready. This helps us review relevant options.',
  },
  {
    question: 'Can I ask for a specific rental company?',
    answer: 'Yes. Tell us which rental company you are looking for. Availability and rates vary by location, dates, vehicle category and supplier inventory.',
  },
  {
    question: 'Can you help with one-way or weekly rentals?',
    answer: 'Yes. Tell us your pickup and return locations and your rental dates so we can help you review available one-way or longer-duration options.',
  },
  {
    question: 'Can you help with same-day rentals?',
    answer: 'You can call FareTransit to check current same-day availability. Availability is not guaranteed and depends on location, timing and supplier inventory.',
  },
  {
    question: 'Can I request airport or city pickup?',
    answer: 'Yes. FareTransit can help you review rental options for airport and city pickup locations based on the trip details you provide.',
  },
];

function trackingContext(brandKey) {
  if (typeof window === 'undefined') return { brand: brandKey || 'generic' };
  const params = new URLSearchParams(window.location.search);
  return {
    page_location: window.location.href,
    brand: brandKey || 'generic',
    utm_campaign: params.get('utm_campaign') || undefined,
    utm_content: params.get('utm_content') || undefined,
    utm_term: params.get('utm_term') || undefined,
    gclid: params.get('gclid') || undefined,
    gbraid: params.get('gbraid') || undefined,
    wbraid: params.get('wbraid') || undefined,
  };
}

function trackLandingEvent(eventName, brandKey, extra = {}) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag('event', eventName, {
    ...trackingContext(brandKey),
    ...extra,
  });
}

function BrandMark({ className = '' }) {
  return (
    <span className={`car-call-brand-mark ${className}`.trim()} aria-hidden="true">
      <span className="car-call-brand-mark__inner"><i className="fas fa-phone" /></span>
    </span>
  );
}

function BrandIdentity({ compact = false }) {
  return (
    <span className={`car-call-brand-identity${compact ? ' car-call-brand-identity--compact' : ''}`}>
      <BrandMark />
      <span className="car-call-brand-identity__text">
        <strong>FareTransit</strong>
        {!compact && <small>Car Rental Assistance</small>}
      </span>
    </span>
  );
}

function PhoneCallLink({ brandKey, className = '', placement, children }) {
  return (
    <a
      className={className}
      href={SUPPORT_PHONE_HREF}
      aria-label={`Call FareTransit at ${SUPPORT_PHONE_DISPLAY}`}
      data-support-call-inline="true"
      data-support-call-primary="true"
      data-call-placement={placement}
      onClick={() => trackLandingEvent('phone_click', brandKey, { placement })}
    >
      {children}
    </a>
  );
}

function PhoneNumber() {
  return <span data-support-phone-text="true">{SUPPORT_PHONE_DISPLAY}</span>;
}

export default function CarRentalCallLandingPage() {
  const location = useLocation();
  const brand = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return resolveCarCallBrand(params.get('brand'));
  }, [location.search]);
  const copy = getCarCallLandingCopy(brand);
  const brandKey = brand?.key || 'generic';
  const lastTrackedView = useRef('');

  useLayoutEffect(() => {
    document.body.classList.add('car-call-landing-active');
    return () => document.body.classList.remove('car-call-landing-active');
  }, []);

  useEffect(() => {
    const viewKey = `${location.pathname}?brand=${brandKey}`;
    if (lastTrackedView.current === viewKey) return;
    lastTrackedView.current = viewKey;
    trackLandingEvent('landing_page_view', brandKey);
  }, [brandKey, location.pathname]);

  const pageTitle = brand
    ? `${brand.displayName} Car Rental Booking Assistance | FareTransit`
    : 'Car Rental Booking Assistance by Phone | FareTransit';
  const pageDescription = brand
    ? `Looking for a ${brand.displayName} rental? Call FareTransit for independent car rental reservation assistance and to compare available options for your dates and pickup location.`
    : 'Need a rental car in the USA? Call FareTransit for independent reservation assistance and to compare available rental rates, vehicle options and pickup locations.';

  const serviceSchema = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Car Rental Reservation Assistance',
    serviceType: 'Independent car rental reservation assistance',
    url: CAR_CALL_LANDING_CANONICAL,
    provider: {
      '@type': 'TravelAgency',
      name: 'FareTransit',
      legalName: 'FareTransit LLC',
      url: 'https://www.faretransit.com/',
      telephone: SUPPORT_PHONE_SCHEMA,
    },
    areaServed: {
      '@type': 'Country',
      name: 'United States',
    },
  };

  return (
    <div className="car-call-page" data-paid-search-landing="car-rental" data-brand={brandKey}>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <meta name="robots" content="noindex, follow, noarchive" />
        <meta name="googlebot" content="noindex, follow, noarchive" />
        <link rel="canonical" href={CAR_CALL_LANDING_CANONICAL} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="FareTransit" />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:url" content={CAR_CALL_LANDING_CANONICAL} />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDescription} />
        <script type="application/ld+json">{JSON.stringify(serviceSchema)}</script>
      </Helmet>

      <header className="car-call-topbar">
        <div className="car-call-shell car-call-topbar__inner">
          <Link className="car-call-brand" to="/" aria-label="FareTransit home">
            <BrandIdentity compact />
          </Link>

          <nav className="car-call-nav" aria-label="Car rental page navigation">
            <a href="#car-rentals">Car Rentals</a>
            <a href="#how-it-works">How It Works</a>
            <a href="#about-faretransit">About</a>
            <a href="#faq">FAQs</a>
          </nav>

          <PhoneCallLink className="car-call-topbar__phone" brandKey={brandKey} placement="topbar">
            <i className="fas fa-phone" aria-hidden="true" />
            <strong><PhoneNumber /></strong>
          </PhoneCallLink>
        </div>
      </header>

      <main>
        <section className="car-call-hero" id="car-rentals" aria-labelledby="car-call-title">
          <div className="car-call-shell car-call-hero__grid">
            <div className="car-call-hero__copy">
              <span className="car-call-eyebrow">Car Rental Reservation Assistance</span>
              <h1 id="car-call-title">{copy.headline}</h1>
              <p className="car-call-hero__lead">{copy.description}</p>

              <PhoneCallLink className="car-call-primary-cta" brandKey={brandKey} placement="hero">
                <span className="car-call-primary-cta__icon" aria-hidden="true"><i className="fas fa-phone" /></span>
                <strong><PhoneNumber /></strong>
                <span className="car-call-primary-cta__label">Call Now</span>
                <i className="fas fa-arrow-right car-call-primary-cta__arrow" aria-hidden="true" />
              </PhoneCallLink>

              <p className="car-call-cta-note">
                <span><i className="fas fa-user-check" aria-hidden="true" /> Speak with a real person</span>
                <span aria-hidden="true">•</span>
                <span>Independent reservation assistance</span>
              </p>
              <p className="car-call-disclosure">{copy.disclosure}</p>

              <div className="car-call-benefit-grid" aria-label="Rental assistance benefits">
                {BENEFITS.map(([icon, title, text]) => (
                  <article className="car-call-benefit" key={title}>
                    <span className="car-call-benefit__icon" aria-hidden="true"><i className={`fas ${icon}`} /></span>
                    <h2>{title}</h2>
                    <p>{text}</p>
                  </article>
                ))}
              </div>
            </div>

            <div className="car-call-hero__visual" aria-hidden="true">
              <div className="car-call-hero__visual-note">A smoother way to get rental help</div>
              <aside className="car-call-hero__assist-card" aria-label="FareTransit human booking assistance">
                <div className="car-call-hero__assist-brand"><BrandIdentity compact /></div>
                <h2>Real People.<br />Real Help.</h2>
                <p>Independent reservation assistance for your car rental needs.</p>
                <ul>
                  <li><i className="fas fa-circle-check" /> Talk with a real person</li>
                  <li><i className="fas fa-circle-check" /> Review available options</li>
                  <li><i className="fas fa-circle-check" /> Ask about special requests</li>
                </ul>
                <strong className="car-call-hero__assist-close">Travel with confidence.</strong>
              </aside>
            </div>
          </div>
        </section>

        <section className="car-call-process-wrap" id="how-it-works" aria-labelledby="how-call-title">
          <div className="car-call-shell">
            <div className="car-call-process-panel">
              <div className="car-call-process-heading">
                <span className="car-call-eyebrow">How it works</span>
                <h2 id="how-call-title">Getting your rental car is easy</h2>
                <p>Three simple steps to review your rental options.</p>
              </div>
              <div className="car-call-step-grid">
                {HOW_IT_WORKS.map((step, index) => (
                  <article className="car-call-step" key={step.number}>
                    <div className="car-call-step__header">
                      <span className="car-call-step__number">{step.number}</span>
                      <span className="car-call-step__icon"><i className={`fas ${step.icon}`} aria-hidden="true" /></span>
                    </div>
                    <h3>{step.title}</h3>
                    <p>{step.text}</p>
                    {index < HOW_IT_WORKS.length - 1 && <i className="fas fa-arrow-right car-call-step__arrow" aria-hidden="true" />}
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="car-call-trust-strip" id="about-faretransit" aria-label="Why travelers call FareTransit">
          <div className="car-call-shell car-call-trust-grid">
            {TRUST_ITEMS.map(([icon, title, text]) => (
              <article className="car-call-trust-item" key={title}>
                <span className="car-call-trust-item__icon" aria-hidden="true"><i className={`fas ${icon}`} /></span>
                <div><strong>{title}</strong><small>{text}</small></div>
              </article>
            ))}
          </div>
        </section>

        <section className="car-call-faq-section" id="faq" aria-labelledby="car-call-faq-title">
          <div className="car-call-shell">
            <div className="car-call-faq-heading">
              <div>
                <span className="car-call-eyebrow">Frequently asked questions</span>
                <h2 id="car-call-faq-title">Quick answers,<br />so you can call with confidence</h2>
              </div>
              <PhoneCallLink className="car-call-faq-call" brandKey={brandKey} placement="faq-heading">
                <span>Need help now?</span><strong>Call FareTransit</strong><i className="fas fa-arrow-right" aria-hidden="true" />
              </PhoneCallLink>
            </div>
            <div className="car-call-faqs">
              {FAQS.map((item) => (
                <details key={item.question}>
                  <summary>{item.question}<span aria-hidden="true">+</span></summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="car-call-callbar" aria-label="Call FareTransit">
          <div className="car-call-shell car-call-callbar__inner">
            <BrandMark className="car-call-callbar__mark" />
            <div className="car-call-callbar__prompt">
              <strong>Need a rental car?</strong>
              <span>Call now for real human assistance.</span>
            </div>
            <div className="car-call-callbar__number"><PhoneNumber /></div>
            <PhoneCallLink className="car-call-callbar__button" brandKey={brandKey} placement="final-callbar">
              <i className="fas fa-phone" aria-hidden="true" /> Call Now <i className="fas fa-arrow-right" aria-hidden="true" />
            </PhoneCallLink>
          </div>
        </section>
      </main>

      <footer className="car-call-mini-footer">
        <div className="car-call-shell car-call-mini-footer__inner">
          <div className="car-call-mini-footer__brand"><BrandIdentity compact /></div>
          <nav aria-label="Legal links">
            <a href="#about-faretransit">About</a>
            <a href="#faq">FAQs</a>
            <Link to="/privacy-policy">Privacy</Link>
            <Link to="/terms">Terms</Link>
          </nav>
          <p>FareTransit is an independent travel reservation assistance service and is not affiliated with any car rental company.</p>
          <a
            className="car-call-mini-footer__email"
            href="mailto:support@faretransit.com"
            onClick={() => trackLandingEvent('contact_click', brandKey, { placement: 'footer-email' })}
          >support@faretransit.com</a>
        </div>
      </footer>

      <PhoneCallLink className="car-call-sticky" brandKey={brandKey} placement="mobile-sticky">
        <BrandMark className="car-call-sticky__brand" />
        <span className="car-call-sticky__copy"><small>Need a rental car?</small><strong>Call <PhoneNumber /></strong></span>
        <span className="car-call-sticky__button"><i className="fas fa-phone" aria-hidden="true" /> Call Now</span>
      </PhoneCallLink>
    </div>
  );
}
