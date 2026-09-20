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
  ['fa-plane-arrival', 'Airport & city rentals'],
  ['fa-route', 'One-way & weekly rentals'],
  ['fa-car-side', 'Economy, SUV & premium'],
  ['fa-headset', 'Human booking assistance'],
];

const WHY_CALL = [
  {
    icon: 'fa-list-check',
    title: 'Compare Available Options',
    text: 'Review available rental choices and rates before booking.',
  },
  {
    icon: 'fa-headset',
    title: 'Talk to a Real Person',
    text: 'Get human help with pickup, dates, vehicle needs and special requests.',
  },
  {
    icon: 'fa-location-dot',
    title: 'Airport & City Pickup',
    text: 'Check rental options for airport and city locations across the USA.',
  },
  {
    icon: 'fa-calendar-days',
    title: 'Flexible Rental Needs',
    text: 'Ask about one-way, weekly and same-day rental availability.',
  },
];

const HOW_IT_WORKS = [
  {
    number: '1',
    icon: 'fa-phone',
    title: 'Call FareTransit',
    text: 'Connect with a travel specialist and tell us where and when you need a car.',
  },
  {
    number: '2',
    icon: 'fa-message',
    title: 'Tell Us What You Need',
    text: 'Share pickup details, vehicle preference and any special requests.',
  },
  {
    number: '3',
    icon: 'fa-circle-check',
    title: 'Review Your Options',
    text: 'Compare the available choices and decide what works best for your trip.',
  },
];

const RENTAL_NEEDS = [
  ['fa-plane', 'Airport pickup'],
  ['fa-building', 'City pickup'],
  ['fa-arrow-right-arrow-left', 'One-way rental'],
  ['fa-calendar-week', 'Weekly rental'],
  ['fa-car', 'Economy & compact'],
  ['fa-truck-field', 'SUV & premium'],
];

