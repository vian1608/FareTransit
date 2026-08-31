import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { bookingAPI } from '../../../shared/api/api';
import journeySessionAPI from '../../../shared/api/journeySessionApi';
import ItineraryCard from '../components/ItineraryCard';
import PaymentCardEntry from '../components/PaymentCardEntry';
import DateOfBirthPicker from '../../../shared/components/DateOfBirthPicker';
import TravelDatePicker from '../../flights/components/TravelDatePicker';
import InternationalPhoneInput from '../../../shared/components/InternationalPhoneInput';
import CountrySelect from '../../../shared/components/CountrySelect';
import EmailInput from '../../../shared/components/EmailInput';
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
import './BookingPageV3.css';

const DRAFT_KEY = 'fareTransitBookingDraftV3';
const FLEX_SELECTION_KEY = 'fareTransitFlexAssistSelected';
const FLEX_RATE = 0.10;

const SUFFIX_OPTIONS = ['', 'Jr', 'Sr', 'I', 'II', 'III', 'IV', 'V'];
const LOYALTY_PROGRAMS = [
  '',
  'American Airlines AAdvantage',
  'Delta SkyMiles',
  'United MileagePlus',
  'JetBlue TrueBlue',
  'Southwest Rapid Rewards',
  'Alaska Airlines Mileage Plan',
  'Air Canada Aeroplan',
  'British Airways Club',
  'Flying Blue',
  'Emirates Skywards',
  'Qatar Airways Privilege Club',
  'Lufthansa Miles & More',
  'Other',
];

const US_STATES = [
  ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['FL','Florida'],['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming'],['DC','District of Columbia'],
];

const COUNTRY_OPTIONS = ['United States', 'Canada', 'United Kingdom', 'Australia', 'Germany', 'France', 'India', 'Mexico', 'Japan', 'Singapore', 'Philippines', 'Other'];

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
  suffix: '',
  gender: '',
  dateOfBirth: '',
  loyaltyProgram: '',
  frequentFlyerNumber: '',
  nationality: 'United States',
  passportNumber: '',
  passportExpiry: '',
  knownTravelerNumber: '',
  redressNumber: '',
  infantType: role === 'infant' ? infantType : null,
});

const normalizePassengerDraft = (passenger = {}) => ({
  ...createPassenger(passenger.role || 'adult', passenger.infantType || passenger.infant_type || null),
  ...passenger,
  suffix: passenger.suffix || '',
  loyaltyProgram: passenger.loyaltyProgram || passenger.loyalty_program || '',
  frequentFlyerNumber: passenger.frequentFlyerNumber || passenger.frequent_flyer_number || '',
  knownTravelerNumber: passenger.knownTravelerNumber || passenger.known_traveler_number || '',
  redressNumber: passenger.redressNumber || passenger.redress_number || '',
});

