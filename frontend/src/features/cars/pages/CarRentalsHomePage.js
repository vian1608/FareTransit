import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import MobileServiceSwitcher from '../../../shared/components/MobileServiceSwitcher';
import { SUPPORT_PHONE_HREF, SUPPORT_PHONE_DISPLAY } from '../../../shared/constants/supportContact';
import CarSearchForm from '../components/CarSearchForm';
import './CarRentalsHomePage.css';
import './CarRentalBrandLogos.css';

const RENTAL_BRANDS = [
  { key: 'hertz', name: 'Hertz', logo: 'https://upload.wikimedia.org/wikipedia/commons/4/42/Hertz_Car_Rental_logo.svg' },
  { key: 'avis', name: 'Avis', logo: 'https://upload.wikimedia.org/wikipedia/commons/f/fd/Avis_logo.svg' },
  { key: 'budget', name: 'Budget', logo: 'https://upload.wikimedia.org/wikipedia/commons/8/8f/Budget_logo.svg' },
  { key: 'enterprise', name: 'Enterprise', logo: 'https://upload.wikimedia.org/wikipedia/commons/e/e9/Enterprise_Rent-A-Car_Logo.svg' },
  { key: 'sixt', name: 'Sixt', logo: 'https://upload.wikimedia.org/wikipedia/commons/f/f4/Sixt_Logo_2023.svg' }
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
    title: 'Search live rental options',
    text: 'Choose an Enterprise pickup location, rental dates, times, and the primary driver age.'
  },
  {
    icon: 'fas fa-car-side',
    title: 'Compare available vehicles',
    text: 'Review current vehicle categories, estimated daily rates, and estimated rental totals returned for your search.'
  },
  {
    icon: 'fas fa-user-check',
    title: 'Send your request',
    text: 'Select a vehicle and submit the primary driver and contact details securely to FareTransit. No payment is collected in this step.'
  },
  {
    icon: 'fas fa-headset',
    title: 'FareTransit confirms it',
    text: 'Our reservation team verifies supplier availability, final price, taxes or fees, and rental terms before the request becomes confirmed.'
  }
];

