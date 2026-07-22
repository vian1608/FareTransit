import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';
import { inquiryAPI } from '../../../shared/api/api';
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_HREF } from '../../../shared/constants/supportContact';
import './FlightRoutePage.css';

const FlightRoute = ({ title, metaTitle, metaDescription, keywords, originCity, destinationCity, originCode, destinationCode }) => {
  const [formData, setFormData] = useState({
    fullName: '',
    travelDateTime: '',
    paxCount: '1',
    cabinClass: 'economy',
    tripType: 'roundtrip',
    specialRequests: '',
    phone: '',
    email: '',
  });
  const [submitStatus, setSubmitStatus] = useState('idle');
  const [submitMessage, setSubmitMessage] = useState('');
  const [showFullDisclosure, setShowFullDisclosure] = useState(false);
  const location = useLocation();
  const canonicalUrl = `https://faretransit.com${location.pathname}`;

  // Helper to extract route parts if props are omitted
  const getFallbackParts = (routeTitle) => {
    try {
      const match = routeTitle.match(/from\s+([^(]+)\s*\(([^)]+)\)\s+to\s+([^(]+)\s*\(([^)]+)\)/i);
      if (match) {
        return {
          originCity: match[1].trim(),
          originCode: match[2].trim(),
          destinationCity: match[3].trim(),
          destinationCode: match[4].trim(),
        };
      }
    } catch (e) {
      // ignore fallback parsing errors
    }
    return {
      originCity: 'New York',
      originCode: 'JFK',
      destinationCity: 'London',
      destinationCode: 'LHR',
    };
  };

  const oCity = originCity || getFallbackParts(title).originCity;
  const dCity = destinationCity || getFallbackParts(title).destinationCity;
  const oCode = originCode || getFallbackParts(title).originCode;
  const dCode = destinationCode || getFallbackParts(title).destinationCode;

  // Cursor template logic for dynamic route SEO
  const generateRouteKeywords = (originCity, destinationCity, originCode, destinationCode) => {
    return [
      `flights from ${originCity} to ${destinationCity}`,
      `book flights from ${originCode} to ${destinationCode}`,
      `cheap flights from ${originCity} to ${destinationCity}`,
      `last minute flight inquiry ${originCity} to ${destinationCity}`,
      `direct flights from ${originCity} to ${destinationCity}`,
      `flight routes from ${originCode} to ${destinationCode}`,
      `multi city flight booking ${originCity} to ${destinationCity} support`
    ];
  };

  const activeKeywords = generateRouteKeywords(oCity, dCity, oCode, dCode);
  const topThreeKeywords = activeKeywords.slice(0, 3);

  // Helper to capitalize words naturally for SEO headlines
  const capitalizeWords = (str) => {
    if (!str) return '';
    return str.replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitStatus('submitting');

    try {
      const payload = {
        name: formData.fullName,
        email: formData.email || 'route-inquiry@faretransit.com',
        phone: formData.phone,
        origin: title,
        destination: title,
        travelDate: formData.travelDateTime,
        passengers: formData.paxCount,
        notes: `Cabin: ${formData.cabinClass}, Trip: ${formData.tripType}. ${formData.specialRequests}. SEO Context Keywords: ${activeKeywords.slice(0, 3).join(', ')}`,
      };

      const result = await inquiryAPI.submitConsulting(payload, 'flights');
      
      setSubmitStatus('success');
      setSubmitMessage(
        result.message || 'Availability request received. We will contact you shortly.'
      );
      setFormData({ fullName: '', travelDateTime: '', paxCount: '1', cabinClass: 'economy', tripType: 'roundtrip', specialRequests: '', phone: '', email: '' });
    } catch (error) {
      setSubmitStatus('error');
      setSubmitMessage('Unable to check availability right now. Please call us.');
    }
  };

  return (
    <div className="flight-route-page">
      <Helmet>
        <title>{metaTitle}</title>
        <meta name="description" content={metaDescription} />
        <meta name="keywords" content={activeKeywords.join(', ')} />
        <meta property="og:title" content={metaTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:url" content={canonicalUrl} />
        <link rel="canonical" href={canonicalUrl} />
      </Helmet>

      <section className="flight-route-hero">
        <div className="container">
          <h1>{title}</h1>
          <p>Premium routing, seamless ticketing, and expert passenger assistance.</p>
        </div>
      </section>

      <section className="flight-route-form-section">
        <div className="container">
          <div className="inquiry-split-layout">
            <div className="inquiry-left-panel">
              <h2>Need Immediate Support for {capitalizeWords(topThreeKeywords[0])}?</h2>
              <p>Skip the form and call us directly to secure your air logistics immediately.</p>
              
              <a href={SUPPORT_PHONE_HREF} className="call-btn flights-btn flights-btn--cta" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '2rem', padding: '1.25rem', fontSize: '1.2rem', backgroundColor: '#1e293b', color: '#fff', textDecoration: 'none', borderRadius: '8px', fontWeight: 'bold' }}>
                <i className="fas fa-phone"></i> Call {SUPPORT_PHONE_DISPLAY}
              </a>
              
              <div className="benefits-list">
                <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#1e293b' }}>Premium Service & {capitalizeWords(topThreeKeywords[2])} Benefits:</h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  <li style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', alignItems: 'start' }}>
                    <i className="fas fa-check-circle" style={{ color: '#3b82f6', marginTop: '0.25rem' }}></i>
                    <span>Includes free 24/7 support till date of travel.</span>
                  </li>
                  <li style={{ display: 'flex', gap: '0.75rem', alignItems: 'start' }}>
                    <i className="fas fa-check-circle" style={{ color: '#3b82f6', marginTop: '0.25rem' }}></i>
                    <span>No need to wait on long holds like with the airline.</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="inquiry-right-panel">
              <div className="flight-route-card" style={{ margin: 0 }}>
                <h2>Check Availability: {capitalizeWords(topThreeKeywords[1])}</h2>
                <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1.5rem', marginTop: '-0.5rem', lineHeight: '1.5' }}>
                  Looking for {activeKeywords[6]}? Submit your details to check real-time availability instantly.
                </p>
                <form className="flight-route-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="fullName">Full Name</label>
                <input
                  type="text"
                  id="fullName"
                  name="fullName"
                  required
                  value={formData.fullName}
                  onChange={handleChange}
                  placeholder="John Doe"
                />
              </div>

              <div className="form-group">
                <label htmlFor="email">Email Address</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="john@example.com"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="travelDateTime">Date of Travel</label>
                  <input
                    type="date"
                    id="travelDateTime"
                    name="travelDateTime"
                    required
                    value={formData.travelDateTime}
                    onChange={handleChange}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="paxCount">Passenger Count</label>
                  <select
                    id="paxCount"
                    name="paxCount"
                    value={formData.paxCount}
                    onChange={handleChange}
                  >
                    {[...Array(10)].map((_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {i + 1} Passenger{i !== 0 ? 's' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="tripType">Trip Type</label>
                  <select id="tripType" name="tripType" value={formData.tripType} onChange={handleChange}>
                    <option value="roundtrip">Round Trip</option>
                    <option value="oneway">One Way</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="cabinClass">Cabin Class</label>
                  <select id="cabinClass" name="cabinClass" value={formData.cabinClass} onChange={handleChange}>
                    <option value="economy">Economy</option>
                    <option value="premium">Premium Economy</option>
                    <option value="business">Business</option>
                    <option value="first">First</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="specialRequests">Special Requests</label>
                <textarea
                  id="specialRequests"
                  name="specialRequests"
                  rows={3}
                  value={formData.specialRequests}
                  onChange={handleChange}
                  placeholder="Any specific seating or meal preferences?"
                />
              </div>


              <div className="form-group">
                <label htmlFor="phone">Phone Number</label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  required
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="+1 555 123 4567"
                />
              </div>


              {/* SMS OPT-IN COMPLIANCE DISCLOSURE BLOCK */}
              <div style={{ backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0', marginBottom: '1rem', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <input 
                    type="checkbox" 
                    id="smsOptIn" 
                    name="smsOptIn" 
                    required 
                    style={{ marginTop: '0.25rem', cursor: 'pointer' }}
                  />
                  <label htmlFor="smsOptIn" style={{ fontSize: '0.75rem', color: '#475569', lineHeight: '1.625', cursor: 'pointer' }}>
                    By checking this box and clicking 'Check Availability', I provide my express written consent to receive automated flight updates, travel quotes, and booking notifications via SMS from FareTransit LLC at the number provided.
                    {showFullDisclosure ? (
                      <>
                        {' '}<strong>Consent is not a condition of purchase. Message frequency varies based on booking activity (up to 4 messages per month).</strong> Message and data rates may apply. Text STOP to cancel at any time, or HELP for assistance. View our <a href="/privacy-policy" style={{ color: '#4f46e5', textDecoration: 'underline' }}>Privacy Policy</a> and <a href="/terms" style={{ color: '#4f46e5', textDecoration: 'underline' }}>Terms of Service</a>.
                      </>
                    ) : null}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setShowFullDisclosure(!showFullDisclosure);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#4f46e5',
                        textDecoration: 'underline',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        padding: 0,
                        marginLeft: '0.25rem',
                        display: 'inline'
                      }}
                    >
                      {showFullDisclosure ? 'Read Less' : 'Read More'}
                    </button>
                  </label>
                </div>
              </div>

              <div className="md:col-span-2 mt-2">
                <button type="submit" className="flight-route-submit-btn" disabled={submitStatus === 'submitting'}>
                  {submitStatus === 'submitting' ? 'Checking...' : 'Check Availability'}
                </button>
              </div>

              {submitMessage && (
                <div className="md:col-span-2 mt-2">
                  <p className={`form-message ${submitStatus === 'success' ? 'success' : 'error'}`}>
                    {submitMessage}
                  </p>
                </div>
              )}
            </form>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default FlightRoute;
