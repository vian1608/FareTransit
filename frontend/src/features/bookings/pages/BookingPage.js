import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { paymentAPI, bookingAPI } from '../../../shared/api/api';

import AccordionSection from '../../../shared/components/AccordionSection';
import ItineraryCard from '../components/ItineraryCard';
import DateOfBirthPicker from '../../../shared/components/DateOfBirthPicker';
import TravelDatePicker from '../../flights/components/TravelDatePicker';
import InternationalPhoneInput from '../../../shared/components/InternationalPhoneInput';
import CountrySelect from '../../../shared/components/CountrySelect';
import RegionSelect from '../../../shared/components/RegionSelect';
import CitySelect from '../../../shared/components/CitySelect';
import CardNumberInput from '../../../shared/components/CardNumberInput';
import EmailInput from '../../../shared/components/EmailInput';

import './BookingPage.css';

function Booking() {
  const navigate = useNavigate();
  const [flight, setFlight] = useState(null);
  const [returnFlight, setReturnFlight] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Unique session key for abandoned booking tracking
  const abandonedSessionKey = useRef(
    sessionStorage.getItem('abandonedSessionKey') ||
    `ab_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
  );
  useEffect(() => {
    sessionStorage.setItem('abandonedSessionKey', abandonedSessionKey.current);
  }, []);

  // Accordion state
  const [openSections, setOpenSections] = useState({ travellers: true, contact: false, requests: false, payment: false });
  const [showSummaryMobile, setShowSummaryMobile] = useState(false);

  const toggleSection = (key) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const [couponCode, setCouponCode] = useState('');
  const [couponApplied, setCouponApplied] = useState(false);
  const [couponMessage, setCouponMessage] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState('');

  const [primaryContact, setPrimaryContact] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
  });

  const [contactSameAsTraveller, setContactSameAsTraveller] = useState(false);

  const [paymentInfo, setPaymentInfo] = useState({
    nameOnCard: '',
    cardNumber: '',
    expiry: '',
    cvv: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    zip: '',
    country: 'United States',
  });

  const [cardBrand, setCardBrand] = useState('unknown');

  const [specialRequests, setSpecialRequests] = useState({
    wheelchair: false,
    mealPreference: 'none',
    seatingPreference: 'none',
    notes: '',
  });

  const [passengersList, setPassengersList] = useState([]);

  useEffect(() => {
    const flightData = JSON.parse(sessionStorage.getItem('selectedFlight') || 'null');
    if (!flightData) { navigate('/'); return; }
    setFlight(flightData);

    const returnFlightData = JSON.parse(sessionStorage.getItem('returnFlight') || 'null');
    setReturnFlight(returnFlightData);

    const searchParams = JSON.parse(sessionStorage.getItem('searchParams') || '{}');
    const adults = parseInt(searchParams.adults || 1, 10);
    const children = parseInt(searchParams.children || 0, 10);
    const infants = parseInt(searchParams.infants || 0, 10);

    const initialList = [];
    for (let i = 0; i < adults; i++) {
      initialList.push(createPassenger('adult'));
    }
    for (let i = 0; i < children; i++) {
      initialList.push(createPassenger('child'));
    }
    for (let i = 0; i < infants; i++) {
      initialList.push(createPassenger('infant'));
    }
    setPassengersList(initialList);

    // Save abandoned booking snapshot to Supabase
    bookingAPI.saveAbandoned({
      sessionKey: abandonedSessionKey.current,
      selectedFlight: flightData,
      returnFlight: returnFlightData,
      travellerInfo: null,
      contactInfo: null,
      currentStep: 'travellers',
    }).catch(() => {/* non-blocking */});
  }, [navigate]);

  function createPassenger(role) {
    return {
      role,
      title: '',
      firstName: '',
      middleName: '',
      lastName: '',
      gender: '',
      dateOfBirth: '',
      nationality: 'United States',
      passportNumber: '',
      passportExpiry: '',
      knownTravelerNumber: '',
      redressNumber: '',
    };
  }

  useEffect(() => {
    if (contactSameAsTraveller && passengersList.length > 0) {
      const t1 = passengersList[0];
      setPrimaryContact(prev => ({
        ...prev,
        firstName: t1.firstName,
        lastName: t1.lastName,
      }));
    }
  }, [contactSameAsTraveller, passengersList]);

  const handlePrimaryContactChange = (field, value) => {
    setPrimaryContact(prev => ({ ...prev, [field]: value }));
  };

  const handlePaymentChange = (field, value) => {
    if (field === 'country' && value !== paymentInfo.country) {
      setPaymentInfo(prev => ({ ...prev, country: value, state: '', city: '' }));
    } else {
      setPaymentInfo(prev => ({ ...prev, [field]: value }));
    }
  };

  const handleSpecialRequestsChange = (field, value) => {
    setSpecialRequests(prev => ({ ...prev, [field]: value }));
  };

  const handlePassengerChange = (index, field, value) => {
    setPassengersList(prev => {
      const newList = [...prev];
      newList[index] = { ...newList[index], [field]: value };
      return newList;
    });
  };

  // Expiry formatting: MM/YY
  const handleExpiryChange = (e) => {
    let raw = e.target.value.replace(/\D/g, '').slice(0, 4);
    if (raw.length >= 3) {
      raw = raw.slice(0, 2) + '/' + raw.slice(2);
    }
    handlePaymentChange('expiry', raw);
  };

  const handleCvvChange = (e) => {
    const maxLen = cardBrand === 'amex' ? 4 : 3;
    let raw = e.target.value.replace(/\D/g, '').slice(0, maxLen);
    handlePaymentChange('cvv', raw);
  };

  const handleApplyCoupon = () => {
    if (couponCode.trim().toLowerCase() === 'welcome') {
      setCouponApplied(true);
      setAppliedCoupon('WELCOME');
      setCouponMessage('Promo applied successfully! Enjoy 99% off.');
    } else {
      setCouponMessage('Invalid promo code.');
      setCouponApplied(false);
    }
  };

  const calculateTotal = () => {
    const outboundPrice = parseFloat(flight?.price?.total || 0);
    const returnPrice = returnFlight ? parseFloat(returnFlight.price?.total || 0) : 0;
    const subtotal = outboundPrice + returnPrice;
    const tax = subtotal * 0.05;
    let total = subtotal + tax;

    if (couponApplied && appliedCoupon === 'WELCOME') {
      total = total * 0.01;
    }

    const originalPriceOut = parseFloat(flight?.price?.originalApiPrice || 0);
    const originalPriceRet = returnFlight ? parseFloat(returnFlight.price?.originalApiPrice || 0) : 0;
    const originalTotal = originalPriceOut + originalPriceRet;

    return {
      subtotal: subtotal.toFixed(2),
      tax: tax.toFixed(2),
      total: total.toFixed(2),
      originalPrice: originalTotal.toFixed(2),
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const pricing = calculateTotal();

      const billingAddress = {
        street: paymentInfo.addressLine1 + (paymentInfo.addressLine2 ? ', ' + paymentInfo.addressLine2 : ''),
        city: paymentInfo.city,
        state: paymentInfo.state,
        zip: paymentInfo.zip,
        country: paymentInfo.country,
      };

      sessionStorage.setItem('pendingPassenger', JSON.stringify({
        primaryContact,
        billingAddress,
        specialRequests,
        passengers: passengersList,
      }));
      sessionStorage.setItem('pricingTotal', pricing.total.toString());

      // Delete abandoned booking record now that payment is proceeding
      bookingAPI.deleteAbandoned(abandonedSessionKey.current).catch(() => {});
      sessionStorage.removeItem('abandonedSessionKey');

      const response = await paymentAPI.createStripeSession({
        type: 'booking',
        email: primaryContact.email,
        amount: parseFloat(pricing.total),
        flight: flight,
        returnFlight: returnFlight,
        passenger: {
          firstName: primaryContact.firstName,
          lastName: primaryContact.lastName,
          email: primaryContact.email,
          phone: primaryContact.phone,
          dateOfBirth: passengersList[0]?.dateOfBirth || '',
          gender: passengersList[0]?.gender || '',
          nationality: passengersList[0]?.nationality || '',
          passportNumber: passengersList[0]?.passportNumber || '',
          passportExpiry: passengersList[0]?.passportExpiry || '',
          emergencyName: primaryContact.firstName + ' ' + primaryContact.lastName,
          emergencyPhone: primaryContact.phone,
          emergencyRelationship: 'Primary Contact',
        },
      });

      if (response.success && response.url) {
        window.location.href = response.url;
      } else {
        throw new Error('Stripe redirect URL not returned by server.');
      }
    } catch (err) {
      console.error('Checkout creation error:', err);
      setError(
        err.response?.data?.error ||
        'Unable to process checkout. Please verify passenger details and try again.'
      );
      setLoading(false);
    }
  };

  if (!flight) {
    return (
      <div className="booking-loading-container">
        <i className="fas fa-circle-notch fa-spin"></i>
        <p>Loading flight summaries...</p>
      </div>
    );
  }

  const pricing = calculateTotal();
  const isTrain = flight.isTrain;

  return (
    <div className="booking-page-container">
      <Helmet>
        <title>Flight Checkout & Booking | FareTransit</title>
      </Helmet>

      <div className="booking-inner-container">

        <header className="booking-page-header">
          <h1>Secure Ticket Checkout</h1>
          <p>Complete your reservation below. Your payment is processed via Stripe's PCI-compliant secure gateway.</p>
        </header>

        {error && (
          <div className="booking-error-alert" role="alert">
            <i className="fas fa-exclamation-circle"></i>
            <span>{error}</span>
          </div>
        )}

        {flight?.isMock && (
          <div className="booking-error-alert" role="alert" style={{ background: '#fff8e1', borderColor: '#f59e0b', color: '#92400e' }}>
            <i className="fas fa-exclamation-triangle" style={{ color: '#f59e0b' }}></i>
            <span>
              <strong>Offline Estimated Result:</strong> This flight result was generated as an offline sample because live flight data is currently unavailable. Prices are estimated and this ticket <strong>cannot be booked</strong>. Please go back, search again, or contact us for live availability.
            </span>
          </div>
        )}

        <div className="booking-checkout-layout">
          <div className="booking-main-content">
            <form onSubmit={flight?.isMock ? (e) => { e.preventDefault(); setError('This is an offline sample flight and cannot be booked. Please search for live flights.'); } : handleSubmit} className="booking-form-element">

              {/* SECTION 1: TRAVELLER INFORMATION */}
              <AccordionSection
                id="travellers"
                stepNumber={1}
                title="Traveller Information"
                isOpen={openSections.travellers}
                onToggle={() => toggleSection('travellers')}
              >
                {passengersList.map((passenger, index) => (
                  <div key={index} className="passenger-entry-block">
                    <h3 className="passenger-block-title">
                      <i className="fas fa-user"></i>
                      Traveller {index + 1}
                      <span className="passenger-role-badge">{passenger.role}</span>
                    </h3>

                    {/* Row 1: Title, First, Middle, Last */}
                    <div className="booking-form-grid booking-form-grid--4col">
                      <label className="booking-form-field">
                        Title
                        <select
                          value={passenger.title}
                          onChange={(e) => handlePassengerChange(index, 'title', e.target.value)}
                        >
                          <option value="">Select</option>
                          <option value="Mr">Mr.</option>
                          <option value="Mrs">Mrs.</option>
                          <option value="Ms">Ms.</option>
                          <option value="Dr">Dr.</option>
                        </select>
                      </label>
                      <label className="booking-form-field">
                        First Name *
                        <input
                          type="text"
                          value={passenger.firstName}
                          onChange={(e) => handlePassengerChange(index, 'firstName', e.target.value)}
                          required
                          placeholder="As on ID"
                        />
                      </label>
                      <label className="booking-form-field">
                        Middle Name
                        <input
                          type="text"
                          value={passenger.middleName}
                          onChange={(e) => handlePassengerChange(index, 'middleName', e.target.value)}
                          placeholder="Optional"
                        />
                      </label>
                      <label className="booking-form-field">
                        Last Name *
                        <input
                          type="text"
                          value={passenger.lastName}
                          onChange={(e) => handlePassengerChange(index, 'lastName', e.target.value)}
                          required
                          placeholder="As on ID"
                        />
                      </label>
                    </div>

                    {/* Row 2: Gender, DOB, Nationality */}
                    <div className="booking-form-grid booking-form-grid--3col" style={{ marginTop: '0.85rem' }}>
                      <label className="booking-form-field">
                        Gender *
                        <select
                          value={passenger.gender}
                          onChange={(e) => handlePassengerChange(index, 'gender', e.target.value)}
                          required
                        >
                          <option value="">Select Gender</option>
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                          <option value="other">Other</option>
                        </select>
                      </label>
                      <div className="booking-form-field">
                        <DateOfBirthPicker
                          id={`dob-passenger-${index}`}
                          label="Date of Birth *"
                          value={passenger.dateOfBirth}
                          onChange={(val) => handlePassengerChange(index, 'dateOfBirth', val)}
                          required
                        />
                      </div>
                      <div className="booking-form-field">
                        <label htmlFor={`nationality-${index}`}>Nationality *</label>
                        <CountrySelect
                          id={`nationality-${index}`}
                          value={passenger.nationality}
                          onChange={(val) => handlePassengerChange(index, 'nationality', val)}
                          required
                        />
                      </div>
                    </div>

                    {/* Row 3: Passport fields */}
                    {!isTrain && (
                      <>
                        <div className="booking-form-grid" style={{ marginTop: '0.85rem' }}>
                          <label className="booking-form-field">
                            Passport Number
                            <input
                              type="text"
                              value={passenger.passportNumber}
                              onChange={(e) => handlePassengerChange(index, 'passportNumber', e.target.value)}
                              placeholder="Optional"
                            />
                          </label>
                          <div className="booking-form-field">
                            <TravelDatePicker
                              id={`passport-expiry-${index}`}
                              label="Passport Expiry"
                              value={passenger.passportExpiry}
                              onChange={(val) => handlePassengerChange(index, 'passportExpiry', val)}
                              placeholder="Optional"
                            />
                          </div>
                        </div>
                        <div className="booking-form-grid" style={{ marginTop: '0.85rem' }}>
                          <label className="booking-form-field">
                            Known Traveler Number
                            <input
                              type="text"
                              value={passenger.knownTravelerNumber}
                              onChange={(e) => handlePassengerChange(index, 'knownTravelerNumber', e.target.value)}
                              placeholder="KTN (optional)"
                            />
                          </label>
                          <label className="booking-form-field">
                            Redress Number
                            <input
                              type="text"
                              value={passenger.redressNumber}
                              onChange={(e) => handlePassengerChange(index, 'redressNumber', e.target.value)}
                              placeholder="Optional"
                            />
                          </label>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </AccordionSection>

              {/* SECTION 2: PRIMARY CONTACT */}
              <AccordionSection
                id="contact"
                stepNumber={2}
                title="Primary Contact"
                isOpen={openSections.contact}
                onToggle={() => toggleSection('contact')}
              >
                <div className="same-as-traveller-check">
                  <input
                    type="checkbox"
                    id="same-as-traveller"
                    checked={contactSameAsTraveller}
                    onChange={(e) => {
                      setContactSameAsTraveller(e.target.checked);
                      if (!e.target.checked) {
                        setPrimaryContact({ firstName: '', lastName: '', email: primaryContact.email, phone: primaryContact.phone });
                      }
                    }}
                  />
                  <label htmlFor="same-as-traveller">Primary contact is the same as Traveller 1</label>
                </div>

                <div className="booking-form-grid">
                  <label className="booking-form-field">
                    First Name *
                    <input
                      type="text"
                      value={primaryContact.firstName}
                      onChange={(e) => handlePrimaryContactChange('firstName', e.target.value)}
                      required
                      placeholder="e.g. John"
                      readOnly={contactSameAsTraveller}
                      className={contactSameAsTraveller ? 'input-synced' : ''}
                    />
                  </label>
                  <label className="booking-form-field">
                    Last Name *
                    <input
                      type="text"
                      value={primaryContact.lastName}
                      onChange={(e) => handlePrimaryContactChange('lastName', e.target.value)}
                      required
                      placeholder="e.g. Doe"
                      readOnly={contactSameAsTraveller}
                      className={contactSameAsTraveller ? 'input-synced' : ''}
                    />
                  </label>
                </div>

                <div className="booking-form-grid" style={{ marginTop: '0.85rem' }}>
                  <div className="booking-form-field">
                    <EmailInput
                      id="primary-contact-email"
                      label="Email Address *"
                      value={primaryContact.email}
                      onChange={(val) => handlePrimaryContactChange('email', val)}
                      required
                    />
                  </div>
                  <div className="booking-form-field">
                    <label>Phone Number *</label>
                    <InternationalPhoneInput
                      id="primary-contact-phone"
                      value={primaryContact.phone}
                      onChange={(val) => handlePrimaryContactChange('phone', val)}
                      required
                    />
                  </div>
                </div>
              </AccordionSection>

              {/* SECTION 3: SPECIAL REQUESTS */}
              <AccordionSection
                id="requests"
                stepNumber={3}
                title="Special Requests"
                isOpen={openSections.requests}
                onToggle={() => toggleSection('requests')}
              >
                <p className="section-info-notice">
                  <i className="fas fa-info-circle"></i>
                  Special requests are subject to airline availability and are not guaranteed.
                </p>

                <div className="same-as-traveller-check" style={{ marginBottom: '0.85rem' }}>
                  <input
                    type="checkbox"
                    id="wheelchair"
                    checked={specialRequests.wheelchair}
                    onChange={(e) => handleSpecialRequestsChange('wheelchair', e.target.checked)}
                  />
                  <label htmlFor="wheelchair">Request wheelchair assistance at airports</label>
                </div>

                <div className="booking-form-grid booking-form-grid--3col">
                  <label className="booking-form-field">
                    Meal Preference
                    <select
                      value={specialRequests.mealPreference}
                      onChange={(e) => handleSpecialRequestsChange('mealPreference', e.target.value)}
                    >
                      <option value="none">No Preference</option>
                      <option value="vegetarian">Vegetarian</option>
                      <option value="vegan">Vegan</option>
                      <option value="kosher">Kosher</option>
                      <option value="halal">Halal</option>
                      <option value="gluten-free">Gluten-Free</option>
                    </select>
                  </label>
                  <label className="booking-form-field">
                    Seating Preference
                    <select
                      value={specialRequests.seatingPreference}
                      onChange={(e) => handleSpecialRequestsChange('seatingPreference', e.target.value)}
                    >
                      <option value="none">No Preference</option>
                      <option value="window">Window</option>
                      <option value="aisle">Aisle</option>
                      <option value="middle">Middle</option>
                    </select>
                  </label>
                </div>

                <div style={{ marginTop: '0.85rem' }}>
                  <label className="booking-form-field">
                    Additional Requests
                    <textarea
                      rows={3}
                      value={specialRequests.notes}
                      onChange={(e) => handleSpecialRequestsChange('notes', e.target.value)}
                      placeholder="Airline loyalty number, special assistance, or any other requests..."
                      className="booking-textarea"
                    />
                  </label>
                </div>
              </AccordionSection>

              {/* SECTION 4: PAYMENT INFORMATION */}
              <AccordionSection
                id="payment"
                stepNumber={4}
                title="Payment Information"
                isOpen={openSections.payment}
                onToggle={() => toggleSection('payment')}
              >
                <div className="payment-security-notice">
                  <i className="fas fa-lock"></i>
                  <span>Your payment is processed securely via Stripe. We never store or access your card information.</span>
                </div>

                <div className="payment-card-group">
                  <h4 className="payment-sub-title">Card Details</h4>

                  <div className="booking-form-grid">
                    <label className="booking-form-field" style={{ gridColumn: 'span 2' }}>
                      Name on Card *
                      <input
                        type="text"
                        value={paymentInfo.nameOnCard}
                        onChange={(e) => handlePaymentChange('nameOnCard', e.target.value)}
                        required
                        placeholder="Full name as on card"
                      />
                    </label>
                  </div>

                  <div className="booking-form-grid" style={{ marginTop: '0.85rem' }}>
                    <div className="booking-form-field">
                      <label>Card Number *</label>
                      <CardNumberInput
                        id="card-number-input"
                        value={paymentInfo.cardNumber}
                        onChange={(val) => handlePaymentChange('cardNumber', val)}
                        onBrandChange={setCardBrand}
                        required
                      />
                    </div>
                    
                    <div className="booking-form-grid-inline">
                      <label className="booking-form-field">
                        Expiry *
                        <input
                          type="text"
                          value={paymentInfo.expiry}
                          onChange={handleExpiryChange}
                          required
                          placeholder="MM/YY"
                          maxLength={5}
                          inputMode="numeric"
                          autoComplete="cc-exp"
                        />
                      </label>
                      <label className="booking-form-field">
                        {cardBrand === 'amex' ? 'CID *' : 'CVV *'}
                        <div className="card-input-wrapper">
                          <input
                            type="password"
                            value={paymentInfo.cvv}
                            onChange={handleCvvChange}
                            required
                            placeholder={cardBrand === 'amex' ? '••••' : '•••'}
                            maxLength={cardBrand === 'amex' ? 4 : 3}
                            inputMode="numeric"
                            autoComplete="cc-csc"
                          />
                          <i className="fas fa-shield-alt" style={{position: 'absolute', right: '0.85rem', color: '#94a3b8', fontSize: '0.95rem'}}></i>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Billing Address */}
                <div className="payment-card-group" style={{ marginTop: '1.5rem' }}>
                  <h4 className="payment-sub-title">Billing Address</h4>

                  <div className="booking-form-grid">
                    <div className="booking-form-field" style={{ gridColumn: 'span 2' }}>
                      <label>Country *</label>
                      <CountrySelect
                        id="billing-country"
                        value={paymentInfo.country}
                        onChange={(val) => handlePaymentChange('country', val)}
                        required
                      />
                    </div>
                  </div>

                  <div className="booking-form-grid" style={{ marginTop: '0.85rem' }}>
                    <label className="booking-form-field" style={{ gridColumn: 'span 2' }}>
                      Address Line 1 *
                      <input
                        type="text"
                        value={paymentInfo.addressLine1}
                        onChange={(e) => handlePaymentChange('addressLine1', e.target.value)}
                        required
                        placeholder="Street and house number"
                      />
                    </label>
                  </div>

                  <div className="booking-form-grid" style={{ marginTop: '0.85rem' }}>
                    <label className="booking-form-field" style={{ gridColumn: 'span 2' }}>
                      Address Line 2
                      <input
                        type="text"
                        value={paymentInfo.addressLine2}
                        onChange={(e) => handlePaymentChange('addressLine2', e.target.value)}
                        placeholder="Apartment, suite, etc. (optional)"
                      />
                    </label>
                  </div>

                  <div className="booking-form-grid booking-form-grid--3col" style={{ marginTop: '0.85rem' }}>
                    <div className="booking-form-field">
                      <label>City *</label>
                      <CitySelect
                        id="billing-city"
                        value={paymentInfo.city}
                        onChange={(val) => handlePaymentChange('city', val)}
                        countryName={paymentInfo.country}
                        stateName={paymentInfo.state}
                        required
                      />
                    </div>
                    <div className="booking-form-field">
                      <label>State / Province *</label>
                      <RegionSelect
                        id="billing-state"
                        value={paymentInfo.state}
                        onChange={(val) => handlePaymentChange('state', val)}
                        countryName={paymentInfo.country}
                        required
                      />
                    </div>
                    <label className="booking-form-field">
                      ZIP / Postal Code *
                      <input
                        type="text"
                        value={paymentInfo.zip}
                        onChange={(e) => handlePaymentChange('zip', e.target.value)}
                        required
                        placeholder="ZIP Code"
                      />
                    </label>
                  </div>
                </div>
              </AccordionSection>

              <div className="verification-block">
                <div className="verification-inner">
                  <input type="checkbox" id="agree-check" required />
                  <label htmlFor="agree-check" className="verification-label">
                    I agree to the <Link to="/terms" target="_blank">Terms of Service</Link>, <Link to="/privacy-policy" target="_blank">Privacy Policy</Link>, and <Link to="/refund-policy" target="_blank">Refund Policy</Link>. I verify that the passenger credentials entered above match official photo IDs exactly.
                  </label>
                </div>
              </div>

              <button
                type="submit"
                className="booking-submit-button"
                disabled={loading}
              >
                {loading ? (
                  <span><i className="fas fa-circle-notch fa-spin"></i> Redirecting to Secure Stripe Checkout...</span>
                ) : (
                  <span><i className="fas fa-lock"></i> Secure Pay — ${pricing.total} USD</span>
                )}
              </button>

            </form>
          </div>

          <aside className="booking-summary-sidebar">
            <button 
              type="button" 
              className="mobile-summary-toggle-bar"
              onClick={() => setShowSummaryMobile(!showSummaryMobile)}
            >
              <span><i className="fas fa-receipt"></i> {showSummaryMobile ? 'Hide Trip Summary' : 'Show Trip Summary'}</span>
              <strong>${pricing.total} USD <i className={`fas fa-chevron-${showSummaryMobile ? 'up' : 'down'}`}></i></strong>
            </button>
            <div className={`summary-sticky-card ${showSummaryMobile ? 'mobile-expanded' : 'mobile-collapsed'}`}>
              <h3 className="summary-card-title">Itinerary Summary</h3>

              <ItineraryCard
                flight={flight}
                label="Outbound"
                labelColor="#1e3a5f"
                isTrain={isTrain}
              />

              {returnFlight && (
                <ItineraryCard
                  flight={returnFlight}
                  label="Return"
                  labelColor="#8b1538"
                  isTrain={returnFlight.isTrain}
                />
              )}

              <div className="promo-code-box">
                <span className="promo-title">Promo Code</span>
                <div className="promo-input-row">
                  <input
                    type="text"
                    placeholder="Enter code"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                    disabled={couponApplied}
                    className="promo-input"
                  />
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    disabled={couponApplied}
                    className="promo-apply-btn"
                  >
                    Apply
                  </button>
                </div>
                {couponMessage && (
                  <p className={`promo-message ${couponApplied ? 'promo-message--success' : 'promo-message--error'}`}>
                    {couponMessage}
                  </p>
                )}
              </div>

              <div className="price-breakdown-section">
                <h4>Pricing Breakdown</h4>
                <div className="price-row">
                  <span>Base Tickets</span>
                  <span>${pricing.subtotal}</span>
                </div>
                <div className="price-row">
                  <span>Taxes & Partner Fees</span>
                  <span>${pricing.tax}</span>
                </div>
                {couponApplied && (
                  <div className="price-row price-row--discount">
                    <span>Promo Applied (WELCOME)</span>
                    <span>-99%</span>
                  </div>
                )}
                <div className="price-row price-row--total">
                  <strong>Total Web Price</strong>
                  <strong className="price-total-amount">${pricing.total} USD</strong>
                </div>
              </div>
            </div>
          </aside>

        </div>
      </div>
    </div>
  );
}

export default Booking;
