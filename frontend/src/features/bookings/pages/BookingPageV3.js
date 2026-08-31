import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { bookingAPI } from '../../../shared/api/api';
import journeySessionAPI from '../../../shared/api/journeySessionApi';
import ModifySearchModal from '../../flights/components/ModifySearchModal';
import { safeUpper } from '../../../shared/utils/itineraryNormalizer';
import {
  validateDateOfBirth,
  validatePassportExpiry,
  validatePassportNumber,
  validatePostalCode,
} from '../../../shared/utils/validationHelpers';
import { trackGoogleAdsLeadConversion } from '../../../shared/analytics/googleAds';
import PassengerDetailsStep from '../steps/PassengerDetailsStep';
import ContactAssistanceStep from '../steps/ContactAssistanceStep';
import TripProtectionStep from '../steps/TripProtectionStep';
import PaymentBillingStep from '../steps/PaymentBillingStep';
import './BookingPage.css';
import './BookingPageV3.css';
import './BookingPageV3Fixes.css';

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

export default function BookingPageV3({ initialJourneyPayload = null }) {
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
  const canRestoreDraft = savedDraft?.flightFingerprint && savedDraft.flightFingerprint === flightFingerprint(selectedFlight);

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
  const [primaryContact, setPrimaryContact] = useState(canRestoreDraft ? savedDraft.primaryContact : { firstName: '', lastName: '', email: '', phone: '' });
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
  const [protectionSyncPending, setProtectionSyncPending] = useState(false);
  const [protectionSyncWarning, setProtectionSyncWarning] = useState('');
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
    if (['passportNumber', 'knownTravelerNumber', 'redressNumber'].includes(field)) nextValue = safeUpper(value);
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

  const selectProtection = (selected) => {
    setError('');
    setTripProtection(selected);
    setProtectionSyncWarning('');
    sessionStorage.setItem(FLEX_SELECTION_KEY, JSON.stringify(selected));

    const checkoutToken = sessionStorage.getItem('checkoutSessionToken');
    if (!checkoutToken) return;

    setProtectionSyncPending(true);
    (async () => {
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
      } catch {
        setProtectionSyncWarning('Your choice is saved on this page and will be synchronized again when you complete the reservation.');
      } finally {
        setProtectionSyncPending(false);
      }
    })();
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
        assistance: specialRequests,
        specialRequests,
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
            <PassengerDetailsStep
              flight={flight}
              returnFlight={returnFlight}
              pricing={pricing}
              passengers={passengersList}
              passengerErrors={passengerValidationErrors}
              suffixOptions={SUFFIX_OPTIONS}
              loyaltyPrograms={LOYALTY_PROGRAMS}
              onPassengerChange={updatePassenger}
              onModifySearch={() => setIsModifySearchOpen(true)}
              onContinue={() => goToStep(2)}
            />
          )}

          {currentStep === 2 && (
            <ContactAssistanceStep
              primaryContact={primaryContact}
              setPrimaryContact={setPrimaryContact}
              contactSameAsTraveller={contactSameAsTraveller}
              setContactSameAsTraveller={setContactSameAsTraveller}
              specialRequests={specialRequests}
              setSpecialRequests={setSpecialRequests}
              onBack={() => goToStep(1)}
              onContinue={() => goToStep(3)}
            />
          )}

          {currentStep === 3 && (
            <TripProtectionStep
              origin={origin}
              destination={destination}
              finalDestination={finalDestination}
              hasReturn={Boolean(returnFlight)}
              tripProtection={tripProtection}
              flexAmount={flexAmount}
              baseFare={pricing.total}
              syncPending={protectionSyncPending}
              syncWarning={protectionSyncWarning}
              onSelect={selectProtection}
              onBack={() => goToStep(2)}
              onContinue={() => goToStep(4)}
            />
          )}

          {currentStep === 4 && (
            <PaymentBillingStep
              paymentCardRef={paymentCardRef}
              billing={billing}
              setBilling={setBilling}
              fieldErrors={fieldErrors}
              clearCardErrors={() => { setCardError(''); setFieldErrors({}); }}
              countries={COUNTRY_OPTIONS}
              usStates={US_STATES}
              tripProtection={tripProtection}
              flexAmount={flexAmount}
              baseFare={pricing.total}
              reservationTotal={reservationTotal}
              termsAccepted={termsAccepted}
              setTermsAccepted={setTermsAccepted}
              processing={processing}
              onBack={() => goToStep(3)}
            />
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