const BENEFITS = [
  {
    icon: 'fas fa-bolt',
    title: 'Live search with human follow-through',
    text: 'Start online with current Enterprise inventory, then have FareTransit handle the supplier-verification step.'
  },
  {
    icon: 'fas fa-shield-alt',
    title: 'Clear confirmation status',
    text: 'A FareTransit request reference is created immediately, while supplier confirmation remains clearly pending until fulfillment.'
  },
  {
    icon: 'fas fa-car-side',
    title: 'Vehicle details in one place',
    text: 'Compare the vehicle category, transmission, capacity, and estimated rental pricing that the inventory source returns.'
  },
  {
    icon: 'fas fa-phone-alt',
    title: 'Phone assistance stays available',
    text: `Prefer a specialist? Call ${SUPPORT_PHONE_DISPLAY} for one-way rentals, other brands, or requests that need extra help.`
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
    question: 'Does submitting the online form immediately confirm an Enterprise reservation?',
    answer: 'No. The website creates a FareTransit reservation request. Our team then verifies current supplier availability, final pricing, taxes or fees, and rental terms. You receive final confirmation only after the supplier reservation is secured.'
  },
  {
    question: 'Do I pay when I submit the online rental request?',
    answer: 'No payment is collected in the initial online request flow. The estimated rental amount comes from the live search result and remains subject to final verification before confirmation.'
  },
  {
    question: 'Can I return the car to a different location?',
    answer: `The current online inventory connection supports same-location returns. For a one-way rental, call FareTransit at ${SUPPORT_PHONE_DISPLAY} and our reservation team can assist you.`
  },
  {
    question: 'Can I ask for Hertz, Avis, Budget, or Sixt instead?',
    answer: 'The current online live-search connection is for Enterprise inventory. FareTransit can still assist with other rental brands by phone, subject to availability and the applicable supplier terms.'
  },
  {
    question: 'What happens after I submit my request?',
    answer: 'FareTransit creates a request reference and places it in our reservation workflow. Our team verifies the rental with the supplier, records the supplier confirmation details, and then sends you the final confirmation.'
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
        <title>Search Car Rentals Online | FareTransit</title>
        <meta
          name="description"
          content="Search current Enterprise rental-car options and send a reservation request to FareTransit. Compare vehicle categories and estimated rates, then let our reservation team verify the final booking."
        />
        <meta property="og:title" content="Search Car Rentals Online | FareTransit" />
        <meta
          property="og:description"
          content="Search rental-car availability online and submit your selected option to FareTransit for final supplier verification and confirmation."
        />
        <meta property="og:url" content="https://www.faretransit.com/car-rentals" />
        <meta property="og:type" content="website" />
        <link rel="canonical" href="https://www.faretransit.com/car-rentals" />
      </Helmet>

      <main>
        <section className="car-ota-hero" aria-labelledby="car-rental-hero-title">
          <div className="car-ota-hero__backdrop" aria-hidden="true" />
          <div className="container car-ota-hero__content">
            <MobileServiceSwitcher active="cars" />
            <div className="car-ota-hero__copy">
              <span className="car-ppc-eyebrow">Live search + FareTransit reservation assistance</span>
              <h1 id="car-rental-hero-title">Search a Rental Car. Reserve Through FareTransit.</h1>
              <p>
                Search current Enterprise rental options for your dates, compare estimated prices, and send your selected vehicle directly into the FareTransit reservation workflow.
              </p>
            </div>

            <div className="car-ota-search-panel" aria-label="Search rental cars">
              <div className="car-ota-search-panel__header">
                <div>
                  <span>Car rental</span>
                  <h2>Where do you need a car?</h2>
                </div>
                <div className="car-ota-live-badge"><i className="fas fa-circle" aria-hidden="true" /> Enterprise inventory</div>
              </div>
              <CarSearchForm />
              <div className="car-ota-search-disclosure">
                <i className="fas fa-info-circle" aria-hidden="true" />
                <span>
                  Search results are used to create a FareTransit reservation request. A supplier reservation is not created until FareTransit verifies and fulfills the request. Final availability, price, taxes or fees, and rental terms may change before confirmation.
                </span>
              </div>
            </div>

            <div className="car-ota-hero__support-row">
              <span>Need a one-way rental, another brand, or help choosing?</span>
              <CallButton className="car-ota-support-link" primary>Call {SUPPORT_PHONE_DISPLAY}</CallButton>
              <Link className="car-ota-contact-link" to="/contact">Contact FareTransit</Link>
            </div>
          </div>
        </section>

        <section className="car-ota-trust-strip" aria-label="FareTransit rental workflow highlights">
          <div className="container car-ota-trust-strip__grid">
            <span><i className="fas fa-search" aria-hidden="true" /><strong>Search online</strong><small>Current Enterprise options</small></span>
            <span><i className="fas fa-lock" aria-hidden="true" /><strong>No card at request</strong><small>Payment is not collected in the first step</small></span>
            <span><i className="fas fa-user-shield" aria-hidden="true" /><strong>Manual verification</strong><small>FareTransit checks the supplier before confirmation</small></span>
            <span><i className="fas fa-phone-alt" aria-hidden="true" /><strong>Human support</strong><small>{SUPPORT_PHONE_DISPLAY}</small></span>
          </div>
        </section>

        <section className="car-how-section" aria-labelledby="car-how-title">
          <div className="container">
            <span className="car-ppc-section-eyebrow">Online reservation workflow</span>
            <h2 id="car-how-title">From Search to Final Confirmation</h2>
            <p className="car-ppc-section-lead">
              FareTransit combines a travel-agency-style online search experience with a controlled manual fulfillment step before the rental is represented as confirmed.
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

        <section className="car-brand-section" aria-labelledby="car-brand-title">
          <div className="container">
            <span className="car-ppc-section-eyebrow">Rental companies</span>
            <h2 id="car-brand-title">Search Enterprise Online — Ask Us About Other Brands</h2>
            <p className="car-ppc-section-lead">
              The live website connection currently searches Enterprise inventory. If you prefer another rental company, FareTransit can assist by phone.
            </p>

            <div className="car-brand-grid" aria-label="Rental brands FareTransit may assist with by phone">
              {RENTAL_BRANDS.map((brand) => (
                <div className="car-brand-card car-brand-card--logo" key={brand.key} title={brand.name}>
                  <img
                    className={`car-brand-logo car-brand-logo--${brand.key}`}
                    src={brand.logo}
                    alt={`${brand.name} logo`}
                    loading="lazy"
                    decoding="async"
                  />
                  {brand.key === 'enterprise' && <span className="car-brand-live-label">Live online search</span>}
                </div>
              ))}
            </div>

            <p className="car-brand-disclaimer">
              Brand availability varies by location and travel dates. FareTransit is an independent reservation-assistance service and is not affiliated with or endorsed by the brands displayed unless expressly stated.
            </p>
          </div>
        </section>

        <section className="car-benefits-section" aria-labelledby="car-benefits-title">
          <div className="container">
            <span className="car-ppc-section-eyebrow">Why use FareTransit</span>
            <h2 id="car-benefits-title">An Online Search With a Real Reservation Team Behind It</h2>
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

        <section className="car-how-section" aria-labelledby="airport-rental-guides-title">
          <div className="container">
            <span className="car-ppc-section-eyebrow">Airport car rental guides</span>
            <h2 id="airport-rental-guides-title">Planning an Airport Pickup?</h2>
            <p className="car-ppc-section-lead">
              Review location-specific airport rental guidance, then return here to search the Enterprise location that fits your trip.
            </p>
            <div className="car-how-grid">
              {AIRPORT_GUIDES.map((airport) => (
                <Link className="car-how-card car-airport-guide-card" to={`/car-rental/airport/${airport.slug}`} key={airport.code}>
                  <div className="car-how-card__icon"><i className="fas fa-plane-arrival" aria-hidden="true" /></div>
                  <h3>{airport.code} Car Rental</h3>
                  <p>{airport.city} airport rental planning and reservation-assistance guidance.</p>
                  <span className="car-airport-guide-link">View airport guide →</span>
                </Link>
              ))}
            </div>
            <div style={{ marginTop: '22px', textAlign: 'center' }}>
              <Link className="car-ppc-button car-ppc-button--outline" to="/car-rental/airport">Browse All Airport Car Rental Guides</Link>
            </div>
          </div>
        </section>

        <section className="car-vehicle-section" aria-labelledby="car-vehicle-title">
          <div className="container">
            <span className="car-ppc-section-eyebrow">Vehicle categories</span>
            <h2 id="car-vehicle-title">Choose the Right Size for Your Trip</h2>
            <p className="car-ppc-section-lead">
              Available categories depend on your selected Enterprise location and dates. Search above to see what is currently returned for your trip.
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
                <strong>Need help with the vehicle category?</strong>
                <span>Our reservation team can help with passengers, luggage, pickup location, and other requirements.</span>
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
                <h2 id="car-conversion-title">Want a Specialist to Handle the Search?</h2>
                <p>Call FareTransit for one-way rentals, other brands, or a request that does not fit the current online search flow.</p>
              </div>
              <div className="car-conversion-card__actions">
                <CallButton className="car-ppc-button car-ppc-button--primary">Call {SUPPORT_PHONE_DISPLAY}</CallButton>
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
