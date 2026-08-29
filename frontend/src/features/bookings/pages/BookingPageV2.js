import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { bookingAPI } from '../../../shared/api/api';
import ItineraryCard from '../components/ItineraryCard';
import DateOfBirthPicker from '../../../shared/components/DateOfBirthPicker';
import TravelDatePicker from '../../flights/components/TravelDatePicker';
import InternationalPhoneInput from '../../../shared/components/InternationalPhoneInput';
import CountrySelect from '../../../shared/components/CountrySelect';
import EmailInput from '../../../shared/components/EmailInput';
import AddressAutocompleteInput from '../../../shared/components/AddressAutocompleteInput';
import ManualPaymentCardFields from '../../secure-payments/ManualPaymentCardFields';
import ModifySearchModal from '../../flights/components/ModifySearchModal';
import { safeUpper } from '../../../shared/utils/itineraryNormalizer';
import {
  validateDateOfBirth,
  validatePassportExpiry,
  validatePassportNumber,
  validatePostalCode,
} from '../../../shared/utils/validationHelpers';
import { trackGoogleAdsLeadConversion } from '../../../shared/analytics/googleAds';
import './BookingPage.css';
import './BookingStepperV2.css';

const DRAFT_KEY = 'fareTransitBookingDraftV2';

const readSessionJson = (key, fallback = null) => {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const createPassenger = (role = 'adult', infantType = null) => ({
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
});

const buildPassengers = (searchParams = {}) => {
  const adults = Math.max(1, Number.parseInt(searchParams.adults || 1, 10) || 1);
  const children = Math.max(0, Number.parseInt(searchParams.children || 0, 10) || 0);
  const infantsInSeat = Math.max(0, Number.parseInt(searchParams.infantsInSeat || 0, 10) || 0);
  const infantsOnLap = Math.max(0, Number.parseInt(searchParams.infantsOnLap || 0, 10) || 0);
  const legacyInfants = Math.max(0, Number.parseInt(searchParams.infants || 0, 10) || 0);
  const list = [];
  for (let i = 0; i < adults; i += 1) list.push(createPassenger('adult'));
  for (let i = 0; i < children; i += 1) list.push(createPassenger('child'));
  if (infantsInSeat + infantsOnLap > 0) {
    for (let i = 0; i < infantsInSeat; i += 1) list.push(createPassenger('infant', 'IN_SEAT'));
    for (let i = 0; i < infantsOnLap; i += 1) list.push(createPassenger('infant', 'ON_LAP'));
  } else {
    for (let i = 0; i < legacyInfants; i += 1) list.push(createPassenger('infant', 'ON_LAP'));
  }
  return list;
};

const flightFingerprint = (flight) => [
  flight?.id,
  flight?.flightNumber,
  flight?.flight_number,
  flight?.departureDate,
  flight?.departure?.date,
  flight?.departure?.airport,
  flight?.arrival?.airport,
].filter(Boolean).join('|');

const airportCode = (point, fallback = '') => {
  if (!point) return fallback;
  if (typeof point === 'string') return point;
  return point.airport || point.code || point.iata || fallback;
};

function BookingPageV2({ initialJourneyPayload = null }) {
  const navigate = useNavigate();
  const secureCardRef = useRef(null);
  const pendingBookingId = useRef(null);
  const pendingBookingCode = useRef(null);
  const reservationReadToken = useRef(null);
  const idempotencyKeyRef = useRef(
    sessionStorage.getItem('checkoutSessionToken')
      ? `checkout:${sessionStorage.getItem('checkoutSessionToken')}`
      : `idemp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  );
  const abandonedSessionKey = useRef(
    sessionStorage.getItem('abandonedSessionKey') || `ab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  );

  const selectedFlight = initialJourneyPayload?.selectedFlight || readSessionJson('selectedFlight', null);
  const selectedReturnFlight = initialJourneyPayload?.returnFlight
    || readSessionJson('returnFlight', null)
    || readSessionJson('selectedReturnFlight', null);
  const initialSearchParams = initialJourneyPayload?.searchParams || readSessionJson('searchParams', {});
  const savedDraft = readSessionJson(DRAFT_KEY, null);
  const canRestoreDraft = savedDraft?.flightFingerprint
    && savedDraft.flightFingerprint === flightFingerprint(selectedFlight);

  const [flight, setFlight] = useState(selectedFlight);
  const [returnFlight, setReturnFlight] = useState(selectedReturnFlight);
  const [currentStep, setCurrentStep] = useState(canRestoreDraft ? Math.min(3, Math.max(1, Number(savedDraft.currentStep) || 1)) : 1);
  const [passengersList, setPassengersList] = useState(
    canRestoreDraft && Array.isArray(savedDraft.passengersList) && savedDraft.passengersList.length
      ? savedDraft.passengersList
      : buildPassengers(initialSearchParams)
  );
  const [primaryContact, setPrimaryContact] = useState(canRestoreDraft ? savedDraft.primaryContact : {
    firstName: '', lastName: '', email: '', phone: '',
  });
  const [contactSameAsTraveller, setContactSameAsTraveller] = useState(Boolean(canRestoreDraft && savedDraft.contactSameAsTraveller));
  const [specialRequests, setSpecialRequests] = useState(canRestoreDraft ? savedDraft.specialRequests : {
    wheelchair: false,
    mealPreference: 'none',
    seatingPreference: 'none',
    notes: '',
  });
  const [cardForm, setCardForm] = useState(canRestoreDraft ? savedDraft.cardForm : {
    cardholderName: '',
    billingPhone: '',
    billingAddress: '',
    billingAddress2: '',
    billingCity: '',
    billingState: '',
    billingZip: '',
    billingCountry: 'United States',
  });
  const [samePhone, setSamePhone] = useState(Boolean(canRestoreDraft && savedDraft.samePhone));
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState('');
  const [cardError, setCardError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [passengerValidationErrors, setPassengerValidationErrors] = useState({});
  const [isModifySearchOpen, setIsModifySearchOpen] = useState(false);

  const pricing = useMemo(() => {
    const isMock = Boolean(flight?.isMock || returnFlight?.isMock);
    const count = Math.max(1, passengersList.length || 1);
    const outFinal = Number.parseFloat(flight?.price?.finalPrice || flight?.price?.total || 0) || 0;
    const outOriginal = Number.parseFloat(flight?.price?.originalApiPrice || outFinal) || outFinal;
    const outDiscount = isMock ? 0 : Number.parseFloat(flight?.price?.discountAmount ?? (outOriginal - outFinal)) || 0;
    const retFinal = returnFlight ? Number.parseFloat(returnFlight?.price?.finalPrice || returnFlight?.price?.total || 0) || 0 : 0;
    const retOriginal = returnFlight ? Number.parseFloat(returnFlight?.price?.originalApiPrice || retFinal) || retFinal : 0;
    const retDiscount = returnFlight && !isMock ? Number.parseFloat(returnFlight?.price?.discountAmount ?? (retOriginal - retFinal)) || 0 : 0;
    return {
      supplierPrice: ((outOriginal + retOriginal) * count).toFixed(2),
      discountAmount: ((outDiscount + retDiscount) * count).toFixed(2),
      discountPercent: isMock ? 0 : 10,
      total: ((outFinal + retFinal) * count).toFixed(2),
      isMock,
    };
  }, [flight, returnFlight, passengersList.length]);

  useEffect(() => {
    sessionStorage.setItem('abandonedSessionKey', abandonedSessionKey.current);
    if (!flight) return;
    bookingAPI.saveAbandoned({
      sessionKey: abandonedSessionKey.current,
      selectedFlight: flight,
      returnFlight,
      travellerInfo: passengersList,
      contactInfo: primaryContact,
      currentStep: ['travellers', 'contact', 'checkout'][currentStep - 1],
    }).catch(() => {});
  }, []); // intentional first checkout snapshot

  useEffect(() => {
    if (!flight) return;
    const draft = {
      flightFingerprint: flightFingerprint(flight),
      currentStep,
      passengersList,
      primaryContact,
      contactSameAsTraveller,
      specialRequests,
      cardForm,
      samePhone,
      savedAt: new Date().toISOString(),
    };
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    bookingAPI.saveAbandoned({
      sessionKey: abandonedSessionKey.current,
      selectedFlight: flight,
      returnFlight,
      travellerInfo: passengersList,
      contactInfo: primaryContact,
      currentStep: ['travellers', 'contact', 'checkout'][currentStep - 1],
    }).catch(() => {});
  }, [currentStep, passengersList, primaryContact, contactSameAsTraveller, specialRequests, cardForm, samePhone, flight, returnFlight]);

  useEffect(() => {
    if (!contactSameAsTraveller || !passengersList[0]) return;
    setPrimaryContact((prev) => ({
      ...prev,
      firstName: passengersList[0].firstName || '',
      lastName: passengersList[0].lastName || '',
    }));
  }, [contactSameAsTraveller, passengersList]);

  useEffect(() => {
    const handleBookingBack = (event) => {
      if (currentStep <= 1) return;
      event.preventDefault();
      setError('');
      setCardError('');
      setCurrentStep((step) => Math.max(1, step - 1));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    window.addEventListener('faretransit-booking-back', handleBookingBack);
    return () => window.removeEventListener('faretransit-booking-back', handleBookingBack);
  }, [currentStep]);

  const updatePassenger = (index, field, value) => {
    let nextValue = value;
    if (field === 'title') nextValue = String(value || '').replace(/\.$/, '');
    if (field === 'gender') nextValue = String(value || '').toLowerCase();
    if (field === 'passportNumber') nextValue = safeUpper(value);
    setPassengersList((prev) => prev.map((p, idx) => idx === index ? { ...p, [field]: nextValue } : p));
    setPassengerValidationErrors((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
    setError('');
  };

  const validateTravellers = () => {
    const required = [['title', 'Title'], ['firstName', 'First Name'], ['lastName', 'Last Name'], ['gender', 'Gender'], ['dateOfBirth', 'Date of Birth']];
    const depDate = flight?.departureDate || flight?.departure?.date || '';
    for (let i = 0; i < passengersList.length; i += 1) {
      const p = passengersList[i];
      const missing = required.filter(([key]) => !String(p?.[key] || '').trim()).map(([, label]) => label);
      if (missing.length) {
        setPassengerValidationErrors({ [i]: missing });
        setError(`Passenger #${i + 1}: Please complete ${missing.join(', ')}.`);
        document.querySelector(`[data-passenger-index="${i}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return false;
      }
      const dobCheck = validateDateOfBirth(p.dateOfBirth, p.role || 'adult', depDate);
      if (!dobCheck.valid) {
        setPassengerValidationErrors({ [i]: [dobCheck.message] });
        setError(`Passenger #${i + 1}: ${dobCheck.message}`);
        return false;
      }
      if (p.passportNumber) {
        const passportCheck = validatePassportNumber(p.passportNumber);
        if (!passportCheck.valid) {
          setPassengerValidationErrors({ [i]: [passportCheck.message] });
          setError(`Passenger #${i + 1}: ${passportCheck.message}`);
          return false;
        }
      }
      if (p.passportExpiry) {
        const expiryCheck = validatePassportExpiry(p.passportExpiry, depDate);
        if (!expiryCheck.valid) {
          setPassengerValidationErrors({ [i]: [expiryCheck.message] });
          setError(`Passenger #${i + 1}: ${expiryCheck.message}`);
          return false;
        }
      }
    }
    setPassengerValidationErrors({});
    return true;
  };

  const validateContact = () => {
    if (!primaryContact.firstName.trim() || !primaryContact.lastName.trim() || !primaryContact.email.trim() || !primaryContact.phone.trim()) {
      setError('Please complete first name, last name, email and phone number for the primary contact.');
      return false;
    }
    if (!/^\S+@\S+\.\S+$/.test(primaryContact.email.trim())) {
      setError('Enter a valid email address for the primary contact.');
      return false;
    }
    return true;
  };

  const validateCheckout = () => {
    const nextErrors = {};
    if (!cardForm.cardholderName.trim()) nextErrors.cardholderName = 'Enter the cardholder name.';
    if (!cardForm.billingPhone.trim()) nextErrors.billingPhone = 'Enter the billing phone number.';
    if (!cardForm.billingAddress.trim()) nextErrors.billingAddress = 'Enter the billing address.';
    if (!cardForm.billingCity.trim()) nextErrors.billingCity = 'Enter the billing city.';
    if (!cardForm.billingState.trim()) nextErrors.billingState = 'Enter the billing state or province.';
    if (!cardForm.billingCountry.trim()) nextErrors.billingCountry = 'Select the billing country.';
    const zipCheck = validatePostalCode(cardForm.billingZip, cardForm.billingCountry || 'United States');
    if (!zipCheck.valid) nextErrors.billingZip = zipCheck.message;
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setCardError(Object.values(nextErrors)[0]);
      return false;
    }
    if (!secureCardRef.current?.isReady()) {
      setCardError('Secure card fields are still loading. Please wait a moment and try again.');
      return false;
    }
    if (!secureCardRef.current?.isValid()) {
      setCardError('Enter a valid card number, expiration date and security code.');
      return false;
    }
    if (!termsAccepted) {
      setCardError('Please accept the Terms of Service, Privacy Policy and Refund Policy.');
      return false;
    }
    return true;
  };

  const goToStep = (step) => {
    setError('');
    setCardError('');
    if (step === 2 && !validateTravellers()) return;
    if (step === 3 && (!validateTravellers() || !validateContact())) return;
    setCurrentStep(step);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const createPendingBooking = async () => {
    if (pendingBookingId.current) {
      return { id: pendingBookingId.current, code: pendingBookingCode.current, reservationReadToken: reservationReadToken.current };
    }
    const customerName = `${primaryContact.firstName} ${primaryContact.lastName}`.trim();
    const paymentMethod = {
      cardholderName: cardForm.cardholderName || customerName,
      billingPhone: cardForm.billingPhone,
      billingEmail: primaryContact.email,
      billingAddressLine1: cardForm.billingAddress,
      billingAddressLine2: cardForm.billingAddress2 || '',
      billingCity: cardForm.billingCity,
      billingState: cardForm.billingState,
      billingPostalCode: cardForm.billingZip,
      billingCountry: cardForm.billingCountry,
    };
    const response = await bookingAPI.create({
      idempotency_key: idempotencyKeyRef.current,
      customerName,
      email: primaryContact.email,
      phone: primaryContact.phone,
      passengers: passengersList,
      flight: { ...flight, returnFlight, specialRequests },
      returnFlight,
      originalApiPrice: pricing.supplierPrice,
      supplier_price: pricing.supplierPrice,
      discount_percent: pricing.discountPercent,
      discount_amount: pricing.discountAmount,
      customer_price: pricing.total,
      displayedWebsitePrice: pricing.total,
      paymentStatus: 'PENDING',
      payment_provider: 'nmi',
      paymentMethod,
      cardholderName: paymentMethod.cardholderName,
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
      isMock: pricing.isMock,
    });
    if (!response?.success) throw new Error(response?.error?.message || response?.message || 'We could not create your reservation.');
    const id = response.data?.id || response.id;
    const code = response.data?.confirmation_code || response.data?.confirmationCode || response.confirmation_code || response.confirmationCode;
    if (!id || !code) throw new Error('The reservation was created without a usable booking reference. Please contact support.');
    pendingBookingId.current = id;
    pendingBookingCode.current = code;
    reservationReadToken.current = response?.reservationReadToken || response?.data?.reservationReadToken || null;
    trackGoogleAdsLeadConversion({ bookingReference: code, value: 1, currency: 'USD' }).catch(() => {});
    return { id, code, reservationReadToken: reservationReadToken.current };
  };

  const submitReservation = async () => {
    setError('');
    setCardError('');
    if (!validateTravellers() || !validateContact() || !validateCheckout()) return;
    setProcessing(true);
    try {
      const pending = await createPendingBooking();
      await secureCardRef.current.secureBooking({
        bookingId: pending.id,
        bookingCode: pending.code,
        customerEmail: primaryContact.email,
        customerName: `${primaryContact.firstName} ${primaryContact.lastName}`.trim(),
        customerPhone: primaryContact.phone,
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
      bookingAPI.deleteAbandoned(abandonedSessionKey.current).catch(() => {});
      sessionStorage.removeItem('abandonedSessionKey');
      sessionStorage.removeItem(DRAFT_KEY);
      const confirmationRef = pending.reservationReadToken || pending.code;
      navigate(`/booking-confirmed/${encodeURIComponent(confirmationRef)}?email=${encodeURIComponent(primaryContact.email)}`);
    } catch (err) {
      console.error('Reservation / NMI vault error:', err);
      const backendMessage = err?.response?.data?.error?.message || err?.message;
      setCardError(backendMessage || `We could not securely save the payment method. Your reference is ${idempotencyKeyRef.current}.`);
    } finally {
      setProcessing(false);
    }
  };

  const handleUpdateSearch = (updatedParams) => {
    sessionStorage.removeItem('selectedFlight');
    sessionStorage.removeItem('selectedReturnFlight');
    sessionStorage.removeItem(DRAFT_KEY);
    const adults = Number.parseInt(updatedParams.adults || 1, 10);
    const children = Number.parseInt(updatedParams.children || 0, 10);
    const infants = Number.parseInt(updatedParams.infants || 0, 10);
    setIsModifySearchOpen(false);
    navigate(`/search?from=${encodeURIComponent(updatedParams.from)}&to=${encodeURIComponent(updatedParams.to)}&departure=${encodeURIComponent(updatedParams.departure)}&return=${encodeURIComponent(updatedParams.return || '')}&tripType=${encodeURIComponent(updatedParams.tripType)}&adults=${adults}&children=${children}&infants=${infants}&cabin=${encodeURIComponent(updatedParams.cabinClass)}`);
  };

  if (!flight) {
    return (
      <div className="booking-page booking-v2-empty">
        <Helmet><title>Flight Checkout | FareTransit</title></Helmet>
        <div className="booking-v2-empty__card">
          <i className="fas fa-exclamation-triangle" aria-hidden="true" />
          <h2>No Itinerary Selected</h2>
          <p>We could not restore the selected itinerary. Please search again.</p>
          <button type="button" className="booking-v2-primary" onClick={() => navigate('/')}>Search Flights</button>
        </div>
      </div>
    );
  }

  const origin = airportCode(flight?.departure, flight?.departure_airport || flight?.departureAirport || flight?.origin?.code || flight?.origin || '—');
  const destination = airportCode(flight?.arrival, flight?.arrival_airport || flight?.arrivalAirport || flight?.destination?.code || flight?.destination || '—');
  const finalDestination = returnFlight ? origin : destination;
  const stepLabels = ['Traveller Details', 'Contact & Assistance', 'Checkout'];

  return (
    <div className="booking-page booking-page-v2">
      <Helmet><title>Complete Flight Reservation | FareTransit</title></Helmet>

      <div className="booking-itinerary-top-panel booking-v2-nav-panel">
        <div className="booking-itinerary-top-panel__inner booking-v2-nav-inner">
          <div className="booking-stepper-v2" aria-label="Booking progress">
            {stepLabels.map((label, index) => {
              const step = index + 1;
              const state = currentStep === step ? 'active' : currentStep > step ? 'complete' : 'upcoming';
              return (
                <React.Fragment key={label}>
                  <button
                    type="button"
                    className={`booking-step-v2 booking-step-v2--${state}`}
                    onClick={() => step < currentStep && goToStep(step)}
                    disabled={step > currentStep}
                    aria-current={currentStep === step ? 'step' : undefined}
                  >
                    <span className="booking-step-v2__dot">{currentStep > step ? '✓' : step}</span>
                    <span className="booking-step-v2__label">{label}</span>
                  </button>
                  {step < 3 && <span className={`booking-step-v2__line${currentStep > step ? ' is-complete' : ''}`} />}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      <main className="booking-v2-shell">
        {(error || cardError) && (
          <div className="booking-global-error booking-v2-error" role="alert">
            <i className="fas fa-exclamation-circle" aria-hidden="true" />
            <span>{cardError || error}</span>
          </div>
        )}

        {currentStep === 1 && (
          <>
            <section className="booking-v2-section booking-v2-itinerary-section">
              <div className="booking-v2-section__header">
                <div>
                  <p className="booking-v2-eyebrow"><i className="fas fa-map-marked-alt" /> Your Selected Itinerary</p>
                  <h1>Review your flight</h1>
                </div>
                <button type="button" className="booking-v2-secondary" onClick={() => setIsModifySearchOpen(true)}>
                  <i className="fas fa-pen" aria-hidden="true" /> Modify Search
                </button>
              </div>

              <div className="booking-v2-fare-card">
                <div><span>Today's Fare</span><strong>${pricing.total} <small>USD</small></strong></div>
                <p>Per traveler <b>${(Number(pricing.total) / Math.max(1, passengersList.length)).toFixed(2)}</b> × {passengersList.length || 1} traveler{passengersList.length === 1 ? '' : 's'} = <b>${pricing.total} total</b></p>
              </div>

              <div className={`booking-itinerary-top-grid ${returnFlight ? 'booking-itinerary-top-grid--roundtrip' : 'booking-itinerary-top-grid--single'}`}>
                <ItineraryCard flight={flight} label="Outbound Flight" labelColor="#1e3a5f" isTrain={Boolean(flight?.isTrain)} />
                {returnFlight && <ItineraryCard flight={returnFlight} label="Return Flight" labelColor="#8b1538" isTrain={Boolean(returnFlight?.isTrain)} />}
              </div>
            </section>

            <section className="booking-v2-section" id="travellers">
              <div className="booking-v2-section__header booking-v2-section__header--simple">
                <div><p className="booking-v2-eyebrow">1. Traveller Details</p><h2>{passengersList.length} Passenger{passengersList.length === 1 ? '' : 's'}</h2></div>
              </div>

              <div className="booking-v2-passenger-list">
                {passengersList.map((passenger, idx) => (
                  <div key={idx} data-passenger-index={idx} className={`passenger-card-block booking-v2-passenger${passengerValidationErrors[idx]?.length ? ' tfs-passenger-card-error' : ''}`}>
                    <div className="passenger-card-title booking-v2-passenger__title">
                      <span><i className="fas fa-user" /> Passenger #{idx + 1} ({safeUpper(passenger.role || 'adult')})</span>
                      <span className="booking-v2-required">Required</span>
                    </div>
                    <div className="booking-form-grid booking-form-grid--3col">
                      <label className="booking-form-field">Title *
                        <select value={passenger.title} onChange={(e) => updatePassenger(idx, 'title', e.target.value)}>
                          <option value="">Select</option><option value="Mr">Mr.</option><option value="Mrs">Mrs.</option><option value="Ms">Ms.</option><option value="Miss">Miss</option><option value="Master">Master</option><option value="Dr">Dr.</option>
                        </select>
                      </label>
                      <label className="booking-form-field">First Name *
                        <input value={passenger.firstName} onChange={(e) => updatePassenger(idx, 'firstName', e.target.value)} placeholder="First Name (as on Passport/ID)" />
                      </label>
                      <label className="booking-form-field">Middle Name
                        <input value={passenger.middleName} onChange={(e) => updatePassenger(idx, 'middleName', e.target.value)} placeholder="Middle Name (optional)" />
                      </label>
                    </div>
                    <div className="booking-form-grid booking-form-grid--3col booking-v2-grid-gap">
                      <label className="booking-form-field">Last Name *
                        <input value={passenger.lastName} onChange={(e) => updatePassenger(idx, 'lastName', e.target.value)} placeholder="Last Name (as on Passport/ID)" />
                      </label>
                      <label className="booking-form-field">Gender *
                        <select value={passenger.gender} onChange={(e) => updatePassenger(idx, 'gender', e.target.value)}><option value="">Select Gender</option><option value="male">Male</option><option value="female">Female</option></select>
                      </label>
                      <div className="booking-form-field"><label>Date of Birth *</label><DateOfBirthPicker id={`dob-pass-${idx}`} value={passenger.dateOfBirth} onChange={(value) => updatePassenger(idx, 'dateOfBirth', value)} /></div>
                    </div>
                    <div className="booking-form-grid booking-form-grid--3col booking-v2-grid-gap">
                      <div className="booking-form-field"><label>Nationality</label><CountrySelect id={`nat-pass-${idx}`} value={passenger.nationality} onChange={(value) => updatePassenger(idx, 'nationality', value)} /></div>
                      <label className="booking-form-field">Passport Number
                        <input value={passenger.passportNumber} onChange={(e) => updatePassenger(idx, 'passportNumber', e.target.value)} placeholder="Passport Number (if international)" />
                      </label>
                      <div className="booking-form-field"><label>Passport Expiry</label><TravelDatePicker id={`passport-exp-${idx}`} value={passenger.passportExpiry} onChange={(value) => updatePassenger(idx, 'passportExpiry', value)} placeholder="YYYY-MM-DD" /></div>
                    </div>
                    {passengerValidationErrors[idx]?.length > 0 && <p className="booking-v2-inline-error">Please check: {passengerValidationErrors[idx].join(', ')}</p>}
                  </div>
                ))}
              </div>

              <div className="booking-v2-actions booking-v2-actions--end">
                <button type="button" className="booking-v2-primary" onClick={() => goToStep(2)}>Continue <span aria-hidden="true">→</span></button>
              </div>
            </section>
          </>
        )}

        {currentStep === 2 && (
          <section className="booking-v2-section">
            <div className="booking-v2-section__header booking-v2-section__header--simple">
              <div><p className="booking-v2-eyebrow">2. Contact & Assistance</p><h1>How should we contact you?</h1></div>
            </div>

            <div className="booking-v2-subcard">
              <h2>Primary Contact Details</h2>
              <label className="booking-v2-toggle-row"><input type="checkbox" checked={contactSameAsTraveller} onChange={(e) => setContactSameAsTraveller(e.target.checked)} /><span>Use Passenger #1 as primary contact</span></label>
              <div className="booking-form-grid booking-v2-grid-gap">
                <label className="booking-form-field">Contact First Name *<input value={primaryContact.firstName} onChange={(e) => setPrimaryContact((prev) => ({ ...prev, firstName: e.target.value }))} /></label>
                <label className="booking-form-field">Contact Last Name *<input value={primaryContact.lastName} onChange={(e) => setPrimaryContact((prev) => ({ ...prev, lastName: e.target.value }))} /></label>
              </div>
              <div className="booking-form-grid booking-v2-grid-gap">
                <div className="booking-form-field"><label>Email Address (For E-Ticket) *</label><EmailInput id="contact-email" value={primaryContact.email} onChange={(value) => setPrimaryContact((prev) => ({ ...prev, email: value }))} required /></div>
                <div className="booking-form-field"><label>Phone Number (For Flight SMS Updates) *</label><InternationalPhoneInput id="contact-phone" value={primaryContact.phone} onChange={(value) => setPrimaryContact((prev) => ({ ...prev, phone: value }))} required /></div>
              </div>
            </div>

            <div className="booking-v2-subcard">
              <h2>Special Requests & Preferences</h2>
              <div className="booking-form-grid booking-v2-grid-gap">
                <label className="booking-form-field">Meal Preference
                  <select value={specialRequests.mealPreference} onChange={(e) => setSpecialRequests((prev) => ({ ...prev, mealPreference: e.target.value }))}>
                    <option value="none">Standard Airline Meal</option><option value="vegetarian">Vegetarian / Vegan</option><option value="kosher">Kosher</option><option value="halal">Halal</option><option value="child">Child Meal</option>
                  </select>
                </label>
                <label className="booking-form-field">Seat Preference
                  <select value={specialRequests.seatingPreference} onChange={(e) => setSpecialRequests((prev) => ({ ...prev, seatingPreference: e.target.value }))}>
                    <option value="none">No Preference</option><option value="aisle">Aisle Seat</option><option value="window">Window Seat</option><option value="extra_legroom">Extra Legroom (if available)</option>
                  </select>
                </label>
              </div>
              <label className="booking-v2-toggle-row booking-v2-grid-gap"><input type="checkbox" checked={specialRequests.wheelchair} onChange={(e) => setSpecialRequests((prev) => ({ ...prev, wheelchair: e.target.checked }))} /><span>Request Wheelchair Assistance</span></label>
              <label className="booking-form-field booking-v2-grid-gap">Additional Airline / Assistance Requests
                <textarea rows={4} value={specialRequests.notes} onChange={(e) => setSpecialRequests((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Special assistance, frequent flyer details, or other requests" />
              </label>
            </div>

            <div className="booking-v2-actions">
              <button type="button" className="booking-v2-icon-back" aria-label="Previous step" title="Previous step" onClick={() => goToStep(1)}>‹</button>
              <button type="button" className="booking-v2-primary" onClick={() => goToStep(3)}>Continue to Checkout <span aria-hidden="true">→</span></button>
            </div>
          </section>
        )}

        {currentStep === 3 && (
          <section className="booking-v2-section">
            <div className="booking-v2-section__header booking-v2-section__header--simple">
              <div><p className="booking-v2-eyebrow">3. Secure Checkout</p><h1>Save your payment method</h1></div>
            </div>

            <div className="booking-v2-checkout-summary">
              <div><span>Trip</span><strong>{origin} → {destination}{returnFlight ? ` → ${finalDestination}` : ''}</strong></div>
              <div><span>Travelers</span><strong>{passengersList.length}</strong></div>
              <div><span>Reservation total</span><strong>${pricing.total} USD</strong></div>
            </div>

            <div className="booking-v2-subcard">
              <div className="booking-v2-secure-heading">
                <div><i className="fas fa-lock" aria-hidden="true" /><div><h2>Card Details</h2><p>Encrypted NMI-hosted fields</p></div></div>
                <div className="booking-v2-card-brands"><i className="fab fa-cc-visa" /><i className="fab fa-cc-mastercard" /><i className="fab fa-cc-amex" /><i className="fab fa-cc-discover" /></div>
              </div>
              <label className="booking-form-field">Cardholder Full Name *
                <input id="cardholderName" value={cardForm.cardholderName} onChange={(e) => setCardForm((prev) => ({ ...prev, cardholderName: e.target.value }))} placeholder="Name as shown on card" autoComplete="cc-name" />
                {fieldErrors.cardholderName && <span className="field-error-text">{fieldErrors.cardholderName}</span>}
              </label>
              <ManualPaymentCardFields ref={secureCardRef} />
            </div>

            <div className="booking-v2-subcard">
              <h2>Billing Address</h2>
              <label className="booking-v2-toggle-row"><input type="checkbox" checked={samePhone} onChange={(e) => { const checked = e.target.checked; setSamePhone(checked); if (checked) setCardForm((prev) => ({ ...prev, billingPhone: primaryContact.phone })); }} /><span>Use primary contact phone</span></label>
              <label className="booking-form-field booking-v2-grid-gap">Billing Phone Number *
                <input type="tel" value={cardForm.billingPhone} onChange={(e) => setCardForm((prev) => ({ ...prev, billingPhone: e.target.value }))} placeholder="e.g. +1 (555) 000-0000" />
                {fieldErrors.billingPhone && <span className="field-error-text">{fieldErrors.billingPhone}</span>}
              </label>
              <div className="booking-form-field booking-v2-grid-gap"><label>Billing Address Line 1 *</label><AddressAutocompleteInput id="billingAddress" value={cardForm.billingAddress} onChange={(value) => setCardForm((prev) => ({ ...prev, billingAddress: value }))} onSelectSuggestion={(item) => setCardForm((prev) => ({ ...prev, billingAddress: item.addressLine1 || prev.billingAddress, billingAddress2: item.addressLine2 || prev.billingAddress2, billingCity: item.city || prev.billingCity, billingState: item.state || prev.billingState, billingZip: item.postalCode || prev.billingZip, billingCountry: item.country || prev.billingCountry || 'United States' }))} placeholder="e.g. 123 Main Street" required />{fieldErrors.billingAddress && <span className="field-error-text">{fieldErrors.billingAddress}</span>}</div>
              <label className="booking-form-field booking-v2-grid-gap">Billing Address Line 2 (Optional)<input value={cardForm.billingAddress2} onChange={(e) => setCardForm((prev) => ({ ...prev, billingAddress2: e.target.value }))} placeholder="Apt, suite, unit" /></label>
              <div className="form-row-three booking-v2-grid-gap">
                <label className="booking-form-field">City *<input value={cardForm.billingCity} onChange={(e) => setCardForm((prev) => ({ ...prev, billingCity: e.target.value }))} />{fieldErrors.billingCity && <span className="field-error-text">{fieldErrors.billingCity}</span>}</label>
                <label className="booking-form-field">State / Province *<input value={cardForm.billingState} onChange={(e) => setCardForm((prev) => ({ ...prev, billingState: e.target.value }))} />{fieldErrors.billingState && <span className="field-error-text">{fieldErrors.billingState}</span>}</label>
                <label className="booking-form-field">ZIP / Postal Code *<input value={cardForm.billingZip} onChange={(e) => setCardForm((prev) => ({ ...prev, billingZip: e.target.value }))} />{fieldErrors.billingZip && <span className="field-error-text">{fieldErrors.billingZip}</span>}</label>
              </div>
              <label className="booking-form-field booking-v2-grid-gap">Country *
                <select value={cardForm.billingCountry} onChange={(e) => setCardForm((prev) => ({ ...prev, billingCountry: e.target.value }))}>
                  <option value="United States">United States</option><option value="Canada">Canada</option><option value="United Kingdom">United Kingdom</option><option value="Australia">Australia</option><option value="Germany">Germany</option><option value="France">France</option><option value="India">India</option><option value="Other">Other International</option>
                </select>
                {fieldErrors.billingCountry && <span className="field-error-text">{fieldErrors.billingCountry}</span>}
              </label>
            </div>

            <div className="booking-v2-no-charge-notice">
              <i className="fas fa-shield-alt" aria-hidden="true" />
              <div><strong>No charge will be made at this time.</strong><p>Your payment method will be securely saved with your reservation. A FareTransit travel specialist will contact you to confirm availability, itinerary and final pricing before payment is processed.</p></div>
            </div>

            <label className="booking-v2-terms">
              <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} />
              <span>I agree to the <Link to="/terms" target="_blank">Terms of Service</Link>, <Link to="/privacy-policy" target="_blank">Privacy Policy</Link>, and <Link to="/refund-policy" target="_blank">Refund Policy</Link>. I verify that passenger details match official identification.</span>
            </label>

            <div className="booking-v2-actions">
              <button type="button" className="booking-v2-icon-back" aria-label="Previous step" title="Previous step" onClick={() => goToStep(2)}>‹</button>
              <button type="button" className="booking-v2-primary booking-v2-primary--checkout" onClick={submitReservation} disabled={processing || !termsAccepted}>
                {processing ? <><i className="fas fa-circle-notch fa-spin" /> Saving Reservation…</> : <><i className="fas fa-lock" /> Confirm Reservation & Save Payment Method</>}
              </button>
            </div>
            <p className="booking-v2-submit-note">No authorization, capture, or sale is submitted when you confirm this reservation.</p>
          </section>
        )}
      </main>

      <ModifySearchModal
        isOpen={isModifySearchOpen}
        onClose={() => setIsModifySearchOpen(false)}
        initialSearch={{
          from: origin,
          to: destination,
          origin: flight?.departure || flight?.origin,
          destination: flight?.arrival || flight?.destination,
          selectedFlight: flight,
          departure: flight?.departureDate || flight?.departure?.date || '',
          return: returnFlight?.departureDate || returnFlight?.departure?.date || '',
          tripType: returnFlight ? 'round-trip' : 'one-way',
          adults: passengersList.filter((p) => p.role === 'adult').length || 1,
          children: passengersList.filter((p) => p.role === 'child').length,
          infants: passengersList.filter((p) => p.role === 'infant').length,
          cabinClass: flight?.cabinClass || flight?.class || 'Economy',
        }}
        onUpdateSearch={handleUpdateSearch}
        isCheckoutPage
      />
    </div>
  );
}

export default BookingPageV2;
