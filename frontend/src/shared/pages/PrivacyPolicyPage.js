import React from 'react';
import { Helmet } from 'react-helmet-async';
import { InfoPageShell, InfoSection } from '../components/InfoPageLayout';

const TOC = [
  { id: 'sms-privacy', label: 'SMS & Messaging Privacy' },
  { id: 'information-collected', label: 'Information We Collect' },
  { id: 'data-use', label: 'How We Use and Share Data' },
  { id: 'payment-security', label: 'Payment Security' },
];

const PrivacyPolicy = () => {
  return (
    <>
      <Helmet>
        <title>Privacy Policy | FareTransit</title>
        <meta name="description" content="Read how FareTransit LLC handles contact details, traveler information, SMS consent, booking information, and payment-related data." />
        <link rel="canonical" href="https://www.faretransit.com/privacy-policy" />
      </Helmet>

      <InfoPageShell
        eyebrow="Privacy & data"
        title="Privacy Policy"
        description="Learn how FareTransit handles personal information, booking details, communications, and payment-related data."
        updated="May 21, 2026"
        icon="fas fa-shield-alt"
        toc={TOC}
        supportProps={{
          title: 'Questions about your privacy or data?',
          text: 'Contact FareTransit support if you have questions about the information described in this policy.',
        }}
      >
        <InfoSection number="01" id="sms-privacy" title="SMS Opt-In and Text Messaging Privacy" icon="fas fa-comment-alt">
          <p>FareTransit LLC values your privacy. Mobile phone numbers collected for the purpose of SMS opt-in, automated flight notifications, or booking support updates will be used exclusively to deliver the specific services requested by the consumer.</p>
          <p>No mobile information will be shared with third parties/affiliates for marketing/promotional purposes. All the above categories exclude text messaging originator opt-in data and consent; this information will not be shared with any third parties.</p>
        </InfoSection>

        <InfoSection number="02" id="information-collected" title="Information We Collect" icon="fas fa-database">
          <p>THE FINAL SEAT LLC respects your privacy. We collect the personal information strictly necessary to facilitate your travel arrangements. This includes your contact details, passenger details, and itinerary preferences required to process inbound flight reservations.</p>
        </InfoSection>

        <InfoSection number="03" id="data-use" title="How We Use and Share Data" icon="fas fa-exchange-alt">
          <p>We use your information solely to fulfill your flight bookings, coordinate with our authorized suppliers, and share operational updates related to your travel plan. We share necessary passenger details strictly with the respective airlines, consolidators, and Global Distribution Systems (GDS) required to issue your tickets. We do not sell or trade your data to third-party marketers.</p>
        </InfoSection>

        <InfoSection number="04" id="payment-security" title="Payment Security" icon="fas fa-lock">
          <p>Your financial security is our priority. Payment data is processed through secure, PCI-DSS compliant payment gateways (such as Authorize.net). We utilize secure tokenization and do not store full credit card numbers on our servers at any time.</p>
        </InfoSection>
      </InfoPageShell>
    </>
  );
};

export default PrivacyPolicy;