const buildPassengers = (searchParams = {}) => {
  const adults = Math.max(1, Number.parseInt(searchParams.adults || 1, 10) || 1);
  const children = Math.max(0, Number.parseInt(searchParams.children || 0, 10) || 0);
  const infantsInSeat = Math.max(0, Number.parseInt(searchParams.infantsInSeat || 0, 10) || 0);
  const infantsOnLap = Math.max(0, Number.parseInt(searchParams.infantsOnLap || 0, 10) || 0);
  const legacyInfants = Math.max(0, Number.parseInt(searchParams.infants || 0, 10) || 0);
  const list = [];
  for (let index = 0; index < adults; index += 1) list.push(createPassenger('adult'));
  for (let index = 0; index < children; index += 1) list.push(createPassenger('child'));
  if (infantsInSeat + infantsOnLap > 0) {
    for (let index = 0; index < infantsInSeat; index += 1) list.push(createPassenger('infant', 'IN_SEAT'));
    for (let index = 0; index < infantsOnLap; index += 1) list.push(createPassenger('infant', 'ON_LAP'));
  } else {
    for (let index = 0; index < legacyInfants; index += 1) list.push(createPassenger('infant', 'ON_LAP'));
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

function BookingPageV3({ initialJourneyPayload = null }) {
  const navigate = useNavigate();
  const paymentCardRef = useRef(null);
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

  const initialFlexSelection = (() => {
    const payloadSelection = initialJourneyPayload?.addons?.flexAssist?.selected;
    if (typeof payloadSelection === 'boolean') return payloadSelection;
    const stored = readSessionJson(FLEX_SELECTION_KEY, null);
    return typeof stored === 'boolean' ? stored : null;
  })();

  const [flight, setFlight] = useState(selectedFlight);
  const [returnFlight, setReturnFlight] = useState(selectedReturnFlight);
  const [currentStep, setCurrentStep] = useState(canRestoreDraft ? Math.min(4, Math.max(1, Number(savedDraft.currentStep) || 1)) : 1);
  const [passengersList, setPassengersList] = useState(
    canRestoreDraft && Array.isArray(savedDraft.passengersList) && savedDraft.passengersList.length
      ? savedDraft.passengersList.map(normalizePassengerDraft)
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
  const [tripProtection, setTripProtection] = useState(
    canRestoreDraft && typeof savedDraft.tripProtection === 'boolean' ? savedDraft.tripProtection : initialFlexSelection
  );
  const [protectionSaving, setProtectionSaving] = useState(false);
  const [billing, setBilling] = useState(canRestoreDraft ? savedDraft.billing : {
    cardholderName: '',
    country: 'United States',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
  });
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

  const flexAmount = Number((Number(pricing.total || 0) * FLEX_RATE).toFixed(2));
  const reservationTotal = Number((Number(pricing.total || 0) + (tripProtection === true ? flexAmount : 0)).toFixed(2));

  useEffect(() => {
    sessionStorage.setItem('abandonedSessionKey', abandonedSessionKey.current);
  }, []);

  useEffect(() => {
    if (!flight) return;
    const draft = {
      flightFingerprint: flightFingerprint(flight),
      currentStep,
      passengersList,
      primaryContact,
      contactSameAsTraveller,
      specialRequests,
      tripProtection,
      billing,
      savedAt: new Date().toISOString(),
    };
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    bookingAPI.saveAbandoned({
      sessionKey: abandonedSessionKey.current,
      selectedFlight: flight,
      returnFlight,
      travellerInfo: passengersList,
      contactInfo: primaryContact,
      currentStep: ['travellers', 'contact', 'protection', 'payment'][currentStep - 1],
    }).catch(() => {});
  }, [currentStep, passengersList, primaryContact, contactSameAsTraveller, specialRequests, tripProtection, billing, flight, returnFlight]);

  useEffect(() => {
    if (!contactSameAsTraveller || !passengersList[0]) return;
    setPrimaryContact((previous) => ({
      ...previous,
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
    if (field === 'passportNumber' || field === 'knownTravelerNumber' || field === 'redressNumber') nextValue = safeUpper(value);
    setPassengersList((previous) => previous.map((passenger, idx) => idx === index ? { ...passenger, [field]: nextValue } : passenger));
    setPassengerValidationErrors((previous) => {
      const next = { ...previous };
      delete next[index];
      return next;
    });
    setError('');
  };

  const validateTravellers = () => {
    const required = [['title', 'Title'], ['firstName', 'First Name'], ['lastName', 'Last Name'], ['gender', 'Gender'], ['dateOfBirth', 'Date of Birth']];
    const departureDate = flight?.departureDate || flight?.departure?.date || '';
    for (let index = 0; index < passengersList.length; index += 1) {
      const passenger = passengersList[index];
      const missing = required.filter(([key]) => !String(passenger?.[key] || '').trim()).map(([, label]) => label);
      if (missing.length) {
        setPassengerValidationErrors({ [index]: missing });
        setError(`Passenger #${index + 1}: Please complete ${missing.join(', ')}.`);
        document.querySelector(`[data-passenger-index="${index}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return false;
      }
      const dobCheck = validateDateOfBirth(passenger.dateOfBirth, passenger.role || 'adult', departureDate);
      if (!dobCheck.valid) {
        setPassengerValidationErrors({ [index]: [dobCheck.message] });
        setError(`Passenger #${index + 1}: ${dobCheck.message}`);
        return false;
      }
      if (passenger.passportNumber) {
        const passportCheck = validatePassportNumber(passenger.passportNumber);
        if (!passportCheck.valid) {
          setPassengerValidationErrors({ [index]: [passportCheck.message] });
          setError(`Passenger #${index + 1}: ${passportCheck.message}`);
          return false;
        }
      }
      if (passenger.passportExpiry) {
        const expiryCheck = validatePassportExpiry(passenger.passportExpiry, departureDate);
        if (!expiryCheck.valid) {
          setPassengerValidationErrors({ [index]: [expiryCheck.message] });
          setError(`Passenger #${index + 1}: ${expiryCheck.message}`);
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

  const validateProtection = () => {
    if (typeof tripProtection !== 'boolean') {
      setError('Please select Yes or No for FareTransit Flex Assist before continuing.');
      return false;
    }
    return true;
  };

  const validatePayment = () => {
    const nextErrors = {};
    if (!billing.cardholderName.trim()) nextErrors.cardholderName = 'Enter the name shown on the card.';
    if (!billing.country.trim()) nextErrors.country = 'Select the billing country.';
    if (!billing.addressLine1.trim()) nextErrors.addressLine1 = 'Enter the billing address.';
    if (!billing.city.trim()) nextErrors.city = 'Enter the billing city.';
    if (!billing.state.trim()) nextErrors.state = 'Enter the billing state or province.';
    const zipCheck = validatePostalCode(billing.postalCode, billing.country || 'United States');
    if (!zipCheck.valid) nextErrors.postalCode = zipCheck.message;
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setCardError(Object.values(nextErrors)[0]);
      return false;
    }
    if (!paymentCardRef.current?.isValid()) {
      setCardError(paymentCardRef.current?.getValidationMessage?.() || 'Enter valid card details.');
      return false;
    }
    if (!termsAccepted) {
      setCardError('Please accept the Terms of Service, Privacy Policy and Refund Policy.');
      return false;
    }
    return true;
  };

  const selectProtection = async (selected) => {
    setError('');
    setTripProtection(selected);
    sessionStorage.setItem(FLEX_SELECTION_KEY, JSON.stringify(selected));
    const checkoutToken = sessionStorage.getItem('checkoutSessionToken');
    if (!checkoutToken) return;

    setProtectionSaving(true);
    try {
      const latest = await journeySessionAPI.getCheckout(checkoutToken);
      const latestPayload = latest?.data?.payload || initialJourneyPayload || {};
      const nextPayload = {
        ...latestPayload,
        addons: {
          ...(latestPayload.addons || {}),
          flexAssist: {
            ...(latestPayload.addons?.flexAssist || {}),
            selected,
          },
        },
      };
      await journeySessionAPI.updateCheckout(checkoutToken, { payload: nextPayload });
    } catch (requestError) {
      setTripProtection(null);
      sessionStorage.removeItem(FLEX_SELECTION_KEY);
      setError(requestError?.userMessage || requestError?.message || 'We could not save your Flex Assist selection. Please try again.');
    } finally {
      setProtectionSaving(false);
    }
  };

  const goToStep = (step) => {
    setError('');
    setCardError('');
    if (step > currentStep) {
      if (step >= 2 && !validateTravellers()) return;
      if (step >= 3 && !validateContact()) return;
      if (step >= 4 && !validateProtection()) return;
    }
    setCurrentStep(step);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submitReservation = async () => {
    setError('');
    setCardError('');
    if (!validateTravellers() || !validateContact() || !validateProtection() || !validatePayment()) return;

    setProcessing(true);
    try {
      const card = paymentCardRef.current.getMaskedMetadata();
      const cardExpDate = card.expMonth && card.expYear
        ? `${String(card.expMonth).padStart(2, '0')}/${String(card.expYear).slice(-2)}`
        : null;
      const customerName = `${primaryContact.firstName} ${primaryContact.lastName}`.trim();
      const paymentMethod = {
        cardholderName: billing.cardholderName,
        cardBrand: card.cardBrand,
        cardLast4: card.last4,
        cardExpDate,
        billingEmail: primaryContact.email,
        billingPhone: primaryContact.phone,
        billingAddressLine1: billing.addressLine1,
        billingAddressLine2: billing.addressLine2 || '',
        billingCity: billing.city,
        billingState: billing.state,
        billingPostalCode: billing.postalCode,
        billingCountry: billing.country,
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
        payment_provider: 'manual',
        paymentMethod,
        cardholderName: billing.cardholderName,
        cardBrand: card.cardBrand,
        cardLast4: card.last4,
        cardExpDate,
        billingEmail: primaryContact.email,
        billingPhone: primaryContact.phone,
        billingAddress: billing.addressLine1,
        billingAddressLine1: billing.addressLine1,
        billingAddressLine2: billing.addressLine2 || '',
        billingCity: billing.city,
        billingState: billing.state,
        billingZip: billing.postalCode,
        billingPostalCode: billing.postalCode,
        billingCountry: billing.country,
        tripAddons: { flexAssist: { selected: tripProtection === true } },
        currency: 'USD',
        status: 'PENDING',
        isMock: pricing.isMock,
      });

      if (!response?.success) throw new Error(response?.error?.message || response?.message || 'We could not create your reservation.');
      const data = response.data || {};
      const booking = data.booking || data;
      const bookingId = booking.id || data.id;
      const bookingCode = booking.confirmation_code || booking.confirmationCode || data.confirmation_code || data.confirmationCode;
      const reservationReadToken = response.reservationReadToken || data.reservationReadToken || null;
      if (!bookingId || !bookingCode) throw new Error('The reservation was created without a usable booking reference. Please contact support.');

      await trackGoogleAdsLeadConversion({ bookingReference: bookingCode, value: 1, currency: 'USD' }).catch(() => {});
      bookingAPI.deleteAbandoned(abandonedSessionKey.current).catch(() => {});
      paymentCardRef.current?.clear?.();
      sessionStorage.removeItem('abandonedSessionKey');
      sessionStorage.removeItem(DRAFT_KEY);
      sessionStorage.removeItem(FLEX_SELECTION_KEY);
      const confirmationRef = reservationReadToken || bookingCode;
      navigate(`/booking-confirmed/${encodeURIComponent(confirmationRef)}?email=${encodeURIComponent(primaryContact.email)}`);
    } catch (requestError) {
      console.error('Reservation submission error:', requestError);
      setCardError(requestError?.response?.data?.error?.message || requestError?.message || 'We could not complete your reservation. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const handleUpdateSearch = (updatedParams) => {
    sessionStorage.removeItem('selectedFlight');
    sessionStorage.removeItem('selectedReturnFlight');
    sessionStorage.removeItem(DRAFT_KEY);
    sessionStorage.removeItem(FLEX_SELECTION_KEY);
    const adults = Number.parseInt(updatedParams.adults || 1, 10);
    const children = Number.parseInt(updatedParams.children || 0, 10);
    const infants = Number.parseInt(updatedParams.infants || 0, 10);
    setIsModifySearchOpen(false);
    navigate(`/search?from=${encodeURIComponent(updatedParams.from)}&to=${encodeURIComponent(updatedParams.to)}&departure=${encodeURIComponent(updatedParams.departure)}&return=${encodeURIComponent(updatedParams.return || '')}&tripType=${encodeURIComponent(updatedParams.tripType)}&adults=${adults}&children=${children}&infants=${infants}&cabin=${encodeURIComponent(updatedParams.cabinClass)}`);
  };

  if (!flight) {
    return (
      <div className="booking-page booking-v3-empty">
        <Helmet><title>Flight Checkout | FareTransit</title></Helmet>
        <div className="booking-v3-empty-card">
          <i className="fas fa-exclamation-triangle" aria-hidden="true" />
          <h2>No Itinerary Selected</h2>
          <p>We could not restore the selected itinerary. Please search again.</p>
          <button type="button" className="booking-v3-primary" onClick={() => navigate('/')}>Search Flights</button>
        </div>
      </div>
    );
  }

  const origin = airportCode(flight?.departure, flight?.departure_airport || flight?.departureAirport || flight?.origin?.code || flight?.origin || '—');
  const destination = airportCode(flight?.arrival, flight?.arrival_airport || flight?.arrivalAirport || flight?.destination?.code || flight?.destination || '—');
  const finalDestination = returnFlight ? origin : destination;
  const stepLabels = ['Traveller Details', 'Contact & Assistance', 'Trip Protection', 'Payment'];

  return (
    <div className="booking-page booking-page-v3">
      <Helmet><title>Complete Flight Reservation | FareTransit</title></Helmet>

      <div className="booking-itinerary-top-panel booking-v3-nav-panel">
        <div className="booking-itinerary-top-panel__inner booking-v3-nav-inner">
          <div className="booking-stepper-v3" aria-label="Booking progress">
            {stepLabels.map((label, index) => {
              const step = index + 1;
              const state = currentStep === step ? 'active' : currentStep > step ? 'complete' : 'upcoming';
              return (
                <React.Fragment key={label}>
                  <button
                    type="button"
                    className={`booking-step-v3 booking-step-v3--${state}`}
                    onClick={() => step < currentStep && goToStep(step)}
                    disabled={step > currentStep}
                    aria-current={currentStep === step ? 'step' : undefined}
                  >
                    <span className="booking-step-v3__dot">{currentStep > step ? '✓' : step}</span>
                    <span className="booking-step-v3__label">{label}</span>
                  </button>
                  {step < 4 && <span className={`booking-step-v3__line${currentStep > step ? ' is-complete' : ''}`} />}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      <main className="booking-v3-shell booking-form-area">
        {(error || cardError) && (
          <div className="booking-global-error booking-v3-error" role="alert">
            <i className="fas fa-exclamation-circle" aria-hidden="true" />
            <span>{cardError || error}</span>
          </div>
        )}

        <form onSubmit={(event) => { event.preventDefault(); if (currentStep === 4) submitReservation(); }}>
          {currentStep === 1 && (
            <>
              <section className="booking-v3-section booking-v3-itinerary-section">
                <div className="booking-v3-section-header">
                  <div>
                    <p className="booking-v3-eyebrow"><i className="fas fa-map-marked-alt" /> Your Selected Itinerary</p>
                    <h1>Review your flight</h1>
                  </div>
                  <button type="button" className="booking-v3-secondary" onClick={() => setIsModifySearchOpen(true)}>
                    <i className="fas fa-pen" aria-hidden="true" /> Modify Search
                  </button>
                </div>
                <div className="booking-v3-fare-card">
                  <div><span>Today's Fare</span><strong>${pricing.total} <small>USD</small></strong></div>
                  <p>Per traveler <b>${(Number(pricing.total) / Math.max(1, passengersList.length)).toFixed(2)}</b> × {passengersList.length} traveler{passengersList.length === 1 ? '' : 's'} = <b>${pricing.total} total</b></p>
                </div>
                <div className={`booking-itinerary-top-grid ${returnFlight ? 'booking-itinerary-top-grid--roundtrip' : 'booking-itinerary-top-grid--single'}`}>
                  <ItineraryCard flight={flight} label="Outbound Flight" labelColor="#1e3a5f" isTrain={Boolean(flight?.isTrain)} />
                  {returnFlight && <ItineraryCard flight={returnFlight} label="Return Flight" labelColor="#8b1538" isTrain={Boolean(returnFlight?.isTrain)} />}
                </div>
              </section>

              <section className="booking-v3-section" id="travellers">
                <div className="booking-v3-section-header booking-v3-section-header--simple">
                  <div><p className="booking-v3-eyebrow">1. Passenger Details</p><h2>{passengersList.length} Passenger{passengersList.length === 1 ? '' : 's'}</h2></div>
                </div>
                <p className="booking-v3-section-intro">Please make sure each full name is entered exactly as it appears on the traveler’s government-issued identification.</p>

                <div className="booking-v3-passenger-list">
                  {passengersList.map((passenger, index) => (
                    <div key={index} data-passenger-index={index} className={`passenger-card-block booking-v3-passenger${passengerValidationErrors[index]?.length ? ' tfs-passenger-card-error' : ''}`}>
                      <div className="booking-v3-passenger-title">
                        <div><strong>Passenger {index + 1}</strong><span>{safeUpper(passenger.role || 'adult')}</span></div>
                        <small>All required fields are marked *</small>
                      </div>

                      <div className="booking-v3-name-grid">
                        <label className="booking-v3-field booking-v3-title-field">Title *
                          <select value={passenger.title} onChange={(event) => updatePassenger(index, 'title', event.target.value)}>
                            <option value="">Select</option><option value="Mr">Mr.</option><option value="Mrs">Mrs.</option><option value="Ms">Ms.</option><option value="Miss">Miss</option><option value="Master">Master</option><option value="Dr">Dr.</option>
                          </select>
                        </label>
                        <label className="booking-v3-field">First Name *<input value={passenger.firstName} onChange={(event) => updatePassenger(index, 'firstName', event.target.value)} placeholder="First Name" /></label>
                        <label className="booking-v3-field">Middle Name<input value={passenger.middleName} onChange={(event) => updatePassenger(index, 'middleName', event.target.value)} placeholder="Middle Name" /></label>
                        <label className="booking-v3-field">Last Name *<input value={passenger.lastName} onChange={(event) => updatePassenger(index, 'lastName', event.target.value)} placeholder="Last Name" /></label>
                        <label className="booking-v3-field booking-v3-suffix-field">Suffix
                          <select value={passenger.suffix} onChange={(event) => updatePassenger(index, 'suffix', event.target.value)}>
                            {SUFFIX_OPTIONS.map((suffix) => <option key={suffix || 'none'} value={suffix}>{suffix || '--'}</option>)}
                          </select>
                        </label>
                      </div>

                      <div className="booking-v3-two-grid booking-v3-grid-gap">
                        <label className="booking-v3-field">Loyalty Program (optional)
                          <select value={passenger.loyaltyProgram} onChange={(event) => updatePassenger(index, 'loyaltyProgram', event.target.value)}>
                            {LOYALTY_PROGRAMS.map((program) => <option key={program || 'none'} value={program}>{program || 'Select loyalty program'}</option>)}
                          </select>
                        </label>
                        <label className="booking-v3-field">Frequent Flyer Number (optional)
                          <input value={passenger.frequentFlyerNumber} onChange={(event) => updatePassenger(index, 'frequentFlyerNumber', event.target.value)} placeholder="Frequent Flyer #" autoComplete="off" />
                        </label>
                      </div>

                      <div className="booking-v3-two-grid booking-v3-grid-gap">
                        <div className="booking-v3-field"><label>Date of Birth *</label><DateOfBirthPicker id={`dob-pass-${index}`} value={passenger.dateOfBirth} onChange={(value) => updatePassenger(index, 'dateOfBirth', value)} /></div>
                        <label className="booking-v3-field">Gender *
                          <select value={passenger.gender} onChange={(event) => updatePassenger(index, 'gender', event.target.value)}><option value="">Select Gender</option><option value="male">Male</option><option value="female">Female</option></select>
                        </label>
                      </div>

                      <div className="booking-v3-three-grid booking-v3-grid-gap">
                        <div className="booking-v3-field"><label>Nationality</label><CountrySelect id={`nat-pass-${index}`} value={passenger.nationality} onChange={(value) => updatePassenger(index, 'nationality', value)} /></div>
                        <label className="booking-v3-field">Passport Number<input value={passenger.passportNumber} onChange={(event) => updatePassenger(index, 'passportNumber', event.target.value)} placeholder="Passport Number" /></label>
                        <div className="booking-v3-field"><label>Passport Expiry</label><TravelDatePicker id={`passport-exp-${index}`} value={passenger.passportExpiry} onChange={(value) => updatePassenger(index, 'passportExpiry', value)} placeholder="YYYY-MM-DD" /></div>
                      </div>

                      <div className="booking-v3-secure-flight-info">
                        <h3>Secure Flight Info <i className="fas fa-info-circle" aria-hidden="true" /></h3>
                        <div className="booking-v3-two-grid">
                          <label className="booking-v3-field">Known Traveler # (optional)<input value={passenger.knownTravelerNumber} onChange={(event) => updatePassenger(index, 'knownTravelerNumber', event.target.value)} placeholder="Known Traveler #" autoComplete="off" /></label>
                          <label className="booking-v3-field">Redress # (optional)<input value={passenger.redressNumber} onChange={(event) => updatePassenger(index, 'redressNumber', event.target.value)} placeholder="Redress #" autoComplete="off" /></label>
                        </div>
                      </div>

                      {passengerValidationErrors[index]?.length > 0 && <p className="booking-v3-inline-error">Please check: {passengerValidationErrors[index].join(', ')}</p>}
                    </div>
                  ))}
                </div>

                <div className="booking-v3-actions booking-v3-actions--end">
                  <button type="button" className="booking-v3-primary" onClick={() => goToStep(2)}>Continue to Contact & Assistance <span aria-hidden="true">→</span></button>
                </div>
              </section>
            </>
          )}

          {currentStep === 2 && (
            <section className="booking-v3-section">
              <div className="booking-v3-section-header booking-v3-section-header--simple">
                <div><p className="booking-v3-eyebrow">2. Contact & Assistance</p><h1>How should we contact you?</h1></div>
              </div>

              <div className="booking-v3-subcard">
                <h2>Primary Contact Details</h2>
                <label className="booking-v3-toggle-row"><input type="checkbox" checked={contactSameAsTraveller} onChange={(event) => setContactSameAsTraveller(event.target.checked)} /><span>Use Passenger #1 as primary contact</span></label>
                <div className="booking-v3-two-grid booking-v3-grid-gap">
                  <label className="booking-v3-field">Contact First Name *<input value={primaryContact.firstName} onChange={(event) => setPrimaryContact((previous) => ({ ...previous, firstName: event.target.value }))} /></label>
                  <label className="booking-v3-field">Contact Last Name *<input value={primaryContact.lastName} onChange={(event) => setPrimaryContact((previous) => ({ ...previous, lastName: event.target.value }))} /></label>
                </div>
                <div className="booking-v3-two-grid booking-v3-grid-gap">
                  <div className="booking-v3-field"><label>Email Address (For E-Ticket) *</label><EmailInput id="contact-email" value={primaryContact.email} onChange={(value) => setPrimaryContact((previous) => ({ ...previous, email: value }))} required /></div>
                  <div className="booking-v3-field"><label>Phone Number (For Flight Updates) *</label><InternationalPhoneInput id="contact-phone" value={primaryContact.phone} onChange={(value) => setPrimaryContact((previous) => ({ ...previous, phone: value }))} required /></div>
                </div>
              </div>

              <div className="booking-v3-subcard">
                <h2>Special Requests & Preferences</h2>
                <div className="booking-v3-two-grid booking-v3-grid-gap">
                  <label className="booking-v3-field">Meal Preference
                    <select value={specialRequests.mealPreference} onChange={(event) => setSpecialRequests((previous) => ({ ...previous, mealPreference: event.target.value }))}>
                      <option value="none">Standard Airline Meal</option><option value="vegetarian">Vegetarian / Vegan</option><option value="kosher">Kosher</option><option value="halal">Halal</option><option value="child">Child Meal</option>
                    </select>
                  </label>
                  <label className="booking-v3-field">Seat Preference
                    <select value={specialRequests.seatingPreference} onChange={(event) => setSpecialRequests((previous) => ({ ...previous, seatingPreference: event.target.value }))}>
                      <option value="none">No Preference</option><option value="aisle">Aisle Seat</option><option value="window">Window Seat</option><option value="extra_legroom">Extra Legroom (if available)</option>
                    </select>
                  </label>
                </div>
                <label className="booking-v3-toggle-row booking-v3-grid-gap"><input type="checkbox" checked={specialRequests.wheelchair} onChange={(event) => setSpecialRequests((previous) => ({ ...previous, wheelchair: event.target.checked }))} /><span>Request Wheelchair Assistance</span></label>
                <label className="booking-v3-field booking-v3-grid-gap">Additional Airline / Assistance Requests<textarea rows={4} value={specialRequests.notes} onChange={(event) => setSpecialRequests((previous) => ({ ...previous, notes: event.target.value }))} placeholder="Special assistance, seating, or other requests" /></label>
              </div>

              <div className="booking-v3-actions">
                <button type="button" className="booking-v3-icon-back" aria-label="Previous step" onClick={() => goToStep(1)}>‹</button>
                <button type="button" className="booking-v3-primary" onClick={() => goToStep(3)}>Continue to Trip Protection <span aria-hidden="true">→</span></button>
              </div>
            </section>
          )}

          {currentStep === 3 && (
            <section className="booking-v3-section booking-v3-protection-section">
              <div className="booking-v3-section-header booking-v3-section-header--simple">
                <div><p className="booking-v3-eyebrow">3. Trip Protection & Baggage Fees</p><h1>Extra help when travel plans change</h1></div>
              </div>
              <p className="booking-v3-section-intro">Add FareTransit Flex Assist for your trip from {origin} to {destination}{returnFlight ? ` and back to ${finalDestination}` : ''}.</p>
              <p className="booking-v3-required-choice"><b>* Required:</b> Select Yes or No to continue</p>

              <button type="button" className={`booking-v3-protection-card${tripProtection === true ? ' is-selected' : ''}`} onClick={() => selectProtection(true)} disabled={protectionSaving}>
                <span className="booking-v3-radio" aria-hidden="true"><span /></span>
                <div className="booking-v3-protection-content">
                  <div className="booking-v3-protection-choice-row">
                    <strong>Yes, add FareTransit Flex Assist for ${flexAmount.toFixed(2)} total.</strong>
                    <span className="booking-v3-recommended">HIGHLY RECOMMENDED</span>
                  </div>
                  <div className="booking-v3-benefits">
                    <div><i className="fas fa-exchange-alt" /><span><b>Changes made easier</b><small>Get help reviewing flight-change and rebooking options when plans change.</small></span></div>
                    <div><i className="far fa-clock" /><span><b>Delay & rebooking support</b><small>A FareTransit specialist can help you navigate available alternatives.</small></span></div>
                    <div><i className="fas fa-suitcase" /><span><b>Baggage assistance</b><small>Get help coordinating baggage requests and airline support.</small></span></div>
                    <div><i className="fas fa-headset" /><span><b>Anytime help</b><small>FareTransit travel specialists are available to assist with your reservation.</small></span></div>
                  </div>
                </div>
              </button>

              <button type="button" className={`booking-v3-protection-no${tripProtection === false ? ' is-selected' : ''}`} onClick={() => selectProtection(false)} disabled={protectionSaving}>
                <span className="booking-v3-radio" aria-hidden="true"><span /></span>
                <strong>No, do not add Flex Assist to my ${Number(pricing.total).toFixed(2)} trip.</strong>
              </button>

              <p className="booking-v3-flex-disclaimer">Flex Assist is a FareTransit agency service, not travel insurance or an airline flexible fare. Airline fare differences, penalties, taxes, availability and fare rules may still apply.</p>

              <div className="booking-v3-actions">
                <button type="button" className="booking-v3-icon-back" aria-label="Previous step" onClick={() => goToStep(2)}>‹</button>
                <button type="button" className="booking-v3-primary" onClick={() => goToStep(4)} disabled={protectionSaving || typeof tripProtection !== 'boolean'}>{protectionSaving ? 'Saving selection…' : <>Continue to Payment <span aria-hidden="true">→</span></>}</button>
              </div>
            </section>
          )}

          {currentStep === 4 && (
            <section className="booking-v3-section booking-v3-payment-section">
              <div className="booking-v3-section-header booking-v3-section-header--simple">
                <div><p className="booking-v3-eyebrow">4. Payment & Billing</p><h1>Card & Billing Details</h1></div>
              </div>

              <div className="booking-v3-checkout-summary">
                <div><span>Trip</span><strong>{origin} → {destination}{returnFlight ? ` → ${finalDestination}` : ''}</strong></div>
                <div><span>Travelers</span><strong>{passengersList.length}</strong></div>
                <div><span>Reservation Total</span><strong className="booking-itinerary-pricing-summary__discounted">${reservationTotal.toFixed(2)} USD</strong></div>
              </div>

              <div className="booking-v3-payment-card card-payment-container">
                <div className="booking-v3-payment-title-row">
                  <div className="booking-v3-payment-title"><span className="booking-v3-payment-radio"><span /></span><h2>Add New Credit or Debit Card</h2></div>
                  <div className="booking-v3-card-logos" aria-label="Accepted card brands">
                    <i className="fab fa-cc-amex" title="American Express" /><i className="fab fa-cc-visa" title="Visa" /><i className="fab fa-cc-mastercard" title="Mastercard" /><i className="fab fa-cc-discover" title="Discover" /><i className="fab fa-cc-jcb" title="JCB" /><i className="fab fa-cc-diners-club" title="Diners Club" /><span>UATP</span>
                  </div>
                </div>
                <p className="booking-v3-required-note">All fields are required unless noted</p>

                <PaymentCardEntry
                  ref={paymentCardRef}
                  nameOnCard={billing.cardholderName}
                  onNameChange={(value) => setBilling((previous) => ({ ...previous, cardholderName: value }))}
                  onFocus={() => { setCardError(''); setFieldErrors({}); }}
                />
                {fieldErrors.cardholderName && <p className="booking-v3-field-error">{fieldErrors.cardholderName}</p>}

                <label className="booking-v3-floating-field booking-v3-payment-full-field">
                  <span>Country</span>
                  <select value={billing.country} onChange={(event) => setBilling((previous) => ({ ...previous, country: event.target.value, state: event.target.value === 'United States' ? previous.state : '' }))}>
                    {COUNTRY_OPTIONS.map((country) => <option key={country} value={country}>{country}</option>)}
                  </select>
                </label>
                {fieldErrors.country && <p className="booking-v3-field-error">{fieldErrors.country}</p>}

                <label className="booking-v3-floating-field booking-v3-payment-full-field">
                  <span>Address Line 1</span>
                  <input id="billingAddress" value={billing.addressLine1} onChange={(event) => setBilling((previous) => ({ ...previous, addressLine1: event.target.value }))} placeholder="Address Line 1" autoComplete="address-line1" />
                </label>
                {fieldErrors.addressLine1 && <p className="booking-v3-field-error">{fieldErrors.addressLine1}</p>}

                <label className="booking-v3-floating-field booking-v3-payment-full-field">
                  <span>Address Line 2 (optional)</span>
                  <input value={billing.addressLine2} onChange={(event) => setBilling((previous) => ({ ...previous, addressLine2: event.target.value }))} placeholder="Address Line 2" autoComplete="address-line2" />
                </label>

                <div className="booking-v3-address-row">
                  <label className="booking-v3-floating-field">
                    <span>City</span>
                    <input value={billing.city} onChange={(event) => setBilling((previous) => ({ ...previous, city: event.target.value }))} placeholder="City" autoComplete="address-level2" />
                  </label>
                  <label className="booking-v3-floating-field">
                    <span>State/Province</span>
                    {billing.country === 'United States' ? (
                      <select value={billing.state} onChange={(event) => setBilling((previous) => ({ ...previous, state: event.target.value }))} autoComplete="address-level1">
                        <option value="">State/Province</option>
                        {US_STATES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                      </select>
                    ) : (
                      <input value={billing.state} onChange={(event) => setBilling((previous) => ({ ...previous, state: event.target.value }))} placeholder="State/Province" autoComplete="address-level1" />
                    )}
                  </label>
                  <label className="booking-v3-floating-field">
                    <span>Postal Code</span>
                    <input value={billing.postalCode} onChange={(event) => setBilling((previous) => ({ ...previous, postalCode: event.target.value }))} placeholder="Postal Code" autoComplete="postal-code" />
                  </label>
                </div>
                {(fieldErrors.city || fieldErrors.state || fieldErrors.postalCode) && <p className="booking-v3-field-error">{fieldErrors.city || fieldErrors.state || fieldErrors.postalCode}</p>}
              </div>

              <div className="booking-v3-price-breakdown price-breakdown-section">
                <div className="price-row"><span>Flight fare</span><strong>${Number(pricing.total).toFixed(2)}</strong></div>
                <div className="price-row"><span>FareTransit Flex Assist</span><strong>{tripProtection ? `$${flexAmount.toFixed(2)}` : '$0.00'}</strong></div>
                <div className="price-row price-row--total"><span>Reservation total</span><strong className="price-total-amount booking-itinerary-pricing-summary__discounted">${reservationTotal.toFixed(2)} USD</strong></div>
              </div>

              <div className="verification-block" />

              <div className="booking-v3-availability-note"><i className="fas fa-headset" aria-hidden="true" /><p>Our travel specialist may call you to confirm your itinerary based on availability.</p></div>

              <label className="booking-v3-terms">
                <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} />
                <span>I agree to the <Link to="/terms" target="_blank">Terms of Service</Link>, <Link to="/privacy-policy" target="_blank">Privacy Policy</Link>, and <Link to="/refund-policy" target="_blank">Refund Policy</Link>. I verify that passenger details match official identification.</span>
              </label>

              <div className="booking-v3-actions">
                <button type="button" className="booking-v3-icon-back" aria-label="Previous step" onClick={() => goToStep(3)}>‹</button>
                <button type="submit" className="amtrak-btn amtrak-btn--cta amtrak-btn--full booking-v3-primary booking-v3-submit-btn" disabled={processing || !termsAccepted}>
                  {processing ? <><i className="fas fa-circle-notch fa-spin" /> Processing Reservation…</> : <span>Complete Reservation</span>}
                </button>
              </div>
            </section>
          )}
        </form>
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
          adults: passengersList.filter((passenger) => passenger.role === 'adult').length || 1,
          children: passengersList.filter((passenger) => passenger.role === 'child').length,
          infants: passengersList.filter((passenger) => passenger.role === 'infant').length,
          cabinClass: flight?.cabinClass || flight?.class || 'Economy',
        }}
        onUpdateSearch={handleUpdateSearch}
        isCheckoutPage
      />
    </div>
  );
}

export default BookingPageV3;
