import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import HeroSlider from '../../../shared/components/HeroSlider';
import AirportAutocomplete from '../components/AirportAutocomplete';
import InquiryLocationSelect from '../components/InquiryLocationSelect';
import CustomSelect from '../../../shared/components/CustomSelect';
import TravelDatePicker from '../components/TravelDatePicker';
import { flightAirportSelectGroups } from '../../../shared/data/flightAirports';
import { inquiryAPI } from '../../../shared/api/api';
import { flightHeroSlides, heroOfferTag } from '../../../shared/data/heroSlides';
import RouteSlider from '../../../shared/components/RouteSlider';
import SeamlessAdvisorySection from '../../../shared/components/SeamlessAdvisorySection';
import HowFareTransitHelps from '../../../shared/components/HowFareTransitHelps';
import { flightFamousRoutes } from '../../../shared/data/famousRoutes';
import { SUPPORT_PHONE_HREF } from '../../../shared/constants/supportContact';
import EmailInput from '../../../shared/components/EmailInput';
import InternationalPhoneInput from '../../../shared/components/InternationalPhoneInput';
import { trackLeadConversion } from '../../../shared/utils/analytics';
import { normalizeError } from '../../../shared/utils/normalizeError';
import CarSearchForm from '../../cars/components/CarSearchForm';
import './Home.css';

const MAX_TRAVELERS = 9;

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
  smsOptIn: false,
};

const initialSearchData = {
  from: '',
  to: '',
  departure: '',
  returnDate: '',
  adults: 1,
  children: 0,
  infantsInSeat: 0,
  infantsOnLap: 0,
  travelClass: 'economy',
  currency: 'USD',
  tripType: 'roundtrip'
};

const extractAirportCode = (input) => {
  if (!input) return '';
  if (typeof input === 'object') return (input.code || input.id || '').toUpperCase();
  const str = String(input).trim();
  const match = str.match(/\(([A-Z]{3,4})\)/i);
  if (match) return match[1].toUpperCase();
  if (/^[A-Z]{3}$/i.test(str)) return str.toUpperCase();
  return str.toUpperCase().substring(0, 3);
};

