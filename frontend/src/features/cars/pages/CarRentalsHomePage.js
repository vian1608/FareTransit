import React from 'react';
import { Helmet } from 'react-helmet-async';
import HeroSlider from '../../../shared/components/HeroSlider';
import ProductSearchCard from '../../../shared/components/ProductSearchCard';
import CarSearchForm from '../components/CarSearchForm';
import { SUPPORT_PHONE_HREF, SUPPORT_PHONE_DISPLAY } from '../../../shared/constants/supportContact';
import './CarRentalsHomePage.css';

const carHeroSlides = [
  {
    id: 'car-slide-1',
    eyebrow: 'CAR RENTALS WORLDWIDE',
    title: 'Drive Your Journey. Your Way.',
    description: 'Compare rental car options, pickup locations, and policies with clear support from search to provider handoff.',
    mobileLead: 'Compare rental cars, pickup options, and policies with clear support.',
    image: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=1800&q=88'
  },
  {
    id: 'car-slide-2',
    eyebrow: 'AIRPORT & CITY CAR RENTALS',
    title: 'Flexible Cars for Every Kind of Trip',
    description: 'Search airport and city rental options, compare practical details, and continue with the supplier that fits your trip.',
    mobileLead: 'Search airport and city rentals and compare the details that matter.',
    image: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=1800&q=88'
  }
];

const BENEFITS = [
  {
    icon: 'fas fa-tags',
    title: 'Clear Rental Pricing',
    text: 'Compare displayed rates and important rental details before continuing.'
  },
  {
    icon: 'fas fa-calendar-alt',
    title: 'Flexible Options',
    text: 'Search different dates, locations, vehicle classes, and pickup arrangements.'
  },
  {
    icon: 'fas fa-shield-alt',
    title: 'Established Suppliers',
    text: 'Review inventory and policies supplied by participating rental providers.'
  },
  {
    icon: 'fas fa-headset',
    title: 'Human Support',
    text: `Need help comparing options? Call ${SUPPORT_PHONE_DISPLAY}.`
  }
];

const POPULAR_AIRPORTS = [
  { code: 'JFK', name: 'New York (JFK)', location: 'John F. Kennedy International Airport', city: 'New York, NY' },
  { code: 'MIA', name: 'Miami (MIA)', location: 'Miami International Airport', city: 'Miami, FL' },
  { code: 'LAX', name: 'Los Angeles (LAX)', location: 'Los Angeles International Airport', city: 'Los Angeles, CA' },
  { code: 'ORD', name: 'Chicago (ORD)', location: "O'Hare International Airport", city: 'Chicago, IL' },
  { code: 'MCO', name: 'Orlando (MCO)', location: 'Orlando International Airport', city: 'Orlando, FL' },
  { code: 'SFO', name: 'San Francisco (SFO)', location: 'San Francisco International Airport', city: 'San Francisco, CA' }
];

function CarRentalsHomePage() {
  return (
    <div className="car-rentals-home-page car-theme-page">
      <Helmet>
        <title>Car Rentals &amp; Airport Car Hire | FareTransit</title>
        <meta name="description" content="Compare car rental options, suppliers, pickup locations and policies through FareTransit." />
        <meta property="og:title" content="Car Rentals & Airport Car Hire | FareTransit" />
        <meta property="og:description" content="Compare rental car options, pickup locations, pricing and policies through FareTransit." />
        <meta property="og:url" content="https://www.faretransit.com/car-rentals" />
        <meta property="og:type" content="website" />
        <link rel="canonical" href="https://www.faretransit.com/car-rentals" />
      </Helmet>

      <HeroSlider slides={carHeroSlides} variant="flights" serviceNavActive="cars" />

      <section className="car-search-shell" aria-label="Search rental cars">
        <div className="container">
          <ProductSearchCard
            theme="cars"
            eyebrow="Find a rental car"
            title="Search Cars"
            trustText="Clear search details. Secure supplier handoff."
          >
            <CarSearchForm />
          </ProductSearchCard>
        </div>
      </section>

      <section className="car-benefits-strip" aria-label="Car rental benefits">
        <div className="container">
          <div className="car-benefits-grid">
            {BENEFITS.map((benefit) => (
              <article className="car-benefit-card" key={benefit.title}>
                <div className="car-benefit-icon"><i className={benefit.icon} aria-hidden="true" /></div>
                <div>
                  <h3>{benefit.title}</h3>
                  <p>{benefit.text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="popular-airports-section">
        <div className="container">
          <span className="car-section-eyebrow car-section-eyebrow--center">Popular pickup points</span>
          <h2 className="section-title">Popular Airport Car Rental Destinations</h2>
          <p className="section-subtitle">Start with a major airport or search any supported pickup location above.</p>

          <div className="popular-airports-grid">
            {POPULAR_AIRPORTS.map((airport) => (
              <div key={airport.code} className="airport-card">
                <div className="airport-card-header">
                  <i className="fas fa-map-marker-alt" />
                  <span className="airport-code">{airport.code}</span>
                </div>
                <h3>{airport.name}</h3>
                <p className="airport-sub">{airport.location}</p>
                <a href={SUPPORT_PHONE_HREF} className="airport-search-link">
                  Need help in {airport.city}? <i className="fas fa-phone-alt" />
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="car-support-section">
        <div className="container">
          <div className="car-support-card">
            <div className="car-support-icon"><i className="fas fa-car-side" aria-hidden="true" /></div>
            <div className="car-support-copy">
              <span className="car-section-eyebrow">Car rental assistance</span>
              <h2>Need Help Choosing a Rental?</h2>
              <p>Call us if you want help comparing pickup details, policies, deposits, mileage, or supplier information before you continue.</p>
            </div>
            <a className="car-support-button" href={SUPPORT_PHONE_HREF}>
              <i className="fas fa-phone-alt" aria-hidden="true" />
              <span>Call Now</span>
              <strong>{SUPPORT_PHONE_DISPLAY}</strong>
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

export default CarRentalsHomePage;
