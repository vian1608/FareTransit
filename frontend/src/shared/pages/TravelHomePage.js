import React from 'react';
import { Link } from 'react-router-dom';
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_HREF } from '../constants/supportContact';
import './TravelHomePage.css';

const SERVICES = [
  {
    key: 'flights',
    icon: 'fas fa-plane-departure',
    title: 'Flights',
    text: 'Compare routes, schedules, connections and cabin choices, then continue with FareTransit reservation assistance.',
    to: '/flights',
    cta: 'Explore Flights',
  },
  {
    key: 'hotels',
    icon: 'fas fa-hotel',
    title: 'Hotels',
    text: 'Search hotel options by destination and dates, then submit the stay you want for a trackable reservation request.',
    to: '/hotels',
    cta: 'Search Hotels',
  },
  {
    key: 'cars',
    icon: 'fas fa-car',
    title: 'Car Rentals',
    text: 'Get help comparing airport or city pickup options, vehicle categories and practical rental details for your trip.',
    to: '/car-rentals',
    cta: 'Explore Car Rentals',
  },
];

const POPULAR_LINKS = [
  { to: '/flight-nyc-to-mia', label: 'New York to Miami flights' },
  { to: '/flight-lax-to-jfk', label: 'Los Angeles to New York flights' },
  { to: '/hotels/miami', label: 'Hotels in Miami' },
  { to: '/hotels/new-york', label: 'Hotels in New York City' },
  { to: '/car-rentals/miami', label: 'Car rentals in Miami' },
  { to: '/car-rentals/jfk', label: 'Car rentals at JFK' },
];

export default function TravelHomePage() {
  return (
    <div className="travel-home-page">
      <section className="travel-home-hero" aria-labelledby="travel-home-title">
        <div className="container travel-home-hero__inner">
          <p className="travel-home-eyebrow">Flights · Hotels · Car Rentals</p>
          <h1 id="travel-home-title">Travel Booking Assistance for Flights, Hotels &amp; Car Rentals</h1>
          <p className="travel-home-lead">
            FareTransit helps travelers compare practical options and move from trip planning to a clear, trackable reservation request with real human support.
          </p>
          <div className="travel-home-hero__actions">
            <Link className="travel-home-button travel-home-button--primary" to="/flights">Start with Flights</Link>
            <a className="travel-home-button travel-home-button--secondary" href={SUPPORT_PHONE_HREF}>Call {SUPPORT_PHONE_DISPLAY}</a>
          </div>
        </div>
      </section>

      <section className="travel-home-services" aria-labelledby="travel-services-title">
        <div className="container">
          <p className="travel-home-section-eyebrow">Plan the full trip</p>
          <h2 id="travel-services-title">Choose the travel service you need</h2>
          <div className="travel-home-service-grid">
            {SERVICES.map((service) => (
              <article className={`travel-home-service-card travel-home-service-card--${service.key}`} key={service.key}>
                <div className="travel-home-service-card__icon"><i className={service.icon} aria-hidden="true" /></div>
                <h3>{service.title}</h3>
                <p>{service.text}</p>
                <Link to={service.to}>{service.cta} <span aria-hidden="true">→</span></Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="travel-home-process" aria-labelledby="travel-process-title">
        <div className="container">
          <p className="travel-home-section-eyebrow">Clear reservation support</p>
          <h2 id="travel-process-title">How FareTransit helps</h2>
          <div className="travel-home-process-grid">
            <article><span>1</span><h3>Tell us the trip</h3><p>Start with your route or destination, dates, traveler count and the service you need.</p></article>
            <article><span>2</span><h3>Review practical options</h3><p>Compare relevant choices such as schedules, stay location, cancellation terms, vehicle size or pickup location.</p></article>
            <article><span>3</span><h3>Request reservation help</h3><p>Submit the option you want or speak with the FareTransit team so your request can be handled and tracked.</p></article>
          </div>
        </div>
      </section>

      <section className="travel-home-popular" aria-labelledby="travel-popular-title">
        <div className="container">
          <p className="travel-home-section-eyebrow">Useful planning pages</p>
          <h2 id="travel-popular-title">Popular routes and destinations</h2>
          <div className="travel-home-popular-links">
            {POPULAR_LINKS.map((item) => <Link key={item.to} to={item.to}>{item.label}<span aria-hidden="true">→</span></Link>)}
          </div>
        </div>
      </section>

      <section className="travel-home-support" aria-labelledby="travel-support-title">
        <div className="container travel-home-support__inner">
          <div>
            <p className="travel-home-section-eyebrow">Need a person?</p>
            <h2 id="travel-support-title">Talk with FareTransit travel support</h2>
            <p>If the itinerary is complicated or you want help reviewing the next step, call our reservation team.</p>
          </div>
          <a className="travel-home-button travel-home-button--primary" href={SUPPORT_PHONE_HREF}>Call {SUPPORT_PHONE_DISPLAY}</a>
        </div>
      </section>
    </div>
  );
}
