import React from 'react';
import { Link, useParams } from 'react-router-dom';
import NotFoundPage from '../../../shared/pages/NotFoundPage';
import airportRows from '../../../shared/data/carRentalAirports.json';
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_HREF } from '../../../shared/constants/supportContact';
import './CarRentalAirportPage.css';

const AIRPORTS = Object.fromEntries(airportRows.map((airport) => [airport.code, airport]));

function AirportCallButton({ airport, children = `Call ${SUPPORT_PHONE_DISPLAY}` }) {
  return (
    <a
      className="airport-seo-button airport-seo-button--primary"
      href={SUPPORT_PHONE_HREF}
      data-support-call-inline="true"
      data-support-call-primary="true"
      data-seo-airport={airport.airportCode}
    >
      <i className="fas fa-phone-alt" aria-hidden="true" />
      <span>{children}</span>
    </a>
  );
}

export function CarRentalAirportHubPage() {
  return (
    <div className="airport-seo-page">
      <main>
        <section className="airport-seo-hero airport-seo-hero--hub">
          <div className="container">
            <nav className="airport-seo-breadcrumb" aria-label="Breadcrumb">
              <Link to="/">Home</Link><span aria-hidden="true">/</span><Link to="/car-rentals">Car Rentals</Link><span aria-hidden="true">/</span><span>Airports</span>
            </nav>
            <span className="airport-seo-eyebrow">High-intent airport rental planning</span>
            <h1>Airport Car Rental Options Across Major U.S. Airports</h1>
            <p>Compare practical airport pickup, vehicle-category, one-way and weekly rental considerations before you book. FareTransit is an independent reservation-assistance service and is not the official website of any rental-car brand.</p>
            <div className="airport-seo-actions">
              <AirportCallButton airport={{ airportCode: 'US-AIRPORTS' }}>Call to Check Rental Options</AirportCallButton>
              <Link className="airport-seo-button airport-seo-button--secondary" to="/contact">Get Rental Options</Link>
            </div>
          </div>
        </section>

        <section className="airport-seo-section" aria-labelledby="airport-list-title">
          <div className="container">
            <span className="airport-seo-eyebrow">Start with your arrival airport</span>
            <h2 id="airport-list-title">Popular U.S. Airport Car Rental Guides</h2>
            <p className="airport-seo-lead">These pages focus on booking intent: where the airport fits into the trip, which vehicle categories may make sense, one-way planning, weekly rentals and useful local driving considerations.</p>
            <div className="airport-seo-airport-grid">
              {airportRows.map((airport) => (
                <Link className="airport-seo-airport-card" to={`/car-rental/airport/${airport.code}`} key={airport.code}>
                  <span className="airport-seo-code">{airport.airportCode}</span>
                  <strong>{airport.city}</strong>
                  <small>{airport.airportName}</small>
                  <span className="airport-seo-link-label">View airport rental guide →</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="airport-seo-section airport-seo-section--white" aria-labelledby="airport-compare-title">
          <div className="container airport-seo-two-column">
            <div>
              <span className="airport-seo-eyebrow">Compare before you book</span>
              <h2 id="airport-compare-title">Airport pickup is only one part of the rental decision</h2>
              <p>Compare the total trip: passenger and luggage space, pickup timing, parking, tolls, one-way return rules, supplier policies and the number of days you actually need the vehicle.</p>
            </div>
            <ul className="airport-seo-checklist">
              <li>Economy, compact, midsize, SUV, premium and minivan categories</li>
              <li>Airport versus city pickup considerations</li>
              <li>One-way and weekly rental planning</li>
              <li>Rental-company preferences subject to actual availability</li>
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}

export default function CarRentalAirportPage() {
  const { airportCode } = useParams();
  const airport = AIRPORTS[String(airportCode || '').toLowerCase()];
  if (!airport) return <NotFoundPage />;

  const related = (airport.related || []).map((code) => AIRPORTS[code]).filter(Boolean);

  return (
    <div className="airport-seo-page">
      <main>
        <section className="airport-seo-hero">
          <div className="container">
            <nav className="airport-seo-breadcrumb" aria-label="Breadcrumb">
              <Link to="/">Home</Link><span aria-hidden="true">/</span><Link to="/car-rentals">Car Rentals</Link><span aria-hidden="true">/</span><Link to="/car-rental/airport">Airports</Link><span aria-hidden="true">/</span><span>{airport.airportCode}</span>
            </nav>
            <span className="airport-seo-eyebrow">{airport.airportName} · {airport.airportCode}</span>
            <h1>Car Rental at {airport.airportName} ({airport.airportCode})</h1>
            <p>{airport.intro}</p>
            <div className="airport-seo-actions">
              <AirportCallButton airport={airport}>Call to Check Rental Options</AirportCallButton>
              <Link className="airport-seo-button airport-seo-button--secondary" to="/contact" data-seo-airport={airport.airportCode}>Get Rental Options</Link>
            </div>
            <p className="airport-seo-disclosure">FareTransit is an independent comparison and reservation-assistance service. We are not the official website, reservation center or customer-service department of the airport or any rental-car brand.</p>
          </div>
        </section>

        <section className="airport-seo-section" aria-labelledby="airport-overview-title">
          <div className="container">
            <span className="airport-seo-eyebrow">Plan the airport rental around your trip</span>
            <h2 id="airport-overview-title">Renting a car at {airport.airportCode}</h2>
            <div className="airport-seo-feature-grid">
              <article><i className="fas fa-plane-arrival" aria-hidden="true" /><h3>Pickup planning</h3><p>{airport.pickup}</p></article>
              <article><i className="fas fa-car-side" aria-hidden="true" /><h3>Vehicle categories</h3><p>{airport.vehicle}</p></article>
              <article><i className="fas fa-route" aria-hidden="true" /><h3>One-way rentals</h3><p>{airport.oneWay}</p></article>
              <article><i className="fas fa-calendar-alt" aria-hidden="true" /><h3>Weekly rentals</h3><p>{airport.weekly}</p></article>
            </div>
          </div>
        </section>

        <section className="airport-seo-section airport-seo-section--white" aria-labelledby="nearby-title">
          <div className="container airport-seo-two-column">
            <div>
              <span className="airport-seo-eyebrow">Where travelers continue after pickup</span>
              <h2 id="nearby-title">Popular trip areas from {airport.airportCode}</h2>
              <p>Use these as itinerary-planning examples rather than guaranteed service areas. The rental supplier's geographic restrictions and return rules control the actual reservation.</p>
              <div className="airport-seo-chip-list">
                {airport.nearby.map((place) => <span key={place}>{place}</span>)}
              </div>
            </div>
            <div>
              <span className="airport-seo-eyebrow">Driving considerations</span>
              <h2>Before you leave the airport</h2>
              <ul className="airport-seo-checklist">
                {airport.tips.map((tip) => <li key={tip}>{tip}</li>)}
              </ul>
            </div>
          </div>
        </section>

        <section className="airport-seo-section" aria-labelledby="vehicle-options-title">
          <div className="container">
            <span className="airport-seo-eyebrow">Rental categories</span>
            <h2 id="vehicle-options-title">Compare the vehicle category—not a promised exact model</h2>
            <div className="airport-seo-category-grid">
              {['Economy', 'Compact', 'Midsize', 'SUV', 'Premium', 'Minivan'].map((category) => (
                <div key={category}><i className="fas fa-car" aria-hidden="true" /><strong>{category}</strong><small>Ask about availability for your dates</small></div>
              ))}
            </div>
          </div>
        </section>

        <section className="airport-seo-section airport-seo-section--white" aria-labelledby="airport-faq-title">
          <div className="container airport-seo-faq-wrap">
            <span className="airport-seo-eyebrow">Airport rental questions</span>
            <h2 id="airport-faq-title">Frequently asked questions about {airport.airportCode} car rentals</h2>
            <div className="airport-seo-faq-list">
              {airport.faqs.map((item) => (
                <details key={item.q}>
                  <summary>{item.q}</summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="airport-seo-section" aria-labelledby="related-airports-title">
          <div className="container">
            <h2 id="related-airports-title">Related airport rental guides</h2>
            <div className="airport-seo-related-grid">
              {related.map((item) => (
                <Link to={`/car-rental/airport/${item.code}`} key={item.code}>
                  <span>{item.airportCode}</span><strong>{item.city}</strong><small>{item.airportName}</small>
                </Link>
              ))}
            </div>
            <div className="airport-seo-final-cta">
              <div><strong>Ready to compare available rental options?</strong><span>Call FareTransit with your airport, dates, driver age and preferred vehicle category.</span></div>
              <AirportCallButton airport={airport}>Call {SUPPORT_PHONE_DISPLAY}</AirportCallButton>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
