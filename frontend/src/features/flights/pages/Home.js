import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import HeroSlider from '../../../shared/components/HeroSlider';
import AirportAutocomplete from '../components/AirportAutocomplete';
import InquiryLocationSelect from '../components/InquiryLocationSelect';
import CustomSelect from '../../../shared/components/CustomSelect';
import TravelDatePicker from '../components/TravelDatePicker';
import { flightAirportSelectGroups } from '../../../shared/data/flightAirports';
import CustomerReviews from '../../../shared/components/CustomerReviews';
import { inquiryAPI } from '../../../shared/api/api';
import { flightReviews } from '../../../shared/data/customerReviews';
import { flightHeroSlides, heroOfferTag } from '../../../shared/data/heroSlides';
import RouteSlider from '../../../shared/components/RouteSlider';
import SeamlessAdvisorySection from '../../../shared/components/SeamlessAdvisorySection';
import { flightFamousRoutes } from '../../../shared/data/famousRoutes';
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_HREF } from '../../../shared/constants/supportContact';
import EmailInput from '../../../shared/components/EmailInput';
import InternationalPhoneInput from '../../../shared/components/InternationalPhoneInput';
import './Home.css';

const initialFormData = {
  name: '',
  email: '',
  phone: '',
  origin: '',
  destination: '',
  tripType: 'roundtrip',
  travelDate: '',
  returnDate: '',
  passengers: '1',
  cabinClass: 'economy',
  notes: '',
};

const initialSearchData = {
  from: '',
  to: '',
  departure: '',
  returnDate: '',
  adults: 1,
  children: 0,
  infants: 0,
  travelClass: 'economy',
  currency: 'USD',
  tripType: 'roundtrip'
};

