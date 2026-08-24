import React from 'react';
import { Helmet } from 'react-helmet-async';
import '../styles/InfoPages.css';

function TermsAndConditions() {
  return (
    <div className="info-page">
      <Helmet>
        <title>Terms & Conditions | FareTransit</title>
        <meta name="description" content="Read the terms and conditions for FareTransit LLC travel-search, reservation-assistance, itinerary-support, Flex Assist, baggage requests, and consulting services." />
        <link rel="canonical" href="https://www.faretransit.com/terms" />
      </Helmet>
      <div className="container">
        <div className="info-card">
          <h1>Terms & Conditions</h1>
          <p className="info-updated">Last updated: August 2026</p>

          <section><h2>1. Scope of Services</h2><p>FareTransit LLC provides flight search, reservation assistance, itinerary support, and optional agency servicing. We help customers evaluate and organize travel options based on urgency, budget, and travel needs.</p></section>
          <section><h2>2. Independent Service Disclaimer</h2><p>FareTransit LLC is an independent flight-search and reservation-assistance service and is not an airline, air carrier, or official ticket issuer. Final ticketing and transport fulfillment are subject to third-party provider terms.</p></section>
          <section><h2>3. Customer Responsibilities</h2><p>You are responsible for providing accurate traveler details, valid identification, passport and visa compliance, and timely responses to advisory communications.</p></section>
          <section><h2>4. Payments and Fees</h2><p>Consulting, service coordination, and optional service fees are disclosed during the inquiry or checkout process. Payment confirms acceptance of the agreed service scope. Optional services are separately identified in the price summary.</p></section>

          <section>
            <h2>5. Flex Assist</h2>
            <p>Flex Assist is an optional FareTransit agency service priced at 10% of the ticket selling price before optional add-ons and voucher discounts. It provides priority assistance with eligible change requests, alternative travel dates or flights, and rebooking support.</p>
            <p>Flex Assist is not travel insurance and does not convert an airline ticket into a flexible airline fare. It does not override airline, consolidator, or supplier fare rules. Replacement availability is not guaranteed. Airline or supplier change penalties, fare differences, taxes, and other third-party charges may still be payable by the traveler.</p>
            <p>Change requests must be submitted before scheduled departure and remain subject to supplier rules and availability. No-show travel is not covered by Flex Assist. FareTransit does not advertise or guarantee a specific success percentage for change requests.</p>
          </section>

          <section>
            <h2>6. Checked Baggage Requests</h2>
            <p>Selecting extra checked baggage during flight checkout submits a request only. It does not purchase, reserve, or guarantee baggage and no baggage fee is included in the airfare payment at that stage. Baggage acceptance, eligibility, weight and size limits, and pricing are controlled by the operating airline or supplier.</p>
            <p>After the flight reservation is submitted, FareTransit will check baggage availability and the applicable airline or supplier fee. If the request is available, we may send a separate baggage offer showing the confirmed customer price and any applicable validity period.</p>
            <p>Extra baggage is paid separately from airfare and will only be purchased after the traveler approves the confirmed price and completes the separate baggage payment. Payment receipt does not itself mean baggage is confirmed; baggage is confirmed only after the airline or supplier purchase is successfully completed. Supplier pricing and availability may change until purchase.</p>
          </section>

          <section><h2>7. Limitation of Liability</h2><p>We are not liable for delays, cancellations, overbooking, weather events, supplier actions, or unavailable replacement inventory outside our control. Our role is to advise and coordinate based on available information.</p></section>
          <section><h2>8. Contact for Legal Requests</h2><p>For legal, billing, or compliance queries, contact us at <a href="mailto:support@faretransit.com">support@faretransit.com</a>.</p></section>
        </div>
      </div>
    </div>
  );
}

export default TermsAndConditions;
