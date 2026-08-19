import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { bookingAPI } from '../../../shared/api/api';
import AirlineLogo from '../../../shared/components/AirlineLogo';
import './PaymentSuccessPage.css';

const displayText = (value, fallback = '') => {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') {
    const preferred = value.name || value.label || value.code || value.value || value.formatted;
    if (preferred !== undefined && preferred !== null && typeof preferred !== 'object') return String(preferred);
  }
  return fallback;
};

const safeArray = value => Array.isArray(value) ? value : [];

const AIRLINE_LOGO_SLUGS = {
  'delta': 'delta',
  'delta air lines': 'delta',
  'delta airlines': 'delta',
  'klm': 'klm',
  'klm royal dutch airlines': 'klm',
  'american airlines': 'american-airlines',
  'united': 'united',
  'united airlines': 'united',
  'southwest': 'southwest',
  'southwest airlines': 'southwest',
  'lufthansa': 'lufthansa',
  'british airways': 'british-airways',
  'air france': 'air-france',
  'alaska airlines': 'alaska-airlines',
  'singapore airlines': 'singapore-airlines',
  'cathay pacific': 'cathay-pacific',
  'emirates': 'emirates',
  'hawaiian airlines': 'hawaiian',
};

const airlineNameFor = (segment = {}) => displayText(
  segment.airlineName || segment.carrier_name || segment.airline || segment.carrier,
  'Airline',
);

