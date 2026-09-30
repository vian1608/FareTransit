import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import MobileServiceSwitcher from '../../../shared/components/MobileServiceSwitcher';
import { SUPPORT_PHONE_HREF, SUPPORT_PHONE_DISPLAY } from '../../../shared/constants/supportContact';
import CarSearchForm from '../components/CarSearchForm';
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

const AIRPORT_GUIDES = [
  { code: 'DFW', city: 'Dallas–Fort Worth', slug: 'dfw' },
  { code: 'MCO', city: 'Orlando', slug: 'mco' },
  { code: 'MIA', city: 'Miami', slug: 'mia' },
  { code: 'FLL', city: 'Fort Lauderdale', slug: 'fll' },
  { code: 'LAX', city: 'Los Angeles', slug: 'lax' },
  { code: 'JFK', city: 'New York', slug: 'jfk' }
];

const HOW_IT_WORKS = [
  {
    icon: 'fas fa-search',
    title: 'Search Enterprise Cars',
    text: 'Choose your pickup location, dates, times, and driver age to check current Enterprise vehicle classes.'
  },
  {
    icon: 'fas fa-car-side',
    title: 'Compare Available Vehicles',
    text: 'Review current vehicle categories, features, daily rates, and total prices returned for your trip.'
  },
  {
    icon: 'fas fa-credit-card',
    title: 'Continue With FareTransit',
    text: 'Select a vehicle and continue through the FareTransit checkout and secure payment authorization flow.'
  },
  {
    icon: 'fas fa-headset',
    title: 'We Complete the Reservation',
    text: 'Our team completes the supplier reservation and sends your final confirmation after fulfillment.'
  }
];

