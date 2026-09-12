import React from 'react';
import { Helmet } from 'react-helmet-async';
import { InfoPageShell, InfoSection } from '../components/InfoPageLayout';

const TOC = [
  { id: 'scope', label: 'Scope of Services' },
  { id: 'independent-service', label: 'Independent Service' },
  { id: 'customer-responsibilities', label: 'Customer Responsibilities' },
  { id: 'payments-fees', label: 'Payments and Fees' },
  { id: 'flex-assist', label: 'Flex Assist' },
  { id: 'baggage', label: 'Checked Baggage Requests' },
  { id: 'liability', label: 'Limitation of Liability' },
  { id: 'legal-contact', label: 'Legal Contact' },
];

function TermsAndConditions() {
  return (
    <>
      <Helmet>
        <title>Terms & Conditions | FareTransit</title>
        <meta name="description" content="Read the terms and conditions for FareTransit LLC travel-search, reservation-assistance, itinerary-support, Flex Assist, baggage requests, and consulting services." />
        <link rel="canonical" href="https://www.faretransit.com/terms" />
      </Helmet>

      <InfoPageShell
        eyebrow="Terms of service"
        title="Terms & Conditions"
        description="Understand FareTransit's services, customer responsibilities, optional assistance products, payments, and travel-service limitations."
        updated="August 2026"
        icon="fas fa-file-contract"
        toc={TOC}
        supportProps={{
          title: 'Questions about these terms?',
          text: 'FareTransit support can help with general service, billing, or compliance questions related to these terms.',
        }}
      >
        <InfoSection number="01" id="scope" title="Scope of Services" icon="fas fa-compass">
          <p>FareTransit LLC provides flight search, reservation assistance, itinerary support, and optional agency servicing. We help customers evaluate and organize travel options based on urgency, budget, and travel needs.</p>
        </InfoSection>

        <InfoSection number="02" id="independent-service" title="Independent Service Disclaimer" icon="fas fa-info-circle">
          <p>FareTransit LLC is an independent flight-search and reservation-assistance service and is not an airline, air carrier, or official ticket issuer. Final ticketing and transport fulfillment are subject to third-party provider terms.</p>
        </InfoSection>

        <InfoSection number="03" id="customer-responsibilities" title="Customer Responsibilities" icon="fas fa-user-check">
          <p>You are responsible for providing accurate traveler details, valid identification, passport and visa compliance, and timely responses to advisory communications.</p>
        </InfoSection>

        <InfoSection number="04" id="payments-fees" title="Payments and Fees" icon="fas fa-credit-card">
          <p>Consulting, service coordination, and optional service fees are disclosed during the inquiry or checkout process. Payment confirms acceptance of the agreed service scope. Optional services are separately identified in the price summary.</p>
        </InfoSection>

        <InfoSection number="05" id="flex-assist" title="Flex Assist" icon="fas fa-route">
          <p>Flex Assist is an optional FareTransit agency service priced at 10% of the ticket selling price before optional add-ons and voucher discounts. It provides priority assistance with eligible change requests, alternative travel dates or flights, and rebooking support.</p>
          <p>Flex Assist is not travel insurance and does not convert an airline ticket into a flexible airline fare. It does not override airline, consolidator, or supplier fare rules. Replacement availability is not guaranteed. Airline or supplier change penalties, fare differences, taxes, and other third-party charges may still be payable by the traveler.</p>
          <p>Change requests must be submitted before scheduled departure and remain subject to supplier rules and availability. No-show travel is not covered by Flex Assist. FareTransit does not advertise or guarantee a specific success percentage for change requests.</p>
        </InfoSection>

        <InfoSection number="06" id="baggage" title="Checked Baggage Requests" icon="fas fa-suitcase-rolling">
          <p>Selecting extra checked baggage during flight checkout submits a request only. It does not purchase, reserve, or guarantee baggage and no baggage fee is included in the airfare payment at that stage. Baggage acceptance, eligibility, weight and size limits, and pricing are controlled by the operating airline or supplier.</p>
          <p>After the flight reservation is submitted, FareTransit will check baggage availability and the applicable airline or supplier fee. If the request is available, we may send a separate baggage offer showing the confirmed customer price and any applicable validity period.</p>
          <p>Extra baggage is paid separately from airfare and will only be purchased after the traveler approves the confirmed price and completes the separate baggage payment. Payment receipt does not itself mean baggage is confirmed; baggage is confirmed only after the airline or supplier purchase is successfully completed. Supplier pricing and availability may change until purchase.</p>
        </InfoSection>

        <InfoSection number="07" id="liability" title="Limitation of Liability" icon="fas fa-balance-scale">
          <p>We are not liable for delays, cancellations, overbooking, weather events, supplier actions, or unavailable replacement inventory outside our control. Our role is to advise and coordinate based on available information.</p>
        </InfoSection>

        <InfoSection number="08" id="legal-contact" title="Contact for Legal Requests" icon="fas fa-envelope-open-text">
          <p>For legal, billing, or compliance queries, contact us at <a href="mailto:support@faretransit.com">support@faretransit.com</a>.</p>
        </InfoSection>
      </InfoPageShell>
    </>
  );
}

export default TermsAndConditions;
