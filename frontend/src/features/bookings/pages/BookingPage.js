import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { bookingAPI } from '../../../shared/api/api';

import AccordionSection from '../../../shared/components/AccordionSection';
import ItineraryCard from '../components/ItineraryCard';
import DateOfBirthPicker from '../../../shared/components/DateOfBirthPicker';
import TravelDatePicker from '../../flights/components/TravelDatePicker';
import InternationalPhoneInput from '../../../shared/components/InternationalPhoneInput';
import CountrySelect from '../../../shared/components/CountrySelect';
import EmailInput from '../../../shared/components/EmailInput';
import AddressAutocompleteInput from '../../../shared/components/AddressAutocompleteInput';
import ManualPaymentCardFields from '../../secure-payments/ManualPaymentCardFields';
import {
  validatePostalCode,
  validatePassportNumber,
  validateDateOfBirth,
  validatePassportExpiry
} from '../../../shared/utils/validationHelpers';

import ModifySearchModal from '../../flights/components/ModifySearchModal';
import { safeUpper } from '../../../shared/utils/itineraryNormalizer';
import { trackGoogleAdsLeadConversion } from '../../../shared/analytics/googleAds';

import './BookingPage.css';

const readBookingSessionJson = (key, fallback = null) => {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const PASSENGER_REQUIRED_FIELDS = [
  ['title', 'Title'],
  ['firstName', 'First Name'],
  ['lastName', 'Last Name'],
  ['gender', 'Gender'],
  ['dateOfBirth', 'Date of Birth'],
];

const normalizePassengerFieldValue = (field, value) => {
  if (field === 'title') return String(value || '').trim().replace(/\.$/, '');
  if (field === 'gender') return String(value || '').trim().toLowerCase();
  return value;
};

const getMissingPassengerFields = (passenger = {}) => PASSENGER_REQUIRED_FIELDS
  .filter(([key]) => !String(passenger?.[key] ?? '').trim())
  .map(([, label]) => label);

const isPassengerRequiredComplete = (passenger = {}) => getMissingPassengerFields(passenger).length === 0;

function Booking({ initialJourneyPayload = null }) {
  const navigate = useNavigate();
  const [flight, setFlight] = useState(() =>
    initialJourneyPayload?.selectedFlight || readBookingSessionJson('selectedFlight', null)
  );
  const [returnFlight, setReturnFlight] = useState(() =>
    initialJourneyPayload?.returnFlight
      || readBookingSessionJson('returnFlight', null)
      || readBookingSessionJson('selectedReturnFlight', null)
  );
  const [error, setError] = useState('');

  // Only masked manual payment metadata lives in React state. Full card number and security code are never collected here.
  const [cardForm, setCardForm] = useState({
    cardholderName: '',
    billingPhone: '',
    billingAddress: '',
    billingAddress2: '',
    billingCity: '',
    billingState: '',
    billingZip: '',
    billingCountry: 'United States'
  });
  const [cardError, setCardError] = useState('');
  const [cardProcessing, setCardProcessing] = useState(false);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const secureCardRef = useRef(null);

  const pendingBookingId = useRef(null);
  const pendingBookingCode = useRef(null);

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
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isModifySearchOpen, setIsModifySearchOpen] = useState(false);

  const handleUpdateSearchFromCheckout = (updatedParams) => {
    const newAdults = parseInt(updatedParams.adults || 1, 10);
    const newChildren = parseInt(updatedParams.children || 0, 10);
    const newInfants = parseInt(updatedParams.infants || 0, 10);
    const newTotalPax = newAdults + newChildren + newInfants;

    if (newTotalPax !== passengersList.length) {
      let updatedList = [...passengersList];
      if (newTotalPax > passengersList.length) {
        for (let i = passengersList.length; i < newTotalPax; i++) {
          let role = 'adult';
          if (i >= newAdults && i < newAdults + newChildren) role = 'child';
          else if (i >= newAdults + newChildren) role = 'infant';

          updatedList.push({
            role,
            title: '',
            firstName: '',
            middleName: '',
            lastName: '',
            dateOfBirth: '',
            gender: '',
            nationality: 'US',
            passportNumber: '',
            passportExpiry: '',
            redressNumber: '',
            knownTravelerNumber: ''
          });
        }
      } else {
        updatedList = updatedList.slice(0, newTotalPax);
      }
      setPassengersList(updatedList);
    }

    sessionStorage.removeItem('selectedFlight');
    sessionStorage.removeItem('selectedReturnFlight');
    sessionStorage.removeItem('bookingDraft');

    const searchUrl = `/search?from=${encodeURIComponent(updatedParams.from)}&to=${encodeURIComponent(updatedParams.to)}&departure=${encodeURIComponent(updatedParams.departure)}&return=${encodeURIComponent(updatedParams.return || '')}&tripType=${encodeURIComponent(updatedParams.tripType)}&adults=${newAdults}&children=${newChildren}&infants=${newInfants}&cabin=${encodeURIComponent(updatedParams.cabinClass)}`;
    
    setIsModifySearchOpen(false);
    navigate(searchUrl);
  };

  const toggleSection = (key) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Calculate total pricing based on 10% discount pricing helper
  const calculateTotal = () => {
    const isMock = !!flight?.isMock || !!returnFlight?.isMock;
    const passCount = Math.max(1, passengersList.length || 1);

    const outFinal = parseFloat(flight?.price?.finalPrice || flight?.price?.total || 0);
    const outOriginal = parseFloat(flight?.price?.originalApiPrice || outFinal);
    const outDiscount = isMock ? 0 : parseFloat(flight?.price?.discountAmount || (outOriginal - outFinal));

    const retFinal = returnFlight ? parseFloat(returnFlight?.price?.finalPrice || returnFlight?.price?.total || 0) : 0;
    const retOriginal = returnFlight ? parseFloat(returnFlight?.price?.originalApiPrice || retFinal) : 0;
    const retDiscount = (returnFlight && !isMock) ? parseFloat(returnFlight?.price?.discountAmount || (retOriginal - retFinal)) : 0;

    const perPassOriginal = outOriginal + retOriginal;
    const perPassDiscount = outDiscount + retDiscount;
    const perPassFinal = outFinal + retFinal;

    const supplierPrice = (perPassOriginal * passCount).toFixed(2);
    const discountAmount = (perPassDiscount * passCount).toFixed(2);
    const total = (perPassFinal * passCount).toFixed(2);

    return {
      supplierPrice,
      discountAmount,
      discountPercent: isMock ? 0 : 10,
      total,
      subtotal: total,
      tax: '0.00',
      originalPrice: supplierPrice,
      isMock
    };
  };

  const [primaryContact, setPrimaryContact] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
  });

  const [contactSameAsTraveller, setContactSameAsTraveller] = useState(false);

  const [specialRequests, setSpecialRequests] = useState({
    wheelchair: false,
    mealPreference: 'none',
    seatingPreference: 'none',
    notes: '',
  });

  const [passengersList, setPassengersList] = useState([]);
  const [expandedPassengers, setExpandedPassengers] = useState({});
  const [passengerValidationErrors, setPassengerValidationErrors] = useState({});

  const revealPassenger = (index) => {
    setExpandedPassengers(prev => ({ ...prev, [index]: true }));
    window.setTimeout(() => {
      document.querySelector(`[data-passenger-index="${index}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 40);
  };

  useEffect(() => {
    const flightData = initialJourneyPayload?.selectedFlight
      || readBookingSessionJson('selectedFlight', null);
    const returnFlightData = initialJourneyPayload?.returnFlight
      || readBookingSessionJson('returnFlight', null)
      || readBookingSessionJson('selectedReturnFlight', null);
    const searchParams = initialJourneyPayload?.searchParams
      || readBookingSessionJson('searchParams', {});

    if (!flightData) {
      setError('We could not restore the selected itinerary. Please retry this checkout link or search again.');
      return;
    }

    setFlight(flightData);
    setReturnFlight(returnFlightData);

    const adults = parseInt(searchParams.adults || 1, 10);
    const children = parseInt(searchParams.children || 0, 10);
    const infantsInSeat = parseInt(searchParams.infantsInSeat || 0, 10);
    const infantsOnLap = parseInt(searchParams.infantsOnLap || 0, 10);
    const legacyInfants = parseInt(searchParams.infants || 0, 10);
    const explicitInfants = infantsInSeat + infantsOnLap;
    const infants = explicitInfants > 0 ? explicitInfants : legacyInfants;

    const initialList = [];
    for (let i = 0; i < adults; i++) {
      initialList.push(createPassenger('adult'));
    }
    for (let i = 0; i < children; i++) {
      initialList.push(createPassenger('child'));
    }
    if (explicitInfants > 0) {
      for (let i = 0; i < infantsInSeat; i++) initialList.push(createPassenger('infant', 'IN_SEAT'));
      for (let i = 0; i < infantsOnLap; i++) initialList.push(createPassenger('infant', 'ON_LAP'));
    } else {
      for (let i = 0; i < infants; i++) initialList.push(createPassenger('infant', 'ON_LAP'));
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
  }, [initialJourneyPayload]);

  function createPassenger(role, infantType = null) {
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
      infantType: role === 'infant' ? infantType : null,
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

  // Dynamic step completion flags (Turn green checkmark when valid, revert to red when invalid)
  const isStep1Complete = passengersList.length > 0 && passengersList.every(isPassengerRequiredComplete);

  const isStep2Complete = !!(
    primaryContact.firstName && primaryContact.firstName.trim() && 
    primaryContact.lastName && primaryContact.lastName.trim() && 
    primaryContact.email && primaryContact.email.trim() && 
    primaryContact.phone && primaryContact.phone.trim()
  );

  const isStep3Complete = true; // Special requests section is optional
  const isStep4Complete = paymentComplete && termsAccepted;

  const handlePrimaryContactChange = (field, value) => {
    setPrimaryContact(prev => ({ ...prev, [field]: value }));
  };

  const handleSpecialRequestsChange = (field, value) => {
    setSpecialRequests(prev => ({ ...prev, [field]: value }));
  };

  const handlePassengerChange = (index, field, value) => {
    const normalizedValue = normalizePassengerFieldValue(field, value);
    setPassengersList(prev => {
      const newList = [...prev];
      newList[index] = { ...newList[index], [field]: normalizedValue };
      return newList;
    });
    setPassengerValidationErrors(prev => {
      if (!prev[index]) return prev;
      const next = { ...prev };
      delete next[index];
      return next;
    });
    if (error) setError('');
  };

  const validateForm = () => {
    const firstIncompleteIndex = passengersList.findIndex(p => !isPassengerRequiredComplete(p));
    if (firstIncompleteIndex >= 0) {
      const missing = getMissingPassengerFields(passengersList[firstIncompleteIndex]);
      setPassengerValidationErrors({ [firstIncompleteIndex]: missing });
      setError(`Passenger #${firstIncompleteIndex + 1}: Please complete ${missing.join(', ')}.`);
      setOpenSections({ travellers: true, contact: false, requests: false, payment: false });
      revealPassenger(firstIncompleteIndex);
      return false;
    }

    setPassengerValidationErrors({});

    if (!isStep2Complete) {
      setError('Please fill in all primary contact details (First Name, Last Name, Email, Phone).');
      setOpenSections({ travellers: false, contact: true, requests: false, payment: false });
      window.setTimeout(() => document.querySelector('#contact-email, #contact-phone')?.focus(), 80);
      return false;
    }

    const depDate = flight?.departureDate || flight?.departure?.date || '';
    for (let i = 0; i < passengersList.length; i++) {
      const p = passengersList[i];
      const pName = `${p.firstName || ''} ${p.lastName || ''}`.trim() || `Passenger #${i + 1}`;

      const dobCheck = validateDateOfBirth(p.dateOfBirth, p.role || 'adult', depDate);
      if (!dobCheck.valid) {
        setError(`${pName}: ${dobCheck.message}`);
        setPassengerValidationErrors({ [i]: [dobCheck.message] });
        setOpenSections({ travellers: true, contact: false, requests: false, payment: false });
        revealPassenger(i);
        return false;
      }

      if (p.passportNumber) {
        const passCheck = validatePassportNumber(p.passportNumber);
        if (!passCheck.valid) {
          setError(`${pName}: ${passCheck.message}`);
          setPassengerValidationErrors({ [i]: [passCheck.message] });
          setOpenSections({ travellers: true, contact: false, requests: false, payment: false });
          revealPassenger(i);
          return false;
        }
      }

      if (p.passportExpiry) {
        const expCheck = validatePassportExpiry(p.passportExpiry, depDate);
        if (!expCheck.valid) {
          setError(`${pName}: ${expCheck.message}`);
          setPassengerValidationErrors({ [i]: [expCheck.message] });
          setOpenSections({ travellers: true, contact: false, requests: false, payment: false });
          revealPassenger(i);
          return false;
        }
      }
    }
    return true;
  };

  const [samePhone, setSamePhone] = useState(false);
  const [isBillingExpanded, setIsBillingExpanded] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const idempotencyKeyRef = useRef(
    sessionStorage.getItem('checkoutSessionToken')
      ? `checkout:${sessionStorage.getItem('checkoutSessionToken')}`
      : `idemp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
  );

  const handlePaymentFocus = () => {
    if (!isBillingExpanded) {
      setIsBillingExpanded(true);
    }
  };

  const handleSamePhoneChange = (e) => {
    const checked = e.target.checked;
    setSamePhone(checked);
    if (checked && primaryContact.phone) {
      setCardForm(prev => ({ ...prev, billingPhone: primaryContact.phone }));
    }
  };

  const createPendingBookingRecord = async (maskedCard = {}) => {
    if (pendingBookingId.current) {
      return { id: pendingBookingId.current, code: pendingBookingCode.current };
    }

    const pricing = calculateTotal();
    const customerName = `${primaryContact.firstName} ${primaryContact.lastName}`;
    const flightObj = {
      ...flight,
      returnFlight: returnFlight,
      specialRequests: specialRequests
    };

    const rawLast4 = String(maskedCard.last4 || '').replace(/\D/g, '');
    const cardLast4 = /^\d{4}$/.test(rawLast4) ? rawLast4 : null;
    const cardBrand = String(maskedCard.cardBrand || '').trim() || null;

    // Canonical nested paymentMethod object contains only safe masked/billing metadata.
    const paymentMethod = {
      cardholderName: cardForm.cardholderName || customerName,
      cardBrand,
      cardLast4,
      billingPhone: cardForm.billingPhone,
      billingEmail: primaryContact.email,
      billingAddressLine1: cardForm.billingAddress,
      billingAddressLine2: cardForm.billingAddress2 || '',
      billingCity: cardForm.billingCity,
      billingState: cardForm.billingState,
      billingPostalCode: cardForm.billingZip,
      billingCountry: cardForm.billingCountry,
    };

    const bookingPayload = {
      idempotency_key: idempotencyKeyRef.current,
      customerName,
      email: primaryContact.email,
      phone: primaryContact.phone,
      passengers: passengersList,
      flight: flightObj,
      returnFlight: returnFlight,
      originalApiPrice: pricing.supplierPrice,
      supplier_price: pricing.supplierPrice,
      discount_percent: pricing.discountPercent,
      discount_amount: pricing.discountAmount,
      customer_price: pricing.total,
      displayedWebsitePrice: pricing.total,
      paymentStatus: 'PENDING',
      payment_provider: 'manual',
      paymentMethod,
      cardholderName: paymentMethod.cardholderName,
      cardLast4,
      cardBrand,
      billingPhone: cardForm.billingPhone,
      billingEmail: primaryContact.email,
      billingAddressLine1: cardForm.billingAddress,
      billingAddressLine2: cardForm.billingAddress2 || '',
      billingAddress: cardForm.billingAddress,
      billingCity: cardForm.billingCity,
      billingState: cardForm.billingState,
      billingZip: cardForm.billingZip,
      billingPostalCode: cardForm.billingZip,
      billingCountry: cardForm.billingCountry,
      currency: 'USD',
      status: 'PENDING',
      isMock: pricing.isMock
    };

    const res = await bookingAPI.create(bookingPayload);
    if (res && res.success) {
      // Extract booking ID and code from nested data or root-level (canonical model is spread at root)
      const bId = res.data?.id || res.id;
      const bCode = res.data?.confirmation_code || res.data?.confirmationCode ||
                    res.confirmation_code || res.confirmationCode;

      if (bId && bCode) {
        pendingBookingId.current = bId;
        pendingBookingCode.current = bCode;

        // Dispatch Google Ads Lead Conversion after backend confirmation
        try {
          await trackGoogleAdsLeadConversion({
            bookingReference: bCode,
            value: 1,
            currency: 'USD'
          });
        } catch (convErr) {
          console.warn('[Checkout] Non-blocking conversion tracking warning:', convErr);
        }

        if (res.idempotentReused) {
          console.info('[Checkout] Idempotent reuse detected — booking already exists:', bCode);
        }

        return {
          id: bId,
          code: bCode,
          reservationReadToken: res?.reservationReadToken || res?.data?.reservationReadToken || null,
        };
      }
    }

    throw new Error(
      res?.error?.message || res?.message ||
      'We could not complete your reservation. No confirmed booking was created. Please review your details and try again.'
    );
  };

  const handleDirectCardPayment = async () => {
    setCardError('');
    setError('');

    if (!validateForm()) {
      setCardError('Please fill in all required traveler and contact details above.');
      return;
    }

    if (!termsAccepted) {
      setCardError('Please read and accept the Terms of Service, Privacy Policy, and Refund Policy before proceeding.');
      return;
    }

    if (!cardForm.cardholderName.trim()) {
      const err = 'Enter your cardholder name as shown on card.';
      setFieldErrors({ cardholderName: err });
      setCardError(err);
      return;
    }

    if (!secureCardRef.current?.isReady()) {
      setCardError('Manual payment fields are still loading. Please wait a moment and try again.');
      return;
    }

    if (!secureCardRef.current?.isValid()) {
      setCardError('Please enter the card brand, last four digits, and a valid expiration date.');
      return;
    }

    if (!cardForm.billingAddress.trim()) {
      const err = 'Enter your billing address.';
      setFieldErrors({ billingAddress: err });
      setIsBillingExpanded(true);
      setCardError(err);
      return;
    }

    if (!cardForm.billingCity.trim()) {
      const err = 'Enter your billing city.';
      setFieldErrors({ billingCity: err });
      setIsBillingExpanded(true);
      setCardError(err);
      return;
    }

    if (!cardForm.billingState.trim()) {
      const err = 'Enter a valid state or province.';
      setFieldErrors({ billingState: err });
      setIsBillingExpanded(true);
      setCardError(err);
      return;
    }

    const zipCheck = validatePostalCode(cardForm.billingZip, cardForm.billingCountry || 'United States');
    if (!zipCheck.valid) {
      setFieldErrors({ billingZip: zipCheck.message });
      setIsBillingExpanded(true);
      setCardError(zipCheck.message);
      return;
    }

    if (!cardForm.billingCountry.trim()) {
      const err = 'Select or enter a valid country.';
      setFieldErrors({ billingCountry: err });
      setIsBillingExpanded(true);
      setCardError(err);
      return;
    }

    if (!cardForm.billingPhone.trim()) {
      const err = 'Enter a valid billing phone number.';
      setFieldErrors({ billingPhone: err });
      setIsBillingExpanded(true);
      setCardError(err);
      return;
    }

    setCardProcessing(true);

    try {
      // 1. Create the reservation using only masked manual payment metadata.
      const maskedCard = secureCardRef.current.getMaskedMetadata();
      const pending = await createPendingBookingRecord(maskedCard);
      const bCode = pending.code;

      // 2. Attach the masked manual payment record to this booking. No full card number or security code is transmitted.
      await secureCardRef.current.secureBooking({
        bookingId: pending.id,
        bookingCode: bCode,
        customerEmail: primaryContact.email,
        customerName: `${primaryContact.firstName} ${primaryContact.lastName}`.trim(),
        customerPhone: primaryContact.phone,
        authorizedAmount: Number(calculateTotal().total),
        currency: 'USD',
        purpose: `Flight booking ${bCode}`,
        idempotencyKey: idempotencyKeyRef.current,
        cardholderName: cardForm.cardholderName,
        billingAddress: {
          line1: cardForm.billingAddress,
          line2: cardForm.billingAddress2 || '',
          city: cardForm.billingCity,
          region: cardForm.billingState,
          postalCode: cardForm.billingZip,
          country: cardForm.billingCountry,
        },
      });

      // 3. Only complete checkout after the booking and its secure payment authorization are linked.
      bookingAPI.deleteAbandoned(abandonedSessionKey.current).catch(() => {});
      sessionStorage.removeItem('abandonedSessionKey');

      setPaymentComplete(true);

      const readToken = pending.reservationReadToken || sessionStorage.getItem(`reservationReadToken:${bCode}`) || null;
      const confirmationRef = readToken || bCode;
      navigate(`/booking-confirmed/${encodeURIComponent(confirmationRef)}?email=${encodeURIComponent(primaryContact.email)}`);
    } catch (err) {
      console.error('Secure booking processing error:', err);

      const httpStatus = err?.response?.status || err?.status;
      const backendMessage = err?.response?.data?.error?.message || err?.response?.data?.message;
      const referenceId = idempotencyKeyRef.current;

      if (err?.code === 'ERR_NETWORK' || err?.code === 'ECONNABORTED') {
        setCardError(
          `We couldn't confirm whether your reservation was created due to a network issue. ` +
          `Please check your email or visit "My Bookings" before retrying to avoid a duplicate reservation. ` +
          `Reference ID: ${referenceId}`
        );
      } else if (!err?.response) {
        setCardError(err?.message || `We couldn't securely save your payment authorization. Reference ID: ${referenceId}`);
      } else if (httpStatus === 504 || httpStatus === 503 || httpStatus === 502) {
        setCardError(
          `The server took too long to respond. Your reservation may or may not have been created. ` +
          `Please check your email or "My Bookings" page before retrying. ` +
          `Reference ID: ${referenceId}`
        );
      } else if (httpStatus === 500) {
        setCardError(
          backendMessage ||
          `We couldn't complete your reservation. No confirmed booking was created. ` +
          `Please review your details and try again. Reference ID: ${referenceId}`
        );
      } else if (backendMessage) {
        setCardError(backendMessage);
      } else {
        setCardError(
          err.message ||
          `We couldn't securely process your reservation. Please review your details and try again. ` +
          `Reference ID: ${referenceId}`
        );
      }
    } finally {
      setCardProcessing(false);
    }
  };

  if (!flight) {
    return (
      <div className="booking-page booking-page-loading">
        <Helmet>
          <title>Flight Checkout | FareTransit</title>
        </Helmet>
        <div className="container" style={{ padding: '4rem 1rem', textAlign: 'center' }}>
          <div style={{ maxWidth: '580px', margin: '0 auto', background: '#ffffff', padding: '2.5rem', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
            <i className="fas fa-exclamation-triangle" style={{ fontSize: '3rem', color: '#d97706', marginBottom: '1rem' }}></i>
            <h2 style={{ color: '#1e293b', marginBottom: '0.75rem' }}>No Itinerary Selected</h2>
            <p style={{ color: '#64748b', marginBottom: '1.5rem', lineHeight: '1.6' }}>
              {error || 'We could not prepare this flight for checkout. Loading itinerary details... Please choose another option or search again.'}
            </p>
            <button
              onClick={() => navigate('/')}
              style={{ padding: '0.85rem 1.75rem', borderRadius: '12px', background: '#8b1538', color: '#ffffff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '1rem' }}
            >
              <i className="fas fa-search" style={{ marginRight: '0.5rem' }}></i> Search Flights
            </button>
          </div>
        </div>
      </div>
    );
  }

  const pricing = calculateTotal();
  const isTrain = !!flight.isTrain;

  return (
    <div className="booking-page">
      <Helmet>
        <title>Flight Booking & Passenger Details | FareTransit</title>
      </Helmet>

      {/* ── Premium Booking Hero ──────────────────────────────────── */}
      <section className="booking-hero-premium">
        <div className="booking-hero-premium__inner">
          <p className="booking-hero-premium__eyebrow">
            <i className="fas fa-star"></i>
            <span className="hero-eyebrow-desktop">Exclusive Member Fare · 10% Discount Applied</span>
            <span className="hero-eyebrow-mobile">10% Member Fare Applied</span>
          </p>
          <h1 className="hero-title-desktop">
            Secure Your <span className="highlight-gold">Discounted</span> Flight Reservation
          </h1>
          <h1 className="hero-title-mobile">
            Complete Your Flight Reservation
          </h1>
          <p className="booking-hero-premium__subtitle hero-sub-desktop">
            Review your itinerary below and enter traveler details to lock in your{' '}
            <strong style={{ color: '#f59e0b' }}>10% discounted airfare</strong> with fast
            electronic ticketing and secure, encrypted checkout.
          </p>
          <p className="booking-hero-premium__subtitle hero-sub-mobile">
            Review your itinerary and enter traveler details to submit your reservation.
          </p>

          {/* Desktop badges */}
          <div className="booking-hero-premium__badges hero-badges-desktop">
            <span className="booking-hero-badge booking-hero-badge--discount">
              <i className="fas fa-tag"></i>
              10% Final Seat Discount
            </span>
            <span className="booking-hero-badge">
              <i className="fas fa-shield-alt"></i>
              Secure Card Vault
            </span>
            <span className="booking-hero-badge">
              <i className="fas fa-bolt"></i>
              E-Ticket Delivery
            </span>
            <span className="booking-hero-badge">
              <i className="fas fa-headset"></i>
              24/7 Booking Support
            </span>
          </div>

          {/* Mobile badges (max 2 compact indicators in one row) */}
          <div className="booking-hero-premium__badges hero-badges-mobile">
            <span className="booking-hero-badge">
              <i className="fas fa-shield-alt"></i>
              Secure Checkout
            </span>
            <span className="booking-hero-badge">
              <i className="fas fa-headset"></i>
              Booking Support
            </span>
          </div>
        </div>
      </section>

      {/* ── Itinerary Top Panel ───────────────────────────────────── */}
      <div className="booking-itinerary-top-panel">
        <div className="booking-itinerary-top-panel__inner">
          <p className="booking-itinerary-top-panel__title">
            <i className="fas fa-map-marked-alt"></i>
            YOUR SELECTED ITINERARY
          </p>
          <div className={`booking-itinerary-top-grid ${returnFlight ? 'booking-itinerary-top-grid--roundtrip' : 'booking-itinerary-top-grid--single'}`}>
            <ItineraryCard
              flight={flight}
              label="Outbound Flight"
              labelColor="#1e3a5f"
              isTrain={isTrain}
            />
            {returnFlight && (
              <ItineraryCard
                flight={returnFlight}
                label="Return Flight"
                labelColor="#8b1538"
                isTrain={returnFlight.isTrain}
              />
            )}
            {/* Pricing summary chip */}
            <div className="booking-itinerary-pricing-summary">
              {!pricing.isMock && parseFloat(pricing.discountAmount) > 0 && (
                <p className="booking-itinerary-pricing-summary__original">
                  ${pricing.supplierPrice} USD
                </p>
              )}
              <p className="booking-itinerary-pricing-summary__discounted">
                ${pricing.total} <small style={{ fontSize: '0.7em', fontWeight: 600, color: '#64748b' }}>USD</small>
              </p>
              {!pricing.isMock && parseFloat(pricing.discountAmount) > 0 && (
                <>
                  <span className="booking-itinerary-pricing-summary__chip">
                    <i className="fas fa-tag" style={{ fontSize: '0.55rem' }}></i>
                    10% OFF
                  </span>
                  <p className="booking-itinerary-pricing-summary__saving">
                    You save ${pricing.discountAmount}
                  </p>
                </>
              )}
              <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem', marginBottom: 0 }}>
                {passengersList.length || 1} traveler{(passengersList.length > 1) ? 's' : ''} · All taxes included
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container booking-main-container">
        <div className="booking-layout">
          <div className="booking-form-area">

            {error && (
              <div className="booking-global-error" role="alert">
                <i className="fas fa-exclamation-circle"></i>
                <span>{error}</span>
              </div>
            )}

            <form noValidate onSubmit={(e) => e.preventDefault()}>

              {/* SECTION 1: TRAVELLER DETAILS */}
              <AccordionSection
                id="travellers"
                stepNumber="1"
                title={`1. Traveler Details (${passengersList.length} Passenger${passengersList.length > 1 ? 's' : ''})`}
                isOpen={openSections.travellers}
                onToggle={() => toggleSection('travellers')}
                isComplete={isStep1Complete}
              >
                {passengersList.map((passenger, idx) => (
                  <div
                    key={idx}
                    data-passenger-index={idx}
                    className={`passenger-card-block${expandedPassengers[idx] === false ? ' tfs-pax-collapsed' : ''}${passengerValidationErrors[idx]?.length ? ' tfs-passenger-card-error' : ''}`}
                  >
                    <button
                      type="button"
                      className="passenger-card-title"
                      aria-expanded={expandedPassengers[idx] !== false}
                      onClick={() => setExpandedPassengers(prev => ({ ...prev, [idx]: prev[idx] === false }))}
                    >
                      <span className="passenger-card-title-main">
                        <i className="fas fa-user"></i> Passenger #{idx + 1} ({safeUpper(passenger?.role || 'ADULT')})
                      </span>
                      <span className={`tfs-pax-mobile-state${isPassengerRequiredComplete(passenger) ? ' tfs-pax-state-complete' : ''}`}>
                        {isPassengerRequiredComplete(passenger) ? 'Done' : 'Required'}
                      </span>
                      <i className="fas fa-chevron-down tfs-pax-mobile-chevron" aria-hidden="true"></i>
                    </button>

                    <div className="booking-form-grid booking-form-grid--3col">
                      <label className="booking-form-field">
                        Title *
                        <select
                          value={passenger.title}
                          onChange={(e) => handlePassengerChange(idx, 'title', e.target.value)}
                          aria-required="true"
                        >
                          <option value="">Select</option>
                          <option value="Mr">Mr.</option>
                          <option value="Mrs">Mrs.</option>
                          <option value="Ms">Ms.</option>
                          <option value="Miss">Miss</option>
                          <option value="Master">Master</option>
                          <option value="Dr">Dr.</option>
                        </select>
                      </label>

                      <label className="booking-form-field">
                        First Name *
                        <input
                          type="text"
                          value={passenger.firstName}
                          onChange={(e) => handlePassengerChange(idx, 'firstName', e.target.value)}
                          aria-required="true"
                          placeholder="First Name (as on Passport/ID)"
                        />
                      </label>

                      <label className="booking-form-field">
                        Middle Name
                        <input
                          type="text"
                          value={passenger.middleName}
                          onChange={(e) => handlePassengerChange(idx, 'middleName', e.target.value)}
                          placeholder="Middle Name (optional)"
                        />
                      </label>
                    </div>

                    <div className="booking-form-grid booking-form-grid--3col" style={{ marginTop: '0.85rem' }}>
                      <label className="booking-form-field">
                        Last Name *
                        <input
                          type="text"
                          value={passenger.lastName}
                          onChange={(e) => handlePassengerChange(idx, 'lastName', e.target.value)}
                          aria-required="true"
                          placeholder="Last Name (as on Passport/ID)"
                        />
                      </label>

                      <label className="booking-form-field">
                        Gender *
                        <select
                          value={passenger.gender}
                          onChange={(e) => handlePassengerChange(idx, 'gender', e.target.value)}
                          aria-required="true"
                        >
                          <option value="">Select Gender</option>
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                        </select>
                      </label>

                      <div className="booking-form-field">
                        <label>Date of Birth *</label>
                        <DateOfBirthPicker
                          id={`dob-pass-${idx}`}
                          value={passenger.dateOfBirth}
                          onChange={(val) => handlePassengerChange(idx, 'dateOfBirth', val)}
                          aria-required="true"
                        />
                      </div>
                    </div>

                    <div className="booking-form-grid booking-form-grid--3col" style={{ marginTop: '0.85rem' }}>
                      <div className="booking-form-field">
                        <label>Nationality</label>
                        <CountrySelect
                          id={`nat-pass-${idx}`}
                          value={passenger.nationality}
                          onChange={(val) => handlePassengerChange(idx, 'nationality', val)}
                        />
                      </div>

                      <label className="booking-form-field">
                        Passport Number
                        <input
                          type="text"
                          value={passenger.passportNumber}
                          onChange={(e) => handlePassengerChange(idx, 'passportNumber', safeUpper(e.target.value))}
                          placeholder="Passport Number (if intl)"
                        />
                      </label>

                      <div className="booking-form-field">
                        <label>Passport Expiry</label>
                        <TravelDatePicker
                          id={`passport-exp-${idx}`}
                          value={passenger.passportExpiry}
                          onChange={(val) => handlePassengerChange(idx, 'passportExpiry', val)}
                          placeholder="YYYY-MM-DD"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </AccordionSection>

              {/* SECTION 2: PRIMARY CONTACT INFO */}
              <AccordionSection
                id="contact"
                stepNumber="2"
                title="2. Primary Contact Details"
                isOpen={openSections.contact}
                onToggle={() => toggleSection('contact')}
                isComplete={isStep2Complete}
              >
                <div className="contact-checkbox-row">
                  <input
                    type="checkbox"
                    id="contactSame"
                    checked={contactSameAsTraveller}
                    onChange={(e) => setContactSameAsTraveller(e.target.checked)}
                  />
                  <label htmlFor="contactSame">Primary contact is Passenger #1</label>
                </div>

                <div className="booking-form-grid">
                  <label className="booking-form-field">
                    Contact First Name *
                    <input
                      type="text"
                      value={primaryContact.firstName}
                      onChange={(e) => handlePrimaryContactChange('firstName', e.target.value)}
                      required
                      placeholder="First Name"
                    />
                  </label>

                  <label className="booking-form-field">
                    Contact Last Name *
                    <input
                      type="text"
                      value={primaryContact.lastName}
                      onChange={(e) => handlePrimaryContactChange('lastName', e.target.value)}
                      required
                      placeholder="Last Name"
                    />
                  </label>
                </div>

                <div className="booking-form-grid" style={{ marginTop: '0.85rem' }}>
                  <div className="booking-form-field">
                    <label>Email Address (For E-Ticket) *</label>
                    <EmailInput
                      id="contact-email"
                      value={primaryContact.email}
                      onChange={(val) => handlePrimaryContactChange('email', val)}
                      required
                    />
                  </div>

                  <div className="booking-form-field">
                    <label>Phone Number (For Flight SMS Updates) *</label>
                    <InternationalPhoneInput
                      id="contact-phone"
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
                stepNumber="3"
                title="3. Special Requests & Preferences"
                isOpen={openSections.requests}
                onToggle={() => toggleSection('requests')}
                isComplete={isStep3Complete}
              >
                <div className="booking-form-grid booking-form-grid--3col">
                  <label className="booking-form-field">
                    Meal Preference
                    <select
                      value={specialRequests.mealPreference}
                      onChange={(e) => handleSpecialRequestsChange('mealPreference', e.target.value)}
                    >
                      <option value="none">Standard Airline Meal</option>
                      <option value="vegetarian">Vegetarian / Vegan</option>
                      <option value="kosher">Kosher</option>
                      <option value="halal">Halal</option>
                      <option value="child">Child Meal</option>
                    </select>
                  </label>

                  <label className="booking-form-field">
                    Seat Preference
                    <select
                      value={specialRequests.seatingPreference}
                      onChange={(e) => handleSpecialRequestsChange('seatingPreference', e.target.value)}
                    >
                      <option value="none">No Preference</option>
                      <option value="aisle">Aisle Seat</option>
                      <option value="window">Window Seat</option>
                      <option value="extra_legroom">Extra Legroom (if available)</option>
                    </select>
                  </label>

                  <div className="checkbox-field-wrapper" style={{ marginTop: '1.75rem' }}>
                    <input
                      type="checkbox"
                      id="wheelchair-check"
                      checked={specialRequests.wheelchair}
                      onChange={(e) => handleSpecialRequestsChange('wheelchair', e.target.checked)}
                    />
                    <label htmlFor="wheelchair-check">Request Wheelchair Assistance</label>
                  </div>
                </div>

                <div className="booking-form-field" style={{ marginTop: '0.85rem' }}>
                  <label>Additional Advisory Notes</label>
                  <textarea
                    rows={3}
                    value={specialRequests.notes}
                    onChange={(e) => handleSpecialRequestsChange('notes', e.target.value)}
                    placeholder="Enter special assistance requests, frequent flyer numbers, etc."
                  />
                </div>
              </AccordionSection>

              {/* SECTION 4: UNIFIED SECURE CREDIT / DEBIT CARD PAYMENT */}
              <AccordionSection
                id="payment"
                stepNumber="4"
                title="4. Secure Credit / Debit Card Payment"
                isOpen={openSections.payment}
                onToggle={() => toggleSection('payment')}
                isComplete={isStep4Complete}
              >
                <div className="card-payment-container">
                  {/* Security Notice Header */}
                  <div className="card-payment-header">
                    <div className="security-badge-group">
                      <span className="secure-badge"><i className="fas fa-lock"></i> Encrypted Checkout</span>
                      <span className="secure-badge"><i className="fas fa-shield-alt"></i> Masked Manual Payment Record</span>
                    </div>
                    <div className="card-brand-logos">
                      <i className="fab fa-cc-visa" title="Visa"></i>
                      <i className="fab fa-cc-mastercard" title="Mastercard"></i>
                      <i className="fab fa-cc-amex" title="American Express"></i>
                      <i className="fab fa-cc-discover" title="Discover"></i>
                    </div>
                  </div>

                  {/* Card Details Box */}
                  <div className="card-details-box">
                    <h4 className="payment-sub-heading">
                      <i className="fas fa-credit-card"></i> Card Details
                    </h4>

                    <div className="booking-form-field">
                      <label htmlFor="cardholderName">Cardholder Full Name <span style={{ color: '#dc2626' }}>*</span></label>
                      <input
                        type="text"
                        id="cardholderName"
                        placeholder="e.g. Johnathan Doe"
                        value={cardForm.cardholderName}
                        onChange={(e) => setCardForm({ ...cardForm, cardholderName: e.target.value })}
                        onFocus={handlePaymentFocus}
                        required
                      />
                      {fieldErrors.cardholderName && <span className="field-error-text">{fieldErrors.cardholderName}</span>}
                    </div>

                    <ManualPaymentCardFields ref={secureCardRef} onFocus={handlePaymentFocus} />

                    <p style={{ margin: '0.8rem 0 0', fontSize: '0.82rem', lineHeight: 1.5, color: '#64748b' }}>
                      FareTransit stores only card brand, last four digits, expiration and billing metadata for manual recordkeeping. Full card number and security code are not collected by this form.
                    </p>
                  </div>

                  {/* Billing Address & Phone Section */}
                  {!isBillingExpanded ? (
                    <div className="billing-address-compact-notice">
                      <button
                        type="button"
                        className="btn-add-billing"
                        onClick={() => setIsBillingExpanded(true)}
                      >
                        <i className="fas fa-plus-circle"></i> Add Billing Address
                      </button>
                      <span className="compact-subtext">Enter the billing address associated with this card.</span>
                    </div>
                  ) : (
                    <div className="billing-address-box billing-address-expanded-box">
                      <h4 className="payment-sub-heading" style={{ marginBottom: '0.35rem' }}>
                        <i className="fas fa-map-marker-alt"></i> Billing Address
                      </h4>
                      <p style={{ fontSize: '0.86rem', color: '#64748b', marginBottom: '1.25rem' }}>
                        Enter the billing address associated with this card.
                      </p>

                      {/* Synced Checkboxes */}
                      <div style={{ marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input
                            type="checkbox"
                            id="samePhone"
                            checked={samePhone}
                            onChange={handleSamePhoneChange}
                          />
                          <label htmlFor="samePhone" style={{ fontSize: '0.88rem', color: '#475569', cursor: 'pointer' }}>
                            Use passenger contact phone
                          </label>
                        </div>
                      </div>

                      {/* Billing Phone */}
                      <div className="booking-form-field">
                        <label htmlFor="billingPhone">Billing Phone Number <span style={{ color: '#dc2626' }}>*</span></label>
                        <input
                          type="tel"
                          id="billingPhone"
                          placeholder="e.g. +1 (555) 000-0000"
                          value={cardForm.billingPhone}
                          onChange={(e) => setCardForm({ ...cardForm, billingPhone: e.target.value })}
                          required
                        />
                        {fieldErrors.billingPhone && <span className="field-error-text">{fieldErrors.billingPhone}</span>}
                      </div>

                      {/* Billing Address Line 1 Autocomplete */}
                      <div className="booking-form-field" style={{ marginTop: '0.85rem' }}>
                        <label htmlFor="billingAddress">Billing Address Line 1 <span style={{ color: '#dc2626' }}>*</span></label>
                        <AddressAutocompleteInput
                          id="billingAddress"
                          value={cardForm.billingAddress}
                          onChange={(val) => setCardForm(prev => ({ ...prev, billingAddress: val }))}
                          onSelectSuggestion={(item) => {
                            setCardForm(prev => ({
                              ...prev,
                              billingAddress: item.addressLine1 || prev.billingAddress,
                              billingAddress2: item.addressLine2 || prev.billingAddress2,
                              billingCity: item.city || prev.billingCity,
                              billingState: item.state || prev.billingState,
                              billingZip: item.postalCode || prev.billingZip,
                              billingCountry: item.country || prev.billingCountry || 'United States',
                            }));
                          }}
                          placeholder="e.g. 123 Main Street"
                          required
                        />
                        {fieldErrors.billingAddress && <span className="field-error-text">{fieldErrors.billingAddress}</span>}
                      </div>

                      {/* Billing Address Line 2 */}
                      <div className="booking-form-field" style={{ marginTop: '0.85rem' }}>
                        <label htmlFor="billingAddress2">Billing Address Line 2 (Optional)</label>
                        <input
                          type="text"
                          id="billingAddress2"
                          placeholder="e.g. Apt 4B, Suite 100"
                          value={cardForm.billingAddress2}
                          onChange={(e) => setCardForm({ ...cardForm, billingAddress2: e.target.value })}
                        />
                      </div>

                      {/* City, State, ZIP */}
                      <div className="form-row-three" style={{ marginTop: '0.85rem' }}>
                        <div className="booking-form-field">
                          <label htmlFor="billingCity">City <span style={{ color: '#dc2626' }}>*</span></label>
                          <input
                            type="text"
                            id="billingCity"
                            placeholder="City"
                            value={cardForm.billingCity}
                            onChange={(e) => setCardForm({ ...cardForm, billingCity: e.target.value })}
                            required
                          />
                          {fieldErrors.billingCity && <span className="field-error-text">{fieldErrors.billingCity}</span>}
                        </div>

                        <div className="booking-form-field">
                          <label htmlFor="billingState">State / Province <span style={{ color: '#dc2626' }}>*</span></label>
                          <input
                            type="text"
                            id="billingState"
                            placeholder="State / Province"
                            value={cardForm.billingState}
                            onChange={(e) => setCardForm({ ...cardForm, billingState: e.target.value })}
                            required
                          />
                          {fieldErrors.billingState && <span className="field-error-text">{fieldErrors.billingState}</span>}
                        </div>

                        <div className="booking-form-field">
                          <label htmlFor="billingZip">ZIP / Postal Code <span style={{ color: '#dc2626' }}>*</span></label>
                          <input
                            type="text"
                            id="billingZip"
                            placeholder="ZIP / Postal Code"
                            value={cardForm.billingZip}
                            onChange={(e) => setCardForm({ ...cardForm, billingZip: e.target.value })}
                            required
                          />
                          {fieldErrors.billingZip && <span className="field-error-text">{fieldErrors.billingZip}</span>}
                        </div>
                      </div>

                      {/* Country */}
                      <div className="booking-form-field" style={{ marginTop: '0.85rem' }}>
                        <label htmlFor="billingCountry">Country <span style={{ color: '#dc2626' }}>*</span></label>
                        <select
                          id="billingCountry"
                          value={cardForm.billingCountry}
                          onChange={(e) => setCardForm({ ...cardForm, billingCountry: e.target.value })}
                          required
                          style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                        >
                          <option value="United States">United States</option>
                          <option value="Canada">Canada</option>
                          <option value="United Kingdom">United Kingdom</option>
                          <option value="Australia">Australia</option>
                          <option value="Germany">Germany</option>
                          <option value="France">France</option>
                          <option value="India">India</option>
                          <option value="Other">Other International</option>
                        </select>
                        {fieldErrors.billingCountry && <span className="field-error-text">{fieldErrors.billingCountry}</span>}
                      </div>
                    </div>
                  )}

                  {/* Terms & Conditions Agreement */}
                  <div className="verification-block" style={{ marginTop: '1.25rem', marginBottom: '1.25rem' }}>
                    <div className="verification-inner">
                      <input
                        type="checkbox"
                        id="agree-check"
                        checked={termsAccepted}
                        onChange={(e) => setTermsAccepted(e.target.checked)}
                      />
                      <label htmlFor="agree-check" className="verification-label">
                        I agree to the <Link to="/terms" target="_blank">Terms of Service</Link>, <Link to="/privacy-policy" target="_blank">Privacy Policy</Link>, and <Link to="/refund-policy" target="_blank">Refund Policy</Link>. I verify that the passenger credentials entered above match official photo IDs exactly.
                      </label>
                    </div>
                  </div>

                  {/* Error Notice */}
                  {cardError && (
                    <div className="payment-error-banner" role="alert" style={{ margin: '1rem 0', padding: '0.85rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b' }}>
                      <i className="fas fa-exclamation-circle" style={{ marginRight: '0.5rem' }}></i>
                      <span>{cardError}</span>
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    type="button"
                    onClick={handleDirectCardPayment}
                    className="amtrak-btn amtrak-btn--cta amtrak-btn--full"
                    disabled={cardProcessing || !termsAccepted}
                  >
                    {cardProcessing ? (
                      <span><i className="fas fa-circle-notch fa-spin"></i> Securing Card & Creating Reservation...</span>
                    ) : (
                      <span><i className="fas fa-lock"></i> Complete Secure Booking — ${pricing.total} USD</span>
                    )}
                  </button>
                </div>
              </AccordionSection>

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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
                <h3 className="summary-card-title" style={{ margin: 0 }}>Your Selected Itinerary</h3>
                <button
                  type="button"
                  onClick={() => setIsModifySearchOpen(true)}
                  className="btn-modify-search-trigger"
                  style={{ padding: '6px 14px', fontSize: '0.85rem' }}
                >
                  <i className="fas fa-edit"></i> Modify Search
                </button>
              </div>

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

              <div className="price-breakdown-section">
                <h4>Pricing Breakdown</h4>
                <div className="price-row">
                  <span>Supplier Airfare ({passengersList.length || 1} traveler{passengersList.length > 1 ? 's' : ''})</span>
                  <span style={{ textDecoration: 'line-through', color: '#94a3b8' }}>${pricing.supplierPrice}</span>
                </div>
                {!pricing.isMock && parseFloat(pricing.discountAmount) > 0 && (
                  <div className="price-row price-row--discount" style={{ color: '#047857', fontWeight: 600 }}>
                    <span>Final Seat Subsidy (10% OFF)</span>
                    <span>-${pricing.discountAmount}</span>
                  </div>
                )}
                <div className="price-row price-row--total">
                  <strong>Total Customer Price</strong>
                  <strong className="price-total-amount">${pricing.total} USD</strong>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <ModifySearchModal
        isOpen={isModifySearchOpen}
        onClose={() => setIsModifySearchOpen(false)}
        initialSearch={{
          from: flight?.departure?.airport || flight?.departure_airport || flight?.departureAirport || (typeof flight?.origin === 'object' ? flight?.origin?.code : flight?.origin) || '',
          to: flight?.arrival?.airport || flight?.arrival_airport || flight?.arrivalAirport || (typeof flight?.destination === 'object' ? flight?.destination?.code : flight?.destination) || '',
          origin: flight?.departure || flight?.origin,
          destination: flight?.arrival || flight?.destination,
          selectedFlight: flight,
          departure: flight?.departureDate || flight?.departure?.date || '',
          return: returnFlight?.departureDate || returnFlight?.departure?.date || '',
          tripType: returnFlight ? 'round-trip' : 'one-way',
          adults: passengersList.filter(p => p.role === 'adult').length || 1,
          children: passengersList.filter(p => p.role === 'child').length || 0,
          infants: passengersList.filter(p => p.role === 'infant').length || 0,
          cabinClass: flight?.cabinClass || flight?.class || 'Economy'
        }}
        onUpdateSearch={handleUpdateSearchFromCheckout}
        isCheckoutPage={true}
      />
    </div>
  );
}

export default Booking;