const airlineLogoSlugFor = (segment = {}) => {
  const key = airlineNameFor(segment).trim().toLowerCase();
  return AIRLINE_LOGO_SLUGS[key] || key
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

function PaymentSuccessPage() {
  const params = useParams();
  const [searchParams] = useSearchParams();

  const confirmationCodeParam = params.confirmationCode || searchParams.get('code') || searchParams.get('booking_id');
  const userEmailParam = searchParams.get('email');

  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function fetchBookingDetails() {
      if (!confirmationCodeParam) {
        if (isMounted) {
          setErrorMsg('We could not load your reservation details. Please contact support with your booking reference.');
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        let res;
        try {
          res = await bookingAPI.getConfirmationDTO(confirmationCodeParam);
        } catch (dtoErr) {
          res = await bookingAPI.getByReference(confirmationCodeParam);
        }

        if (res && res.success && res.data) {
          if (isMounted) {
            setBooking(res.data);
            setLoading(false);
          }
        } else {
          if (isMounted) {
            setErrorMsg('We could not load your reservation details. Please contact support with your booking reference.');
            setLoading(false);
          }
        }
      } catch (err) {
        console.error('Error loading confirmation booking:', err);
        if (isMounted) {
          setErrorMsg('We could not load your reservation details. Please contact support with your booking reference.');
          setLoading(false);
        }
      }
    }

    fetchBookingDetails();

    return () => {
      isMounted = false;
    };
  }, [confirmationCodeParam]);

  const handlePrint = () => {
    window.print();
  };

  // ── 1. LOADING STATE ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="confirmation-page-wrapper">
        <Helmet>
          <title>Loading Reservation Confirmation | FareTransit</title>
        </Helmet>
        <div className="confirmation-card confirmation-card--loading">
          <i className="fas fa-circle-notch fa-spin confirmation-spinner"></i>
          <p className="confirmation-loading-text">Loading your reservation details...</p>
        </div>
      </div>
    );
  }

  // ── 2. ERROR / NOT FOUND STATE ─────────────────────────────────────────────
  if (errorMsg || !booking) {
    return (
      <div className="confirmation-page-wrapper">
        <Helmet>
          <title>Reservation Not Found | FareTransit</title>
        </Helmet>
        <div className="confirmation-card confirmation-card--error">
          <div className="confirmation-error-icon">
            <i className="fas fa-exclamation-circle"></i>
          </div>
          <h2 className="confirmation-error-title">Reservation Lookup Failed</h2>
          <p className="confirmation-error-desc">
            {errorMsg || 'We could not load your reservation details. Please contact support with your booking reference.'}
          </p>
          <div className="confirmation-actions">
            <Link to="/" className="btn-confirm btn-confirm--primary">
              Return to Home
            </Link>
            <a href="mailto:support@faretransit.com" className="btn-confirm btn-confirm--secondary">
              Contact Support
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ── 3. DATA EXTRACTION & DERIVED VALUES ──────────────────────────────────
  // ── 3. DATA EXTRACTION & DERIVED VALUES ──────────────────────────────────
  const isPaid = (booking.booking?.paymentStatus || booking.payment_status || booking.paymentStatus || '').toLowerCase() === 'paid';
  const passengerName = displayText(booking.booking?.passengerName || booking.passenger_name || booking.passengerName, 'Valued Traveler');
  const firstName = passengerName.split(' ')[0] || 'Traveler';
  const code = displayText(booking.booking?.confirmationCode || booking.confirmation_code || booking.confirmationCode || booking.bookingId || confirmationCodeParam, 'Reservation');
  const email = displayText(booking.booking?.email || booking.email || userEmailParam, 'Email unavailable');
  const phone = displayText(booking.booking?.phone || booking.phone, 'N/A');
  const bookingDate = (booking.booking?.bookingDate || booking.created_at)
    ? new Date(booking.booking?.bookingDate || booking.created_at).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
      })
    : new Date().toLocaleDateString('en-US');

  const paymentStatusDisplay = isPaid ? 'Paid' : 'Pending';
  const bookingStatusDisplay = displayText(booking.booking?.status || booking.status, 'PENDING').toUpperCase();

  // Email Delivery Status Notice (Authoritative backend status)
  const emailDeliveryStatus = booking.emailDelivery?.status || booking.emailDeliveryStatus || (booking.authorization_email_sent_at ? 'SENT' : 'UNATTEMPTED');

  let emailNoticeMessage = '';
  let emailNoticeType = 'info';
  if (emailDeliveryStatus === 'SENT') {
    emailNoticeType = 'success';
    emailNoticeMessage = `Your booking confirmation has been sent to ${email}.`;
  } else if (emailDeliveryStatus === 'FAILED') {
    emailNoticeType = 'warn';
    const errDetail = booking.emailDelivery?.errorMessage || '';
    emailNoticeMessage = `Your reservation is saved. Confirmation email delivery notice: ${errDetail || 'Provider attempt logged'}.`;
  } else {
    emailNoticeType = 'info';
    emailNoticeMessage = `Email delivery status is unavailable. Please retain your confirmation code: ${code}.`;
  }

  // Itinerary Segments (Authored solely from backend flights list)
  const itineraryOutbound = safeArray(booking.itinerary?.outbound);
  const itineraryReturn = safeArray(booking.itinerary?.return);
  const flightsList = safeArray(booking.flights).length > 0
    ? safeArray(booking.flights)
    : (itineraryOutbound.length > 0 ? itineraryOutbound : safeArray(booking.itinerary_segments));

  const outboundSegments = itineraryOutbound.length > 0
    ? itineraryOutbound
    : flightsList.filter(f => displayText(f?.leg || f?.journey_direction).toLowerCase() === 'outbound' || (!f?.leg && flightsList.indexOf(f) === 0));

  const returnSegments = itineraryReturn.length > 0
    ? itineraryReturn
    : flightsList.filter(f => displayText(f?.leg || f?.journey_direction).toLowerCase() === 'return' || (!f?.leg && flightsList.indexOf(f) > 0));

  const allSegments = [...outboundSegments, ...returnSegments];

  const isSegmentValid = (seg) => {
    const origin = seg.departureAirport || seg.originCode || seg.departure_airport || seg.origin_airport;
    const dest = seg.arrivalAirport || seg.destinationCode || seg.arrival_airport || seg.destination_airport;
    const carrier = seg.airlineName || seg.carrier_name || seg.airline;
    const fn = seg.flightNumber || seg.flight_number;
    return !!(origin && dest && carrier && fn);
  };

  const isItineraryComplete = allSegments.length > 0 && allSegments.every(isSegmentValid);

  // Price Calculation & Validation (Section 8 rule: Positive numeric total or unavailable)
  const rawPrice = parseFloat(booking.booking?.totalAmount ?? booking.totalAmount ?? booking.total_amount ?? booking.customer_price ?? 0);
  const hasValidPrice = !isNaN(rawPrice) && rawPrice > 0;
  const currency = displayText(booking.booking?.currency || booking.currency, 'USD').toUpperCase();
  const totalPriceDisplay = hasValidPrice ? `$${rawPrice.toFixed(2)} ${currency}` : 'Reservation amount unavailable';

  // Payment Method Metadata Reference (Section 2, 5, 6 rules)
  const rawCardRef = booking.cardReference || booking.paymentMethod || booking.payment_method || {};
  const cardRef = rawCardRef && typeof rawCardRef === 'object' && !Array.isArray(rawCardRef) ? rawCardRef : {};
  const cardholderName = displayText(cardRef.cardholderName || cardRef.cardholder_name || booking.passenger_name, passengerName);
  const cardBrand = displayText(cardRef.cardBrand || cardRef.card_brand || cardRef.brand, '');
  const rawLast4 = String(cardRef.last4 || cardRef.card_last4 || cardRef.cardLast4 || '').replace(/\D/g, '');
  const validLast4 = /^\d{4}$/.test(rawLast4) ? rawLast4 : null;

  let cardDisplay = '';
  if (cardBrand && validLast4) {
    cardDisplay = `${cardBrand} ending in ${validLast4}`;
  } else if (validLast4) {
    cardDisplay = `Card ending in ${validLast4}`;
  } else {
    cardDisplay = 'Card ending unavailable';
  }

  const expMonth = cardRef.expMonth || cardRef.card_exp_month || cardRef.cardExpMonth;
  const expYear = cardRef.expYear || cardRef.card_exp_year || cardRef.cardExpYear;
  const expDisplay = (expMonth && expYear) ? `${expMonth}/${expYear}` : 'N/A';

  const billingAddr = displayText(cardRef.billingAddress) || [
    cardRef.billing_address_line1 || cardRef.billingAddressLine1,
    cardRef.billing_address_line2 || cardRef.billingAddressLine2,
    cardRef.billing_city || cardRef.billingCity,
    cardRef.billing_state || cardRef.billingState,
    cardRef.billing_postal_code || cardRef.billingPostalCode,
    cardRef.billing_country || cardRef.billingCountry
  ].filter(Boolean).join(', ') || 'On File';

  const billingPhone = displayText(cardRef.billingPhone || cardRef.billing_phone, phone);

  return (
    <div className="confirmation-page-wrapper">
      <Helmet>
        <title>{isPaid ? 'Booking & Payment Confirmed' : 'Reservation Received'} | FareTransit</title>
      </Helmet>

      <div className="confirmation-container no-print-padding">
        <div className="confirmation-context-nav no-print">
          <Link to="/my-bookings" className="confirmation-context-back">
            <i className="fas fa-arrow-left" aria-hidden="true"></i>
            Back to My Bookings
          </Link>
        </div>

        {/* ── 1. Header Banner & Success Checkmark ──────────────────────── */}
        <div className="confirmation-header-banner">
          <div className="confirmation-checkmark-circle">
            <span className="confirmation-checkmark-symbol">&#10003;</span>
          </div>

          <h1 className="confirmation-hero-title">
            {isPaid ? 'Booking and Payment Confirmed' : 'Reservation Received'}
          </h1>

          <p className="confirmation-hero-subtitle">
            {isPaid
              ? `Thank you, ${firstName}. Your payment was successful and your reservation has been confirmed.`
              : `Thank you, ${firstName}. Your reservation details have been received. Our team will process the booking and provide the final confirmation.`}
          </p>

          <div className="confirmation-status-row">
            <div className={`status-badge status-badge--${isPaid ? 'paid' : 'pending'}`}>
              <i className={`fas ${isPaid ? 'fa-check-circle' : 'fa-clock'}`}></i>
              Payment Status: {paymentStatusDisplay}
            </div>
            <div className="status-badge status-badge--info">
              <i className="fas fa-ticket-alt"></i>
              Booking Status: {bookingStatusDisplay}
            </div>
          </div>
        </div>

        {/* ── 2. Prominent Reservation Details Card ──────────────────────── */}
        <div className="reservation-details-card">
          
          {/* Section: Booking Information */}
          <div className="res-section">
            <h3 className="res-section-title">
              <i className="fas fa-info-circle"></i> Booking Information
            </h3>
            <div className="res-grid-two">
              <div className="res-field">
                <span className="res-field-label">Confirmation Code / Booking ID</span>
                <strong className="res-field-code">{code}</strong>
              </div>
              <div className="res-field">
                <span className="res-field-label">Booking Date</span>
                <span className="res-field-val">{bookingDate}</span>
              </div>
              <div className="res-field">
                <span className="res-field-label">Primary Passenger</span>
                <span className="res-field-val">{passengerName}</span>
              </div>
              <div className="res-field">
                <span className="res-field-label">Contact Email</span>
                <span className="res-field-val">{email}</span>
              </div>
              <div className="res-field">
                <span className="res-field-label">Contact Phone</span>
                <span className="res-field-val">{phone}</span>
              </div>
            </div>
          </div>

          <hr className="res-divider" />

          {/* Section: Flight Itinerary */}
          <div className="res-section">
            <h3 className="res-section-title">
              <i className="fas fa-plane-departure"></i> Flight Itinerary
            </h3>

            {!isItineraryComplete ? (
              <div className="incomplete-itinerary-alert">
                <i className="fas fa-exclamation-triangle"></i> Itinerary details are currently incomplete.
              </div>
            ) : (
              <div className="itinerary-segments-list">
                {outboundSegments.length > 0 && (
                  <div className="itinerary-leg-group">
                    <h4 className="leg-group-title"><i className="fas fa-plane"></i> Outbound Flight</h4>
                    {outboundSegments.map((seg, idx) => (
                      <div key={idx} className="segment-card">
                        <div className="segment-header">
                          <span className="segment-airline">
                            <AirlineLogo
                              slug={airlineLogoSlugFor(seg)}
                              src={displayText(seg.airlineLogoUrl || seg.airline_logo_url)}
                              airlineName={airlineNameFor(seg)}
                              className="segment-logo"
                            />
                            <strong>{airlineNameFor(seg)}</strong>
                            <span className="segment-flight-number">{displayText(seg.flightNumber || seg.flight_number || 'N/A')}</span>
                          </span>
                          <span className="segment-cabin">{displayText(seg.cabinClass || seg.cabin || 'Economy')}</span>
                        </div>
                        <div className="segment-route">
                          <div className="route-point">
                            <span className="airport-code">{displayText(seg.departureAirport || seg.originCode || seg.departure_airport || seg.origin_airport)}</span>
                            <span className="city-name">{displayText(seg.originName || seg.originCity || seg.origin_city || '')}</span>
                            <span className="time-date">{seg.departureDate || seg.departure_date} {seg.departureTime || seg.departure_time || ''}</span>
                          </div>
                          <div className="route-arrow">
                            <i className="fas fa-arrow-right"></i>
                            <span className="stops-count">{seg.stops === 0 ? 'Non-stop' : `${seg.stops} stop(s)`}</span>
                          </div>
                          <div className="route-point">
                            <span className="airport-code">{displayText(seg.arrivalAirport || seg.destinationCode || seg.arrival_airport || seg.destination_airport)}</span>
                            <span className="city-name">{displayText(seg.destinationName || seg.destinationCity || seg.destination_city || '')}</span>
                            <span className="time-date">{seg.arrivalDate || seg.arrival_date} {seg.arrivalTime || seg.arrival_time || ''}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {returnSegments.length > 0 && (
                  <div className="itinerary-leg-group" style={{ marginTop: '1.25rem' }}>
                    <h4 className="leg-group-title"><i className="fas fa-undo"></i> Return Flight</h4>
                    {returnSegments.map((seg, idx) => (
                      <div key={idx} className="segment-card">
                        <div className="segment-header">
                          <span className="segment-airline">
                            <AirlineLogo
                              slug={airlineLogoSlugFor(seg)}
                              src={displayText(seg.airlineLogoUrl || seg.airline_logo_url)}
                              airlineName={airlineNameFor(seg)}
                              className="segment-logo"
                            />
                            <strong>{airlineNameFor(seg)}</strong>
                            <span className="segment-flight-number">{displayText(seg.flightNumber || seg.flight_number || 'N/A')}</span>
                          </span>
                          <span className="segment-cabin">{displayText(seg.cabinClass || seg.cabin || 'Economy')}</span>
                        </div>
                        <div className="segment-route">
                          <div className="route-point">
                            <span className="airport-code">{displayText(seg.departureAirport || seg.originCode || seg.departure_airport || seg.origin_airport)}</span>
                            <span className="city-name">{displayText(seg.originName || seg.originCity || seg.origin_city || '')}</span>
                            <span className="time-date">{seg.departureDate || seg.departure_date} {seg.departureTime || seg.departure_time || ''}</span>
                          </div>
                          <div className="route-arrow">
                            <i className="fas fa-arrow-right"></i>
                            <span className="stops-count">{seg.stops === 0 ? 'Non-stop' : `${seg.stops} stop(s)`}</span>
                          </div>
                          <div className="route-point">
                            <span className="airport-code">{displayText(seg.arrivalAirport || seg.destinationCode || seg.arrival_airport || seg.destination_airport)}</span>
                            <span className="city-name">{displayText(seg.destinationName || seg.destinationCity || seg.destination_city || '')}</span>
                            <span className="time-date">{seg.arrivalDate || seg.arrival_date} {seg.arrivalTime || seg.arrival_time || ''}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <hr className="res-divider" />

          {/* Section: Price Details */}
          <div className="res-section">
            <h3 className="res-section-title">
              <i className="fas fa-dollar-sign"></i> Price Details
            </h3>
            <div className="price-summary-box">
              <div className="price-row price-row--total">
                <span>Total Reservation Amount:</span>
                <strong>{totalPriceDisplay}</strong>
              </div>
            </div>
          </div>

          <hr className="res-divider" />

          {/* Section: Card and Billing Reference (Masked Metadata Only) */}
          <div className="res-section">
            <h3 className="res-section-title">
              <i className="fas fa-credit-card"></i> Card & Billing Reference
            </h3>
            <div className="res-grid-two">
              <div className="res-field">
                <span className="res-field-label">Cardholder Name</span>
                <span className="res-field-val">{cardholderName}</span>
              </div>
              <div className="res-field">
                <span className="res-field-label">Payment Method</span>
                <span className="res-field-val">{cardDisplay}</span>
              </div>
              <div className="res-field">
                <span className="res-field-label">Expiration</span>
                <span className="res-field-val">{expDisplay}</span>
              </div>
              <div className="res-field">
                <span className="res-field-label">Billing Phone</span>
                <span className="res-field-val">{billingPhone}</span>
              </div>
              <div className="res-field" style={{ gridColumn: 'span 2' }}>
                <span className="res-field-label">Billing Address</span>
                <span className="res-field-val">{billingAddr}</span>
              </div>
            </div>
          </div>

        </div>

        {/* ── 3. Email Delivery Status Notice ─────────────────────────────── */}
        <div className={`email-notice-box email-notice-box--${emailNoticeType}`}>
          <i className={`fas ${emailNoticeType === 'success' ? 'fa-envelope-open-text' : (emailNoticeType === 'warn' ? 'fa-exclamation-triangle' : 'fa-info-circle')}`}></i>
          <span>{emailNoticeMessage}</span>
        </div>

        {/* ── 4. Action Buttons ────────────────────────────────────────────── */}
        <div className="confirmation-actions-bar no-print">
          <Link to="/my-bookings" className="btn-confirm btn-confirm--primary">
            <i className="fas fa-suitcase"></i> View My Booking
          </Link>
          <button type="button" onClick={handlePrint} className="btn-confirm btn-confirm--secondary">
            <i className="fas fa-print"></i> Print Reservation
          </button>
          <Link to="/" className="btn-confirm btn-confirm--outline">
            <i className="fas fa-home"></i> Return to Home
          </Link>
          <a href="mailto:support@faretransit.com" className="btn-confirm btn-confirm--outline">
            <i className="fas fa-headset"></i> Contact Support
          </a>
        </div>

      </div>
    </div>
  );
}

export default PaymentSuccessPage;
