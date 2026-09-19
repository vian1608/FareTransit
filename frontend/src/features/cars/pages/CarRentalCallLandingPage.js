import React, { useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useLocation } from 'react-router-dom';
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_HREF } from '../../../shared/constants/supportContact';
import {
  CAR_CALL_LANDING_CANONICAL,
  getCarRentalBrand,
  getCarRentalLandingCopy,
} from '../data/carRentalCallLandingConfig';
import {
  buildCarLandingEventContext,
  sendCarLandingEvent,
} from '../utils/carCallLandingAnalytics';
import './CarRentalCallLandingPage.css';

const FIRED_LANDING_VIEW_KEYS = new Set();

const WHY_CALL_ITEMS = [
  {
    icon: 'fas fa-list-check',
    title: 'Compare Available Options',
    text: 'Review rental choices before booking.',
  },
  {
    icon: 'fas fa-headset',
    title: 'Human Booking Assistance',
    text: 'Speak with a real person about your trip.',
  },
  {
    icon: 'fas fa-plane-arrival',
    title: 'Airport & City Rentals',
    text: 'Check available rental options across the USA.',
  },
  {
    icon: 'fas fa-route',
    title: 'One-Way & Weekly Rentals',
    text: 'Ask about longer trips and different return locations.',
  },
];

const HOW_IT_WORKS = [
  {
    title: 'Tell us your trip',
    text: 'Share pickup location, dates and driver details.',
  },
  {
    title: 'We check available options',
    text: 'We review available rental choices and rates.',
  },
  {
    title: 'Choose your rental',
    text: 'Select the option that works for your trip.',
  },
];

const TRUST_ITEMS = [
  { icon: 'fas fa-lock', title: 'Secure website' },
  { icon: 'fas fa-user-headset', title: 'Human booking assistance' },
  { icon: 'fas fa-phone', title: 'US phone number' },
  { icon: 'fas fa-circle-info', title: 'Independent reservation assistance' },
];

const RENTAL_NEEDS = [
  { icon: 'fas fa-plane-arrival', title: 'Airport pickup', text: 'Ask about rental options near your arrival airport.' },
  { icon: 'fas fa-building', title: 'City rentals', text: 'Check pickup locations away from the airport.' },
  { icon: 'fas fa-arrow-right-arrow-left', title: 'One-way rentals', text: 'Ask about returning the vehicle in a different location.' },
  { icon: 'fas fa-calendar-week', title: 'Weekly rentals', text: 'Review options for longer rental periods.' },
  { icon: 'fas fa-car-side', title: 'SUVs & family vehicles', text: 'Ask about space for passengers and luggage.' },
  { icon: 'fas fa-gem', title: 'Premium vehicles', text: 'Check premium categories when available.' },
];

const AIRPORT_LINKS = [
  ['DFW', 'Dallas–Fort Worth', 'dfw'],
  ['MCO', 'Orlando', 'mco'],
  ['MIA', 'Miami', 'mia'],
  ['FLL', 'Fort Lauderdale', 'fll'],
  ['LAX', 'Los Angeles', 'lax'],
  ['JFK', 'New York', 'jfk'],
];

const FAQS = [
  {
    question: 'What should I have ready when I call?',
    answer: 'Have your pickup location, pickup and return dates, approximate times, driver details and preferred vehicle type ready. That helps the specialist check relevant rental options faster.',
  },
  {
    question: 'Can I ask for a specific rental company?',
    answer: 'Yes. Tell us which rental company you are considering. Availability and rates depend on your location, dates, vehicle category and supplier inventory.',
  },
  {
    question: 'Can FareTransit help with same-day rentals?',
    answer: 'You can call to check current same-day availability. Availability is not guaranteed and can change quickly.',
  },
  {
    question: 'Can I ask about one-way or weekly rentals?',
    answer: 'Yes. Tell the specialist your pickup and return locations and the length of your trip so available options can be reviewed.',
  },
  {
    question: 'Is FareTransit the rental company?',
    answer: 'No. FareTransit is an independent travel reservation assistance service. We help customers review available rental options and reservation details.',
  },
];

function PhoneLink({ locationLabel, className = '', children, primary = false }) {
  return (
    <a
      href={SUPPORT_PHONE_HREF}
      className={className}
      aria-label={`Call FareTransit at ${SUPPORT_PHONE_DISPLAY}`}
      data-paid-car-call="true"
      data-call-location={locationLabel}
      data-faretransit-phone="true"
      data-support-call-inline="true"
      data-support-call-primary={primary ? 'true' : undefined}
    >
      {children}
    </a>
  );
}

function PhoneNumber() {
  return <span data-phone-display="true">{SUPPORT_PHONE_DISPLAY}</span>;
}