const FAQS = [
  {
    question: 'What should I have ready when I call?',
    answer: 'Have your pickup location, pickup and return dates, approximate times, driver details and preferred vehicle type ready. That helps us check relevant rental options.',
  },
  {
    question: 'Can I ask for a specific rental company?',
    answer: 'Yes. Tell us which rental company you are looking for. Availability and rates vary by location, dates, vehicle category and supplier inventory.',
  },
  {
    question: 'Can you help with same-day rentals?',
    answer: 'You can call FareTransit to check current same-day availability. Availability is not guaranteed and depends on your location, dates and supplier inventory.',
  },
  {
    question: 'Can you help with one-way or weekly rentals?',
    answer: 'Yes. Tell us your pickup and return locations and the dates you need the vehicle. We can help review available one-way and longer-duration rental options.',
  },
  {
    question: 'Is FareTransit the rental company?',
    answer: 'No. FareTransit is an independent travel reservation assistance service. We help customers review reservation options and do not present ourselves as the rental company.',
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
            <BrandIdentity />
          </Link>
          <PhoneCallLink className="car-call-topbar__phone" brandKey={brandKey} placement="topbar">
            <span className="car-call-topbar__phone-icon"><i className="fas fa-phone" aria-hidden="true" /></span>
            <span className="car-call-topbar__phone-copy"><small>Call a travel specialist</small><strong><PhoneNumber /></strong></span>
          </PhoneCallLink>
        </div>
      </header>

      <main>
        <section className="car-call-hero" aria-labelledby="car-call-title">
          <div className="car-call-shell car-call-hero__grid">
            <div className="car-call-hero__copy">
              <span className="car-call-eyebrow">Car Rental Reservation Assistance</span>
              <h1 id="car-call-title">{copy.headline}</h1>
              <p className="car-call-hero__lead">{copy.description}</p>

              <PhoneCallLink className="car-call-primary-cta" brandKey={brandKey} placement="hero">
                <span className="car-call-primary-cta__icon" aria-hidden="true"><i className="fas fa-phone" /></span>
                <span className="car-call-primary-cta__copy">
                  <small>Call FareTransit now</small>
                  <strong><PhoneNumber /></strong>
                </span>
                <i className="fas fa-arrow-right car-call-primary-cta__arrow" aria-hidden="true" />
              </PhoneCallLink>
              <p className="car-call-cta-note"><i className="fas fa-user-check" aria-hidden="true" /> Speak with a real person about your rental needs.</p>

              <div className="car-call-benefit-list" aria-label="Rental assistance benefits">
                {BENEFITS.map(([icon, label]) => (
                  <span key={label}><i className={`fas ${icon}`} aria-hidden="true" /> {label}</span>
                ))}
              </div>
              <p className="car-call-disclosure">{copy.disclosure}</p>
            </div>

            <aside className="car-call-hero__card" aria-label="Call FareTransit for car rental assistance">
              <div className="car-call-hero__card-brand"><BrandIdentity compact /></div>
              <h2>Real People. Real Help.</h2>
              <p>Tell us your trip details and we&apos;ll help you review available rental choices before you book.</p>
              <ul className="car-call-hero__checklist">
                <li><i className="fas fa-circle-check" /> Pickup location and dates</li>
                <li><i className="fas fa-circle-check" /> Vehicle type or rental company</li>
                <li><i className="fas fa-circle-check" /> One-way or special requests</li>
              </ul>
              <div className="car-call-hero__availability">
                <i className="fas fa-clock" aria-hidden="true" />
                <span><strong>Need a car today?</strong><small>Call to check current availability.</small></span>
              </div>
            </aside>
          </div>
        </section>

        <section className="car-call-section car-call-section--why" aria-labelledby="why-call-title">
          <div className="car-call-shell">
            <div className="car-call-section-heading">
              <span className="car-call-eyebrow">Why FareTransit?</span>
              <h2 id="why-call-title">Less Searching. More Human Help.</h2>
              <p>Tell us what you need once. We&apos;ll help you review the available options that fit your trip.</p>
            </div>
            <div className="car-call-value-grid">
              {WHY_CALL.map((item) => (
                <article className="car-call-value" key={item.title}>
                  <span className="car-call-value__icon" aria-hidden="true"><i className={`fas ${item.icon}`} /></span>
                  <div><h3>{item.title}</h3><p>{item.text}</p></div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="car-call-section car-call-section--steps" aria-labelledby="how-call-title">
          <div className="car-call-shell">
            <div className="car-call-section-heading">
              <span className="car-call-eyebrow">How it works</span>
              <h2 id="how-call-title">Three Clear Steps</h2>
              <p>From your first call to reviewing an option, the process stays simple.</p>
            </div>
            <div className="car-call-step-grid">
              {HOW_IT_WORKS.map((step, index) => (
                <article className="car-call-step" key={step.number}>
                  <div className="car-call-step__top">
                    <span className="car-call-step__number">{step.number}</span>
                    <span className="car-call-step__icon"><i className={`fas ${step.icon}`} aria-hidden="true" /></span>
                  </div>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                  {index < HOW_IT_WORKS.length - 1 && <span className="car-call-step__connector" aria-hidden="true"><i className="fas fa-arrow-right" /></span>}
                </article>
              ))}
            </div>
            <div className="car-call-centered-cta">
              <PhoneCallLink className="car-call-secondary-call" brandKey={brandKey} placement="how-it-works">
                <i className="fas fa-phone" aria-hidden="true" />
                <span><small>Ready when you are</small><strong>Call <PhoneNumber /></strong></span>
              </PhoneCallLink>
            </div>
          </div>
        </section>

        <section className="car-call-section car-call-section--today" aria-labelledby="same-day-title">
          <div className="car-call-shell car-call-today-card">
            <div className="car-call-today-card__icon"><i className="fas fa-bolt" aria-hidden="true" /></div>
            <div className="car-call-today-card__copy">
              <span className="car-call-eyebrow">Same-day rental assistance</span>
              <h2 id="same-day-title">Need a Car Today?</h2>
              <p>Same-day inventory can change quickly. Call with your pickup location and preferred time so we can help you check current options.</p>
              <small>Availability varies by location, dates and supplier inventory.</small>
            </div>
            <PhoneCallLink className="car-call-today-phone" brandKey={brandKey} placement="same-day">
              <i className="fas fa-phone" aria-hidden="true" /> <span>Call Now</span>
            </PhoneCallLink>
          </div>
        </section>

        <section className="car-call-section car-call-section--needs" aria-labelledby="rental-needs-title">
          <div className="car-call-shell">
            <div className="car-call-section-heading">
              <span className="car-call-eyebrow">Rental needs we can help with</span>
              <h2 id="rental-needs-title">Tell Us What You&apos;re Looking For</h2>
            </div>
            <div className="car-call-needs-grid">
              {RENTAL_NEEDS.map(([icon, title]) => (
                <div className="car-call-need" key={title}>
                  <i className={`fas ${icon}`} aria-hidden="true" />
                  <strong>{title}</strong>
                </div>
              ))}
            </div>
            <p className="car-call-low-priority-link">Planning ahead? <Link to="/car-rental/airport">View FareTransit&apos;s airport rental guides</Link>.</p>
          </div>
        </section>

        <section className="car-call-section car-call-section--trust" aria-labelledby="trust-title">
          <div className="car-call-shell car-call-trust">
            <div className="car-call-trust__brand"><BrandIdentity /></div>
            <div className="car-call-trust__copy">
              <span className="car-call-eyebrow">Clear & transparent assistance</span>
              <h2 id="trust-title">Know Who You&apos;re Calling</h2>
              <p>FareTransit is an independent travel reservation assistance service. We help customers review travel reservation options and do not claim to be the rental company.</p>
            </div>
            <ul>
              <li><i className="fas fa-lock" aria-hidden="true" /> Secure website</li>
              <li><i className="fas fa-headset" aria-hidden="true" /> Human booking assistance</li>
              <li><i className="fas fa-phone" aria-hidden="true" /> US phone number</li>
              <li><i className="fas fa-circle-check" aria-hidden="true" /> Clear FareTransit branding</li>
            </ul>
          </div>
        </section>

        <section className="car-call-section car-call-section--faq" aria-labelledby="car-call-faq-title">
          <div className="car-call-shell car-call-faq-shell">
            <div className="car-call-section-heading">
              <span className="car-call-eyebrow">Quick answers</span>
              <h2 id="car-call-faq-title">Car Rental Assistance FAQs</h2>
              <p>Useful details before you call.</p>
            </div>
            <div className="car-call-faqs">
              {FAQS.map((item) => (
                <details key={item.question}>
                  <summary>{item.question}</summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="car-call-final" aria-labelledby="final-call-title">
          <div className="car-call-shell car-call-final__inner">
            <BrandMark className="car-call-final__mark" />
            <span className="car-call-eyebrow">Ready to check rental options?</span>
            <h2 id="final-call-title">Call FareTransit</h2>
            <p>Tell us where and when you need a vehicle. We&apos;ll help you review available rental choices for your trip.</p>
            <PhoneCallLink className="car-call-primary-cta car-call-primary-cta--final" brandKey={brandKey} placement="final">
              <span className="car-call-primary-cta__icon" aria-hidden="true"><i className="fas fa-phone" /></span>
              <span className="car-call-primary-cta__copy"><small>Speak with a travel specialist</small><strong><PhoneNumber /></strong></span>
              <i className="fas fa-arrow-right car-call-primary-cta__arrow" aria-hidden="true" />
            </PhoneCallLink>
            <p className="car-call-final__support">Other question? <a href="mailto:support@faretransit.com" onClick={() => trackLandingEvent('contact_click', brandKey, { placement: 'footer-email' })}>support@faretransit.com</a></p>
          </div>
        </section>
      </main>

      <footer className="car-call-mini-footer">
        <div className="car-call-shell car-call-mini-footer__inner">
          <BrandIdentity compact />
          <span className="car-call-mini-footer__note">Independent travel reservation assistance</span>
          <nav aria-label="Legal links">
            <Link to="/terms">Terms</Link>
            <Link to="/privacy-policy">Privacy</Link>
            <Link to="/refund-policy">Refund Policy</Link>
          </nav>
        </div>
      </footer>

      <PhoneCallLink className="car-call-sticky" brandKey={brandKey} placement="mobile-sticky">
        <BrandMark className="car-call-sticky__brand" />
        <span className="car-call-sticky__copy"><small>Need a rental car?</small><strong>Call Now</strong></span>
        <span className="car-call-sticky__number"><PhoneNumber /></span>
      </PhoneCallLink>
    </div>
  );
}
