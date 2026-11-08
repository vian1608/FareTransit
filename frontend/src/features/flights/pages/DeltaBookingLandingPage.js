import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_HREF } from '../../../shared/constants/supportContact';
import { analytics, trackEvent } from '../../../shared/utils/analytics';
import './DeltaBookingLandingPage.css';

const PAGE_ID = 'delta_new_flight_reservations';
const DELTA_HELP_URL = 'https://www.delta.com/us/en/need-help/overview';

const flightOptions = [
  {
    icon: 'fa-map-marked-alt',
    title: 'Domestic flights',
    description: 'Ask about Delta itineraries between U.S. cities and compare practical departure and arrival options.',
  },
  {
    icon: 'fa-globe-americas',
    title: 'International travel',
    description: 'Discuss potential international flight options, connecting itineraries, and travel requirements.',
  },
  {
    icon: 'fa-exchange-alt',
    title: 'One-way or round-trip',
    description: 'Explore the trip structure that fits your plans, including a return on a different date.',
  },
  {
    icon: 'fa-route',
    title: 'Connections & layovers',
    description: 'Review available routing choices and what a connection could mean for your journey.',
  },
];

const benefits = [
  {
    icon: 'fa-headset',
    title: 'Real people to talk to',
    description: 'Discuss your new-reservation questions with Fare Transit by phone.',
  },
  {
    icon: 'fa-search',
    title: 'Review flight options',
    description: 'Ask about available itineraries rather than relying on a single route choice.',
  },
  {
    icon: 'fa-list-alt',
    title: 'Understand the details',
    description: 'Go over travel dates, connections, baggage conditions, and booking terms.',
  },
  {
    icon: 'fa-phone-alt',
    title: 'A straightforward next step',
    description: 'Speak to our reservation-assistance team before deciding whether to book.',
  },
];

const faqs = [
  {
    question: 'Can Fare Transit help me find available Delta flights?',
    answer: 'Fare Transit provides independent assistance with inquiries about Delta flight options and new reservations. Options depend on your route, dates, passenger details, and availability at the time of inquiry.',
  },
  {
    question: 'Can I inquire about one-way and round-trip flights?',
    answer: 'Yes. Tell our team whether you are planning a one-way or round-trip journey. You can also ask about connecting itineraries, subject to available schedules and booking conditions.',
  },
  {
    question: 'Can I book flights for multiple passengers?',
    answer: 'You can ask about a new reservation for multiple travelers. Please share the number of adults and children when you call. Seats, fares, and passenger requirements depend on the itinerary.',
  },
  {
    question: 'Are prices guaranteed?',
    answer: 'No. Airfares can change with travel dates, routes, seat availability, taxes, and airline rules. A price is not confirmed until the complete charges and terms are reviewed and the reservation is finalized.',
  },
  {
    question: 'Are there any additional booking or service fees?',
    answer: 'Airline fares, taxes, and any applicable Fare Transit booking or service fees should be explained before you agree to purchase. Ask our team to review the full price and relevant fare conditions before confirming.',
  },
  {
    question: 'Is Fare Transit affiliated with Delta Air Lines?',
    answer: 'No. Fare Transit is an independent travel reservation assistance service. It is not affiliated with or endorsed by Delta Air Lines, and this number is not Delta customer service.',
  },
];

function PhoneCta({ children, placement, className = '', showNumber = false }) {
  const handleClick = () => {
    // Intent event only: a tap-to-call is NOT a connected call or a qualified booking lead.
    trackEvent('delta_flight_phone_click', {
      page: PAGE_ID,
      placement,
      intent: 'new_flight_reservation',
    });
  };

  return (
    <a
      href={SUPPORT_PHONE_HREF}
      className={`dfl-phone-cta ${className}`.trim()}
      onClick={handleClick}
      aria-label={`Call Fare Transit at ${SUPPORT_PHONE_DISPLAY} for new flight reservation assistance`}
    >
      <i className="fas fa-phone-alt" aria-hidden="true" />
      <span>{children}</span>
      {showNumber && <small>{SUPPORT_PHONE_DISPLAY}</small>}
      <i className="fas fa-arrow-right dfl-cta-arrow" aria-hidden="true" />
    </a>
  );
}