function Home() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState(initialFormData);
  const [submitStatus, setSubmitStatus] = useState('idle');
  const [submitMessage, setSubmitMessage] = useState('');

  const [activeTab, setActiveTab] = useState('search'); // 'search' (interactive) or 'inquiry' (original)
  const [searchData, setSearchData] = useState(initialSearchData);
  const [showPassengerPopup, setShowPassengerPopup] = useState(false);

  const passengerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (passengerRef.current && !passengerRef.current.contains(event.target)) {
        setShowPassengerPopup(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handlePassengerKeyDown = (e) => {
    if (e.key === 'Escape') {
      setShowPassengerPopup(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSearchChange = (field, value) => {
    setSearchData((prev) => ({ ...prev, [field]: value }));
  };

  const incrementPassenger = (type) => {
    setSearchData((prev) => {
      const val = prev[type] || 0;
      if (val >= 9) return prev;
      return { ...prev, [type]: val + 1 };
    });
  };

  const decrementPassenger = (type) => {
    setSearchData((prev) => {
      const val = prev[type] || 0;
      const min = type === 'adults' ? 1 : 0;
      if (val <= min) return prev;
      return { ...prev, [type]: val - 1 };
    });
  };

  const handleSearchFlights = (e) => {
    e.preventDefault();
    if (!searchData.from || !searchData.to || !searchData.departure) {
      setSubmitStatus('error');
      setSubmitMessage('Please specify Departure, Arrival, and Date fields.');
      return;
    }

    if (searchData.fromAirport?.code && searchData.toAirport?.code && searchData.fromAirport.code === searchData.toAirport.code) {
      setSubmitStatus('error');
      setSubmitMessage('Origin and destination airports cannot be the same.');
      return;
    }

    if (searchData.tripType === 'roundtrip' && !searchData.returnDate) {
      setSubmitStatus('error');
      setSubmitMessage('Please specify a Return Date for round-trip flights.');
      return;
    }

    if (searchData.tripType === 'roundtrip' && new Date(searchData.returnDate) < new Date(searchData.departure)) {
      setSubmitStatus('error');
      setSubmitMessage('Return date must be on or after the departure date.');
      return;
    }

    setSubmitStatus('idle');
    setSubmitMessage('');

    // Save criteria in sessionStorage
    sessionStorage.setItem('searchParams', JSON.stringify(searchData));
    sessionStorage.setItem('searchType', searchData.tripType);
    
    // Clear any previous select values
    sessionStorage.removeItem('selectedFlight');
    sessionStorage.removeItem('returnFlight');

    navigate('/search');
  };

  const handleSearchSchedules = (e) => {
    e.preventDefault();
    if (!formData.origin || !formData.destination || !formData.travelDate) {
      setSubmitStatus('error');
      setSubmitMessage('Please fill in Origin, Destination, and Departure Date to search flight schedules.');
      return;
    }

    if (formData.origin && formData.destination && formData.origin === formData.destination) {
      setSubmitStatus('error');
      setSubmitMessage('Origin and destination airports cannot be the same.');
      return;
    }

    const searchParams = {
      from: formData.origin,
      to: formData.destination,
      departure: formData.travelDate,
      returnDate: formData.tripType === 'roundtrip' ? formData.returnDate : undefined,
      passengers: formData.passengers || '1',
      travelClass: formData.cabinClass?.toUpperCase() || 'ECONOMY',
    };

    sessionStorage.setItem('searchParams', JSON.stringify(searchParams));
    sessionStorage.setItem('searchType', formData.tripType);
    
    navigate('/search', { state: { searchParams, searchType: formData.tripType } });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.origin && formData.destination && formData.origin === formData.destination) {
      setSubmitStatus('error');
      setSubmitMessage('Origin and destination airports cannot be the same.');
      return;
    }

    setSubmitStatus('submitting');
    setSubmitMessage('');

    try {
      const result = await inquiryAPI.submitConsulting({
        serviceType: 'flights',
        ...formData,
      });
      setSubmitStatus('success');
      setSubmitMessage(
        result.message ||
          'Thank you. Your inquiry was submitted and our team will contact you shortly.'
      );
      setFormData(initialFormData);

      // Fire Google Ads conversion event
      if (typeof window !== 'undefined' && window.gtag) {
        window.gtag('event', 'conversion', {
            'send_to': 'AW-18166581434/W9aXCMPzpq8cELqRwNZD',
            'transaction_id': ''
        });
      }
    } catch (error) {
      setSubmitStatus('error');
      if (error.response?.data?.error) {
        setSubmitMessage(error.response.data.error);
      } else if (error.code === 'ERR_NETWORK' || !error.response) {
        const isLocal =
          window.location.hostname === 'localhost' ||
          window.location.hostname === '127.0.0.1';
        setSubmitMessage(
          isLocal
            ? 'Unable to reach the server. Start the backend on port 5001 (cd backend && npm run dev), restart the frontend, then try again.'
            : 'Unable to reach our servers. Hard-refresh the page (Cmd+Shift+R) and try again, or email support@faretransit.com.'
        );
      } else {
        setSubmitMessage(
          'Unable to submit right now. Please call us or email support@faretransit.com.'
        );
      }
    }
  };

  return (
    <div className="flights-page">
      <Helmet>
      </Helmet>
      <HeroSlider
        slides={flightHeroSlides}
        variant="flights"
        serviceNavActive="flights"
        inquiryHref="#inquiry"
        offerTag={heroOfferTag}
      />

<section id="inquiry" className="flights-section">
        <div className="container">
          <div className="inquiry-split-layout">
            <div className="inquiry-main-panel">
              <div className="flights-inquiry-card" style={{ margin: 0 }}>
                
                {/* Search tabs header */}
                <div className="search-tabs-header">
                  <button 
                    type="button" 
                    className={`tab-btn ${activeTab === 'search' ? 'active' : ''}`}
                    onClick={() => setActiveTab('search')}
                  >
                    <i className="fas fa-search"></i> Book Flights
                  </button>
                  <button 
                    type="button" 
                    className={`tab-btn ${activeTab === 'inquiry' ? 'active' : ''}`}
                    onClick={() => setActiveTab('inquiry')}
                  >
                    <i className="fas fa-paper-plane"></i> Custom Inquiry
                  </button>
                </div>

                {activeTab === 'search' ? (
                  <>
                    <h2 style={{ marginBottom: '0.5rem', color: '#1e293b', fontSize: '1.75rem' }}>Search Flights</h2>
                    <p className="flights-inquiry__intro">
                      Discover flight deals with SerpAPI real-time Google Flights search engine.
                    </p>
                    
                    <form className="flights-form" onSubmit={handleSearchFlights}>
                      
                      {/* Meta selections row (Trip type, Cabin class, Passenger popup, Currency) */}
                      <div className="search-meta-row">
                        <div className="search-meta-left">
                          <CustomSelect 
                            id="search-trip-type"
                            value={searchData.tripType} 
                            onChange={(val) => handleSearchChange('tripType', val)}
                            options={[
                              { value: 'roundtrip', label: 'Round Trip' },
                              { value: 'oneway', label: 'One Way' }
                            ]}
                            icon="fas fa-route"
                          />
                          
                          <CustomSelect 
                            id="search-travel-class"
                            value={searchData.travelClass} 
                            onChange={(val) => handleSearchChange('travelClass', val)}
                            options={[
                              { value: 'economy', label: 'Economy' },
                              { value: 'premium', label: 'Premium Economy' },
                              { value: 'business', label: 'Business' },
                              { value: 'first', label: 'First Class' }
                            ]}
                            icon="fas fa-chair"
                          />

                          <div className="search-meta-group" style={{ position: 'relative' }} ref={passengerRef} onKeyDown={handlePassengerKeyDown}>
                            <button 
                              type="button" 
                              className={`passenger-trigger-btn ${showPassengerPopup ? 'active' : ''}`}
                              onClick={() => setShowPassengerPopup(!showPassengerPopup)}
                              aria-haspopup="dialog"
                              aria-expanded={showPassengerPopup}
                            >
                              <i className="fas fa-user-friends" style={{ color: '#64748b' }}></i>
                              <span>{searchData.adults + searchData.children + searchData.infants} Traveler(s)</span>
                              <i className={`fas fa-chevron-${showPassengerPopup ? 'up' : 'down'}`} style={{ fontSize: '0.7rem' }}></i>
                            </button>

                            {showPassengerPopup && (
                              <div className="passenger-popover" role="dialog" aria-label="Traveler selector">
                                <div className="passenger-row">
                                  <div className="passenger-label">
                                    <span className="passenger-type">Adults</span>
                                    <span className="passenger-age-desc">Age 18+</span>
                                  </div>
                                  <div className="passenger-counters">
                                    <button type="button" className="counter-btn" onClick={() => decrementPassenger('adults')} disabled={searchData.adults <= 1}>-</button>
                                    <span className="counter-value">{searchData.adults}</span>
                                    <button type="button" className="counter-btn" onClick={() => incrementPassenger('adults')}>+</button>
                                  </div>
                                </div>
                                <div className="passenger-row">
                                  <div className="passenger-label">
                                    <span className="passenger-type">Children</span>
                                    <span className="passenger-age-desc">Age 2-17</span>
                                  </div>
                                  <div className="passenger-counters">
                                    <button type="button" className="counter-btn" onClick={() => decrementPassenger('children')} disabled={searchData.children <= 0}>-</button>
                                    <span className="counter-value">{searchData.children}</span>
                                    <button type="button" className="counter-btn" onClick={() => incrementPassenger('children')}>+</button>
                                  </div>
                                </div>
                                <div className="passenger-row">
                                  <div className="passenger-label">
                                    <span className="passenger-type">Infants</span>
                                    <span className="passenger-age-desc">Under 2 (lap)</span>
                                  </div>
                                  <div className="passenger-counters">
                                    <button type="button" className="counter-btn" onClick={() => decrementPassenger('infants')} disabled={searchData.infants <= 0}>-</button>
                                    <span className="counter-value">{searchData.infants}</span>
                                    <button type="button" className="counter-btn" onClick={() => incrementPassenger('infants')}>+</button>
                                  </div>
                                </div>
                                <button type="button" className="passenger-popup-close" onClick={() => setShowPassengerPopup(false)}>Done</button>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="search-meta-right">
                          <CustomSelect 
                            id="search-currency"
                            value={searchData.currency} 
                            onChange={(val) => handleSearchChange('currency', val)}
                            options={[
                              { value: 'USD', label: 'USD ($)' },
                              { value: 'EUR', label: 'EUR (€)' },
                              { value: 'GBP', label: 'GBP (£)' },
                              { value: 'CAD', label: 'CAD (C$)' }
                            ]}
                            icon="fas fa-dollar-sign"
                          />
                        </div>
                      </div>

                      {/* Airport Autocomplete Row */}
                      <div className="flights-form__row" style={{ gap: '1.25rem' }}>
                        <div className="flights-form__group" style={{ margin: 0 }}>
                          <AirportAutocomplete 
                            label="Origin Airport"
                            id="search-origin"
                            value={searchData.from}
                            excludeCode={searchData.toAirport?.code}
                            onChange={(val, item) => {
                              handleSearchChange('from', val);
                              handleSearchChange('fromAirport', item);
                            }}
                            placeholder="e.g. New York (JFK)"
                            required
                          />
                        </div>
                        <div className="flights-form__group" style={{ margin: 0 }}>
                          <AirportAutocomplete 
                            label="Destination Airport"
                            id="search-destination"
                            value={searchData.to}
                            excludeCode={searchData.fromAirport?.code}
                            onChange={(val, item) => {
                              handleSearchChange('to', val);
                              handleSearchChange('toAirport', item);
                            }}
                            placeholder="e.g. Los Angeles (LAX)"
                            required
                          />
                        </div>
                      </div>

                      {/* Dates Row */}
                      <div className="flights-form__row" style={{ gap: '1.25rem', marginTop: '1.25rem' }}>
                        <div className="flights-form__group" style={{ margin: 0 }}>
                          <TravelDatePicker
                            id="search-departure-date"
                            label="Departure Date"
                            value={searchData.departure}
                            onChange={(val) => handleSearchChange('departure', val)}
                            minDate={new Date().toISOString().split('T')[0]}
                            required
                          />
                        </div>
                        <div className="flights-form__group" style={{ margin: 0, opacity: searchData.tripType === 'oneway' ? 0.5 : 1 }}>
                          <TravelDatePicker
                            id="search-return-date"
                            label="Return Date"
                            value={searchData.returnDate}
                            onChange={(val) => handleSearchChange('returnDate', val)}
                            minDate={searchData.departure || new Date().toISOString().split('T')[0]}
                            disabled={searchData.tripType === 'oneway'}
                            required={searchData.tripType === 'roundtrip'}
                          />
                        </div>
                      </div>

                      {/* Submit action */}
                      <div style={{ marginTop: '1.5rem' }}>
                        <button 
                          type="submit" 
                          className="flights-btn flights-btn--cta" 
                          style={{ width: '100%', fontSize: '1.1rem', padding: '1rem' }}
                        >
                          <i className="fas fa-search"></i> Search Flights
                        </button>
                      </div>

                      {submitMessage && submitStatus === 'error' && (
                        <p className="inquiry-form__message inquiry-form__message--error" role="alert" style={{ marginTop: '1rem' }}>
                          {submitMessage}
                        </p>
                      )}

                    </form>
                  </>
                ) : (
                  <>
                    <h2 style={{ marginBottom: '0.5rem', color: '#1e293b', fontSize: '1.75rem' }}>Consulting Inquiry</h2>
                    <p className="flights-inquiry__intro">
                      Submit your air logistics details. A consultant will respond with advisory options and a quote outline.
                    </p>
                    <form className="flights-form" onSubmit={handleSubmit}>
                      <div className="flights-form__row">
                        <div className="flights-form__group">
                          <label htmlFor="flight-name">Full name</label>
                          <input
                            id="flight-name"
                            type="text"
                            value={formData.name}
                            onChange={(e) => handleChange('name', e.target.value)}
                            required
                            autoComplete="name"
                          />
                        </div>
                        <div className="flights-form__group">
                          <EmailInput
                            id="flight-email"
                            label="Email"
                            value={formData.email}
                            onChange={(val) => handleChange('email', val)}
                            required
                          />
                        </div>
                      </div>
                      <div className="flights-form__row">
                        <div className="flights-form__group">
                          <label htmlFor="flight-phone">Phone (optional)</label>
                          <InternationalPhoneInput
                            id="flight-phone"
                            value={formData.phone}
                            onChange={(val) => handleChange('phone', val)}
                          />
                        </div>
                        <div className="flights-form__group">
                          <label htmlFor="flight-passengers">Passengers</label>
                          <CustomSelect
                            id="flight-passengers"
                            value={formData.passengers}
                            onChange={(val) => handleChange('passengers', val)}
                            options={[
                              { value: '1', label: '1' },
                              { value: '2', label: '2' },
                              { value: '3', label: '3' },
                              { value: '4', label: '4' },
                              { value: '5+', label: '5+' }
                            ]}
                          />
                        </div>
                      </div>
                      <div className="flights-form__row">
                        <div className="flights-form__group">
                          <InquiryLocationSelect
                            id="flight-origin"
                            label="Origin airport"
                            value={formData.origin}
                            onChange={(value) => handleChange('origin', value)}
                            groups={flightAirportSelectGroups}
                            placeholder="Select origin airport"
                            required
                          />
                        </div>
                        <div className="flights-form__group">
                          <InquiryLocationSelect
                            id="flight-destination"
                            label="Destination airport"
                            value={formData.destination}
                            onChange={(value) => handleChange('destination', value)}
                            groups={flightAirportSelectGroups}
                            placeholder="Select destination airport"
                            required
                          />
                        </div>
                      </div>
                      <div className="flights-form__row">
                        <div className="flights-form__group">
                          <label htmlFor="flight-trip-type">Trip type</label>
                          <CustomSelect
                            id="flight-trip-type"
                            value={formData.tripType}
                            onChange={(val) => handleChange('tripType', val)}
                            options={[
                              { value: 'roundtrip', label: 'Round Trip' },
                              { value: 'oneway', label: 'One Way' }
                            ]}
                          />
                        </div>
                        <div className="flights-form__group">
                          <label htmlFor="flight-travel-class">Cabin class</label>
                          <CustomSelect
                            id="flight-travel-class"
                            value={formData.travelClass}
                            onChange={(val) => handleChange('travelClass', val)}
                            options={[
                              { value: 'economy', label: 'Economy' },
                              { value: 'premium', label: 'Premium Economy' },
                              { value: 'business', label: 'Business' },
                              { value: 'first', label: 'First Class' }
                            ]}
                          />
                        </div>
                      </div>
                      <div className="flights-form__row">
                        <div className="flights-form__group">
                          <TravelDatePicker
                            id="flight-travel-date"
                            label="Departure date"
                            value={formData.travelDate}
                            onChange={(val) => handleChange('travelDate', val)}
                            minDate={new Date().toISOString().split('T')[0]}
                            required
                          />
                        </div>
                        {formData.tripType === 'roundtrip' && (
                          <div className="flights-form__group">
                            <TravelDatePicker
                              id="flight-return-date"
                              label="Return date"
                              value={formData.returnDate}
                              onChange={(val) => handleChange('returnDate', val)}
                              minDate={formData.travelDate || new Date().toISOString().split('T')[0]}
                            />
                          </div>
                        )}
                      </div>
                      <div className="flights-form__group">
                        <label htmlFor="flight-notes">Advisory notes (urgency, visa, accessibility, etc.)</label>
                        <textarea
                          id="flight-notes"
                          rows={4}
                          value={formData.notes}
                          onChange={(e) => handleChange('notes', e.target.value)}
                          placeholder="Describe your logistics needs and timeline."
                        />
                      </div>

                      {/* SMS OPT-IN COMPLIANCE DISCLOSURE BLOCK */}
                      <div style={{ backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0', marginBottom: '1rem', width: '100%' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                          <input 
                            type="checkbox" 
                            id="smsOptIn" 
                            name="smsOptIn" 
                            checked={formData.smsOptIn}
                            onChange={(e) => handleChange('smsOptIn', e.target.checked)}
                            required 
                            style={{ width: '16px', height: '16px', marginTop: '3px', cursor: 'pointer', accentColor: '#8b1538' }}
                          />
                          <label htmlFor="smsOptIn" style={{ fontSize: '0.78rem', color: '#475569', lineHeight: '1.4', cursor: 'pointer', fontWeight: '500', userSelect: 'none' }}>
                            I agree to receive SMS support updates from FareTransit LLC at the phone number provided. Message & data rates may apply. Reply STOP to opt out at any time. View our <Link to="/privacy" target="_blank" style={{ color: '#8b1538', textDecoration: 'none', fontWeight: 'bold' }}>Privacy Policy</Link> and <Link to="/terms" target="_blank" style={{ color: '#8b1538', textDecoration: 'none', fontWeight: 'bold' }}>Terms of Service</Link>.
                          </label>
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button
                          type="submit"
                          className="flights-btn flights-btn--cta"
                          style={{ flex: 1 }}
                          disabled={submitStatus === 'submitting'}
                        >
                          {submitStatus === 'submitting' ? 'Submitting…' : 'Request Callback'}
                        </button>
                        <button
                          type="button"
                          onClick={handleSearchSchedules}
                          className="flights-btn"
                          style={{ flex: 1, backgroundColor: '#0f172a', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                          Search Flights
                        </button>
                      </div>
                      {submitMessage && (
                        <p
                          className={`inquiry-form__message ${
                            submitStatus === 'success'
                              ? 'inquiry-form__message--success'
                              : 'inquiry-form__message--error'
                          }`}
                          role="alert"
                          style={{ marginTop: '1rem' }}
                        >
                          {submitMessage}
                        </p>
                      )}
                    </form>
                  </>
                )}
              </div>
            </div>

            <div className="inquiry-side-panel">
              <div className="flights-inquiry-card support-inquiry-card" style={{ height: 'auto', margin: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <h2 style={{ fontSize: '1.6rem', color: '#1e293b', marginBottom: '0.75rem', fontWeight: 800 }}>Need Immediate Support?</h2>
                  <p style={{ color: '#475569', fontSize: '0.98rem', lineHeight: '1.6', marginBottom: '1.5rem' }}>
                    Skip the form and call our expert travel desk directly to secure your air logistics and private routes immediately.
                  </p>
                  
                  <div className="benefits-list" style={{ marginTop: '1.5rem' }}>
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: '#1e293b', fontWeight: 700 }}>Benefits of booking with us:</h3>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                      <li style={{ display: 'flex', gap: '0.75rem', alignItems: 'start', fontSize: '0.92rem', color: '#475569' }}>
                        <i className="fas fa-check-circle" style={{ color: '#8b1538', marginTop: '0.2rem' }}></i>
                        <span>Includes free 24/7 priority support till date of travel.</span>
                      </li>
                      <li style={{ display: 'flex', gap: '0.75rem', alignItems: 'start', fontSize: '0.92rem', color: '#475569' }}>
                        <i className="fas fa-check-circle" style={{ color: '#8b1538', marginTop: '0.2rem' }}></i>
                        <span>No need to wait on long holds like with traditional airlines.</span>
                      </li>
                      <li style={{ display: 'flex', gap: '0.75rem', alignItems: 'start', fontSize: '0.92rem', color: '#475569' }}>
                        <i className="fas fa-check-circle" style={{ color: '#8b1538', marginTop: '0.2rem' }}></i>
                        <span>Instant ticketing and custom route optimization.</span>
                      </li>
                    </ul>
                  </div>
                </div>
                
                <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'center' }}>
                  <a href={SUPPORT_PHONE_HREF} className="call-btn flights-btn flights-btn--cta" style={{ width: 'auto', minWidth: '180px', margin: 0, minHeight: '44px', height: '44px', padding: '0 1.5rem', fontSize: '0.95rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="fas fa-phone"></i> Call {SUPPORT_PHONE_DISPLAY}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="flights-section">
        <div className="container route-slider-section">
          <RouteSlider routes={flightFamousRoutes} btnClassPrefix="flights" />
        </div>
      </section>

      <SeamlessAdvisorySection variant="flight" />



            <CustomerReviews reviews={flightReviews} variant="flights" />
    </div>
  );
}

export default Home;