export default function CarRentalCallLandingPage() {
  const location = useLocation();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const brand = useMemo(() => getCarRentalBrand(params.get('brand')), [params]);
  const copy = useMemo(() => getCarRentalLandingCopy(brand), [brand]);
  const eventContext = useMemo(
    () => buildCarLandingEventContext({ location, brand }),
    [location, brand]
  );

  useEffect(() => {
    document.body.classList.add('car-call-landing-active');
    return () => document.body.classList.remove('car-call-landing-active');
  }, []);

  useEffect(() => {
    const key = `${location.key || 'default'}:${location.pathname}${location.search}`;
    if (!FIRED_LANDING_VIEW_KEYS.has(key)) {
      FIRED_LANDING_VIEW_KEYS.add(key);
      sendCarLandingEvent('landing_page_view', eventContext);
    }

    const onDocumentClick = (event) => {
      const callLink = event.target.closest?.('a[data-paid-car-call="true"]');
      if (callLink) {
        sendCarLandingEvent('phone_click', {
          ...eventContext,
          cta_location: callLink.dataset.callLocation || 'unknown',
          link_url: callLink.getAttribute('href') || SUPPORT_PHONE_HREF,
        });
        return;
      }

      const contactLink = event.target.closest?.('a[data-paid-car-contact="true"]');
      if (contactLink) {
        sendCarLandingEvent('contact_click', {
          ...eventContext,
          contact_type: contactLink.dataset.contactType || 'email',
          link_url: contactLink.getAttribute('href') || '',
        });
      }
    };

    document.addEventListener('click', onDocumentClick, true);
    const raf = window.requestAnimationFrame(() => {
      window.fareTransitApplyGoogleForwardingNumber?.();
    });

    return () => {
      window.cancelAnimationFrame(raf);
      document.removeEventListener('click', onDocumentClick, true);
    };
  }, [eventContext, location.key, location.pathname, location.search]);

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': `${CAR_CALL_LANDING_CANONICAL}#service`,
    name: 'Car Rental Booking Assistance by Phone',
    serviceType: 'Car rental reservation assistance',
    url: CAR_CALL_LANDING_CANONICAL,
    provider: { '@id': 'https://www.faretransit.com/#organization' },
    areaServed: { '@type': 'Country', name: 'United States' },
  };

  return (
    <div className="car-call-page">
      <Helmet>
        <title>{copy.metaTitle}</title>
        <meta name="description" content={copy.metaDescription} />
        <meta name="robots" content="noindex, follow, noarchive" />
        <meta name="googlebot" content="noindex, follow, noarchive" />
        <link rel="canonical" href={CAR_CALL_LANDING_CANONICAL} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={CAR_CALL_LANDING_CANONICAL} />
        <meta property="og:title" content={copy.metaTitle} />
        <meta property="og:description" content={copy.metaDescription} />
        <meta property="og:image" content="https://www.faretransit.com/favicon.png" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={copy.metaTitle} />
        <meta name="twitter:description" content={copy.metaDescription} />
        <script type="application/ld+json">{JSON.stringify(schema)}</script>
      </Helmet>

      <main className="car-call-main">
        <section className="car-call-hero" aria-labelledby="car-call-title">
          <div className="car-call-shell car-call-hero__grid">
            <div className="car-call-hero__copy">
              <span className="car-call-eyebrow">{copy.eyebrow}</span>
              <h1 id="car-call-title">{copy.title}</h1>
              <p className="car-call-hero__lead">{copy.description}</p>
              <p className="car-call-hero__persuasion">{copy.persuasion}</p>

              <PhoneLink locationLabel="hero" className="car-call-primary-cta" primary>
                <i className="fas fa-phone" aria-hidden="true" />
                <span>Call <PhoneNumber /></span>
              </PhoneLink>
              <div className="car-call-cta-helper">Call Now to Check Rental Options</div>

              <div className="car-call-urgency" role="note">
                <i className="fas fa-clock" aria-hidden="true" />
                <span><strong>Need a car today?</strong> Call to check current availability.</span>
              </div>

              <div className="car-call-benefit-row" aria-label="Car rental assistance highlights">
                <span><i className="fas fa-plane-arrival" aria-hidden="true" /> Airport &amp; city rentals</span>
                <span><i className="fas fa-route" aria-hidden="true" /> One-way &amp; weekly rentals</span>
                <span><i className="fas fa-car-side" aria-hidden="true" /> Economy, SUV &amp; premium options</span>
                <span><i className="fas fa-headset" aria-hidden="true" /> Human booking assistance</span>
              </div>

              <p className="car-call-disclosure">{copy.disclosure}</p>
            </div>

            <aside className="car-call-hero__call-card" aria-label="Call FareTransit for rental assistance">
              <div className="car-call-card__icon" aria-hidden="true"><i className="fas fa-phone-volume" /></div>
              <span className="car-call-card__label">Speak with a rental specialist</span>
              <strong className="car-call-card__number"><PhoneNumber /></strong>
              <p>Tell us your pickup location, dates and preferred vehicle type.</p>
              <PhoneLink locationLabel="hero-card" className="car-call-card__button">
                Call Now
              </PhoneLink>
              <small>No affiliation with any rental brand is implied.</small>
            </aside>
          </div>
        </section>

        <section className="car-call-section" aria-labelledby="why-call-title">
          <div className="car-call-shell">
            <span className="car-call-section-kicker">WHY CALL FARETRANSIT?</span>
            <h2 id="why-call-title">Get Help Comparing Rental Options Before You Book</h2>
            <div className="car-call-feature-grid">
              {WHY_CALL_ITEMS.map((item) => (
                <article className="car-call-feature-card" key={item.title}>
                  <div className="car-call-feature-card__icon"><i className={item.icon} aria-hidden="true" /></div>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="car-call-section car-call-section--soft" aria-labelledby="how-call-title">
          <div className="car-call-shell">
            <span className="car-call-section-kicker">HOW IT WORKS</span>
            <h2 id="how-call-title">Three Simple Steps</h2>
            <div className="car-call-steps">
              {HOW_IT_WORKS.map((step, index) => (
                <article className="car-call-step" key={step.title}>
                  <span className="car-call-step__number" aria-hidden="true">{index + 1}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.text}</p>
                  </div>
                </article>
              ))}
            </div>

            <PhoneLink locationLabel="how-it-works" className="car-call-primary-cta car-call-primary-cta--centered">
              <i className="fas fa-phone" aria-hidden="true" />
              <span>Call <PhoneNumber /></span>
            </PhoneLink>
          </div>
        </section>

        <section className="car-call-trust-band" aria-label="FareTransit trust information">
          <div className="car-call-shell">
            <div className="car-call-trust-grid">
              {TRUST_ITEMS.map((item) => (
                <div className="car-call-trust-item" key={item.title}>
                  <i className={item.icon} aria-hidden="true" />
                  <span>{item.title}</span>
                </div>
              ))}
            </div>
            <p className="car-call-trust-disclosure">{copy.disclosure}</p>
          </div>
        </section>

        <section className="car-call-section" aria-labelledby="rental-needs-title">
          <div className="car-call-shell">
            <span className="car-call-section-kicker">POPULAR RENTAL NEEDS</span>
            <h2 id="rental-needs-title">Tell Us What Kind of Rental You Need</h2>
            <div className="car-call-needs-grid">
              {RENTAL_NEEDS.map((need) => (
                <article className="car-call-need" key={need.title}>
                  <i className={need.icon} aria-hidden="true" />
                  <div>
                    <h3>{need.title}</h3>
                    <p>{need.text}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="car-call-section car-call-section--airport" aria-labelledby="airport-help-title">
          <div className="car-call-shell">
            <span className="car-call-section-kicker">AIRPORT PICKUP PLANNING</span>
            <h2 id="airport-help-title">Need More Detail About an Airport Pickup?</h2>
            <p className="car-call-section-lead">Our airport guides are available if you want location-specific planning information before you call.</p>
            <div className="car-call-airport-links">
              {AIRPORT_LINKS.map(([code, city, slug]) => (
                <Link key={code} to={`/car-rental/airport/${slug}`}>
                  <strong>{code}</strong>
                  <span>{city}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="car-call-section car-call-section--soft" aria-labelledby="car-call-faq-title">
          <div className="car-call-shell car-call-faq-shell">
            <span className="car-call-section-kicker">RENTAL QUESTIONS</span>
            <h2 id="car-call-faq-title">Frequently Asked Questions</h2>
            <div className="car-call-faq-list">
              {FAQS.map((item) => (
                <details className="car-call-faq" key={item.question}>
                  <summary>{item.question}</summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="car-call-final" aria-labelledby="car-call-final-title">
          <div className="car-call-shell car-call-final__inner">
            <div>
              <span className="car-call-section-kicker">READY TO CHECK YOUR OPTIONS?</span>
              <h2 id="car-call-final-title">Call FareTransit for Car Rental Assistance</h2>
              <p>Share your pickup location and dates and speak with a specialist about available rental options.</p>
            </div>
            <div className="car-call-final__actions">
              <PhoneLink locationLabel="final" className="car-call-primary-cta">
                <i className="fas fa-phone" aria-hidden="true" />
                <span>Call <PhoneNumber /></span>
              </PhoneLink>
              <a
                className="car-call-contact-link"
                href="mailto:support@faretransit.com"
                data-paid-car-contact="true"
                data-contact-type="email"
              >
                Prefer email? support@faretransit.com
              </a>
            </div>
          </div>
        </section>
      </main>

      <div className="car-call-mobile-sticky" role="region" aria-label="Call FareTransit">
        <PhoneLink locationLabel="mobile-sticky" className="car-call-mobile-sticky__link">
          <span className="car-call-mobile-sticky__icon" aria-hidden="true"><i className="fas fa-phone" /></span>
          <span className="car-call-mobile-sticky__copy">
            <strong>Call Now</strong>
            <span><PhoneNumber /></span>
          </span>
        </PhoneLink>
      </div>
    </div>
  );
}
