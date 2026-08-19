import React, { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import LandingCtaSection from '../../../shared/components/LandingCtaSection';
import FlightSearchPanel from '../components/FlightSearchPanel';
import analytics from '../../../shared/utils/analytics';
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_HREF } from '../../../shared/constants/supportContact';
import './UrgentTravelPage.css';

function UrgentTravelPage() {
  useEffect(() => {
    analytics.trackSeoPageView('urgent_travel');
  }, []);

  return (
    <div className="urgent-travel-page">
      <Helmet>
        <title>Urgent Flight Booking Assistance | FareTransit</title>
        <meta
          name="description"
          content="Search available flights or receive priority assistance for eligible travel within the next three days."
        />
        <meta
          name="keywords"
          content="urgent flights, last minute flight booking, urgent travel assistance, emergency flight support"
        />
        <meta property="og:title" content="Urgent Flight Booking Assistance | FareTransit" />
        <meta
          property="og:description"
          content="Search available flights or receive priority assistance for eligible travel within the next three days."
        />
        <meta property="og:url" content="https://www.faretransit.com/urgent-travel" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Urgent Flight Booking Assistance | FareTransit" />
        <meta
          name="twitter:description"
          content="Search available flights or receive priority assistance for eligible travel within the next three days."
        />
        <link rel="canonical" href="https://www.faretransit.com/urgent-travel" />
      </Helmet>

      {/* Hero Section */}
      <section className="ut-hero">
        <div className="container">
          <div className="ut-hero__content">
            <span className="ut-eyebrow">FareTransit — Urgent Flight Support</span>
            <h1>Need to Travel Within the Next Few Days?</h1>
            <p className="ut-lead">
              Search available flights now or speak with a travel specialist for priority assistance. Save up to 20% on eligible reservations for travel within 3 days.
            </p>
            <LandingCtaSection
              primaryText="Search Flights"
              primaryHref="#flight-search-form"
              secondaryText={`Call ${SUPPORT_PHONE_DISPLAY}`}
              secondaryHref={SUPPORT_PHONE_HREF}
              variant="hero"
            />
          </div>
        </div>
      </section>

      {/* Flight Search Section */}
      <section className="ut-search-section">
        <div className="container">
          <FlightSearchPanel
            pageId="urgent_travel"
            isUrgentContext={true}
            title="Search Urgent Flights"
            subtitle="Search immediate flight options or speak with a specialist for priority travel help."
          />

          {/* Urgent Offer Banner */}
          <div className="ut-offer-box">
            <div className="ut-offer-left">
              <span className="ut-offer-badge">Priority Travel Support</span>
              <h3>Save Up To 20% On Travel Within 3 Days</h3>
              <p>Applied to eligible time-sensitive itineraries. Savings depend on route availability and cabin class.</p>
            </div>
            <a
              href={SUPPORT_PHONE_HREF}
              className="btn-urgent-call"
              onClick={() => analytics.trackCallCtaClicked('urgent_travel')}
            >
              <i className="fas fa-bolt"></i> Priority Call: {SUPPORT_PHONE_DISPLAY}
            </a>
          </div>
        </div>
      </section>

      {/* Key Services */}
      <section className="ut-section">
        <div className="container">
          <div className="ut-section__header">
            <h2>Why Use Our Urgent Travel Desk</h2>
            <p>Fast responses, clear flight options, and direct human coordination.</p>
          </div>

          <div className="ut-grid ut-grid--3">
            <div className="ut-card">
              <div className="ut-card__icon"><i className="fas fa-tachometer-alt"></i></div>
              <h3>Fast Assistance</h3>
              <p>Immediate phone and online support when you need to secure a seat without long holds.</p>
            </div>
            <div className="ut-card">
              <div className="ut-card__icon"><i className="fas fa-layer-group"></i></div>
              <h3>Compare Available Options</h3>
              <p>Real-time review of domestic and international carrier schedules, layovers, and cabin classes.</p>
            </div>
            <div className="ut-card">
              <div className="ut-card__icon"><i className="fas fa-user-check"></i></div>
              <h3>Human Support</h3>
              <p>Direct contact with dedicated travel specialists who verify itinerary rules before reservation.</p>
            </div>
          </div>

          <div className="independent-service-footer-notice" style={{ marginTop: '3rem' }}>
            <i className="fas fa-info-circle"></i> FareTransit is an independent flight-search and reservation-assistance service and is not affiliated with or endorsed by individual airlines.
          </div>
        </div>
      </section>

      {/* CTA Box */}
      <section className="ut-cta-box">
        <div className="container">
          <LandingCtaSection
            title="Need Immediate Flight Assistance?"
            description="Our urgent travel desk is open 24/7. Search flights online or call for priority help."
            primaryText="Search Flights"
            primaryHref="#flight-search-form"
            secondaryText={`Call ${SUPPORT_PHONE_DISPLAY}`}
            secondaryHref={SUPPORT_PHONE_HREF}
            variant="footer"
          />
        </div>
      </section>
    </div>
  );
}

export default UrgentTravelPage;