// Original inline vector artwork: no airline trademarks, external images or network requests.
function FlightArtwork() {
  return (
    <div className="dfl-hero-visual" aria-hidden="true">
      <svg className="dfl-hero-illustration" viewBox="0 0 680 540" xmlns="http://www.w3.org/2000/svg" focusable="false">
        <defs>
          <linearGradient id="dfl-sky" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#91d5f0" />
            <stop offset="48%" stopColor="#467fb3" />
            <stop offset="100%" stopColor="#193a68" />
          </linearGradient>
          <linearGradient id="dfl-horizon" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b9e4e8" stopOpacity=".92" />
            <stop offset="100%" stopColor="#3c76a5" stopOpacity=".8" />
          </linearGradient>
          <linearGradient id="dfl-glass" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity=".5" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <clipPath id="dfl-clip">
            <rect width="680" height="540" rx="30" />
          </clipPath>
        </defs>
        <g clipPath="url(#dfl-clip)">
          <rect width="680" height="540" fill="url(#dfl-sky)" />
          <circle cx="518" cy="134" r="78" fill="#fff5ca" opacity=".74" />
          <circle cx="518" cy="134" r="113" fill="#ffffff" opacity=".08" />
          <g fill="#fff" opacity=".48">
            <ellipse cx="111" cy="109" rx="88" ry="17" />
            <ellipse cx="173" cy="121" rx="69" ry="13" />
            <ellipse cx="494" cy="291" rx="107" ry="14" />
            <ellipse cx="567" cy="305" rx="92" ry="13" />
          </g>
          <path d="M0 382 C105 356 160 396 249 368 C342 331 424 358 505 345 C584 334 621 349 680 326 L680 540 L0 540Z" fill="url(#dfl-horizon)" />
          <path d="M0 420 L84 374 L133 406 L203 355 L275 418 L362 368 L448 423 L523 383 L610 412 L680 379 L680 540 L0 540Z" fill="#477a9e" opacity=".54" />
          <path d="M0 451 C110 427 183 459 280 427 C403 386 503 451 680 417 L680 540 L0 540Z" fill="#1b4e7b" opacity=".62" />
          <path d="M0 481 C162 452 277 498 403 463 C516 429 611 469 680 451 L680 540 L0 540Z" fill="#163a64" opacity=".79" />
          <path d="M89 313 C187 243 282 242 405 184" fill="none" stroke="#fff" strokeWidth="3" strokeDasharray="3 12" strokeLinecap="round" opacity=".54" />
          <g transform="translate(279 192) rotate(-17)">
            <path d="M-188 4 Q-167 -5 -128 -9 L-25 -18 L67 -95 Q74 -100 84 -96 L101 -91 L47 -17 L164 -12 Q190 -11 197 1 Q195 13 168 16 L47 22 L100 97 L82 101 Q74 104 65 98 L-25 24 L-126 16 L-159 44 L-181 43 L-159 12 L-190 11 Q-209 9 -209 4 Q-209 0 -188 4Z" fill="#ffffff" />
            <path d="M-25 -18 L47 -17 L22 -4 L-10 4Z" fill="#d8eff5" opacity=".65" />
          </g>
          <rect x="0" y="0" width="680" height="540" fill="url(#dfl-glass)" opacity=".15" />
          <path d="M0 0H680" stroke="#ffffff" strokeWidth="3" opacity=".23" />
        </g>
      </svg>
      <div className="dfl-visual-stamp">
        <span className="dfl-visual-stamp__icon"><i className="fas fa-plane-departure" /></span>
        <span><strong>Plan with clarity</strong><small>Options for your next journey</small></span>
      </div>
      <span className="dfl-visual-caption">Independent reservation assistance · Fare Transit</span>
    </div>
  );
}

