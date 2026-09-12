import React from 'react';
import { Helmet } from 'react-helmet-async';
import { InfoPageShell, InfoSection } from '../components/InfoPageLayout';

const TOC = [
  { id: 'fare-rules', label: 'General Airline Fare Rules' },
  { id: 'service-fees', label: 'Agency Service Fees' },
  { id: 'cancellations', label: 'Cancellations and Changes' },
  { id: 'schedule-changes', label: 'Schedule Changes' },
];

const RefundPolicy = () => {
  return (
    <>
      <Helmet>
        <title>Refund & Cancellation Policy | FareTransit</title>
        <meta name="description" content="Review FareTransit LLC refund, cancellation, airline fare-rule, service-fee, schedule-change, and re-accommodation policies." />
        <link rel="canonical" href="https://www.faretransit.com/refund-policy" />
      </Helmet>

      <InfoPageShell
        eyebrow="Booking policies"
        title="Refund & Cancellation Policy"
        description="Understand fare rules, cancellations, schedule changes, refund processing, and the responsibilities that apply to your booking."
        updated="May 6, 2026"
        icon="fas fa-undo-alt"
        toc={TOC}
        supportProps={{
          title: 'Need help with an existing booking?',
          text: 'Have your reservation details ready and our team can help you understand the applicable fare rules and next steps.',
          secondaryLabel: 'View My Bookings',
          secondaryTo: '/my-bookings',
        }}
      >
        <InfoSection number="01" id="fare-rules" title="General Airline Fare Rules" icon="fas fa-ticket-alt">
          <p>THE FINAL SEAT LLC acts as a travel intermediary. All airline tickets and travel products booked through our platform are subject to the strict fare rules and contracts of carriage imposed by the issuing airlines and our consolidation partners. Unless explicitly stated otherwise in writing during checkout, all airline tickets are completely non-refundable, non-transferable, and cannot be changed or routed.</p>
        </InfoSection>

        <InfoSection number="02" id="service-fees" title="Agency Service Fees" icon="fas fa-receipt">
          <p>Any service fees, booking fees, or markup fees charged directly by THE FINAL SEAT LLC at the time of purchase are strictly non-refundable, even in the event that an airline authorizes a refund for the base fare of the ticket.</p>
        </InfoSection>

        <InfoSection number="03" id="cancellations" title="Cancellations and Changes" icon="fas fa-exchange-alt">
          <p>If your specific ticket class permits changes or cancellations (as determined solely by the airline), you must submit your request to us prior to your scheduled departure. Changes are subject to airline penalty fees, fare differences, and an administrative processing charge assessed by THE FINAL SEAT LLC. Failure to board a flight (No-Show) will result in the forfeiture of the entire ticket value.</p>
        </InfoSection>

        <InfoSection number="04" id="schedule-changes" title="Involuntary Cancellations (Schedule Changes)" icon="fas fa-calendar-times">
          <p>If a supplier makes a significant schedule change or cancels a flight, you may be entitled to an alternative flight or a refund, subject strictly to that specific supplier's policies. We will assist with re-accommodation or refund requests; however, refunds will only be issued to you once the funds have been successfully recovered from the airline or supplier.</p>
        </InfoSection>
      </InfoPageShell>
    </>
  );
};

export default RefundPolicy;
