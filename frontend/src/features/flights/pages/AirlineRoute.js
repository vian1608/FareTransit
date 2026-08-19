import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useParams, Navigate } from 'react-router-dom';
import airlinesData from '../../../shared/data/airlinesData.json';
import airlineKeywords from '../../../shared/data/airline-keywords.json';
import { inquiryAPI } from '../../../shared/api/api';
import { trackLeadConversion } from '../../../shared/utils/analytics';
import './AirlineRoute.css';

const AirlineRoute = () => {
  const { airlineSlug } = useParams();
  const airline = airlinesData.find((a) => a.slug === airlineSlug);

  const [formData, setFormData] = useState({
    passengerName: '',
    passengerEmail: '',
    passengerPhone: '',
    originCity: '',
    destinationCity: '',
    passengerCount: '1',
  });
  const [submitStatus, setSubmitStatus] = useState('idle');
  const [submitMessage, setSubmitMessage] = useState('');
  const [showFullDisclosure, setShowFullDisclosure] = useState(false);
  
  // Get SEO keywords for the active airline
  const activeKeywords = airline ? (airlineKeywords[airline.slug] || []) : [];
  const topThreeKeywords = activeKeywords.slice(0, 3);
  
  // Helper to capitalize words naturally for SEO headlines
  const capitalizeWords = (str) => {
    if (!str) return '';
    return str.replace(/\b\w/g, (char) => char.toUpperCase());
  };

  // If slug doesn't exist, redirect to home or 404
  if (!airline) {
    return <Navigate to="/" replace />;
  }

  const logoApiUrl = `https://img.logo.dev/${airline.domain}?token=pk_live_Ym9va2luZ2VuZ2luZQ`;
  const canonicalUrl = `https://faretransit.com/airlines/${airline.slug}`;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitStatus('submitting');

    try {
      const payload = {
        name: formData.passengerName,
        email: formData.passengerEmail || 'route-inquiry@faretransit.com',
        phone: formData.passengerPhone,
        origin: formData.originCity,
        destination: formData.destinationCity,
        passengers: formData.passengerCount,
        notes: `Airline: ${airline.name} Booking Request`,
      };

      console.info('[Lead] Submitting');
      const rawResponse = await inquiryAPI.submitConsulting(payload, 'flights');
      const result = rawResponse?.data ?? rawResponse;
      
      if (result?.success || result?.emailed || result?.leadId || result?.messageId) {
        console.info('[Lead] Backend save confirmed', { leadId: result?.leadId || result?.messageId || result?.id });
        setSubmitStatus('success');
        setSubmitMessage(
          result.message || 'Flight query received. Our team will reach out with itinerary quotes shortly.'
        );
        setFormData({ passengerName: '', passengerEmail: '', passengerPhone: '', originCity: '', destinationCity: '', passengerCount: '1' });
        trackLeadConversion({
          leadId: result?.leadId || result?.messageId || result?.id,
          value: 1.0,
          currency: 'USD',
        });
      } else {
        throw new Error(result?.message || 'Inquiry submission failed');
      }
    } catch (error) {
      setSubmitStatus('error');
      setSubmitMessage('Unable to submit your request right now. Please call us directly.');
    }
  };

  return (
    <div className="airline-route-page">
      <Helmet>
        <title>{airline.h1} | FareTransit</title>
        <meta name="description" content={`Secure low fares and book ${airline.name} flights now with zero lag. Get instant route confirmation, real-time ticket availability, and dedicated premium support.`} />
        <meta name="keywords" content={activeKeywords.length > 0 ? activeKeywords.join(', ') : airline.keyword} />
        <meta property="og:title" content={`${airline.h1} | FareTransit`} />
        <meta property="og:description" content={`Secure low fares and book ${airline.name} flights now with zero lag. Get instant route confirmation, real-time ticket availability, and dedicated premium support.`} />
        <meta property="og:url" content={canonicalUrl} />
        <link rel="canonical" href={canonicalUrl} />
      </Helmet>

      <div className="airline-container">
        
        {/* HERO SECTION */}
        <div className="airline-card hero-card">
          <div className="hero-header">
            <div className="hero-logo-box">
              <img 
                src={`/logo/${airline.slug}.png`}
                alt={`${airline.name} Brand Logo`}
                className="hero-logo"
                onError={(e) => {
                  // Fallback to logo.dev API if local logo is missing
                  if (e.currentTarget.src.includes('/logo/')) {
                    e.currentTarget.src = logoApiUrl;
                  } else {
                    // Fallback to placeholder if API also fails
                    e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2394a3b8'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9'/%3E%3C/svg%3E";
                  }
                }}
              />
            </div>
            <div className="hero-titles">
              <h1>{airline.h1}</h1>
              <p>Compare routes, baggage policies, and secure your tickets instantly.</p>
            </div>
          </div>

          {/* HIGH-CONVERSION CLICK TO DIAL CALL ASSET */}
          <div className="hero-call-action">
            <a href={`tel:${airline.phone}`} className="call-btn">
              <svg className="call-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-2.2 2.2c-2.83-1.44-5.15-3.75-6.59-6.59l2.2-2.21c.28-.26.36-.65.25-1A11.36 11.36 0 018.5 4c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1 0 9.39 7.61 17 17 17 .55 0 1-.45 1-1v-3.5c0-.55-.45-1-1-1z"/>
              </svg>
              <span>Call Instant Booking Support: {airline.phone}</span>
            </a>
            <p className="call-disclaimer">Speak with a live booking professional to manage changes, multi-city updates, or seat confirmations instantly.</p>
          </div>
        </div>

        {/* POPULAR ROUTE CARDS GRID */}
        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#0f172a', marginBottom: '1rem', marginTop: '2rem' }}>
          Carrier Routes & {capitalizeWords(topThreeKeywords[0]) || 'Reservation Support'}
        </h2>
        <div className="routes-grid">
          <div className="route-card">
            <span className="route-tag">Popular Direct Route</span>
            <h3>{airline.hub1}</h3>
            <p>Daily departures with dynamic seat inventory matching.</p>
          </div>
          <div className="route-card">
            <span className="route-tag">Top Connecting Route</span>
            <h3>{airline.hub2}</h3>
            <p>High-availability schedule options configured for this carrier.</p>
          </div>
        </div>

        {/* INSTANT BOOKING QUERY LEAD CAPTURE FORM */}
        <div className="airline-card form-card">
          <h2>Submit an Instant {capitalizeWords(topThreeKeywords[1]) || 'Booking Inquiry Request'}</h2>
          <p className="form-subtitle">Can't find your ideal route online? Submit a direct query and our ticketing team will secure your confirmation routing manually.</p>
          
          <form onSubmit={handleSubmit} className="airline-form">
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="passengerName">Full Name</label>
                <input 
                  type="text" 
                  id="passengerName"
                  name="passengerName" 
                  value={formData.passengerName}
                  onChange={handleChange}
                  required 
                  placeholder="John Doe" 
                />
              </div>
              <div className="form-group">
                <label htmlFor="passengerEmail">Email Address</label>
                <input 
                  type="email" 
                  id="passengerEmail"
                  name="passengerEmail" 
                  value={formData.passengerEmail}
                  onChange={handleChange}
                  required 
                  placeholder="johndoe@example.com" 
                />
              </div>
              <div className="form-group">
                <label htmlFor="originCity">Origin City</label>
                <input 
                  type="text" 
                  id="originCity"
                  name="originCity" 
                  value={formData.originCity}
                  onChange={handleChange}
                  required 
                  placeholder="e.g., Los Angeles (LAX)" 
                />
              </div>
              <div className="form-group">
                <label htmlFor="destinationCity">Destination City</label>
                <input 
                  type="text" 
                  id="destinationCity"
                  name="destinationCity" 
                  value={formData.destinationCity}
                  onChange={handleChange}
                  required 
                  placeholder="e.g., London (LHR)" 
                />
              </div>
              <div className="form-group full-width">
                <label htmlFor="passengerCount">Total Passengers</label>
                <select 
                  id="passengerCount"
                  name="passengerCount" 
                  value={formData.passengerCount}
                  onChange={handleChange}
                >
                  <option value="1">1 Passenger</option>
                  <option value="2">2 Passengers</option>
                  <option value="3">3 Passengers</option>
                  <option value="4+">4+ Passengers (Group Class)</option>
                </select>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '1.5rem', width: '100%' }}>
              <label htmlFor="passengerPhone">Phone Number</label>
              <input 
                type="tel" 
                id="passengerPhone"
                name="passengerPhone" 
                value={formData.passengerPhone}
                onChange={handleChange}
                required 
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
                  style={{ marginTop: '0.25rem', cursor: 'pointer', padding: '0.75rem' }}
                />
                <label htmlFor="smsOptIn" style={{ fontSize: '0.75rem', color: '#475569', lineHeight: '1.625', cursor: 'pointer' }}>
                  By checking this box and clicking 'Submit Flight Query', I provide my express written consent to receive automated flight updates, travel quotes, and booking notifications via SMS from FareTransit LLC at the number provided.
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
              <button type="submit" className="submit-btn" disabled={submitStatus === 'submitting'}>
                {submitStatus === 'submitting' ? 'Submitting...' : 'Submit Flight Query'}
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

        {/* PASSENGER CARRIER FAQ POLICY CONTAINER */}
        <div className="faq-container">
          <h2>Passenger Flight Information FAQ</h2>
          <div className="faq-item">
            <h4>What is the standard baggage allowance for this airline?</h4>
            <p>{airline.baggage}</p>
          </div>
          <div className="faq-item">
            <h4>How do I verify, modify, or get {capitalizeWords(topThreeKeywords[2]) || 'Ticket Assistance Online'}?</h4>
            <p>All tickets issued through our platform generate immediate electronic confirmations. Changes can be handled live via our automated support line or by filling out our instant tracking query form above.</p>
          </div>
        </div>

        {/* COMPLIANT LEGAL DISCLAIMER */}
        <footer className="airline-footer-disclaimer">
          <p>
            Disclaimer: All airline names, logos, and registered trademarks displayed on this website remain the property of their respective owners. FareTransit uses these assets solely for referential travel information and route identification purposes.
          </p>
        </footer>
      </div>
    </div>
  );
};

export default AirlineRoute;
