import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAPI } from '../../../shared/api/api';
import { buildGdsStyleReferenceLines, parseGdsLine, CHATGPT_PROMPT_TEMPLATE } from '../../../shared/utils/gdsItineraryHelper';
import AdminItineraryImportModal from '../../../shared/components/admin/AdminItineraryImportModal';
import AdminItineraryHelpModal from '../../../shared/components/admin/AdminItineraryHelpModal';
import ItineraryTimeline from '../../../shared/components/ItineraryTimeline';
import './AdminDashboardPage.css';

// ----------------------------------------------------
// CONTROLLED DATE OF BIRTH COMPONENT (Fixes MM/DD/YYYY Typing & Clearing)
// ----------------------------------------------------
function DobInputComponent({ value, onChange, label = "Date of Birth", required = false, hasError = false, errorMessage = "" }) {
  const formatIsoToDisplay = (isoStr) => {
    if (!isoStr) return '';
    if (isoStr.includes('/')) return isoStr;
    const parts = isoStr.split('-');
    if (parts.length === 3) {
      return `${parts[1]}/${parts[2]}/${parts[0]}`;
    }
    return isoStr;
  };

  const [inputText, setInputText] = useState(() => formatIsoToDisplay(value));
  const datePickerRef = useRef(null);

  useEffect(() => {
    setInputText(formatIsoToDisplay(value));
  }, [value]);

  const handleTextChange = (e) => {
    let raw = e.target.value;
    raw = raw.replace(/[^\d/]/g, '').slice(0, 10);
    setInputText(raw);

    if (raw.length === 10) {
      const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (match) {
        const m = parseInt(match[1], 10);
        const d = parseInt(match[2], 10);
        const y = parseInt(match[3], 10);
        const nowYear = new Date().getFullYear();
        if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1900 && y <= nowYear) {
          const iso = `${y}-${match[1]}-${match[2]}`;
          onChange(iso);
          return;
        }
      }
    }
    if (raw === '') {
      onChange('');
    }
  };

  const handleBlur = () => {
    if (!inputText) {
      onChange('');
      return;
    }
    if (inputText.length === 10) {
      const match = inputText.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (match) {
        const m = parseInt(match[1], 10);
        const d = parseInt(match[2], 10);
        const y = parseInt(match[3], 10);
        const nowYear = new Date().getFullYear();
        if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1900 && y <= nowYear) {
          const iso = `${y}-${match[1]}-${match[2]}`;
          onChange(iso);
          return;
        }
      }
    }
  };

  const handleCalendarChange = (e) => {
    const val = e.target.value; // YYYY-MM-DD
    if (val) {
      onChange(val);
      setInputText(formatIsoToDisplay(val));
    }
  };

  const handleClear = () => {
    setInputText('');
    onChange('');
  };

  return (
    <div className="drawer-form-field" style={{ position: 'relative' }}>
      <label>
        {label} {required && <span className="required-marker" style={{ color: '#b91c1c', fontWeight: 800, marginLeft: '2px' }}>*</span>}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
        <input
          type="text"
          inputMode="numeric"
          placeholder="MM/DD/YYYY"
          maxLength={10}
          aria-required={required ? "true" : "false"}
          value={inputText}
          onChange={handleTextChange}
          onBlur={handleBlur}
          onFocus={(e) => e.target.select()}
          style={{
            width: '100%',
            paddingRight: inputText ? '75px' : '35px',
            border: hasError ? '2px solid #b91c1c' : undefined,
            background: hasError ? '#fef2f2' : undefined
          }}
        />
        {inputText && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear date of birth"
            title="Clear date of birth"
            style={{
              position: 'absolute',
              right: '32px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              color: '#ef4444',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: '0.8rem',
              padding: '2px 4px'
            }}
          >
            × Clear
          </button>
        )}
        <input
          type="date"
          ref={datePickerRef}
          onChange={handleCalendarChange}
          style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', right: 0, width: '1px' }}
        />
        <button
          type="button"
          onClick={() => datePickerRef.current && datePickerRef.current.showPicker ? datePickerRef.current.showPicker() : datePickerRef.current.click()}
          aria-label="Open date picker"
          title="Open date picker"
          style={{
            position: 'absolute',
            right: '8px',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            color: '#64748b',
            cursor: 'pointer',
            fontSize: '0.9rem'
          }}
        >
          <i className="fas fa-calendar-alt"></i>
        </button>
      </div>
      <small style={{ color: hasError ? '#b91c1c' : '#64748b', fontSize: '0.72rem', marginTop: '2px', display: 'block', fontWeight: hasError ? 700 : 'normal' }}>
        {hasError && errorMessage ? errorMessage : 'Enter as MM/DD/YYYY or choose from calendar.'}
      </small>
    </div>
  );
}