const BENEFITS = [
  {
    icon: 'fas fa-layer-group',
    title: 'Current Enterprise Inventory',
    text: 'Search available Enterprise vehicle classes for your pickup location and travel dates.'
  },
  {
    icon: 'fas fa-headset',
    title: 'Personal Booking Assistance',
    text: 'Search online first, then get real human assistance through the reservation and fulfillment process.'
  },
  {
    icon: 'fas fa-car-side',
    title: 'Vehicle Selection Help',
    text: 'Compare practical vehicle categories for your passengers, luggage, and trip.'
  },
  {
    icon: 'fas fa-plane-arrival',
    title: 'Airport & City Rentals',
    text: 'Search participating Enterprise airport or city pickup locations based on your travel plans.'
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
    question: 'Can I search car rentals online?',
    answer: 'Yes. Use the Enterprise search form on this page to choose your pickup location, dates, times, and driver age. Current vehicle classes and rates are then shown on the results page.'
  },
  {
    question: 'Can you help me find airport car rentals?',
    answer: 'Yes. Search your airport or city in the pickup field, choose a location from the Enterprise list, and FareTransit can assist with the reservation after you select a vehicle.'
  },
  {
    question: 'Can I request a specific rental company?',
    answer: 'The online search currently uses Enterprise inventory. You can still contact FareTransit if you want assistance with another rental brand.'
  },
  {
    question: 'What information do I need before searching?',
    answer: 'Have your pickup location, pickup and return dates, approximate times, and driver age ready.'
  },
  {
    question: 'Can I request an SUV or luxury vehicle?',
    answer: 'Yes. Available categories can include SUVs, luxury vehicles, vans, economy cars, and other classes depending on supplier inventory.'
  },
  {
    question: 'Does availability depend on location and dates?',
    answer: 'Yes. Rental availability, vehicle categories, policies, and pricing can vary by pickup location, travel dates, and supplier inventory.'
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
        <title>Enterprise Car Rental Search & Booking Assistance | FareTransit</title>
        <meta
          name="description"
          content="Search current Enterprise car rental availability by location and dates, compare vehicle classes and rates, and continue with FareTransit reservation assistance."
        />
        <meta property="og:title" content="Enterprise Car Rental Search & Booking Assistance | FareTransit" />
        <meta
          property="og:description"
          content="Search Enterprise rental cars by pickup location and travel dates, compare current vehicle classes, and continue with FareTransit checkout and assistance."
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
            <span className="car-ppc-eyebrow">Enterprise car rental search</span>
            <h1 id="car-rental-hero-title">Find the Right Rental Car for Your Trip</h1>
            <p>
              Search current Enterprise vehicle availability by pickup location, dates, times, and driver age.
              Compare vehicle classes and rates, then continue with FareTransit reservation assistance.
            </p>

            <div className="car-ppc-hero__actions" aria-label="Car rental assistance options">
              <a className="car-ppc-button car-ppc-button--primary" href="#search-enterprise-cars">
                <i className="fas fa-search" aria-hidden="true" />
                <span>Search Cars</span>
              </a>
              <CallButton className="car-ppc-button car-ppc-button--secondary" primary>
                Call {SUPPORT_PHONE_DISPLAY}
              </CallButton>
            </div>

            <div className="car-ppc-hero__notes" aria-label="FareTransit service highlights">
              <span><i className="fas fa-search" aria-hidden="true" /> Live Enterprise search</span>
              <span><i className="fas fa-map-marked-alt" aria-hidden="true" /> Airport &amp; city rentals</span>
              <span><i className="fas fa-headset" aria-hidden="true" /> Human reservation assistance</span>
            </div>
          </div>
        </section>

        <section id="search-enterprise-cars" className="car-how-section" aria-labelledby="enterprise-car-search-title">
          <div className="container">
            <span className="car-ppc-section-eyebrow">Search current availability</span>
            <h2 id="enterprise-car-search-title">Search Enterprise Rental Cars</h2>
            <p className="car-ppc-section-lead">
              Select an Enterprise pickup location, your rental dates and times, and the driver&apos;s age. We&apos;ll show the current vehicle classes and rates returned for that trip.
            </p>
            <CarSearchForm />
          </div>
        </section>

        <section className="car-how-section" aria-labelledby="airport-rental-guides-title">
          <div className="container">
            <span className="car-ppc-section-eyebrow">Airport car rental guides</span>
            <h2 id="airport-rental-guides-title">Start With Your Arrival Airport</h2>
            <p className="car-ppc-section-lead">
              Planning an airport pickup? Review location-specific guidance for vehicle categories, one-way rentals,
              weekly rentals, nearby trip areas and practical driving considerations before you book.
            </p>
            <div className="car-how-grid">
              {AIRPORT_GUIDES.map((airport) => (
                <Link className="car-how-card car-airport-guide-card" to={`/car-rental/airport/${airport.slug}`} key={airport.code}>
                  <div className="car-how-card__icon"><i className="fas fa-plane-arrival" aria-hidden="true" /></div>
                  <h3>{airport.code} Car Rental</h3>
                  <p>{airport.city} airport rental planning and booking assistance.</p>
                  <span className="car-airport-guide-link">View airport guide →</span>
                </Link>
              ))}
            </div>
            <div style={{ marginTop: '22px', textAlign: 'center' }}>
              <Link className="car-ppc-button car-ppc-button--outline" to="/car-rental/airport">Browse All Airport Car Rental Guides</Link>
            </div>
          </div>
        </section>

        <section className="car-brand-section" aria-labelledby="car-brand-title">
          <div className="container">
            <span className="car-ppc-section-eyebrow">Recognized rental companies</span>
            <h2 id="car-brand-title">Car Rental Brands We Can Help You Explore</h2>
            <p className="car-ppc-section-lead">
              Online inventory search currently uses Enterprise. Contact our team if you want assistance exploring another rental brand.
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
            <span className="car-ppc-section-eyebrow">Online search + human fulfillment</span>
            <h2 id="car-how-title">How It Works</h2>
            <p className="car-ppc-section-lead">
              Search available Enterprise vehicles online, select the option you want, and FareTransit handles the reservation workflow and support.
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
            <span className="car-ppc-section-eyebrow">Why use FareTransit</span>
            <h2 id="car-benefits-title">Rental Search With Human Assistance</h2>
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
            <h2 id="car-vehicle-title">Choose the Vehicle That Fits Your Trip</h2>
            <p className="car-ppc-section-lead">
              Available categories are returned from Enterprise for your selected location and dates and can vary by trip.
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
                <strong>Want help choosing a vehicle?</strong>
                <span>Search first, or call our specialist about your passengers, luggage, and trip needs.</span>
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
                <h2 id="car-conversion-title">Need Help With Your Rental Search?</h2>
                <p>Search online above or call our reservation team for help with your trip.</p>
              </div>
              <div className="car-conversion-card__actions">
                <a className="car-ppc-button car-ppc-button--primary" href="#search-enterprise-cars">
                  <i className="fas fa-search" aria-hidden="true" />
                  <span>Search Cars</span>
                </a>
                <CallButton className="car-ppc-button car-ppc-button--outline">
                  Call {SUPPORT_PHONE_DISPLAY}
                </CallButton>
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