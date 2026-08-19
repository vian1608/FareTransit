import React from 'react';
import { Helmet } from 'react-helmet-async';
import '../styles/InfoPages.css';

const RefundPolicy = () => {
  return (
    <section className="info-page">
      <Helmet>
        <title>Refund & Cancellation Policy | FareTransit</title>
        <meta name="description" content="Review FareTransit LLC refund, cancellation, airline fare-rule, service-fee, schedule-change, and re-accommodation policies." />
        <link rel="canonical" href="https://www.faretransit.com/refund-policy" />
      </Helmet>
      <div className="container">
        <article className="info-card">
          <h1>Refund and Cancellation Policy</h1>
          <p className="info-updated"><strong>Last Updated:</strong> May 6, 2026</p>

          <section>
            <h2>1. General Airline Fare Rules</h2>
            <p>THE FINAL SEAT LLC acts as a travel intermediary. All airline tickets and travel products booked through our platform are subject to the strict fare rules and contracts of carriage imposed by the issuing airlines and our consolidation partners. Unless explicitly stated otherwise in writing during checkout, all airline tickets are completely non-refundable, non-transferable, and cannot be changed or routed.</p>
          </section>

          <section>
            <h2>2. Agency Service Fees</h2>
            <p>Any service fees, booking fees, or markup fees charged directly by THE FINAL SEAT LLC at the time of purchase are strictly non-refundable, even in the event that an airline authorizes a refund for the base fare of the ticket.</p>
          </section>

          <section>
            <h2>3. Cancellations and Changes</h2>
            <p>If your specific ticket class permits changes or cancellations (as determined solely by the airline), you must submit your request to us prior to your scheduled departure. Changes are subject to airline penalty fees, fare differences, and an administrative processing charge assessed by THE FINAL SEAT LLC. Failure to board a flight (No-Show) will result in the forfeiture of the entire ticket value.</p>
          </section>

          <section>
            <h2>4. Involuntary Cancellations (Schedule Changes)</h2>
            <p>If a supplier makes a significant schedule change or cancels a flight, you may be entitled to an alternative flight or a refund, subject strictly to that specific supplier's policies. We will assist with re-accommodation or refund requests; however, refunds will only be issued to you once the funds have been successfully recovered from the airline or supplier.</p>
          </section>
        </article>
      </div>
    </section>
  );
};

export default RefundPolicy;