export default function AdminCreateBookingPage() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1); // 1 to 5

  // Guard: redirect to admin login if no valid session token
  useEffect(() => {
    const token = localStorage.getItem('token');
    const adminSession = sessionStorage.getItem('adminSession');
    if (!token || !adminSession) {
      navigate('/admin/login');
    }
  }, [navigate]);

  // Navigation Feedback & Isolated Action Submission State
  const [activeSubmissionAction, setActiveSubmissionAction] = useState(null);
  const [activeCreateRequest, setActiveCreateRequest] = useState(null); // { actionType, idempotencyKey }
  const isSubmitting = activeSubmissionAction !== null;
  const [dobErrors, setDobErrors] = useState({});
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // ----------------------------------------------------
  // STEP 1 STATE: Passenger & Contact
  // ----------------------------------------------------
  const [contactInfo, setContactInfo] = useState({
    email: '',
    phone: ''
  });

  const [passengers, setPassengers] = useState([
    {
      id: 'p-1',
      role: 'adult',
      title: 'Mr',
      firstName: '',
      lastName: '',
      gender: 'Male',
      dateOfBirth: '',
      passportNumber: '',
      passportCountry: 'United States',
      passportExpiry: ''
    }
  ]);

  // ----------------------------------------------------
  // STEP 2 STATE: Itinerary (One Way, Round Trip, Multi-City)
  // ----------------------------------------------------
  const [tripType, setTripType] = useState('one_way'); // 'one_way' | 'round_trip' | 'multi_city'
  const [outboundSegments, setOutboundSegments] = useState([
    {
      id: `seg-${Date.now()}-1`,
      carrier_code: 'DL',
      carrier_name: 'Delta Air Lines',
      flight_number: '106',
      booking_class: 'Y',
      cabin: 'Economy',
      origin_airport: 'JFK',
      destination_airport: 'LHR',
      departure_date: '2026-09-15',
      departure_time: '19:30',
      arrival_date: '2026-09-16',
      arrival_time: '07:45',
      dep_terminal: 'T4',
      arr_terminal: 'T3',
      status: 'NN1',
      notes: 'Original GDS Line: 01 DL 106 Y 15SEP JFKLHR 1930 0745 NN1'
    }
  ]);
  const [returnSegments, setReturnSegments] = useState([]);
  const [multiCityJourneysState, setMultiCityJourneysState] = useState([]);
  const [gdsReferenceText, setGdsReferenceText] = useState('01 DL 106 Y 15SEP JFKLHR 1930 0745 NN1');

  // Step 2 Modals State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isGptHelpOpen, setIsGptHelpOpen] = useState(false);
  const [isImportPreviewOpen, setIsImportPreviewOpen] = useState(false);

  // Modal Trip Type Selection State
  const [selectedTripType, setSelectedTripType] = useState(''); // 'one_way' | 'round_trip' | 'multi_city'
  const [oneWayYear, setOneWayYear] = useState('2026');
  const [oneWayText, setOneWayText] = useState('');

  const [roundTripOutboundYear, setRoundTripOutboundYear] = useState('2026');
  const [roundTripOutboundText, setRoundTripOutboundText] = useState('');
  const [roundTripReturnYear, setRoundTripReturnYear] = useState('2026');
  const [roundTripReturnText, setRoundTripReturnText] = useState('');

  const [multiCityJourneys, setMultiCityJourneys] = useState([
    { id: 'mc-1', year: '2026', text: '' }
  ]);

  // Import Parsing & Preview State
  const [importErrors, setImportErrors] = useState([]);
  const [importWarnings, setImportWarnings] = useState([]);
  const [previewParsedData, setPreviewParsedData] = useState(null);
  const [copyToast, setCopyToast] = useState('');

  // ----------------------------------------------------
  // STEP 3 STATE: Pricing Breakdown
  // ----------------------------------------------------
  const [pricing, setPricing] = useState({
    supplierCost: '620.00',
    supplierTaxes: '80.00',
    supplierFees: '20.00',
    agencyFee: '50.00',
    markup: '80.00',
    discount: '0.00',
    currency: 'USD',
    finalCustomerTotal: '850.00',
    priceOverrideReason: ''
  });

  const calculatedTotal = useMemo(() => {
    const sCost = parseFloat(pricing.supplierCost) || 0;
    const sTaxes = parseFloat(pricing.supplierTaxes) || 0;
    const sFees = parseFloat(pricing.supplierFees) || 0;
    const aFee = parseFloat(pricing.agencyFee) || 0;
    const mk = parseFloat(pricing.markup) || 0;
    const disc = parseFloat(pricing.discount) || 0;
    return (sCost + sTaxes + sFees + aFee + mk - disc).toFixed(2);
  }, [pricing]);

  // ----------------------------------------------------
  // STEP 4 STATE: Billing & Payment
  // ----------------------------------------------------
  const [billing, setBilling] = useState({
    cardholderName: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'United States',
    cardBrand: 'visa',
    cardLast4: '',
    expMonth: '',
    expYear: '',
    paymentToken: null, // Must be a real provider token — never generated client-side
    authSource: 'email_authorization_form',
    authNote: ''
  });

  // Billing validation
  const validateBilling = () => {
    const errs = [];
    if (billing.cardholderName && !billing.addressLine1) errs.push('Billing Address Line 1 is required for authorization.');
    if (billing.cardLast4 && !/^\d{4}$/.test(billing.cardLast4)) errs.push('Card Last 4 must be exactly four numeric digits.');
    if (billing.expMonth && (parseInt(billing.expMonth, 10) < 1 || parseInt(billing.expMonth, 10) > 12)) errs.push('Expiry month must be 01–12.');
    const nowYear = new Date().getFullYear();
    if (billing.expYear && parseInt(billing.expYear, 10) < nowYear) errs.push('Expiry year must not be in the past.');
    return errs;
  };

  const EXPIRY_YEARS = Array.from({ length: 16 }, (_, i) => String(new Date().getFullYear() + i));

  // ----------------------------------------------------
  // HANDLERS: Trip-Type Import & Parsing
  // ----------------------------------------------------
  const handleParseAndPreviewItinerary = () => {
    setImportErrors([]);
    setImportWarnings([]);

    if (!selectedTripType) {
      setImportErrors(['Please select a trip type (One Way, Round Trip, or Multi-City).']);
      return;
    }

    const errors = [];
    const warnings = [];
    const journeys = [];

    if (selectedTripType === 'one_way') {
      if (!oneWayText.trim()) {
        setImportErrors(['Outbound GDS lines are required for One Way import.']);
        return;
      }
      const lines = oneWayText.split(/\r?\n/).filter(l => l.trim());
      const parsedSegs = [];
      lines.forEach((l, idx) => {
        const parsed = parseGdsLine(l, parseInt(oneWayYear, 10) || 2026, idx + 1);
        if (parsed?.error) errors.push(parsed.error);
        else if (parsed) parsedSegs.push(parsed);
      });
      if (parsedSegs.length > 0) {
        journeys.push({ journeyType: 'outbound', label: 'Outbound', segments: parsedSegs });
      }
    } else if (selectedTripType === 'round_trip') {
      if (!roundTripOutboundText.trim()) {
        setImportErrors(['Outbound GDS lines are required for Round Trip import.']);
        return;
      }
      const outLines = roundTripOutboundText.split(/\r?\n/).filter(l => l.trim());
      const outSegs = [];
      outLines.forEach((l, idx) => {
        const parsed = parseGdsLine(l, parseInt(roundTripOutboundYear, 10) || 2026, idx + 1);
        if (parsed?.error) errors.push(`Outbound ${parsed.error}`);
        else if (parsed) outSegs.push(parsed);
      });
      if (outSegs.length > 0) {
        journeys.push({ journeyType: 'outbound', label: 'Outbound', segments: outSegs });
      }

      if (roundTripReturnText.trim()) {
        const retLines = roundTripReturnText.split(/\r?\n/).filter(l => l.trim());
        const retSegs = [];
        retLines.forEach((l, idx) => {
          const parsed = parseGdsLine(l, parseInt(roundTripReturnYear, 10) || 2026, idx + 1);
          if (parsed?.error) errors.push(`Return ${parsed.error}`);
          else if (parsed) retSegs.push(parsed);
        });
        if (retSegs.length > 0) {
          journeys.push({ journeyType: 'return', label: 'Return', segments: retSegs });
        }
      } else {
        warnings.push('Return itinerary has not been added yet. You can add it later.');
      }
    } else if (selectedTripType === 'multi_city') {
      const activeJourneysWithText = multiCityJourneys.filter(j => j.text.trim());
      if (activeJourneysWithText.length === 0) {
        setImportErrors(['At least one multi-city flight journey box must contain valid GDS lines.']);
        return;
      }
      multiCityJourneys.forEach((j, jIdx) => {
        if (!j.text.trim()) return;
        const lines = j.text.split(/\r?\n/).filter(l => l.trim());
        const segs = [];
        lines.forEach((l, idx) => {
          const parsed = parseGdsLine(l, parseInt(j.year, 10) || 2026, idx + 1);
          if (parsed?.error) errors.push(`Flight ${jIdx + 1}: ${parsed.error}`);
          else if (parsed) segs.push(parsed);
        });
        if (segs.length > 0) {
          journeys.push({ journeyType: `flight_${jIdx + 1}`, label: `Multi-City Flight ${jIdx + 1}`, segments: segs });
        }
      });
    }

    if (errors.length > 0) {
      setImportErrors(errors);
      return;
    }

    setPreviewParsedData({
      tripType: selectedTripType,
      journeys
    });
    setImportWarnings(warnings);
    setIsImportModalOpen(false);
    setIsImportPreviewOpen(true);
  };

  const handleConfirmImportIntoBooking = () => {
    if (!previewParsedData || !Array.isArray(previewParsedData.journeys)) return;

    setTripType(previewParsedData.tripType);

    let newOut = [];
    let newRet = [];
    let newMulti = [];
    let allSegsForGdsRef = [];

    previewParsedData.journeys.forEach(j => {
      const segs = j.segments.map((s, idx) => ({
        id: `imp-${Date.now()}-${j.journeyType}-${idx}`,
        carrier_code: s.carrier_code,
        carrier_name: s.carrier_code === 'DL' ? 'Delta Air Lines' : (s.carrier_code === 'AA' ? 'American Airlines' : (s.carrier_code === 'BA' ? 'British Airways' : s.carrier_code)),
        flight_number: s.flight_number,
        booking_class: s.booking_class,
        cabin: s.booking_class === 'F' ? 'First' : (s.booking_class === 'J' || s.booking_class === 'C' ? 'Business' : 'Economy'),
        origin_airport: s.origin_airport,
        destination_airport: s.destination_airport,
        departure_date: s.departure_date,
        departure_time: s.departure_time,
        arrival_date: s.arrival_date || s.departure_date, // Editable, warning if unconfirmed
        arrival_time: s.arrival_time,
        status: s.status || 'NN1',
        notes: s.notes || ''
      }));

      allSegsForGdsRef.push(...segs);

      if (j.journeyType === 'outbound') newOut.push(...segs);
      else if (j.journeyType === 'return') newRet.push(...segs);
      else newMulti.push({ label: j.label, segments: segs });
    });

    if (newOut.length > 0) setOutboundSegments(newOut);
    if (newRet.length > 0) setReturnSegments(newRet);
    if (newMulti.length > 0) setMultiCityJourneysState(newMulti);

    setGdsReferenceText(buildGdsStyleReferenceLines(allSegsForGdsRef).join('\n'));
    setIsImportPreviewOpen(false);
  };

  const handleClearItinerary = () => {
    if (window.confirm('Clear all imported itinerary information?')) {
      setTripType('one_way');
      setOutboundSegments([]);
      setReturnSegments([]);
      setMultiCityJourneysState([]);
      setGdsReferenceText('');
      setSelectedTripType('');
      setOneWayText('');
      setRoundTripOutboundText('');
      setRoundTripReturnText('');
      setMultiCityJourneys([{ id: 'mc-1', year: '2026', text: '' }]);
    }
  };

  // Dedicated Step Validation Functions
  const validatePassengerStep = (isDraft = false) => {
    if (isDraft) {
      setDobErrors({});
      return [];
    }
    const errs = [];
    const newDobErrs = {};
    if (!contactInfo.email || !contactInfo.email.includes('@')) {
      errs.push('Please enter a valid Contact Email in Step 1.');
    }
    if (passengers.length === 0 || !passengers[0].firstName || !passengers[0].lastName) {
      errs.push('Please enter primary passenger First and Last Name in Step 1.');
    }
    passengers.forEach((p, idx) => {
      if (!p.dateOfBirth) {
        errs.push(`Passenger #${idx + 1} (${p.firstName || 'Passenger'}): Date of birth is required.`);
        newDobErrs[p.id || idx] = 'Date of birth is required.';
      }
    });
    setDobErrors(newDobErrs);
    return errs;
  };

  const validateItineraryStep = () => {
    if (outboundSegments.length === 0) {
      return ['At least one outbound flight segment is required in Step 2.'];
    }
    return [];
  };

  const validatePricingStep = () => {
    const overrideText = String(pricing.finalCustomerTotal ?? '').trim();
    const hasOverride = overrideText !== '';
    const calculatedAmount = Number.parseFloat(calculatedTotal);
    const overrideAmount = Number.parseFloat(overrideText);
    const finalCustomerTotal = hasOverride ? overrideAmount : calculatedAmount;
    if (!Number.isFinite(finalCustomerTotal) || finalCustomerTotal <= 0) {
      return ['Final Customer Total must be a valid amount greater than zero in Step 3.'];
    }
    return [];
  };

  const validateBillingStep = (actionType) => {
    if (['create_and_send_auth', 'create_and_process_payment'].includes(actionType)) {
      const errs = [];
      if (!billing.cardholderName) errs.push('Cardholder Name is required for authorization.');
      if (!billing.addressLine1) errs.push('Address Line 1 is required for authorization.');
      if (!billing.city) errs.push('City is required for authorization.');
      if (!billing.postalCode) errs.push('Postal Code is required for authorization.');
      if (!billing.cardBrand) errs.push('Card Brand is required for authorization.');
      if (!billing.cardLast4 || !/^\d{4}$/.test(billing.cardLast4)) errs.push('Card Last 4 must be exactly 4 numeric digits.');
      if (!billing.expMonth || !billing.expYear) errs.push('Card expiry month and year are required for authorization.');
      return errs;
    }
    return validateBilling();
  };

  // ----------------------------------------------------
  // SUBMISSION HANDLER: Step 5 Final Action
  // ----------------------------------------------------
  const handleCreateBooking = async (actionType = 'create_draft') => {
    if (isSubmitting) return;

    const isDraft = actionType === 'create_draft';
    const passErrs = validatePassengerStep(isDraft);
    if (passErrs.length > 0) {
      setErrorMsg(passErrs.join(' | '));
      setCurrentStep(1);
      setActiveSubmissionAction(null);
      return;
    }

    if (!isDraft) {
      const itinErrs = validateItineraryStep();
      if (itinErrs.length > 0) {
        setErrorMsg(itinErrs.join(' | '));
        setCurrentStep(2);
        setActiveSubmissionAction(null);
        return;
      }

      const priceErrs = validatePricingStep();
      if (priceErrs.length > 0) {
        setErrorMsg(priceErrs.join(' | '));
        setCurrentStep(3);
        setActiveSubmissionAction(null);
        return;
      }
    }

    // Block Create & Process Payment when no real provider token
    if (actionType === 'create_and_process_payment' && !billing.paymentToken) {
      setErrorMsg('Payment processing is not configured. Create the booking without payment or send authorization.');
      setActiveSubmissionAction(null);
      return;
    }

    // Validate billing fields when provided
    const billingErrors = validateBillingStep(actionType);
    if (billingErrors.length > 0) {
      setErrorMsg(billingErrors.join(' | '));
      setCurrentStep(4);
      setActiveSubmissionAction(null);
      return;
    }

    // Calculate canonical customer total
    const overrideText = String(pricing.finalCustomerTotal ?? '').trim();
    const hasOverride = overrideText !== '';
    const calculatedAmount = Number.parseFloat(calculatedTotal);
    const overrideAmount = Number.parseFloat(overrideText);
    const finalCustomerTotal = hasOverride ? overrideAmount : calculatedAmount;

    if (!isDraft && (!Number.isFinite(finalCustomerTotal) || finalCustomerTotal <= 0)) {
      setErrorMsg('Final Customer Total must be a valid amount greater than zero.');
      setCurrentStep(3);
      setActiveSubmissionAction(null);
      return;
    }

    const supplierTotal =
      (Number.parseFloat(pricing.supplierCost) || 0) +
      (Number.parseFloat(pricing.supplierTaxes) || 0) +
      (Number.parseFloat(pricing.supplierFees) || 0);

    setActiveSubmissionAction(actionType);
    setErrorMsg('');
    setSuccessMsg('');

    // Reuse active idempotency key if retrying the same action, otherwise generate new
    let idempotencyKey = activeCreateRequest?.actionType === actionType ? activeCreateRequest.idempotencyKey : null;
    if (!idempotencyKey) {
      idempotencyKey = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setActiveCreateRequest({ actionType, idempotencyKey });
    }

    try {
      const payload = {
        actionType,
        clientRequestId: idempotencyKey,
        customerName: `${passengers[0]?.firstName || ''} ${passengers[0]?.lastName || ''}`.trim() || 'Valued Passenger',
        email: contactInfo.email,
        phone: contactInfo.phone,

        // TOP-LEVEL CANONICAL PRICE CONTRACT
        customer_price: finalCustomerTotal || 0,
        customerPrice: finalCustomerTotal || 0,
        total_amount: finalCustomerTotal || 0,
        totalAmount: finalCustomerTotal || 0,
        amount: finalCustomerTotal || 0,
        price: finalCustomerTotal || 0,
        currency: (pricing.currency || 'USD').toUpperCase(),

        supplier_price: supplierTotal,
        supplierPrice: supplierTotal,

        discount_amount: Number.parseFloat(pricing.discount) || 0,
        discountAmount: Number.parseFloat(pricing.discount) || 0,

        idempotency_key: idempotencyKey,
        idempotencyKey: idempotencyKey,

        passengers: passengers.map(p => ({
          role: p.role,
          title: p.title,
          firstName: p.firstName,
          lastName: p.lastName,
          gender: p.gender,
          dateOfBirth: p.dateOfBirth,
          passportNumber: p.passportNumber,
          passportCountry: p.passportCountry,
          passportExpiry: p.passportExpiry
        })),
        flight: {
          tripType,
          outbound: outboundSegments,
          return: returnSegments,
          multiCity: multiCityJourneysState,
          price: finalCustomerTotal || 0,
          totalPrice: finalCustomerTotal || 0
        },
        pricing: {
          supplierCost: Number.parseFloat(pricing.supplierCost) || 0,
          supplierTaxes: Number.parseFloat(pricing.supplierTaxes) || 0,
          supplierFees: Number.parseFloat(pricing.supplierFees) || 0,
          agencyFee: Number.parseFloat(pricing.agencyFee) || 0,
          markup: Number.parseFloat(pricing.markup) || 0,
          discount: Number.parseFloat(pricing.discount) || 0,
          currency: (pricing.currency || 'USD').toUpperCase(),
          totalPrice: finalCustomerTotal || 0,
          finalCustomerTotal: finalCustomerTotal || 0,
          customerTotal: finalCustomerTotal || 0,
          calculatedTotal: calculatedAmount || 0,
          priceOverrideReason: pricing.priceOverrideReason || ''
        },
        billingDetails: {
          cardholderName: billing.cardholderName,
          addressLine1: billing.addressLine1,
          addressLine2: billing.addressLine2,
          city: billing.city,
          state: billing.state,
          postalCode: billing.postalCode,
          country: billing.country,
          cardBrand: billing.cardBrand,
          cardLast4: billing.cardLast4,
          expMonth: billing.expMonth,
          expYear: billing.expYear,
          paymentToken: billing.paymentToken || null,
          authSource: billing.authSource,
          authNote: billing.authNote
        },
      };

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 45000);

      let res = null;
      try {
        res = await adminAPI.createBooking(payload, { signal: controller.signal });
        window.clearTimeout(timeoutId);
      } catch (reqErr) {
        window.clearTimeout(timeoutId);

        const isCanceledRequest =
          reqErr?.name === 'CanceledError' ||
          reqErr?.name === 'AbortError' ||
          reqErr?.code === 'ERR_CANCELED' ||
          reqErr?.code === 'ECONNABORTED' ||
          reqErr?.message === 'canceled';

        if (isCanceledRequest) {
          setSuccessMsg('The booking request took too long. Verifying whether it was created…');
          const reconRes = await adminAPI.getBookingByClientRequestId(idempotencyKey).catch(() => null);
          if (reconRes?.found && (reconRes?.booking || reconRes?.data)) {
            res = { success: true, booking: reconRes.booking || reconRes.data };
          } else {
            setErrorMsg('The server did not confirm creation. No booking was found for this request.');
            setActiveSubmissionAction(null);
            return;
          }
        } else {
          throw reqErr;
        }
      }

      // Read booking reference safely from normalized response shape
      const resData = res?.data ?? res;
      const createdBooking = res?.booking || resData?.booking || resData;
      const createdBookingId = createdBooking?.id;

      if (!createdBookingId && (res?.success || resData?.success)) {
        setErrorMsg('BOOKING_RESPONSE_INVALID: Server created a booking but did not return its database ID.');
        setActiveSubmissionAction(null);
        return;
      }

      const bookingRef =
        createdBooking?.confirmation_code ||
        createdBooking?.confirmationCode ||
        createdBooking?.booking_reference ||
        createdBookingId ||
        'TFS-NEW';

      if (res?.success || resData?.success || createdBookingId) {
        setActiveCreateRequest(null);

        if (actionType === 'create_and_send_auth' && createdBookingId) {
          setSuccessMsg(`Booking ${bookingRef} created successfully! Phase 2: Sending Authorization Email…`);
          try {
            const authResult = await adminAPI.sendAuthorizationEmail(createdBookingId, false);
            if (authResult?.success) {
              setSuccessMsg(`Booking ${bookingRef} created and authorization email sent.`);
            } else {
              throw new Error(authResult?.error?.message || authResult?.message || 'Authorization email dispatch failed.');
            }
          } catch (authErr) {
            setSuccessMsg(`Booking ${bookingRef} was created successfully.`);
            setErrorMsg(`Authorization email was not sent: ${authErr.message || authErr}`);
          }
        } else if (actionType === 'create_draft') {
          setSuccessMsg(`Draft booking saved successfully! Reference: ${bookingRef}. Navigating to dashboard…`);
        } else {
          setSuccessMsg(`Booking created! Reference: ${bookingRef}. Navigating to dashboard…`);
        }
        setTimeout(() => navigate('/admin/dashboard'), 2500);
      } else {
        const errMsg = resData?.error?.message || resData?.message || res?.message || 'Failed to create booking. Check all required fields.';
        setErrorMsg(errMsg);
      }
    } catch (err) {
      const errMsg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        err?.message ||
        'Error submitting booking. Please check your network connection.';
      setErrorMsg(errMsg);
    } finally {
      setActiveSubmissionAction(null);
    }
  };

  return (
    <div className="admin-dashboard-page" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* HEADER & ACTION BUTTONS */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #cbd5e1', paddingBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button type="button" onClick={() => navigate('/admin/dashboard')} className="admin-secondary-btn">
            <i className="fas fa-arrow-left"></i> Back to Dashboard
          </button>
          <h1 style={{ margin: 0, color: '#1e3a5f', fontSize: '1.6rem', fontWeight: '800' }}>
            + Create New Booking
          </h1>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" onClick={() => navigate('/admin/dashboard')} className="admin-secondary-btn">
            Cancel
          </button>
          <button type="button" onClick={() => handleCreateBooking('create_draft')} disabled={isSubmitting} className="admin-secondary-btn" style={{ background: '#e0f2fe', color: '#0369a1', borderColor: '#bae6fd' }}>
            <i className="fas fa-save" style={{ marginRight: '4px' }}></i> Save Draft
          </button>
        </div>
      </div>

      {/* ERROR / SUCCESS ALERTS */}
      {errorMsg && (
        <div style={{ background: '#fee2e2', border: '1px solid #fecaca', color: '#991b1b', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.85rem' }}>
          <i className="fas fa-exclamation-triangle" style={{ marginRight: '8px' }}></i> {errorMsg}
        </div>
      )}
      {successMsg && (
        <div style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#15803d', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.85rem', fontWeight: '600' }}>
          <i className="fas fa-check-circle" style={{ marginRight: '8px' }}></i> {successMsg}
        </div>
      )}

      {/* 5 WORKFLOW STEPS STEPPER CONTROL */}
      <div style={{ display: 'flex', borderBottom: '1px solid #cbd5e1', marginBottom: '24px', background: '#f8fafc', borderRadius: '8px', padding: '4px' }}>
        {[
          { num: 1, label: '1. Passenger & Contact' },
          { num: 2, label: '2. Itinerary' },
          { num: 3, label: '3. Pricing' },
          { num: 4, label: '4. Billing & Payment' },
          { num: 5, label: '5. Review & Create' }
        ].map(step => (
          <button
            key={step.num}
            type="button"
            onClick={() => setCurrentStep(step.num)}
            style={{
              flex: 1,
              padding: '10px 14px',
              border: 'none',
              borderRadius: '6px',
              background: currentStep === step.num ? '#1e3a5f' : 'transparent',
              color: currentStep === step.num ? '#ffffff' : '#64748b',
              fontWeight: currentStep === step.num ? '700' : '600',
              fontSize: '0.83rem',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            {step.label}
          </button>
        ))}
      </div>

      {/* STEP BODY CONTAINER */}
      <div className="admin-create-booking-step-card">

        {/* REQUIRED FIELDS LEGEND */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', fontSize: '0.78rem', color: '#64748b' }}>
          <span>* Required field</span>
          <span>Step {currentStep} of 5</span>
        </div>

        {/* STEP 1: PASSENGER & CONTACT */}
        {currentStep === 1 && (
          <div>
            <h3 style={{ margin: '0 0 16px', color: '#1e3a5f' }}><i className="fas fa-user" style={{ marginRight: '8px' }}></i> Step 1: Passenger &amp; Contact Details</h3>

            <div className="drawer-grid-2col" style={{ marginBottom: '20px' }}>
              <div className="drawer-form-field">
                <label style={{ fontWeight: 700 }}>Contact Email <span className="required-marker">*</span></label>
                <input type="email" value={contactInfo.email} onChange={e => { setContactInfo({ ...contactInfo, email: e.target.value }); setErrorMsg(''); }} placeholder="customer@example.com" />
              </div>
              <div className="drawer-form-field">
                <label style={{ fontWeight: 700 }}>Contact Phone</label>
                <input type="text" value={contactInfo.phone} onChange={e => setContactInfo({ ...contactInfo, phone: e.target.value })} placeholder="+1 (555) 000-0000" />
              </div>
            </div>

            <h4 style={{ color: '#334155', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', marginBottom: '14px' }}>Passengers List</h4>

            {passengers.map((p, pIdx) => (
              <div key={p.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontWeight: 700, color: '#1e3a5f' }}>
                  <span>Passenger #{pIdx + 1} ({pIdx === 0 ? 'Primary Passenger' : 'Additional Passenger'})</span>
                  {pIdx > 0 && (
                    <button type="button" onClick={() => setPassengers(passengers.filter((_, idx) => idx !== pIdx))} style={{ color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>
                      Remove Passenger
                    </button>
                  )}
                </div>

                <div className="drawer-grid-3col">
                  <div className="drawer-form-field">
                    <label>Title</label>
                    <select value={p.title} onChange={e => { const next = [...passengers]; next[pIdx].title = e.target.value; setPassengers(next); }}>
                      <option value="Mr">Mr</option><option value="Mrs">Mrs</option><option value="Ms">Ms</option><option value="Dr">Dr</option>
                    </select>
                  </div>
                  <div className="drawer-form-field">
                    <label>First Name <span className="required-marker">*</span></label>
                    <input type="text" value={p.firstName} onChange={e => { const next = [...passengers]; next[pIdx].firstName = e.target.value; setPassengers(next); setErrorMsg(''); }} placeholder="John" />
                  </div>
                  <div className="drawer-form-field">
                    <label>Last Name <span className="required-marker">*</span></label>
                    <input type="text" value={p.lastName} onChange={e => { const next = [...passengers]; next[pIdx].lastName = e.target.value; setPassengers(next); setErrorMsg(''); }} placeholder="Doe" />
                  </div>
                  <div className="drawer-form-field">
                    <label>Gender</label>
                    <select value={p.gender} onChange={e => { const next = [...passengers]; next[pIdx].gender = e.target.value; setPassengers(next); }}>
                      <option value="Male">Male</option><option value="Female">Female</option>
                    </select>
                  </div>

                  {/* CONTROLLED RELIABLE DATE OF BIRTH COMPONENT */}
                  <DobInputComponent
                    label="Date of Birth"
                    required={true}
                    value={p.dateOfBirth}
                    hasError={!!dobErrors[p.id || pIdx]}
                    errorMessage={dobErrors[p.id || pIdx]}
                    onChange={(val) => {
                      const next = [...passengers];
                      next[pIdx].dateOfBirth = val;
                      setPassengers(next);
                      if (val) {
                        setDobErrors(prev => ({ ...prev, [p.id || pIdx]: null }));
                        setErrorMsg('');
                      }
                    }}
                  />

                  <div className="drawer-form-field">
                    <label>Passport Number</label>
                    <input type="text" value={p.passportNumber} onChange={e => { const next = [...passengers]; next[pIdx].passportNumber = e.target.value; setPassengers(next); }} placeholder="A12345678" />
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={() => setPassengers([...passengers, { id: `p-${Date.now()}`, role: 'adult', title: 'Mr', firstName: '', lastName: '', gender: 'Male', dateOfBirth: '', passportNumber: '', passportCountry: 'United States', passportExpiry: '' }])}
              style={{ background: '#f1f5f9', border: '1px dashed #cbd5e1', color: '#1e3a5f', padding: '8px 16px', borderRadius: '6px', fontWeight: '700', fontSize: '0.82rem', cursor: 'pointer', width: '100%' }}
            >
              + Add Additional Passenger
            </button>
          </div>
        )}

        {/* STEP 2: ITINERARY */}
        {currentStep === 2 && (
          <div>
            <h3 style={{ margin: '0 0 16px', color: '#1e3a5f' }}><i className="fas fa-plane" style={{ marginRight: '8px' }}></i> Step 2: Flight Selection &amp; Itinerary</h3>

            {/* ITINERARY CONTROL TOOLBAR: [ Import Itinerary ] [ Information ⓘ ] [ Clear Itinerary ] */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', border: '1px solid #cbd5e1', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button" onClick={() => setIsImportModalOpen(true)} className="admin-primary-btn" style={{ background: '#8b1236' }}>
                  <i className="fas fa-file-import"></i> Import Itinerary
                </button>
                <button type="button" onClick={() => setIsGptHelpOpen(true)} aria-label="Itinerary import help" title="Itinerary import help" style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '50%', width: '32px', height: '32px', fontWeight: 'bold', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#1e3a5f', fontSize: '14px' }}>
                  ⓘ
                </button>
              </div>

              <button type="button" onClick={handleClearItinerary} style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', padding: '6px 14px', borderRadius: '6px', fontWeight: '700', fontSize: '0.8rem', cursor: 'pointer' }}>
                <i className="fas fa-trash-alt"></i> Clear Itinerary
              </button>
            </div>

            {/* OUTBOUND SEGMENTS LIST */}
            <h4 style={{ color: '#334155', margin: '0 0 10px' }}>Outbound Segments ({outboundSegments.length})</h4>
            {outboundSegments.map((seg, idx) => (
              <div key={seg.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px', marginBottom: '12px' }}>
                <div className="drawer-grid-3col">
                  <div className="drawer-form-field">
                    <label>Airline Code &amp; Flight #</label>
                    <input type="text" value={`${seg.carrier_code} ${seg.flight_number}`} onChange={e => { const parts = e.target.value.split(' '); const next = [...outboundSegments]; next[idx].carrier_code = parts[0] || ''; next[idx].flight_number = parts[1] || ''; setOutboundSegments(next); }} placeholder="DL 106" />
                  </div>
                  <div className="drawer-form-field">
                    <label>Origin Airport (IATA)</label>
                    <input type="text" value={seg.origin_airport} onChange={e => { const next = [...outboundSegments]; next[idx].origin_airport = e.target.value.toUpperCase(); setOutboundSegments(next); }} placeholder="JFK" />
                  </div>
                  <div className="drawer-form-field">
                    <label>Destination Airport (IATA)</label>
                    <input type="text" value={seg.destination_airport} onChange={e => { const next = [...outboundSegments]; next[idx].destination_airport = e.target.value.toUpperCase(); setOutboundSegments(next); }} placeholder="LHR" />
                  </div>
                  <div className="drawer-form-field">
                    <label>Departure Date</label>
                    <input type="date" value={seg.departure_date} onChange={e => { const next = [...outboundSegments]; next[idx].departure_date = e.target.value; setOutboundSegments(next); }} />
                  </div>
                  <div className="drawer-form-field">
                    <label>Departure Time</label>
                    <input type="text" value={seg.departure_time} onChange={e => { const next = [...outboundSegments]; next[idx].departure_time = e.target.value; setOutboundSegments(next); }} placeholder="19:30" />
                  </div>
                  <div className="drawer-form-field">
                    <label>Arrival Time</label>
                    <input type="text" value={seg.arrival_time} onChange={e => { const next = [...outboundSegments]; next[idx].arrival_time = e.target.value; setOutboundSegments(next); }} placeholder="07:45" />
                  </div>

                  {/* EDITABLE ARRIVAL DATE WITH UNCONFIRMED WARNING */}
                  <div className="drawer-form-field" style={{ gridColumn: 'span 2' }}>
                    <label>Arrival Date *</label>
                    <input type="date" value={seg.arrival_date} onChange={e => { const next = [...outboundSegments]; next[idx].arrival_date = e.target.value; setOutboundSegments(next); }} />
                    {(!seg.arrival_date || seg.arrival_date === seg.departure_date) && (
                      <small style={{ color: '#d97706', fontSize: '0.72rem', display: 'block', marginTop: '4px' }}>
                        <i className="fas fa-exclamation-circle"></i> Arrival date was not included in GDS line. Please verify whether this flight arrives the same day or following day.
                      </small>
                    )}
                  </div>
                  <div className="drawer-form-field">
                    <label>Cabin Class</label>
                    <select value={seg.cabin} onChange={e => { const next = [...outboundSegments]; next[idx].cabin = e.target.value; setOutboundSegments(next); }}>
                      <option value="Economy">Economy</option><option value="Premium Economy">Premium Economy</option><option value="Business">Business</option><option value="First">First</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}

            {/* RETURN SEGMENTS LIST (IF ROUND TRIP) */}
            {returnSegments.length > 0 && (
              <div style={{ marginTop: '20px' }}>
                <h4 style={{ color: '#334155', margin: '0 0 10px' }}>Inbound / Return Segments ({returnSegments.length})</h4>
                {returnSegments.map((seg, idx) => (
                  <div key={seg.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px', marginBottom: '12px' }}>
                    <div className="drawer-grid-3col">
                      <div className="drawer-form-field">
                        <label>Airline Code &amp; Flight #</label>
                        <input type="text" value={`${seg.carrier_code} ${seg.flight_number}`} onChange={e => { const parts = e.target.value.split(' '); const next = [...returnSegments]; next[idx].carrier_code = parts[0] || ''; next[idx].flight_number = parts[1] || ''; setReturnSegments(next); }} placeholder="DL 107" />
                      </div>
                      <div className="drawer-form-field">
                        <label>Origin Airport (IATA)</label>
                        <input type="text" value={seg.origin_airport} onChange={e => { const next = [...returnSegments]; next[idx].origin_airport = e.target.value.toUpperCase(); setReturnSegments(next); }} placeholder="LHR" />
                      </div>
                      <div className="drawer-form-field">
                        <label>Destination Airport (IATA)</label>
                        <input type="text" value={seg.destination_airport} onChange={e => { const next = [...returnSegments]; next[idx].destination_airport = e.target.value.toUpperCase(); setReturnSegments(next); }} placeholder="JFK" />
                      </div>
                      <div className="drawer-form-field">
                        <label>Departure Date</label>
                        <input type="date" value={seg.departure_date} onChange={e => { const next = [...returnSegments]; next[idx].departure_date = e.target.value; setReturnSegments(next); }} />
                      </div>
                      <div className="drawer-form-field">
                        <label>Departure Time</label>
                        <input type="text" value={seg.departure_time} onChange={e => { const next = [...returnSegments]; next[idx].departure_time = e.target.value; setReturnSegments(next); }} placeholder="12:00" />
                      </div>
                      <div className="drawer-form-field">
                        <label>Arrival Time</label>
                        <input type="text" value={seg.arrival_time} onChange={e => { const next = [...returnSegments]; next[idx].arrival_time = e.target.value; setReturnSegments(next); }} placeholder="15:30" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* VISUAL ITINERARY TIMELINE ROUTE DISPLAY */}
            {outboundSegments.length > 0 && (
              <ItineraryTimeline segments={outboundSegments} title="Outbound Flight Route Timeline" />
            )}
            {returnSegments.length > 0 && (
              <ItineraryTimeline segments={returnSegments} title="Inbound / Return Flight Route Timeline" />
            )}

            {/* GDS-STYLE REFERENCE DISPLAY BOX */}
            <div style={{ marginTop: '20px', background: '#0f172a', color: '#38bdf8', padding: '16px', borderRadius: '8px', fontFamily: 'monospace', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.75rem', marginBottom: '8px' }}>
                <span>GDS-Style Reference Lines (Agent Display)</span>
                <button type="button" onClick={() => { navigator.clipboard.writeText(gdsReferenceText); setCopyToast('Copied reference lines!'); setTimeout(() => setCopyToast(''), 2000); }} style={{ background: '#1e293b', border: '1px solid #334155', color: '#f8fafc', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem' }}>
                  {copyToast || 'Copy Reference'}
                </button>
              </div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{gdsReferenceText || '// No GDS reference lines'}</pre>
            </div>
          </div>
        )}

        {/* STEP 3: PRICING BREAKDOWN */}
        {currentStep === 3 && (
          <div>
            <h3 style={{ margin: '0 0 16px', color: '#1e3a5f' }}><i className="fas fa-calculator" style={{ marginRight: '8px' }}></i> Step 3: Pricing Breakdown</h3>
            <div className="admin-pricing-grid">
              <div className="drawer-form-field">
                <label style={{ fontWeight: 700 }}>Supplier Flight Cost ($)</label>
                <input type="number" step="0.01" value={pricing.supplierCost} onChange={e => setPricing({ ...pricing, supplierCost: e.target.value })} />
              </div>
              <div className="drawer-form-field">
                <label style={{ fontWeight: 700 }}>Agency Service Fee ($)</label>
                <input type="number" step="0.01" value={pricing.agencyFee} onChange={e => setPricing({ ...pricing, agencyFee: e.target.value })} />
              </div>
              <div className="drawer-form-field">
                <label>Supplier Taxes ($)</label>
                <input type="number" step="0.01" value={pricing.supplierTaxes} onChange={e => setPricing({ ...pricing, supplierTaxes: e.target.value })} />
              </div>
              <div className="drawer-form-field">
                <label>Agency Markup ($)</label>
                <input type="number" step="0.01" value={pricing.markup} onChange={e => setPricing({ ...pricing, markup: e.target.value })} />
              </div>
              <div className="drawer-form-field">
                <label>Supplier Fees ($)</label>
                <input type="number" step="0.01" value={pricing.supplierFees} onChange={e => setPricing({ ...pricing, supplierFees: e.target.value })} />
              </div>
              <div className="drawer-form-field">
                <label>Discount ($)</label>
                <input type="number" step="0.01" value={pricing.discount} onChange={e => setPricing({ ...pricing, discount: e.target.value })} />
              </div>
            </div>

            <div style={{ marginTop: '20px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <span style={{ fontSize: '0.85rem', color: '#64748b', display: 'block' }}>Calculated Customer Total</span>
                <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1e3a5f' }}>${calculatedTotal} {pricing.currency}</span>
              </div>

              <div style={{ width: '240px' }}>
                <label style={{ fontWeight: 700, fontSize: '0.8rem', color: '#1e3a5f', display: 'block', marginBottom: '4px' }}>Final Customer Total Override ($)</label>
                <input type="number" step="0.01" value={pricing.finalCustomerTotal} onChange={e => setPricing({ ...pricing, finalCustomerTotal: e.target.value })} style={{ width: '100%', fontWeight: 700, fontSize: '1.1rem', color: '#8b1236' }} />
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: BILLING & PAYMENT */}
        {currentStep === 4 && (
          <div>
            <h3 style={{ margin: '0 0 16px', color: '#1e3a5f' }}><i className="fas fa-credit-card" style={{ marginRight: '8px' }}></i> Step 4: Billing &amp; Payment Details</h3>
            <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '-8px 0 16px' }}>
              * Required for authorization or payment processing. Optional when creating a draft or booking without payment.
            </p>
            <div className="drawer-grid-2col" style={{ marginBottom: '16px' }}>
              <div className="drawer-form-field">
                <label style={{ fontWeight: 700 }}>Cardholder Name <span className="required-marker">*</span></label>
                <input type="text" value={billing.cardholderName} onChange={e => setBilling({ ...billing, cardholderName: e.target.value })} placeholder="John Doe" />
              </div>
              <div className="drawer-form-field">
                <label style={{ fontWeight: 700 }}>Address Line 1 <span className="required-marker">*</span></label>
                <input type="text" value={billing.addressLine1} onChange={e => setBilling({ ...billing, addressLine1: e.target.value })} placeholder="123 Main St" />
              </div>
              <div className="drawer-form-field">
                <label style={{ fontWeight: 700 }}>City <span className="required-marker">*</span></label>
                <input type="text" value={billing.city} onChange={e => setBilling({ ...billing, city: e.target.value })} placeholder="New York" />
              </div>
              <div className="drawer-form-field">
                <label style={{ fontWeight: 700 }}>State / Province <span className="required-marker">*</span></label>
                <input type="text" value={billing.state} onChange={e => setBilling({ ...billing, state: e.target.value })} placeholder="NY" />
              </div>
              <div className="drawer-form-field">
                <label style={{ fontWeight: 700 }}>Postal Code <span className="required-marker">*</span></label>
                <input type="text" value={billing.postalCode} onChange={e => setBilling({ ...billing, postalCode: e.target.value })} placeholder="10001" />
              </div>
              <div className="drawer-form-field">
                <label style={{ fontWeight: 700 }}>Country <span className="required-marker">*</span></label>
                <select value={billing.country} onChange={e => setBilling({ ...billing, country: e.target.value })}>
                  <option value="United States">United States</option><option value="Canada">Canada</option><option value="United Kingdom">United Kingdom</option>
                </select>
              </div>
            </div>

            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '16px', marginTop: '16px' }}>
              <h4 style={{ margin: '0 0 4px', color: '#166534', fontSize: '0.9rem' }}>
                <i className="fas fa-shield-alt" style={{ marginRight: '6px' }}></i> Card Reference (No full card number or CVV)
              </h4>
              <p style={{ margin: '0 0 12px', fontSize: '0.78rem', color: '#15803d' }}>
                Enter the card brand, last 4 digits and expiry only. Full card number and CVV are never collected here.
              </p>
              <div className="drawer-grid-3col">
                <div className="drawer-form-field">
                  <label style={{ fontWeight: 700 }}>Card Brand <span className="required-marker">*</span></label>
                  <select
                    value={billing.cardBrand}
                    onChange={e => setBilling({ ...billing, cardBrand: e.target.value })}
                  >
                    <option value="">— Select brand —</option>
                    <option value="visa">Visa</option>
                    <option value="mastercard">Mastercard</option>
                    <option value="amex">American Express</option>
                    <option value="discover">Discover</option>
                  </select>
                </div>
                <div className="drawer-form-field">
                  <label style={{ fontWeight: 700 }}>Last 4 Digits <span className="required-marker">*</span></label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="e.g. 1234"
                    value={billing.cardLast4}
                    onChange={e => setBilling({ ...billing, cardLast4: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                  />
                </div>
                <div className="drawer-form-field">
                  <label style={{ fontWeight: 700 }}>Expiry Month <span className="required-marker">*</span></label>
                  <select
                    value={billing.expMonth}
                    onChange={e => setBilling({ ...billing, expMonth: e.target.value })}
                  >
                    <option value="">MM</option>
                    {['01','02','03','04','05','06','07','08','09','10','11','12'].map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="drawer-form-field">
                  <label style={{ fontWeight: 700 }}>Expiry Year <span className="required-marker">*</span></label>
                  <select
                    value={billing.expYear}
                    onChange={e => setBilling({ ...billing, expYear: e.target.value })}
                  >
                    <option value="">YYYY</option>
                    {EXPIRY_YEARS.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
              {billing.cardBrand && billing.cardLast4.length === 4 && (
                <div style={{ marginTop: '10px', padding: '8px 12px', background: '#dcfce7', borderRadius: '6px', fontSize: '0.85rem', color: '#166534', fontWeight: 700 }}>
                  {billing.cardBrand.charAt(0).toUpperCase() + billing.cardBrand.slice(1)} •••• {billing.cardLast4}
                  {billing.expMonth && billing.expYear && ` — Exp. ${billing.expMonth}/${billing.expYear}`}
                </div>
              )}
              <small style={{ color: '#15803d', fontSize: '0.75rem', marginTop: '8px', display: 'block' }}>
                ⚠ Raw credit card numbers and CVV codes are NEVER stored in state, database, or logs.
              </small>
            </div>

            <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '8px', padding: '12px 16px', marginTop: '16px' }}>
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#92400e', fontWeight: 600 }}>
                <i className="fas fa-info-circle" style={{ marginRight: '6px' }}></i>
                <strong>Payment Processing:</strong> "Create &amp; Process Payment" requires a real payment provider token.
                If no payment processor is configured, use "Create Without Payment" or "Create &amp; Send Auth" instead.
              </p>
            </div>
          </div>
        )}

        {/* STEP 5: REVIEW & CREATE */}
        {currentStep === 5 && (
          <div>
            <h3 style={{ margin: '0 0 16px', color: '#1e3a5f' }}><i className="fas fa-check-double" style={{ marginRight: '8px' }}></i> Step 5: Review &amp; Create Booking</h3>

            <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '20px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '12px' }}>
                <div>
                  <h4 style={{ margin: 0, color: '#1e3a5f' }}>Primary Customer: {passengers[0]?.firstName} {passengers[0]?.lastName}</h4>
                  <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Email: {contactInfo.email || 'Not provided'} | Phone: {contactInfo.phone || 'Not provided'}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block' }}>Total Customer Price</span>
                  <span style={{ fontSize: '1.3rem', fontWeight: 800, color: '#8b1236' }}>${pricing.finalCustomerTotal || calculatedTotal} USD</span>
                </div>
              </div>

              <div style={{ fontSize: '0.85rem', color: '#334155' }}>
                <p style={{ margin: '4px 0' }}><strong>Trip Type:</strong> {tripType.toUpperCase()}</p>
                <p style={{ margin: '4px 0' }}><strong>Outbound Flight:</strong> {outboundSegments[0]?.carrier_code} {outboundSegments[0]?.flight_number} ({outboundSegments[0]?.origin_airport} → {outboundSegments[0]?.destination_airport})</p>
                {returnSegments.length > 0 && (
                  <p style={{ margin: '4px 0' }}><strong>Return Flight:</strong> {returnSegments[0]?.carrier_code} {returnSegments[0]?.flight_number} ({returnSegments[0]?.origin_airport} → {returnSegments[0]?.destination_airport})</p>
                )}
                <p style={{ margin: '4px 0' }}><strong>Total Passengers:</strong> {passengers.length}</p>
              </div>

              {/* VISUAL TIMELINE SUMMARY */}
              <div style={{ marginTop: '16px' }}>
                {outboundSegments.length > 0 && <ItineraryTimeline segments={outboundSegments} title="Outbound Journey" />}
                {returnSegments.length > 0 && <ItineraryTimeline segments={returnSegments} title="Return Journey" />}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => handleCreateBooking('create_without_payment')}
              disabled={isSubmitting}
              className="admin-primary-btn"
              style={{ background: '#059669', padding: '12px', fontWeight: 700, flex: 1, opacity: (isSubmitting && activeSubmissionAction !== 'create_without_payment' ? 0.5 : 1) }}
            >
              {activeSubmissionAction === 'create_without_payment' ? (
                <><i className="fas fa-spinner fa-spin" style={{ marginRight: '6px' }}></i>Creating Booking…</>
              ) : (
                'Create Booking Without Payment'
              )}
            </button>

            <button
              type="button"
              onClick={() => handleCreateBooking('create_and_send_auth')}
              disabled={isSubmitting}
              className="admin-primary-btn"
              style={{ background: '#1e3a5f', padding: '12px', fontWeight: 700, flex: 1, opacity: (isSubmitting && activeSubmissionAction !== 'create_and_send_auth' ? 0.5 : 1) }}
            >
              {activeSubmissionAction === 'create_and_send_auth' ? (
                <><i className="fas fa-spinner fa-spin" style={{ marginRight: '6px' }}></i>Phase 1: Creating Booking…</>
              ) : (
                <><i className="fas fa-paper-plane" style={{ marginRight: '6px' }}></i>Create &amp; Send Auth</>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleCreateBooking('create_and_process_payment')}
              disabled={isSubmitting || !billing.paymentToken}
              className="admin-primary-btn"
              style={{ background: '#8b1236', padding: '12px', fontWeight: 700, flex: 1, opacity: (!billing.paymentToken || isSubmitting ? 0.5 : 1) }}
              title={!billing.paymentToken ? 'Payment processing is not configured. Use Create Without Payment or Send Auth.' : 'Create and process payment'}
            >
              {activeSubmissionAction === 'create_and_process_payment' ? (
                <><i className="fas fa-spinner fa-spin" style={{ marginRight: '6px' }}></i>Processing Payment…</>
              ) : (
                <><i className="fas fa-credit-card" style={{ marginRight: '6px' }}></i>Create &amp; Process Payment</>
              )}
            </button>
          </div>
          {!billing.paymentToken && (
            <p style={{ margin: '8px 0 0', fontSize: '0.78rem', color: '#92400e', fontStyle: 'italic' }}>
              Payment processing is not configured. Create the booking without payment or send authorization.
            </p>
          )}
        </div>
      )}

        {/* STEP FOOTER NAVIGATION */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
          {currentStep > 1 ? (
            <button type="button" onClick={() => setCurrentStep(currentStep - 1)} className="admin-secondary-btn">
              ← Back
            </button>
          ) : <div />}

          {currentStep < 5 && (
            <button type="button" onClick={() => setCurrentStep(currentStep + 1)} className="admin-primary-btn" style={{ background: '#1e3a5f' }}>
              Continue →
            </button>
          )}
        </div>
      </div>

      {/* ================================================== */}
      {/* 3-TRIP-TYPE ITINERARY IMPORT MODAL */}
      {/* ================================================== */}
      {isImportModalOpen && (
        <div className="admin-modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#ffffff', borderRadius: '12px', maxWidth: '750px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, color: '#1e3a5f', fontSize: '1.25rem' }}><i className="fas fa-file-import" style={{ marginRight: '8px' }}></i> Import Itinerary</h3>
              <button type="button" onClick={() => setIsImportModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#64748b' }}>×</button>
            </div>

            {/* STEP 1: ASK FOR TRIP TYPE */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontWeight: 700, color: '#1e3a5f', display: 'block', marginBottom: '8px' }}>
                What type of trip is this? *
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                {[
                  { id: 'one_way', label: 'One Way', icon: 'fa-arrow-right' },
                  { id: 'round_trip', label: 'Round Trip', icon: 'fa-exchange-alt' },
                  { id: 'multi_city', label: 'Multi-City', icon: 'fa-route' }
                ].map(type => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => {
                      setSelectedTripType(type.id);
                      setImportErrors([]);
                    }}
                    style={{
                      padding: '12px 8px',
                      borderRadius: '8px',
                      border: selectedTripType === type.id ? '2px solid #8b1236' : '1px solid #cbd5e1',
                      background: selectedTripType === type.id ? '#fff1f2' : '#f8fafc',
                      color: selectedTripType === type.id ? '#8b1236' : '#334155',
                      fontWeight: selectedTripType === type.id ? '700' : '600',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.2s'
                    }}
                  >
                    <i className={`fas ${type.icon}`} style={{ fontSize: '1.1rem' }}></i>
                    <span>{type.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* ERROR DISPLAY IN MODAL */}
            {importErrors.length > 0 && (
              <div style={{ background: '#fee2e2', border: '1px solid #fecaca', color: '#991b1b', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.83rem' }}>
                <strong><i className="fas fa-exclamation-circle" style={{ marginRight: '6px' }}></i> Import Validation Errors:</strong>
                <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
                  {importErrors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              </div>
            )}

            {/* TRIP-TYPE SPECIFIC IMPORT TEXTAREAS */}
            {selectedTripType === 'one_way' && (
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontWeight: 700, color: '#1e3a5f' }}>Outbound Itinerary *</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Travel Year:</span>
                    <select value={oneWayYear} onChange={e => setOneWayYear(e.target.value)} style={{ padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                      <option value="2026">2026</option><option value="2027">2027</option><option value="2028">2028</option>
                    </select>
                  </div>
                </div>
                <textarea
                  rows={5}
                  value={oneWayText}
                  onChange={e => setOneWayText(e.target.value)}
                  placeholder="Paste Outbound GDS-Style Lines&#10;e.g. 01 DL 106 Y 15SEP JFKLHR 1930 0745 NN1"
                  style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.85rem', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
              </div>
            )}

            {selectedTripType === 'round_trip' && (
              <div>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ fontWeight: 700, color: '#1e3a5f' }}>Outbound Itinerary *</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Travel Year:</span>
                      <select value={roundTripOutboundYear} onChange={e => setRoundTripOutboundYear(e.target.value)} style={{ padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                        <option value="2026">2026</option><option value="2027">2027</option>
                      </select>
                    </div>
                  </div>
                  <textarea
                    rows={4}
                    value={roundTripOutboundText}
                    onChange={e => setRoundTripOutboundText(e.target.value)}
                    placeholder="Paste Outbound GDS-Style Lines&#10;e.g. 01 DL 106 Y 15SEP JFKLHR 1930 0745 NN1"
                    style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.85rem', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </div>

                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ fontWeight: 700, color: '#1e3a5f' }}>Inbound / Return Itinerary — Optional</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Travel Year:</span>
                      <select value={roundTripReturnYear} onChange={e => setRoundTripReturnYear(e.target.value)} style={{ padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                        <option value="2026">2026</option><option value="2027">2027</option>
                      </select>
                    </div>
                  </div>
                  <textarea
                    rows={4}
                    value={roundTripReturnText}
                    onChange={e => setRoundTripReturnText(e.target.value)}
                    placeholder="Paste Inbound / Return GDS-Style Lines — Optional"
                    style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.85rem', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </div>
              </div>
            )}

            {selectedTripType === 'multi_city' && (
              <div>
                {multiCityJourneys.map((j, jIdx) => (
                  <div key={j.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 700, color: '#1e3a5f' }}>Multi-City Flight {jIdx + 1}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Travel Year:</span>
                        <select value={j.year} onChange={e => { const next = [...multiCityJourneys]; next[jIdx].year = e.target.value; setMultiCityJourneys(next); }} style={{ padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                          <option value="2026">2026</option><option value="2027">2027</option>
                        </select>
                        {jIdx > 0 && (
                          <button
                            type="button"
                            onClick={() => setMultiCityJourneys(multiCityJourneys.filter((_, idx) => idx !== jIdx))}
                            style={{ color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                    <textarea
                      rows={3}
                      value={j.text}
                      onChange={e => { const next = [...multiCityJourneys]; next[jIdx].text = e.target.value; setMultiCityJourneys(next); }}
                      placeholder={`Paste GDS lines for Multi-City Flight ${jIdx + 1}`}
                      style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.85rem', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    />
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => setMultiCityJourneys([...multiCityJourneys, { id: `mc-${Date.now()}`, year: '2026', text: '' }])}
                  style={{ background: '#e0f2fe', border: '1px solid #bae6fd', color: '#0369a1', padding: '8px 14px', borderRadius: '6px', fontWeight: '700', fontSize: '0.82rem', cursor: 'pointer', marginBottom: '16px' }}
                >
                  + Add Another Flight
                </button>
              </div>
            )}

            {/* MODAL FOOTER BUTTONS */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
              <button type="button" onClick={() => setIsImportModalOpen(false)} className="admin-secondary-btn">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleParseAndPreviewItinerary}
                disabled={!selectedTripType}
                className="admin-primary-btn"
                style={{ background: '#8b1236', opacity: !selectedTripType ? 0.6 : 1 }}
              >
                Import and Preview →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================== */}
      {/* IMPORT PREVIEW MODAL */}
      {/* ================================================== */}
      {isImportPreviewOpen && previewParsedData && (
        <div className="admin-modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#ffffff', borderRadius: '12px', maxWidth: '750px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, color: '#1e3a5f', fontSize: '1.2rem' }}><i className="fas fa-search" style={{ marginRight: '8px' }}></i> Preview Parsed Itinerary</h3>
              <button type="button" onClick={() => setIsImportPreviewOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#64748b' }}>×</button>
            </div>

            {importWarnings.length > 0 && (
              <div style={{ background: '#fef3c7', border: '1px solid #fde68a', color: '#92400e', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.82rem' }}>
                {importWarnings.map((w, i) => <p key={i} style={{ margin: '2px 0' }}><i className="fas fa-info-circle"></i> {w}</p>)}
              </div>
            )}

            {previewParsedData.journeys.map((j, jIdx) => (
              <div key={jIdx} style={{ marginBottom: '16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px' }}>
                <h4 style={{ color: '#1e3a5f', margin: '0 0 10px' }}>{j.label || `Journey #${jIdx + 1}`} ({j.segments.length} segments)</h4>
                {j.segments.map((s, sIdx) => (
                  <div key={sIdx} style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '10px', marginBottom: '8px', fontSize: '0.85rem' }}>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>{s.carrier_code} {s.flight_number} — Class {s.booking_class} ({s.origin_airport} → {s.destination_airport})</div>
                    <div style={{ color: '#475569', marginTop: '4px' }}>Date: {s.departure_date} | Dep: {s.departure_time} | Arr: {s.arrival_time}</div>
                    <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '4px', fontStyle: 'italic' }}>{s.notes}</div>
                  </div>
                ))}
              </div>
            ))}

            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
              <button type="button" onClick={() => { setIsImportPreviewOpen(false); setIsImportModalOpen(true); }} className="admin-secondary-btn">
                ← Back to Edit
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={() => setIsImportPreviewOpen(false)} className="admin-secondary-btn">Cancel</button>
                <button type="button" onClick={handleConfirmImportIntoBooking} className="admin-primary-btn" style={{ background: '#8b1236' }}>
                  Import Into Booking →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================== */}
      {/* CHATGPT PROMPT / INFORMATION MODAL */}
      {/* SHARED ITINERARY HELP MODAL */}
      <AdminItineraryHelpModal
        isOpen={isGptHelpOpen}
        onClose={() => setIsGptHelpOpen(false)}
      />

      {/* SHARED ITINERARY IMPORT MODAL */}
      {isImportModalOpen && (
        <AdminItineraryImportModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          existingItineraryHasData={outboundSegments.length > 0 || returnSegments.length > 0}
          onConfirmImport={(importData) => {
            if (importData) {
              setTripType(importData.tripType || 'one-way');
              setOutboundSegments(importData.outboundSegments || []);
              setReturnSegments(importData.returnSegments || []);
              setMultiCityJourneysState(importData.multiCityJourneys || []);
            }
          }}
        />
      )}
    </div>
  );
}