function Home() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState(initialFormData);
  const [submitStatus, setSubmitStatus] = useState('idle');
  const [submitMessage, setSubmitMessage] = useState('');

  const [activeTab, setActiveTab] = useState('search'); // 'search' (interactive) or 'inquiry' (original)
  const [searchData, setSearchData] = useState(initialSearchData);
  const [showPassengerPopup, setShowPassengerPopup] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [showAllBenefits, setShowAllBenefits] = useState(false);

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


  const handleSwapSearchAirports = () => {
    setSearchData((prev) => ({
      ...prev,
      from: prev.to || '',
      to: prev.from || '',
      fromAirport: prev.toAirport || null,
      toAirport: prev.fromAirport || null,
    }));
    setSubmitStatus('idle');
    setSubmitMessage('');
  };

  const handleSwapInquiryAirports = () => {
    setFormData((prev) => ({
      ...prev,
      origin: prev.destination || '',
      destination: prev.origin || '',
    }));
    setFieldErrors((prev) => ({ ...prev, origin: undefined, destination: undefined }));
  };

  const incrementPassenger = (type) => {
    setSearchData((prev) => {
      const total = prev.adults + prev.children + prev.infantsInSeat + prev.infantsOnLap;
      if (total >= MAX_TRAVELERS) return prev;
      if (type === 'infantsOnLap' && prev.infantsOnLap >= prev.adults) return prev;
      return { ...prev, [type]: (prev[type] || 0) + 1 };
    });
  };

  const decrementPassenger = (type) => {
    setSearchData((prev) => {
      const val = prev[type] || 0;
      const min = type === 'adults' ? 1 : 0;
      if (val <= min) return prev;
      const next = { ...prev, [type]: val - 1 };
      if (type === 'adults' && next.infantsOnLap > next.adults) {
        next.infantsOnLap = next.adults;
      }
      return next;
    });
  };

  const handleSearchFlights = (e) => {
    e.preventDefault();
    if (isSearching) return;

    const fromCode = searchData.fromAirport?.code || extractAirportCode(searchData.from);
    const toCode = searchData.toAirport?.code || extractAirportCode(searchData.to);

    if (!searchData.from || !searchData.to || !searchData.departure) {
      setSubmitStatus('error');
      setSubmitMessage('Please specify Origin Airport, Destination Airport, and Departure Date.');
      return;
    }

    if (!fromCode || fromCode.length !== 3 || !toCode || toCode.length !== 3) {
      setSubmitStatus('error');
      setSubmitMessage('Please select or enter valid 3-letter IATA airport codes for origin and destination.');
      return;
    }

    if (fromCode === toCode) {
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

    if (searchData.infantsOnLap > searchData.adults) {
      setSubmitStatus('error');
      setSubmitMessage('Infants on lap cannot exceed the number of adult travelers.');
      return;
    }

    setSubmitStatus('idle');
    setSubmitMessage('');
    setIsSearching(true);

    const fromDisplayStr = typeof searchData.from === 'string' ? searchData.from : (searchData.fromAirport?.name ? `${searchData.fromAirport.city || searchData.fromAirport.name} (${fromCode})` : fromCode);
    const toDisplayStr = typeof searchData.to === 'string' ? searchData.to : (searchData.toAirport?.name ? `${searchData.toAirport.city || searchData.toAirport.name} (${toCode})` : toCode);
    const totalInfants = searchData.infantsInSeat + searchData.infantsOnLap;

    const payload = {
      ...searchData,
      // Keep a total infant count for the booking form, while retaining the split
      // needed by Google Flights for correct fare availability.
      infants: totalInfants,
      from: fromDisplayStr,
      to: toDisplayStr,
      fromCode,
      toCode,
      fromAirport: searchData.fromAirport || { code: fromCode, name: fromDisplayStr },
      toAirport: searchData.toAirport || { code: toCode, name: toDisplayStr }
    };

    // Save criteria in sessionStorage for fallback
    sessionStorage.setItem('searchParams', JSON.stringify(payload));
    sessionStorage.setItem('searchType', searchData.tripType);
    
    // Clear any previous select values
    sessionStorage.removeItem('selectedFlight');
    sessionStorage.removeItem('returnFlight');

    // Build URL query parameters so results page works on refresh
    const params = new URLSearchParams({
      from: fromCode,
      to: toCode,
      fromDisplay: fromDisplayStr,
      toDisplay: toDisplayStr,
      departure: searchData.departure,
      adults: String(searchData.adults || 1),
      children: String(searchData.children || 0),
      infants: String(totalInfants),
      infantsInSeat: String(searchData.infantsInSeat || 0),
      infantsOnLap: String(searchData.infantsOnLap || 0),
      travelClass: searchData.travelClass || 'economy',
      currency: searchData.currency || 'USD',
      tripType: searchData.tripType || 'roundtrip'
    });

    if (searchData.tripType === 'roundtrip' && searchData.returnDate) {
      params.append('returnDate', searchData.returnDate);
    }

    navigate(`/search?${params.toString()}`);
  };

  const [fieldErrors, setFieldErrors] = useState({});

  const validateInquiry = () => {
    const errors = {};
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!formData.name?.trim()) {
      errors.name = 'Full name is required.';
    }
    if (!formData.email?.trim()) {
      errors.email = 'Email is required.';
    } else if (!emailPattern.test(formData.email.trim())) {
      errors.email = 'Please provide a valid email address.';
    }
    if (!formData.origin?.trim()) {
      errors.origin = 'Origin airport is required.';
    }
    if (!formData.destination?.trim()) {
      errors.destination = 'Destination airport is required.';
    }
    if (formData.origin && formData.destination && formData.origin.trim() === formData.destination.trim()) {
      errors.destination = 'Origin and destination airports cannot be the same.';
    }
    if (!formData.travelDate) {
      errors.travelDate = 'Departure date is required.';
    }
    if (formData.tripType === 'roundtrip') {
      if (!formData.returnDate) {
        errors.returnDate = 'Return date is required for round-trip flights.';
      } else if (formData.travelDate && new Date(formData.returnDate) < new Date(formData.travelDate)) {
        errors.returnDate = 'Return date must be on or after the departure date.';
      }
    }
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitStatus === 'submitting') return;

    const errors = validateInquiry();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setSubmitStatus('error');
      setSubmitMessage('Please correct the highlighted fields below.');
      const firstKey = Object.keys(errors)[0];
      const targetElement = document.getElementById(`flight-${firstKey}`) || document.getElementById(firstKey);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetElement.focus?.();
      }
      return;
    }

    setFieldErrors({});
    setSubmitStatus('submitting');
    setSubmitMessage('');

    const clientRequestId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    try {
      const rawResponse = await inquiryAPI.submitConsulting({
        serviceType: 'flights',
        clientRequestId,
        ...formData,
      });
      const result = rawResponse?.data ?? rawResponse;

      if (result?.success === true && result?.persisted === true && result?.leadId) {
        console.info('[Lead] Backend save confirmed', { leadId: result.leadId });
        setSubmitStatus('success');
        setSubmitMessage(
          `✓ Request submitted successfully. Reference: ${result.leadId}. Our travel team will contact you shortly.`
        );
        setFormData(initialFormData);

        // Fire Google Ads Lead Conversion tracking event
        trackLeadConversion({
          leadId: result.leadId,
          value: 1.0,
          currency: 'USD',
        });
      } else {
        throw new Error(result?.message || 'Inquiry submission failed');
      }
    } catch (error) {
      setSubmitStatus('error');
      setSubmitMessage(normalizeError(error, 'Unable to submit your request right now. Please try again.'));
    }
  };

  return (
    <div className="flights-page">
      <Helmet>
        <title>FareTransit | Flight Search With Human Support</title>
        <meta
          name="description"
          content="Compare flight options and complete your reservation with clear information and real human support from FareTransit."
        />
        <meta
          name="keywords"
          content="flight search, flight booking, travel assistance, airline reservations, flight comparison"
        />
        <meta property="og:title" content="FareTransit | Flight Search With Human Support" />
        <meta
          property="og:description"
          content="Compare flight options and complete your reservation with clear information and real human support from FareTransit."
        />
        <meta property="og:url" content="https://www.faretransit.com/" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="FareTransit | Flight Search With Human Support" />
        <meta
          name="twitter:description"
          content="Compare flight options and complete your reservation with clear information and real human support from FareTransit."
        />
        <link rel="canonical" href="https://www.faretransit.com/" />
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
                    <i className="fas fa-plane"></i> Book Flights
                  </button>
                  <button 
                    type="button" 
                    className={`tab-btn ${activeTab === 'cars' ? 'active' : ''}`}
                    onClick={() => setActiveTab('cars')}
                  >
                    <i className="fas fa-car"></i> Car Rentals
                  </button>
                  <button 
                    type="button" 
                    className={`tab-btn ${activeTab === 'inquiry' ? 'active' : ''}`}
                    onClick={() => setActiveTab('inquiry')}
                  >
                    <i className="fas fa-paper-plane"></i> Custom Inquiry
                  </button>
                </div>

                {activeTab === 'cars' && (
                  <div className="home-car-search-wrapper" style={{ marginTop: '1rem' }}>
                    <h2 style={{ marginBottom: '0.5rem', color: '#1e293b', fontSize: '1.75rem' }}>Search Rental Cars</h2>
                    <p className="flights-inquiry__intro" style={{ marginBottom: '1.25rem' }}>
                      Compare car rental options, airport locations, and transparent policies from top global suppliers.
                    </p>
                    <CarSearchForm compact />
                  </div>
                )}

                {activeTab === 'search' ? (
                  <>
                    <h2 style={{ marginBottom: '0.5rem', color: '#1e293b', fontSize: '1.75rem' }}>Search Flights</h2>
                    <p className="flights-inquiry__intro">
                      Compare flight options with real-time routes, fares, and personal booking assistance.
                    </p>
                    <p className="search-urgent-hint" style={{ fontSize: '0.88rem', color: '#8b1538', background: '#faf5f7', padding: '0.45rem 0.8rem', borderRadius: '6px', border: '1px solid #f0d5de', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', marginTop: '0.35rem' }}>
                      <i className="fas fa-clock" style={{ color: '#8b1538' }}></i>
                      <span><strong>Traveling soon?</strong> Our specialists can help review urgent flight options.</span>
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
                              <span>{searchData.adults + searchData.children + searchData.infantsInSeat + searchData.infantsOnLap} Traveler(s)</span>
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
                                    <button type="button" className="counter-btn" onClick={() => incrementPassenger('adults')} disabled={searchData.adults + searchData.children + searchData.infantsInSeat + searchData.infantsOnLap >= MAX_TRAVELERS}>+</button>
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
                                    <button type="button" className="counter-btn" onClick={() => incrementPassenger('children')} disabled={searchData.adults + searchData.children + searchData.infantsInSeat + searchData.infantsOnLap >= MAX_TRAVELERS}>+</button>
                                  </div>
                                </div>
                                <div className="passenger-row">
                                  <div className="passenger-label">
                                    <span className="passenger-type">Infants in seat</span>
                                    <span className="passenger-age-desc">Under 2</span>
                                  </div>
                                  <div className="passenger-counters">
                                    <button type="button" className="counter-btn" onClick={() => decrementPassenger('infantsInSeat')} disabled={searchData.infantsInSeat <= 0}>-</button>
                                    <span className="counter-value">{searchData.infantsInSeat}</span>
                                    <button type="button" className="counter-btn" onClick={() => incrementPassenger('infantsInSeat')} disabled={searchData.adults + searchData.children + searchData.infantsInSeat + searchData.infantsOnLap >= MAX_TRAVELERS}>+</button>
                                  </div>
                                </div>
                                <div className="passenger-row">
                                  <div className="passenger-label">
                                    <span className="passenger-type">Infants on lap</span>
                                    <span className="passenger-age-desc">Under 2</span>
                                  </div>
                                  <div className="passenger-counters">
                                    <button type="button" className="counter-btn" onClick={() => decrementPassenger('infantsOnLap')} disabled={searchData.infantsOnLap <= 0}>-</button>
                                    <span className="counter-value">{searchData.infantsOnLap}</span>
                                    <button type="button" className="counter-btn" onClick={() => incrementPassenger('infantsOnLap')} disabled={searchData.infantsOnLap >= searchData.adults || searchData.adults + searchData.children + searchData.infantsInSeat + searchData.infantsOnLap >= MAX_TRAVELERS}>+</button>
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
                      <div className="airport-swap-row">
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
                        <button
                          type="button"
                          className="airport-swap-button"
                          onClick={handleSwapSearchAirports}
                          disabled={!searchData.from && !searchData.to}
                          aria-label="Swap origin and destination airports"
                          title="Swap origin and destination"
                        >
                          <i className="fas fa-exchange-alt" aria-hidden="true"></i>
                        </button>
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

                      {/* Booking For Someone Else Option */}
                      <div className="search-booking-for-someone-else" style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px dashed #cbd5e1' }}>
                        <label htmlFor="booking-for-someone-else" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', color: '#334155', fontWeight: '500' }}>
                          <input
                            type="checkbox"
                            id="booking-for-someone-else"
                            checked={!!searchData.isBookingForSomeoneElse}
                            onChange={(e) => handleSearchChange('isBookingForSomeoneElse', e.target.checked)}
                            style={{ width: '17px', height: '17px', accentColor: '#8b1538', cursor: 'pointer' }}
                          />
                          <span>I am booking for a parent, relative or another traveler</span>
                        </label>
                      </div>

                      {/* Submit action */}
                      <div style={{ marginTop: '1.25rem' }}>
                        <button 
                          type="submit" 
                          className="flights-btn flights-btn--cta" 
                          disabled={isSearching}
                          style={{ width: '100%', fontSize: '1.1rem', padding: '1rem', opacity: isSearching ? 0.7 : 1, cursor: isSearching ? 'not-allowed' : 'pointer' }}
                        >
                          {isSearching ? (
                            <><i className="fas fa-circle-notch fa-spin"></i> Searching Flights...</>
                          ) : (
                            <><i className="fas fa-search"></i> Search Flights</>
                          )}
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
                      <div className="airport-swap-row airport-swap-row--inquiry">
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
                        <button
                          type="button"
                          className="airport-swap-button"
                          onClick={handleSwapInquiryAirports}
                          disabled={!formData.origin && !formData.destination}
                          aria-label="Swap origin and destination airports"
                          title="Swap origin and destination"
                        >
                          <i className="fas fa-exchange-alt" aria-hidden="true"></i>
                        </button>
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
                          <label htmlFor="flight-cabin-class">Cabin class</label>
                          <CustomSelect
                            id="flight-cabin-class"
                            value={formData.cabinClass}
                            onChange={(val) => handleChange('cabinClass', val)}
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
                          {fieldErrors.travelDate && <span className="field-error-text" style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '0.25rem', display: 'block' }}>{fieldErrors.travelDate}</span>}
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
                            {fieldErrors.returnDate && <span className="field-error-text" style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '0.25rem', display: 'block' }}>{fieldErrors.returnDate}</span>}
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
                            style={{ width: '16px', height: '16px', marginTop: '3px', cursor: 'pointer', accentColor: '#8b1538' }}
                          />
                          <label htmlFor="smsOptIn" style={{ fontSize: '0.78rem', color: '#475569', lineHeight: '1.4', cursor: 'pointer', fontWeight: '500', userSelect: 'none' }}>
                            I agree to receive SMS support updates from FareTransit LLC at the phone number provided. Message & data rates may apply. Reply STOP to opt out at any time. View our <Link to="/privacy" target="_blank" style={{ color: '#8b1538', textDecoration: 'none', fontWeight: 'bold' }}>Privacy Policy</Link> and <Link to="/terms" target="_blank" style={{ color: '#8b1538', textDecoration: 'none', fontWeight: 'bold' }}>Terms of Service</Link>.
                          </label>
                        </div>
                      </div>
                      
                      <div style={{ width: '100%' }}>
                        <button
                          type="submit"
                          className="flights-btn flights-btn--cta inquiry-submit-button"
                          style={{ width: '100%', fontSize: '1.1rem', padding: '1rem', display: 'block' }}
                          disabled={submitStatus === 'submitting'}
                        >
                          {submitStatus === 'submitting' ? (
                            <><i className="fas fa-circle-notch fa-spin"></i> Submitting Request…</>
                          ) : (
                            'Submit Request'
                          )}
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

            <div className="inquiry-side-panel" id="support-section">
              <div className="flights-inquiry-card support-inquiry-card" style={{ height: 'auto', margin: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <h2 style={{ fontSize: '1.5rem', color: '#1e293b', marginBottom: '0.5rem', fontWeight: 800 }}>Need Help Choosing a Flight?</h2>
                  <p style={{ color: '#475569', fontSize: '0.94rem', lineHeight: '1.5', marginBottom: '1rem' }}>
                    Get help reviewing connections, baggage rules and total travel time.
                  </p>
                  
                  <div className="benefits-list" style={{ marginTop: '1rem' }}>
                    <h3 style={{ fontSize: '1rem', marginBottom: '0.65rem', color: '#1e293b', fontWeight: 700 }}>Benefits of booking with us:</h3>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      <li style={{ display: 'flex', gap: '0.65rem', alignItems: 'start', fontSize: '0.88rem', color: '#475569' }}>
                        <i className="fas fa-check-circle" style={{ color: '#8b1538', marginTop: '0.2rem' }}></i>
                        <span>Compare practical flight options</span>
                      </li>
                      <li style={{ display: 'flex', gap: '0.65rem', alignItems: 'start', fontSize: '0.88rem', color: '#475569' }}>
                        <i className="fas fa-check-circle" style={{ color: '#8b1538', marginTop: '0.2rem' }}></i>
                        <span>Understand baggage and fare rules</span>
                      </li>
                      <li style={{ display: 'flex', gap: '0.65rem', alignItems: 'start', fontSize: '0.88rem', color: '#475569' }}>
                        <i className="fas fa-check-circle" style={{ color: '#8b1538', marginTop: '0.2rem' }}></i>
                        <span>Support before and after booking</span>
                      </li>
                      
                      {showAllBenefits && (
                        <>
                          <li style={{ display: 'flex', gap: '0.65rem', alignItems: 'start', fontSize: '0.88rem', color: '#475569' }}>
                            <i className="fas fa-check-circle" style={{ color: '#8b1538', marginTop: '0.2rem' }}></i>
                            <span>Personal help reviewing flight options</span>
                          </li>
                          <li style={{ display: 'flex', gap: '0.65rem', alignItems: 'start', fontSize: '0.88rem', color: '#475569' }}>
                            <i className="fas fa-check-circle" style={{ color: '#8b1538', marginTop: '0.2rem' }}></i>
                            <span>Assistance comparing stops and connection times</span>
                          </li>
                        </>
                      )}
                    </ul>

                    <button 
                      type="button" 
                      onClick={() => setShowAllBenefits(!showAllBenefits)} 
                      style={{ background: 'none', border: 'none', color: '#8b1538', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', marginTop: '0.65rem', padding: 0 }}
                    >
                      {showAllBenefits ? 'Show Fewer Benefits' : 'View All Benefits'} <i className={`fas fa-chevron-${showAllBenefits ? 'up' : 'down'}`} style={{ fontSize: '0.75rem', marginLeft: '0.25rem' }} />
                    </button>
                  </div>
                </div>
                
                <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'center' }}>
                  <a href={SUPPORT_PHONE_HREF} className="call-btn flights-btn flights-btn--cta" style={{ width: '100%', minHeight: '44px', height: '44px', padding: '0 1rem', fontSize: '0.95rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="fas fa-headset" style={{ marginRight: '0.5rem' }}></i> Talk to a Travel Specialist
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CONSOLIDATED TABBED CAROUSEL SECTION */}
      <HowFareTransitHelps />

      {/* WHO WE HELP SECTION (Desktop view) */}
      <section className="who-we-help-section" style={{ backgroundColor: '#ffffff', padding: '3.5rem 0', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: '2rem', color: '#1e293b', fontWeight: 800, marginBottom: '0.5rem' }}>Who We Help</h2>
            <p style={{ color: '#64748b', fontSize: '1.05rem', maxWidth: '650px', margin: '0 auto' }}>
              Designed for travelers and families looking for clear guidance and personal service.
            </p>
          </div>
          <div className="who-we-help-grid">
            <div className="who-we-help-card">
              <div className="who-icon-wrapper"><i className="fas fa-user-check"></i></div>
              <h3>Personal Assistance</h3>
              <p>Travelers who prefer personal booking assistance over automated forms.</p>
            </div>
            <div className="who-we-help-card">
              <div className="who-icon-wrapper"><i className="fas fa-users"></i></div>
              <h3>Family Booking</h3>
              <p>Families arranging flights for parents, relatives or friends.</p>
            </div>
            <div className="who-we-help-card">
              <div className="who-icon-wrapper"><i className="fas fa-route"></i></div>
              <h3>Complex Routes</h3>
              <p>Passengers comparing complex routes or multiple connecting flights.</p>
            </div>
            <div className="who-we-help-card">
              <div className="who-icon-wrapper"><i className="fas fa-suitcase-rolling"></i></div>
              <h3>Fare & Baggage Rules</h3>
              <p>Travelers who want help understanding baggage allowances and fare conditions.</p>
            </div>
          </div>
        </div>
      </section>

      {/* POPULAR FLIGHT OPTIONS */}
      <section className="flights-section">
        <div className="container route-slider-section">
          <RouteSlider routes={flightFamousRoutes} btnClassPrefix="flights" title="Popular Flight Options" />
        </div>
      </section>

      {/* WHY CHOOSE THE FINAL SEAT (Desktop view) */}
      <section className="why-choose-section" style={{ backgroundColor: '#f8fafc', padding: '4rem 0', borderTop: '1px solid #e2e8f0' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: '2rem', color: '#1e293b', fontWeight: 800, marginBottom: '0.5rem' }}>Why Choose FareTransit</h2>
            <p style={{ color: '#64748b', fontSize: '1.05rem', maxWidth: '650px', margin: '0 auto' }}>
              Dedicated to delivering clarity, confidence, and personal assistance for every traveler.
            </p>
          </div>
          <div className="why-choose-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
            <div className="why-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.75rem 1.25rem', textAlign: 'center', boxShadow: '0 4px 12px rgba(15,23,42,0.04)' }}>
              <div className="why-icon" style={{ width: '52px', height: '52px', background: '#faf5f7', color: '#8b1538', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.35rem', marginBottom: '1rem' }}><i className="fas fa-headset"></i></div>
              <h3 style={{ fontSize: '1.15rem', color: '#1e293b', fontWeight: 700, marginBottom: '0.5rem' }}>Personal Travel Assistance</h3>
              <p style={{ fontSize: '0.92rem', color: '#64748b', lineHeight: 1.5, margin: 0 }}>Get help comparing flights, routes, baggage rules and travel options.</p>
            </div>
            <div className="why-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.75rem 1.25rem', textAlign: 'center', boxShadow: '0 4px 12px rgba(15,23,42,0.04)' }}>
              <div className="why-icon" style={{ width: '52px', height: '52px', background: '#faf5f7', color: '#8b1538', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.35rem', marginBottom: '1rem' }}><i className="fas fa-heart"></i></div>
              <h3 style={{ fontSize: '1.15rem', color: '#1e293b', fontWeight: 700, marginBottom: '0.5rem' }}>Support For Family Bookings</h3>
              <p style={{ fontSize: '0.92rem', color: '#64748b', lineHeight: 1.5, margin: 0 }}>Book flights for parents, relatives and travelers who need extra assistance.</p>
            </div>
            <div className="why-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.75rem 1.25rem', textAlign: 'center', boxShadow: '0 4px 12px rgba(15,23,42,0.04)' }}>
              <div className="why-icon" style={{ width: '52px', height: '52px', background: '#faf5f7', color: '#8b1538', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.35rem', marginBottom: '1rem' }}><i className="fas fa-balance-scale"></i></div>
              <h3 style={{ fontSize: '1.15rem', color: '#1e293b', fontWeight: 700, marginBottom: '0.5rem' }}>More Than Just The Cheapest Fare</h3>
              <p style={{ fontSize: '0.92rem', color: '#64748b', lineHeight: 1.5, margin: 0 }}>We help you understand connections, travel time, baggage and total journey quality.</p>
            </div>
            <div className="why-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.75rem 1.25rem', textAlign: 'center', boxShadow: '0 4px 12px rgba(15,23,42,0.04)' }}>
              <div className="why-icon" style={{ width: '52px', height: '52px', background: '#faf5f7', color: '#8b1538', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.35rem', marginBottom: '1rem' }}><i className="fas fa-check-circle"></i></div>
              <h3 style={{ fontSize: '1.15rem', color: '#1e293b', fontWeight: 700, marginBottom: '0.5rem' }}>Simple Reservation Experience</h3>
              <p style={{ fontSize: '0.92rem', color: '#64748b', lineHeight: 1.5, margin: 0 }}>Clear information and human support from search to confirmation.</p>
            </div>
          </div>
        </div>
      </section>

      {/* PERSONAL BOOKING ASSISTANCE */}
      <SeamlessAdvisorySection variant="flight" />

      {/* WE HELP YOU COMPARE MORE THAN PRICE (Desktop view) */}
      <section className="compare-more-section" style={{ padding: '4rem 0', backgroundColor: '#ffffff', borderTop: '1px solid #e2e8f0' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: '2rem', color: '#1e293b', fontWeight: 800, marginBottom: '0.5rem' }}>We Help You Compare More Than Price</h2>
            <p style={{ color: '#64748b', fontSize: '1.05rem', maxWidth: '650px', margin: '0 auto' }}>
              We focus on total journey quality and manageable travel details.
            </p>
          </div>
          <div className="compare-more-grid">
            <div className="compare-card">
              <i className="fas fa-plane-arrival compare-icon"></i>
              <h4>Number of Stops</h4>
              <p>Help identifying more manageable options with minimal connections.</p>
            </div>
            <div className="compare-card">
              <i className="fas fa-clock compare-icon"></i>
              <h4>Connection Duration</h4>
              <p>Sufficient layover times for comfortable airport transfers.</p>
            </div>
            <div className="compare-card">
              <i className="fas fa-exchange-alt compare-icon"></i>
              <h4>Airport Changes</h4>
              <p>Clear warnings for terminal or airport transfers between legs.</p>
            </div>
            <div className="compare-card">
              <i className="fas fa-stopwatch compare-icon"></i>
              <h4>Total Journey Time</h4>
              <p>Balancing duration, comfort, and schedule convenience.</p>
            </div>
            <div className="compare-card">
              <i className="fas fa-luggage-cart compare-icon"></i>
              <h4>Baggage Allowance</h4>
              <p>Guidance on included baggage rules and carry-on limits.</p>
            </div>
            <div className="compare-card">
              <i className="fas fa-shield-alt compare-icon"></i>
              <h4>Refund & Change Rules</h4>
              <p>Clear explanations of ticket flexibility and cancellation terms.</p>
            </div>
            <div className="compare-card">
              <i className="fas fa-sun compare-icon"></i>
              <h4>Departure & Arrival Times</h4>
              <p>Convenient daytime schedules when available for easier travel.</p>
            </div>
            <div className="compare-card">
              <i className="fas fa-wheelchair compare-icon"></i>
              <h4>Mobility Assistance</h4>
              <p>Help requesting airport assistance and special handling when needed.</p>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}

export default Home;
