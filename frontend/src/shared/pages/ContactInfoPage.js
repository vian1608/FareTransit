import React from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { InfoPageShell } from '../components/InfoPageLayout';
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_HREF } from '../constants/supportContact';

function ContactInfo() {
  const heroActions = (
    <>
      <a className="info-button info-button--primary" href={SUPPORT_PHONE_HREF}>
        <i className="fas fa-phone-alt" aria-hidden="true" />
        <span>Call {SUPPORT_PHONE_DISPLAY}</span>
      </a>
      <a className="info-button info-button--secondary" href="mailto:support@faretransit.com">
        <i className="fas fa-envelope" aria-hidden="true" />
        <span>Email Support</span>
      </a>
    </>
  );

  return (
    <>
      <Helmet>
        <title>Contact FareTransit | Travel Assistance</title>
        <meta name="description" content="Contact FareTransit LLC for flight search help, reservation assistance, itinerary support, billing questions, and travel inquiries." />
        <meta property="og:title" content="Contact FareTransit | Travel Assistance" />
        <meta property="og:description" content="Contact FareTransit LLC for flight search help, reservation assistance, itinerary support, billing questions, and travel inquiries." />
        <meta property="og:url" content="https://www.faretransit.com/contact" />
        <link rel="canonical" href="https://www.faretransit.com/contact" />
      </Helmet>

      <InfoPageShell
        eyebrow="Travel support"
        title="How Can We Help You?"
        description="Questions about flights, bookings, changes, payments, or your trip? Our travel support team is ready to assist."
        icon="fas fa-headset"
        variant="contact"
        heroActions={heroActions}
        support={false}
      >
        <div className="contact-modern">
          <div className="contact-modern__heading">
            <div>
              <span className="info-eyebrow">Contact FareTransit</span>
              <h2>Choose the easiest way to reach us</h2>
            </div>
            <p>Our team can help with reservation questions, itinerary support, billing inquiries, and time-sensitive travel assistance.</p>
          </div>

          <section className="contact-methods" aria-label="Contact methods">
            <article className="contact-method-card">
              <div className="contact-method-card__icon"><i className="fas fa-phone-alt" aria-hidden="true" /></div>
              <span className="contact-method-card__label">Call us</span>
              <h3>{SUPPORT_PHONE_DISPLAY}</h3>
              <p>Talk directly with a FareTransit travel specialist.</p>
              <a href={SUPPORT_PHONE_HREF}>
                <span>Call now</span>
                <i className="fas fa-arrow-right" aria-hidden="true" />
              </a>
            </article>

            <article className="contact-method-card">
              <div className="contact-method-card__icon"><i className="fas fa-envelope" aria-hidden="true" /></div>
              <span className="contact-method-card__label">Email us</span>
              <h3>support@faretransit.com</h3>
              <p>Send us your question and relevant booking details.</p>
              <a href="mailto:support@faretransit.com">
                <span>Email support</span>
                <i className="fas fa-arrow-right" aria-hidden="true" />
              </a>
            </article>

            <article className="contact-method-card">
              <div className="contact-method-card__icon"><i className="far fa-clock" aria-hidden="true" /></div>
              <span className="contact-method-card__label">Support hours</span>
              <h3>Travel support when you need it</h3>
              <p>24/7 Emergency Support<br />Standard Desk: Mon-Sat, 9:00 AM - 7:00 PM (MT)</p>
            </article>
          </section>

          <section className="contact-business-card" aria-labelledby="business-details-title">
            <div>
              <span className="info-eyebrow">Business details</span>
              <h2 id="business-details-title">FareTransit LLC</h2>
              <div className="contact-business-list">
                <div className="contact-business-detail">
                  <i className="fas fa-building" aria-hidden="true" />
                  <div>
                    <span>Business name</span>
                    <strong>FareTransit LLC</strong>
                  </div>
                </div>
                <div className="contact-business-detail">
                  <i className="fas fa-map-marker-alt" aria-hidden="true" />
                  <div>
                    <span>Business address</span>
                    <p>1309 Coffeen Avenue STE 1200, Sheridan, Wyoming 82801 US</p>
                  </div>
                </div>
              </div>
            </div>

            <aside className="contact-payment-card" aria-label="Secure payment">
              <i className="fas fa-lock" aria-hidden="true" />
              <h3>Secure Payment</h3>
              <p>Need to pay an agreed FareTransit consulting service fee?</p>
              <Link className="info-button info-button--primary" to="/payment">
                <span>Go to Secure Payment</span>
                <i className="fas fa-arrow-right" aria-hidden="true" />
              </Link>
            </aside>
          </section>
        </div>
      </InfoPageShell>
    </>
  );
}

export default ContactInfo;
