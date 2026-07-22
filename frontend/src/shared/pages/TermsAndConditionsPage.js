import React from 'react';
import '../styles/InfoPages.css';

function TermsAndConditions() {
  return (
    <div className="info-page">
      <div className="container">
        <div className="info-card">
          <h1>Terms & Conditions</h1>
          <p className="info-updated">Last updated: April 2026</p>

          <section>
            <h2>1. Scope of Services</h2>
            <p>
              FareTransit LLC provides travel planning, logistics advisory, and itinerary support
              services. We help customers evaluate and organize travel options based on urgency,
              budget, and operational needs.
            </p>
          </section>

          <section>
            <h2>2. Consultancy Disclaimer</h2>
            <p>
              FareTransit LLC is an independent travel consultancy and is not an airline, air
              carrier, or ticket issuer. Final ticketing and transport fulfillment are subject to
              third-party provider terms.
            </p>
          </section>

          <section>
            <h2>3. Customer Responsibilities</h2>
            <p>
              You are responsible for providing accurate traveler details, valid identification,
              passport and visa compliance, and timely responses to advisory communications.
            </p>
          </section>

          <section>
            <h2>4. Payments and Fees</h2>
            <p>
              Consulting and service coordination fees, where applicable, are disclosed during the
              inquiry and quote process. Payment confirms acceptance of the agreed service scope.
            </p>
          </section>

          <section>
            <h2>5. Limitation of Liability</h2>
            <p>
              We are not liable for delays, cancellations, overbooking, weather events, or supplier
              actions outside our control. Our role is to advise and coordinate based on available
              information.
            </p>
          </section>

          <section>
            <h2>6. Contact for Legal Requests</h2>
            <p>
              For legal, billing, or compliance queries, contact us at
              {' '}
              <a href="mailto:support@faretransit.com">support@faretransit.com</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

export default TermsAndConditions;

