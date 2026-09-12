import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import MobileServiceSwitcher from '../../../shared/components/MobileServiceSwitcher';
import { SUPPORT_PHONE_HREF, SUPPORT_PHONE_DISPLAY } from '../../../shared/constants/supportContact';
import './CarRentalsHomePage.css';
import './CarRentalBrandLogos.css';

const RENTAL_BRANDS = [
  {
    key: 'hertz',
    name: 'Hertz',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/4/42/Hertz_Car_Rental_logo.svg'
  },
  {
    key: 'avis',
    name: 'Avis',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/f/fd/Avis_logo.svg'
  },
  {
    key: 'budget',
    name: 'Budget',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/8/8f/Budget_logo.svg'
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/e/e9/Enterprise_Rent-A-Car_Logo.svg'
  },
  {
    key: 'sixt',
    name: 'Sixt',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/f/f4/Sixt_Logo_2023.svg'
  }
];

const HOW_IT_WORKS = [
  {
    icon: 'fas fa-phone-alt',
    title: 'Call FareTransit',
    text: 'Connect with a travel specialist and tell us what kind of rental you need.'
  },
  {
    icon: 'fas fa-map-marker-alt',
    title: 'Share Your Trip Details',
    text: 'Tell us your destination, rental dates, pickup preference, and vehicle type.'
  },
  {
    icon: 'fas fa-search',
    title: 'We Check Available Options',
    text: 'Our specialist helps explore rental options that fit the details you provide.'
  },
  {
    icon: 'fas fa-check-circle',
    title: 'Review Before Booking',
    text: 'Review the available option and important rental details before moving forward.'
  }
];

const BENEFITS = [
  {
    icon: 'fas fa-layer-group',
    title: 'Multiple Rental Options',
    text: 'Ask about rental options from established brands based on your destination and dates.'
  },
  {
    icon: 'fas fa-headset',
    title: 'Personal Booking Assistance',
    text: 'Talk with a real person instead of working through an automated car-search form.'
  },
  {
    icon: 'fas fa-car-side',
    title: 'Vehicle Selection Help',
    text: 'Get help choosing a practical vehicle category for your passengers, luggage, and trip.'
  },
  {
    icon: 'fas fa-plane-arrival',
    title: 'Airport & City Rentals',
    text: 'Ask for assistance with airport or city pickup locations based on your travel plans.'
  },
  {
    icon: 'fas fa-life-ring',
    title: 'Travel Support',
    text: 'Contact FareTransit when you need help understanding the rental option before your trip.'
  }
];

const VEHICLE_TYPES = [
  { icon: 'fas fa-car', label: 'Economy' },
  { icon: 'fas fa-car-side', label: 'Compact' },
  { icon: 'fas fa-car-alt', label: 'Midsize' },
  { icon: 'fas fa-shuttle-van', label: 'SUV' },
  { icon: 'fas fa-gem', label: 'Luxury' },
  { icon: 'fas fa-bus-alt', label: 'Van' }
];

const FAQS = [
  {
    question: 'Can you help me find airport car rentals?',
    answer: 'Yes. Tell us your airport, arrival details, rental dates, and vehicle preference, and a FareTransit specialist can help you explore available rental options.'
  },
  {
    question: 'Can I request a specific rental company?',
    answer: 'Yes. You can tell us if you prefer a particular rental brand. Availability varies by location, dates, vehicle category, and supplier inventory.'
  },
  {
    question: 'What information do I need before calling?',
    answer: 'It helps to have your pickup location, pickup and return dates, approximate times, driver requirements, and preferred vehicle type ready.'
  },
  {
    question: 'Can I request an SUV or luxury vehicle?',
    answer: 'Yes. You can request an SUV, luxury vehicle, van, economy car, or another category. Specific models and categories are subject to availability.'
  },
  {
    question: 'Does availability depend on location and dates?',
    answer: 'Yes. Rental availability, vehicle categories, policies, and pricing can vary by pickup location, travel dates, and supplier.'
  }
];

function CallButton({ className = '', children = 'Call Now', primary = false }) {
  return (
    <a
      className={className}
      href={SUPPORT_PHONE_HREF}
      data-support-call-inline="true"
      data-support-call-primary={primary ? 'true' : undefined}
    >
      <i className="fas fa-phone-alt" aria-hidden="true" />
      <span>{children}</span>
    </a>
  );
}