export default function DeltaBookingLandingPage() {
  const trackedView = useRef(false);

  useEffect(() => {
    if (trackedView.current) return;
    trackedView.current = true;
    // Informational page-view event; existing Vercel Analytics also measures site traffic.
    analytics.trackSeoPageView(PAGE_ID);
  }, []);

  return (
    <div className="dfl-page">
      <section className="dfl-hero" aria-labelledby="dfl-title">
        <div className="container dfl-hero-layout">
          <div className="dfl-hero-copy">
            <div className="dfl-eyebrow"><span className="dfl-eyebrow-dot" /> Fare Transit · Independent Flight Booking Help</div>
            <h1 id="dfl-title">Looking to Book a <span>Delta Flight?</span></h1>
            <p className="dfl-lead">
              Explore available Delta flight options and fares with Fare Transit's independent reservation assistance.
              Speak with our team about your next trip.
            </p>
            <div className="dfl-hero-actions">
              <PhoneCta placement="hero_primary" className="dfl-phone-cta--primary" showNumber>
                Call to Check Flight Options
              </PhoneCta>
              <a href="#how-it-works" className="dfl-secondary-link">
                How Our Booking Assistance Works <i className="fas fa-arrow-down" aria-hidden="true" />
              </a>
            </div>
            <p className="dfl-hero-intent"><i className="fas fa-info-circle" aria-hidden="true" /> For new flight reservation inquiries. Calls are answered by Fare Transit, not Delta.</p>
            <div className="dfl-disclosure" role="note">
              <i className="fas fa-shield-alt" aria-hidden="true" />
              <p><strong>Independent service disclosure:</strong> Fare Transit is an independent travel reservation service and is not affiliated with or endorsed by Delta Air Lines.</p>
            </div>
          </div>
          <FlightArtwork />
        </div>
        <div className="container dfl-hero-points">
          <span><i className="fas fa-check-circle" aria-hidden="true" /> Domestic and international inquiries</span>
          <span><i className="fas fa-check-circle" aria-hidden="true" /> One-way and round-trip options</span>
          <span><i className="fas fa-check-circle" aria-hidden="true" /> Real human assistance</span>
        </div>
      </section>

      <section className="dfl-section dfl-options" id="flight-options" aria-labelledby="dfl-options-title">
        <div className="container">
          <div className="dfl-section-intro">
            <span className="dfl-kicker">EXPLORE YOUR NEXT TRIP</span>
            <h2 id="dfl-options-title">Explore Available Delta Flight Options</h2>
            <p>Planning a new trip? Ask Fare Transit about Delta airline tickets and available flight itineraries that may suit your travel plans.</p>
          </div>
          <div className="dfl-options-grid">
            {flightOptions.map(({ icon, title, description }) => (
              <article className="dfl-option-card" key={title}>
                <span className="dfl-card-icon"><i className={`fas ${icon}`} aria-hidden="true" /></span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
          <p className="dfl-price-note"><i className="fas fa-info-circle" aria-hidden="true" /> Flight options, schedules, Delta flight deals, and airfare are subject to current airline availability. Total pricing depends on the route, travel dates, passenger details, taxes, and applicable fees.</p>
          <div className="dfl-inline-action">
            <PhoneCta placement="options" className="dfl-phone-cta--outline">Check Available Delta Flight Options</PhoneCta>
          </div>
        </div>
      </section>

      <section className="dfl-section dfl-steps-section" id="how-it-works" aria-labelledby="dfl-steps-title">
        <div className="container">
          <div className="dfl-section-intro">
            <span className="dfl-kicker">THREE SIMPLE STEPS</span>
            <h2 id="dfl-steps-title">How Our Booking Assistance Works</h2>
            <p>A straightforward conversation about your itinerary, choices, and total price before you decide to book.</p>
          </div>
          <div className="dfl-steps">
            <article className="dfl-step"><span className="dfl-step-number">01</span><h3>Tell us where you're going</h3><p>Call Fare Transit with your departure city, destination, travel dates, and number of travelers.</p></article>
            <article className="dfl-step"><span className="dfl-step-number">02</span><h3>Discuss flight options</h3><p>Ask about available Delta itineraries, fares, connections, and relevant booking conditions.</p></article>
            <article className="dfl-step"><span className="dfl-step-number">03</span><h3>Review before confirming</h3><p>Review the full price, any Fare Transit service fees, airline rules, and applicable terms before agreeing to purchase.</p></article>
          </div>
        </div>
      </section>

      <section className="dfl-section dfl-benefits-section" aria-labelledby="dfl-benefits-title">
        <div className="container dfl-benefits-layout">
          <div className="dfl-benefits-intro">
            <span className="dfl-kicker">PERSONAL, PRACTICAL HELP</span>
            <h2 id="dfl-benefits-title">Why Contact Fare Transit?</h2>
            <p>Flight booking decisions can involve more than choosing a departure time. Our independent phone-based service helps you discuss the details that matter.</p>
            <PhoneCta placement="benefits" className="dfl-phone-cta--light">Speak With Fare Transit</PhoneCta>
          </div>
          <div className="dfl-benefits-grid">
            {benefits.map(({ icon, title, description }) => (
              <article className="dfl-benefit" key={title}>
                <i className={`fas ${icon}`} aria-hidden="true" />
                <div><h3>{title}</h3><p>{description}</p></div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="dfl-section dfl-new-bookings" aria-labelledby="dfl-new-bookings-title">
        <div className="container">
          <div className="dfl-service-boundary">
            <span className="dfl-boundary-icon" aria-hidden="true"><i className="fas fa-ticket-alt" /></span>
            <div>
              <span className="dfl-kicker">THE RIGHT PLACE FOR THE RIGHT REQUEST</span>
              <h2 id="dfl-new-bookings-title">New Flight Reservations Only</h2>
              <p>Our advertised phone service is intended primarily for travelers seeking <strong>new flight bookings</strong> and information about available airfare options.</p>
              <p>If you already have a Delta reservation, or need airline help with baggage, refunds, flight status, changes, or other customer-service questions, please use <a href={DELTA_HELP_URL} target="_blank" rel="noopener noreferrer">Delta Air Lines' official Help Center <span className="dfl-external-label">(opens in a new tab)</span></a>.</p>
              <p className="dfl-boundary-fine">For bookings originally made through a travel agency, refer to that agency for servicing when applicable.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="dfl-section dfl-faq-section" aria-labelledby="dfl-faq-title">
        <div className="container">
          <div className="dfl-section-intro">
            <span className="dfl-kicker">HELPFUL ANSWERS</span>
            <h2 id="dfl-faq-title">Frequently Asked Questions</h2>
            <p>What to know before calling us about new Delta flight reservations.</p>
          </div>
          <div className="dfl-faq-list">
            {faqs.map(({ question, answer }) => (
              <details className="dfl-faq" key={question}>
                <summary><span>{question}</span><span className="dfl-faq-toggle" aria-hidden="true" /></summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="dfl-final-section" aria-labelledby="dfl-final-title">
        <div className="container dfl-final-inner">
          <span className="dfl-kicker">READY TO PLAN YOUR NEXT FLIGHT?</span>
          <h2 id="dfl-final-title">Your next trip starts with a conversation.</h2>
          <p>Contact Fare Transit about new Delta flight reservations. Review available options, total pricing, and terms before you book.</p>
          <PhoneCta placement="final" className="dfl-phone-cta--primary" showNumber>Call for New Flight Reservations</PhoneCta>
          <p className="dfl-final-note">Independent Fare Transit assistance, not Delta Air Lines customer service.</p>
          <nav className="dfl-legal-links" aria-label="Fare Transit service and legal information">
            <Link to="/contact">Contact</Link>
            <Link to="/terms">Terms &amp; Conditions</Link>
            <Link to="/privacy-policy">Privacy Policy</Link>
            <Link to="/refund-policy">Refund Policy</Link>
            <Link to="/flights">Explore Flights</Link>
          </nav>
        </div>
      </section>

      <div className="dfl-mobile-sticky">
        <div className="dfl-mobile-sticky__copy"><strong>New Delta flight bookings</strong><small>Independent Fare Transit assistance</small></div>
        <PhoneCta placement="mobile_sticky" className="dfl-phone-cta--sticky">Call Now</PhoneCta>
      </div>
    </div>
  );
}
