import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import LandingCtaSection from '../../../shared/components/LandingCtaSection';
import FlightSearchPanel from '../components/FlightSearchPanel';
import { inquiryAPI } from '../../../shared/api/api';
import analytics, { trackLeadConversion } from '../../../shared/utils/analytics';
import { normalizeError } from '../../../shared/utils/normalizeError';
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_HREF } from '../../../shared/constants/supportContact';
import './TravelAssistancePage.css';

const INITIAL_FORM = {
  name: '',
  email: '',
  phone: '',
  origin: '',
  destination: '',
  travelDate: '',
  passengers: '1',
  notes: '',
};

function TravelAssistancePage() {
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [submitStatus, setSubmitStatus] = useState('idle');
  const [submitMessage, setSubmitMessage] = useState('');

  useEffect(() => {
    analytics.trackSeoPageView('travel_assistance');
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((previous) => ({ ...previous, [name]: value }));
    if (submitStatus === 'error') setSubmitMessage('');
  };

  const handleSubmitInquiry = async (event) => {
    event.preventDefault();
    if (submitStatus === 'submitting') return;

    if (!formData.name.trim() || !formData.email.trim() || !formData.phone.trim() || !formData.origin.trim() || !formData.destination.trim()) {
      setSubmitStatus('error');
      setSubmitMessage('Please enter your name, email, phone number, departure city, and destination city.');
      return;
    }

    setSubmitStatus('submitting');
    setSubmitMessage('');

    const clientRequestId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `travel_assist_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    try {
      const result = await inquiryAPI.submitConsulting({
        serviceType: 'flights',
        clientRequestId,
        ...formData,
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        origin: formData.origin.trim(),
        destination: formData.destination.trim(),
        source: 'travel-assistance',
      });

      if (result?.success === true && result?.persisted === true && result?.leadId) {
        setSubmitStatus('success');
        setSubmitMessage(result.message || 'Thank you. Your travel assistance request was received and saved.');
        setFormData(INITIAL_FORM);
        trackLeadConversion({ leadId: result.leadId, value: 1.0, currency: 'USD' });
      } else {
        throw new Error(result?.message || 'Your request could not be saved. Please try again.');
      }
    } catch (error) {
      setSubmitStatus('error');
      setSubmitMessage(normalizeError(error, 'Unable to submit your request right now. Please try again or call us directly.'));
    }
  };

  return (
    <div className="travel-assistance-page">
      <Helmet>
        <title>Flight Booking Assistance | FareTransit</title>
        <meta name="description" content="Search flights online or get personal help comparing routes, connections, baggage and total travel time with FareTransit." />
        <meta property="og:title" content="Flight Booking Assistance | FareTransit" />
        <meta property="og:description" content="Search available flight options online or receive personal help from a travel specialist." />
        <meta property="og:url" content="https://www.faretransit.com/travel-assistance" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="Flight Booking Assistance | FareTransit" />
        <meta name="twitter:description" content="Search flights online or get help comparing routes, connections, baggage and travel time." />
        <link rel="canonical" href="https://www.faretransit.com/travel-assistance" />
      </Helmet>

      <section className="ta-hero">
        <div className="container">
          <div className="ta-hero__content">
            <span className="ta-eyebrow">FareTransit — Travel Assistance</span>
            <h1>Need Help Booking Your Flight?</h1>
            <p className="ta-lead">Search available flight options online or get personal help comparing routes, connections, baggage and total travel time.</p>
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

      <section className="ta-search-section">
        <div className="container">
          <FlightSearchPanel
            pageId="travel_assistance"
            title="Search Flights Online"
            subtitle="Compare flight options with real-time routes, fares, and personal booking assistance."
          />

          <div className="compact-assistance-card">
            <div className="assistance-card-left">
              <i className="fas fa-headset assistance-card-icon" />
              <div>
                <h3>Would You Prefer Help?</h3>
                <p>Our travel specialists can help compare routes, connections, baggage and reservation details.</p>
              </div>
            </div>
            <div className="assistance-card-actions">
              <a href={SUPPORT_PHONE_HREF} className="btn-compact-phone" onClick={() => analytics.trackCallCtaClicked('travel_assistance')}>
                <i className="fas fa-phone-alt" /> Call {SUPPORT_PHONE_DISPLAY}
              </a>
              <a href="#inquiry" className="btn-compact-inquiry" onClick={() => analytics.trackAssistanceRequested('travel_assistance')}>Request Assistance</a>
            </div>
          </div>
        </div>
      </section>

      <section className="ta-section ta-section--light">
        <div className="container">
          <div className="ta-section__header">
            <h2>Travel Assistance for Clearer Flight Decisions</h2>
            <p>Get help reviewing the parts of an itinerary that matter before you reserve.</p>
          </div>
          <div className="ta-grid ta-grid--4">
            <div className="ta-card"><div className="ta-card__icon"><i className="fas fa-route" /></div><h3>Route Comparison</h3><p>Review flight schedules, stops, connection times and total journey length.</p></div>
            <div className="ta-card"><div className="ta-card__icon"><i className="fas fa-suitcase" /></div><h3>Baggage Guidance</h3><p>Understand baggage allowances and important fare-rule differences.</p></div>
            <div className="ta-card"><div className="ta-card__icon"><i className="fas fa-chair" /></div><h3>Cabin Preferences</h3><p>Compare economy, premium, business and first-class options when available.</p></div>
            <div className="ta-card"><div className="ta-card__icon"><i className="fas fa-hands-helping" /></div><h3>Special Requests</h3><p>Include accessibility, seating or family-travel needs in your request.</p></div>
          </div>
        </div>
      </section>

      <section className="ta-section" id="inquiry" style={{ backgroundColor: '#f8fafc', padding: '3rem 0' }}>
        <div className="container" style={{ maxWidth: '720px' }}>
          <div className="ta-section__header" style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
            <h2>Request Travel Assistance</h2>
            <p>Submit your travel details and a specialist can help review your options.</p>
          </div>

          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '2rem', boxShadow: '0 4px 20px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' }}>
            {submitStatus === 'success' && <div role="status" style={{ padding: '1rem', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', borderRadius: '8px', marginBottom: '1.5rem' }}>{submitMessage}</div>}
            {submitStatus === 'error' && <div role="alert" style={{ padding: '1rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: '8px', marginBottom: '1.5rem' }}>{submitMessage}</div>}

            <form onSubmit={handleSubmitInquiry}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '1rem', marginBottom: '1rem' }}>
                <div><label>Full Name *</label><input type="text" name="name" required value={formData.name} onChange={handleChange} style={{ width: '100%', padding: '0.75rem' }} /></div>
                <div><label>Email Address *</label><input type="email" name="email" required value={formData.email} onChange={handleChange} style={{ width: '100%', padding: '0.75rem' }} /></div>
                <div><label>Phone Number *</label><input type="tel" name="phone" required value={formData.phone} onChange={handleChange} style={{ width: '100%', padding: '0.75rem' }} /></div>
                <div><label>Travel Date</label><input type="date" name="travelDate" min={new Date().toISOString().split('T')[0]} value={formData.travelDate} onChange={handleChange} style={{ width: '100%', padding: '0.75rem' }} /></div>
                <div><label>Departure City / Airport *</label><input type="text" name="origin" required value={formData.origin} onChange={handleChange} style={{ width: '100%', padding: '0.75rem' }} /></div>
                <div><label>Destination City / Airport *</label><input type="text" name="destination" required value={formData.destination} onChange={handleChange} style={{ width: '100%', padding: '0.75rem' }} /></div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label>Passengers</label>
                <select name="passengers" value={formData.passengers} onChange={handleChange} style={{ width: '100%', padding: '0.75rem' }}>
                  {[...Array(9)].map((_, index) => <option key={index + 1} value={String(index + 1)}>{index + 1}</option>)}
                </select>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label>Special Notes or Requests</label>
                <textarea name="notes" rows={3} value={formData.notes} onChange={handleChange} style={{ width: '100%', padding: '0.75rem' }} />
              </div>

              <button type="submit" disabled={submitStatus === 'submitting'} style={{ width: '100%', padding: '0.875rem', backgroundColor: '#8b1538', color: '#fff', fontWeight: 700, borderRadius: '8px', border: 0, cursor: submitStatus === 'submitting' ? 'not-allowed' : 'pointer', opacity: submitStatus === 'submitting' ? 0.7 : 1 }}>
                {submitStatus === 'submitting' ? 'Submitting Request...' : 'Submit Assistance Inquiry'}
              </button>
            </form>
          </div>
        </div>
      </section>

      <section className="ta-section">
        <div className="container">
          <LandingCtaSection
            title="Ready to Review Your Trip?"
            description="Search flights yourself or contact our travel team for assistance."
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

export default TravelAssistancePage;
