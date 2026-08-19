import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';
import { inquiryAPI } from '../../../shared/api/api';
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_HREF } from '../../../shared/constants/supportContact';
import { trackLeadConversion } from '../../../shared/utils/analytics';
import { normalizeError } from '../../../shared/utils/normalizeError';
import './TrainRoutePage.css';

const INITIAL_FORM = {
  fullName: '',
  travelDateTime: '',
  paxCount: '1',
  specialRequests: '',
  phone: '',
  email: '',
  smsOptIn: false,
};

const TrainRoute = ({ title, metaTitle, metaDescription, originCity, destinationCity, originCode, destinationCode }) => {
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [submitStatus, setSubmitStatus] = useState('idle');
  const [submitMessage, setSubmitMessage] = useState('');
  const [showFullDisclosure, setShowFullDisclosure] = useState(false);
  const location = useLocation();
  const canonicalUrl = `https://www.faretransit.com${location.pathname}`;

  const getFallbackParts = (routeTitle) => {
    const match = String(routeTitle || '').match(/from\s+(.+?)\s+to\s+(.+)$/i);
    if (match) {
      return {
        originCity: match[1].trim(),
        originCode: match[1].trim(),
        destinationCity: match[2].trim(),
        destinationCode: match[2].trim(),
      };
    }
    return { originCity: 'New York City', originCode: 'NYC', destinationCity: 'Washington, D.C.', destinationCode: 'DC' };
  };

  const fallback = getFallbackParts(title);
  const oCity = originCity || fallback.originCity;
  const dCity = destinationCity || fallback.destinationCity;
  const oCode = originCode || fallback.originCode;
  const dCode = destinationCode || fallback.destinationCode;

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setFormData((previous) => ({ ...previous, [name]: type === 'checkbox' ? checked : value }));
    setSubmitMessage('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitStatus === 'submitting') return;

    if (!formData.fullName.trim() || !formData.email.trim() || !formData.phone.trim() || !formData.travelDateTime) {
      setSubmitStatus('error');
      setSubmitMessage('Please enter your name, email, phone number, and travel date.');
      return;
    }

    setSubmitStatus('submitting');
    setSubmitMessage('');
    const clientRequestId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `train_route_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    try {
      const result = await inquiryAPI.submitConsulting({
        serviceType: 'rail',
        clientRequestId,
        name: formData.fullName.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        origin: `${oCity} (${oCode})`,
        destination: `${dCity} (${dCode})`,
        travelDate: formData.travelDateTime,
        passengers: formData.paxCount,
        smsOptIn: formData.smsOptIn,
        source: `route:${location.pathname}`,
        notes: formData.specialRequests.trim(),
      });

      if (result?.success === true && result?.persisted === true && result?.leadId) {
        setSubmitStatus('success');
        setSubmitMessage(result.message || 'Your rail request was received. Our team will contact you shortly.');
        setFormData(INITIAL_FORM);
        trackLeadConversion({ leadId: result.leadId, value: 1.0, currency: 'USD' });
      } else {
        throw new Error(result?.message || 'Your request could not be saved. Please try again.');
      }
    } catch (error) {
      setSubmitStatus('error');
      setSubmitMessage(normalizeError(error, 'Unable to submit this rail request right now. Please try again or call us.'));
    }
  };

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: `Rail assistance from ${oCity} to ${dCity}`,
    provider: { '@type': 'TravelAgency', name: 'FareTransit', url: 'https://www.faretransit.com/' },
    areaServed: 'US',
    serviceType: 'Rail travel assistance',
    url: canonicalUrl,
  };

  return (
    <div className="train-route-page">
      <Helmet>
        <title>{metaTitle}</title>
        <meta name="description" content={metaDescription} />
        <meta property="og:title" content={metaTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={metaTitle} />
        <meta name="twitter:description" content={metaDescription} />
        <link rel="canonical" href={canonicalUrl} />
        <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
      </Helmet>

      <section className="train-route-hero">
        <div className="container">
          <h1>{title}</h1>
          <p>Review route details and request personal assistance for your rail trip.</p>
        </div>
      </section>

      <section className="train-route-form-section">
        <div className="container">
          <div className="inquiry-split-layout">
            <div className="inquiry-left-panel">
              <h2>Need help with {oCity} to {dCity} rail travel?</h2>
              <p>Call our travel team or submit your trip details for route assistance.</p>
              <a href={SUPPORT_PHONE_HREF} className="call-btn amtrak-btn amtrak-btn--cta" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '2rem', padding: '1.25rem', fontSize: '1.2rem', backgroundColor: '#1e3a5f', color: '#fff', textDecoration: 'none', borderRadius: '8px', fontWeight: 'bold' }}>
                <i className="fas fa-phone" /> Call {SUPPORT_PHONE_DISPLAY}
              </a>
              <div className="benefits-list">
                <h3>Rail trip assistance</h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  <li style={{ marginBottom: '1rem' }}><i className="fas fa-check-circle" style={{ color: '#0ea5e9', marginRight: '0.6rem' }} />Review schedules, stations, and route options.</li>
                  <li><i className="fas fa-check-circle" style={{ color: '#0ea5e9', marginRight: '0.6rem' }} />Ask about seating and accessibility needs.</li>
                </ul>
              </div>
            </div>

            <div className="inquiry-right-panel">
              <div className="train-route-card" style={{ margin: 0 }}>
                <h2>Request {oCode} to {dCode} rail options</h2>
                <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '1.5rem' }}>Share your travel details and our team will review available options.</p>
                <form className="train-route-form" onSubmit={handleSubmit}>
                  <div className="form-group">
                    <label htmlFor="fullName">Full Name *</label>
                    <input type="text" id="fullName" name="fullName" required value={formData.fullName} onChange={handleChange} placeholder="John Doe" />
                  </div>

                  <div className="form-group">
                    <label htmlFor="email">Email Address *</label>
                    <input type="email" id="email" name="email" required value={formData.email} onChange={handleChange} placeholder="john@example.com" />
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="travelDateTime">Date of Travel *</label>
                      <input type="date" id="travelDateTime" name="travelDateTime" required min={new Date().toISOString().split('T')[0]} value={formData.travelDateTime} onChange={handleChange} />
                    </div>
                    <div className="form-group">
                      <label htmlFor="paxCount">Passenger Count</label>
                      <select id="paxCount" name="paxCount" value={formData.paxCount} onChange={handleChange}>
                        {[...Array(9)].map((_, index) => <option key={index + 1} value={index + 1}>{index + 1} Passenger{index ? 's' : ''}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="specialRequests">Special Requests</label>
                    <textarea id="specialRequests" name="specialRequests" rows={3} value={formData.specialRequests} onChange={handleChange} placeholder="Seat preferences, accessibility, or other requests" />
                  </div>

                  <div className="form-group">
                    <label htmlFor="phone">Phone Number *</label>
                    <input type="tel" id="phone" name="phone" required value={formData.phone} onChange={handleChange} placeholder="+1 555 123 4567" />
                  </div>

                  <div style={{ backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0', marginBottom: '1rem' }}>
                    <label htmlFor="smsOptIn" style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', fontSize: '0.78rem', color: '#475569', lineHeight: 1.55 }}>
                      <input type="checkbox" id="smsOptIn" name="smsOptIn" checked={formData.smsOptIn} onChange={handleChange} style={{ marginTop: '0.2rem' }} />
                      <span>
                        I agree to receive SMS support updates from FareTransit LLC at the phone number provided. Message &amp; data rates may apply. Reply STOP to opt out.
                        {showFullDisclosure && <> Consent is not a condition of purchase. Message frequency varies. View our privacy and terms pages for details.</>}
                      </span>
                    </label>
                    <button type="button" onClick={() => setShowFullDisclosure((open) => !open)} style={{ background: 'none', border: 0, color: '#4f46e5', textDecoration: 'underline', cursor: 'pointer', padding: '0.35rem 0 0' }}>
                      {showFullDisclosure ? 'Read Less' : 'Read More'}
                    </button>
                  </div>

                  <button type="submit" className="train-route-submit-btn" disabled={submitStatus === 'submitting'}>
                    {submitStatus === 'submitting' ? 'Submitting...' : 'Request Rail Options'}
                  </button>

                  {submitMessage && <p role="status" className={`form-message ${submitStatus === 'success' ? 'success' : 'error'}`}>{submitMessage}</p>}
                </form>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default TrainRoute;