function CarRentalsHomePage() {
  return (
    <div className="car-rentals-home-page car-theme-page">
      <Helmet>
        <title>Car Rental Booking Assistance | FareTransit</title>
        <meta
          name="description"
          content="Call FareTransit for personal car rental booking assistance. Ask about airport and city rental options, vehicle categories, and major rental brands."
        />
        <meta property="og:title" content="Car Rental Booking Assistance | FareTransit" />
        <meta
          property="og:description"
          content="Speak with FareTransit to explore car rental options for your destination and travel dates."
        />
        <meta property="og:url" content="https://www.faretransit.com/car-rentals" />
        <meta property="og:type" content="website" />
        <link rel="canonical" href="https://www.faretransit.com/car-rentals" />
      </Helmet>

      <main>
        <section className="car-ppc-hero" aria-labelledby="car-rental-hero-title">
          <div className="car-ppc-hero__overlay" aria-hidden="true" />
          <div className="container car-ppc-hero__content">
            <MobileServiceSwitcher active="cars" />
            <span className="car-ppc-eyebrow">Car rental booking assistance</span>
            <h1 id="car-rental-hero-title">Find the Right Rental Car for Your Trip</h1>
            <p>
              Speak with our travel specialists to explore available car rental options for your destination.
              Tell us where and when you need a vehicle, and we&apos;ll help you review your options.
            </p>

            <div className="car-ppc-hero__actions" aria-label="Car rental assistance options">
              <CallButton className="car-ppc-button car-ppc-button--primary" primary>
                Call {SUPPORT_PHONE_DISPLAY}
              </CallButton>
              <Link className="car-ppc-button car-ppc-button--secondary" to="/contact">
                <i className="fas fa-envelope" aria-hidden="true" />
                <span>Contact Us</span>
              </Link>
            </div>

            <div className="car-ppc-hero__notes" aria-label="FareTransit service highlights">
              <span><i className="fas fa-headset" aria-hidden="true" /> Human assistance</span>
              <span><i className="fas fa-map-marked-alt" aria-hidden="true" /> Airport &amp; city rentals</span>
              <span><i className="fas fa-car" aria-hidden="true" /> Multiple vehicle categories</span>
            </div>
          </div>
        </section>

        <section className="car-brand-section" aria-labelledby="car-brand-title">
          <div className="container">
            <span className="car-ppc-section-eyebrow">Recognized rental companies</span>
            <h2 id="car-brand-title">Car Rental Brands We Can Help You Explore</h2>
            <p className="car-ppc-section-lead">
              Tell us if you have a preferred rental company, or ask our team about options available for your trip.
            </p>

            <div className="car-brand-grid" aria-label="Rental brands">
              {RENTAL_BRANDS.map((brand) => (
                <div className="car-brand-card car-brand-card--logo" key={brand.key} title={brand.name}>
                  <img
                    className={`car-brand-logo car-brand-logo--${brand.key}`}
                    src={brand.logo}
                    alt={`${brand.name} logo`}
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              ))}
            </div>

            <p className="car-brand-disclaimer">
              Brand availability varies by location and travel dates. FareTransit is not affiliated with or endorsed by
              the brands displayed unless expressly stated.
            </p>
          </div>
        </section>

        <section className="car-how-section" aria-labelledby="car-how-title">
          <div className="container">
            <span className="car-ppc-section-eyebrow">Simple call-first assistance</span>
            <h2 id="car-how-title">How It Works</h2>
            <p className="car-ppc-section-lead">
              There&apos;s no online car-search form on this page. Call us and a specialist will help with the next steps.
            </p>

            <div className="car-how-grid">
              {HOW_IT_WORKS.map((step, index) => (
                <article className="car-how-card" key={step.title}>
                  <div className="car-how-card__number" aria-hidden="true">{index + 1}</div>
                  <div className="car-how-card__icon"><i className={step.icon} aria-hidden="true" /></div>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="car-benefits-section" aria-labelledby="car-benefits-title">
          <div className="container">
            <span className="car-ppc-section-eyebrow">Why call FareTransit</span>
            <h2 id="car-benefits-title">Rental Assistance Built Around Your Trip</h2>
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

        <section className="car-vehicle-section" aria-labelledby="car-vehicle-title">
          <div className="container">
            <span className="car-ppc-section-eyebrow">Vehicle categories</span>
            <h2 id="car-vehicle-title">Tell Us What You Need to Drive</h2>
            <p className="car-ppc-section-lead">
              Ask about the vehicle category that best fits your passengers, luggage, destination, and travel plans.
            </p>

            <div className="car-vehicle-grid">
              {VEHICLE_TYPES.map((vehicle) => (
                <div className="car-vehicle-card" key={vehicle.label}>
                  <i className={vehicle.icon} aria-hidden="true" />
                  <span>{vehicle.label}</span>
                </div>
              ))}
            </div>

            <div className="car-vehicle-callout">
              <div>
                <strong>Not sure which vehicle you need?</strong>
                <span>Tell our specialist about your trip and passenger needs.</span>
              </div>
              <CallButton className="car-ppc-button car-ppc-button--primary">Call a Rental Specialist</CallButton>
            </div>
          </div>
        </section>

        <section className="car-conversion-section" aria-labelledby="car-conversion-title">
          <div className="container">
            <div className="car-conversion-card">
              <div className="car-conversion-card__icon"><i className="fas fa-headset" aria-hidden="true" /></div>
              <div className="car-conversion-card__copy">
                <span className="car-ppc-section-eyebrow">Reservation assistance</span>
                <h2 id="car-conversion-title">Need Help Finding a Rental Car?</h2>
                <p>Call our reservation team and tell us where and when you need the vehicle.</p>
              </div>
              <div className="car-conversion-card__actions">
                <CallButton className="car-ppc-button car-ppc-button--primary">
                  Call {SUPPORT_PHONE_DISPLAY}
                </CallButton>
                <Link className="car-ppc-button car-ppc-button--outline" to="/contact">
                  <i className="fas fa-envelope" aria-hidden="true" />
                  <span>Contact Us</span>
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="car-faq-section" aria-labelledby="car-faq-title">
          <div className="container car-faq-container">
            <span className="car-ppc-section-eyebrow">Car rental questions</span>
            <h2 id="car-faq-title">Frequently Asked Questions</h2>
            <div className="car-faq-list">
              {FAQS.map((item) => (
                <details className="car-faq-item" key={item.question}>
                  <summary>{item.question}</summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default CarRentalsHomePage;
