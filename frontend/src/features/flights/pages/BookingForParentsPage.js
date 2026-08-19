import React, { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import LandingCtaSection from '../../../shared/components/LandingCtaSection';
import FlightSearchPanel from '../components/FlightSearchPanel';
import analytics from '../../../shared/utils/analytics';
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_HREF } from '../../../shared/constants/supportContact';
import './BookingForParentsPage.css';

function BookingForParentsPage() {
  useEffect(() => {
    analytics.trackSeoPageView('booking_for_parents');
  }, []);

  return (
    <div className="booking-for-parents-page">
      <Helmet>
        <title>Family Flight Booking Assistance | FareTransit</title>
        <meta
          name="description"
          content="Arrange travel for a parent, relative or family member with help comparing routes, connections, baggage and total journey time."
        />
        <meta
          name="keywords"
          content="book flights for parents, family flight booking, travel assistance for family, book flight for relative"
        />
        <meta property="og:title" content="Family Flight Booking Assistance | FareTransit" />
        <meta
          property="og:description"
          content="Arrange travel for a parent, relative or family member with help comparing routes, connections, baggage and total journey time."
        />
        <meta property="og:url" content="https://www.faretransit.com/booking-for-parents" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Family Flight Booking Assistance | FareTransit" />
        <meta
          name="twitter:description"
          content="Arrange travel for a parent, relative or family member with help comparing routes, connections, baggage and total journey time."
        />
        <link rel="canonical" href="https://www.faretransit.com/booking-for-parents" />
      </Helmet>

      {/* Hero Section */}
      <section className="bfp-hero">
        <div className="container">
          <div className="bfp-hero__content">
            <span className="bfp-eyebrow">FareTransit — Family Booking Assistance</span>
            <h1>Arranging Travel for a Parent or Relative?</h1>
            <p className="bfp-lead">
              Search flight options online or get help comparing travel time, connections, baggage and route complexity with real human support.
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
      <section className="bfp-search-section">
        <div className="container">
          <FlightSearchPanel
            pageId="booking_for_parents"
            defaultBookingForSomeoneElse={true}
            title="Search Flights for Parents & Relatives"
            subtitle="Compare flight options with clear layover details, seating preferences, and family reservation support."
          />

          {/* Compact Family Assistance Notice */}
          <div className="family-assistance-banner">
            <i className="fas fa-heart-spouse family-banner-icon"></i>
            <div>
              <h3>Family Booking Support Available</h3>
              <p>We can help families review flight options and understand the complete itinerary before reservation.</p>
            </div>
            <a
              href={SUPPORT_PHONE_HREF}
              className="btn-family-call"
              onClick={() => analytics.trackCallCtaClicked('booking_for_parents')}
            >
              <i className="fas fa-phone-alt"></i> Call {SUPPORT_PHONE_DISPLAY}
            </a>
          </div>
        </div>
      </section>

      {/* Core Benefits */}
      <section className="bfp-section bfp-section--light">
        <div className="container">
          <div className="bfp-section__header">
            <h2>Why Families Trust Us With Parent Reservations</h2>
            <p>Thoughtful flight coordination designed for peace of mind.</p>
          </div>

          <div className="bfp-grid bfp-grid--4">
            <div className="bfp-card">
              <div className="bfp-card__icon"><i className="fas fa-smile"></i></div>
              <h3>Easy Booking Process</h3>
              <p>Simple flight selection without requiring family members to navigate confusing automated systems.</p>
            </div>
            <div className="bfp-card">
              <div className="bfp-card__icon"><i className="fas fa-info-circle"></i></div>
              <h3>Help Understanding Options</h3>
              <p>Clear explanations of connection times, baggage rules, seat legroom, and flight schedule convenience.</p>
            </div>
            <div className="bfp-card">
              <div className="bfp-card__icon"><i className="fas fa-route"></i></div>
              <h3>Support with Layovers</h3>
              <p>Special care evaluating layovers and transfers to ensure connections are stress-free and manageable.</p>
            </div>
            <div className="bfp-card">
              <div className="bfp-card__icon"><i className="fas fa-hands-helping"></i></div>
              <h3>Special Service Coordination</h3>
              <p>Help adding wheelchair assistance, meal requests, and preferred daytime departure options.</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works for Family Members */}
      <section className="bfp-section">
        <div className="container">
          <div className="bfp-section__header">
            <h2>How Booking For Someone Else Works</h2>
            <p>Keep your family updated every step of the way.</p>
          </div>

          <div className="bfp-steps">
            <div className="bfp-step">
              <div className="bfp-step__num">1</div>
              <h3>Search Flights Online</h3>
              <p>Search routes above or select "I am arranging this trip for a parent, relative or family member".</p>
            </div>
            <div className="bfp-step">
              <div className="bfp-step__num">2</div>
              <h3>Add Your Contact Information</h3>
              <p>Include your email and phone number to receive confirmation notices and real-time flight status updates.</p>
            </div>
            <div className="bfp-step">
              <div className="bfp-step__num">3</div>
              <h3>Review & Confirm</h3>
              <p>Our travel specialists review connection times and flight details before issuing final tickets.</p>
            </div>
          </div>

          <div className="independent-service-footer-notice" style={{ marginTop: '3rem' }}>
            <i className="fas fa-info-circle"></i> FareTransit is an independent flight-search and reservation-assistance service and is not affiliated with or endorsed by individual airlines.
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bfp-cta-box">
        <div className="container">
          <LandingCtaSection
            title="Ready to Find Flights For Your Family?"
            description="Search available flight options online or speak with a travel specialist."
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

export default BookingForParentsPage;
