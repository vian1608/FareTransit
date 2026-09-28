import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { carRentalApi, carApiErrorMessage } from '../carRentalApi';
import './CarRentalCheckoutPage.css';

function loadSelection() {
  try {
    const raw = sessionStorage.getItem('carSelectedQuote');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getOrCreateClientRequestId() {
  try {
    const existing = sessionStorage.getItem('carBookingClientRequestId');
    if (existing) return existing;
    const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    const value = `car_web_${random}`;
    sessionStorage.setItem('carBookingClientRequestId', value);
    return value;
  } catch {
    return `car_web_${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }
}

function money(value, currency = 'USD') {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'To be confirmed';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).replace('T', ' ');
  return date.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  });
}

function CarRentalCheckoutPage() {
  const navigate = useNavigate();
  const [selection] = useState(loadSelection);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    flightNumber: '',
    specialRequests: '',
    termsAccepted: false
  });

  const result = selection?.result || null;
  const quoteToken = result?.quote_token || '';
  const vehicle = result?.vehicle || {};
  const pricing = result?.pricing || {};
  const currency = pricing.currency || selection?.searchParams?.currency || 'USD';

  const quoteLooksUsable = Boolean(result && quoteToken && Number(pricing.rental_total) > 0);
  const pickup = result?.pickup_location?.name || result?.pickup_location?.label || selection?.searchParams?.pickupText || '—';
  const dropoff = result?.return_location?.name || result?.return_location?.label || pickup;
  const pickupAt = result?.pickup_datetime || `${selection?.searchParams?.pickupDate || ''}T${selection?.searchParams?.pickupTime || ''}`;
  const dropoffAt = result?.return_datetime || `${selection?.searchParams?.dropoffDate || ''}T${selection?.searchParams?.dropoffTime || ''}`;

  const vehicleName = useMemo(() => (
    vehicle.make_model || vehicle.name || vehicle.category || 'Rental car'
  ), [vehicle]);

  useEffect(() => {
    if (!quoteLooksUsable) setError('Your selected rental quote is unavailable. Run a new search to continue.');
  }, [quoteLooksUsable]);

  const setField = (name, value) => setForm((current) => ({ ...current, [name]: value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting || !quoteLooksUsable) return;
    setError('');

    if (!form.termsAccepted) {
      setError('Please acknowledge the reservation-request terms before continuing.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await carRentalApi.createBooking({
        quoteToken,
        clientRequestId: getOrCreateClientRequestId(),
        customer: {
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone,
          dateOfBirth: form.dateOfBirth
        },
        flightNumber: form.flightNumber,
        specialRequests: form.specialRequests,
        termsAccepted: true
      });

      const booking = response?.data;
      if (!response?.success || !booking?.bookingReference) {
        throw new Error(response?.error?.message || 'FareTransit could not create the reservation request.');
      }

      const cacheEntry = {
        ...booking,
        customerFirstName: form.firstName,
        cachedAt: new Date().toISOString()
      };
      try {
        sessionStorage.setItem(`carRequest:${booking.bookingReference}`, JSON.stringify(cacheEntry));
        sessionStorage.setItem('carLatestRequest', JSON.stringify(cacheEntry));
        sessionStorage.removeItem('carBookingClientRequestId');
      } catch {
        // The confirmation route can still render from navigation state if storage is unavailable.
      }

      navigate(`/car-rentals/request/${encodeURIComponent(booking.bookingReference)}`, {
        replace: true,
        state: { booking: cacheEntry }
      });
    } catch (requestError) {
      const code = requestError?.response?.data?.error?.code;
      if (code === 'CAR_QUOTE_EXPIRED' || code === 'INVALID_CAR_QUOTE' || code === 'DRIVER_AGE_CHANGED') {
        setError(carApiErrorMessage(requestError, 'The rental quote needs to be refreshed. Please search again.'));
      } else {
        setError(carApiErrorMessage(requestError, 'We could not submit your reservation request. Please try again.'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!quoteLooksUsable) {
    return (
      <div className="car-checkout-page">
        <Helmet><title>Rental Quote Unavailable | FareTransit</title><meta name="robots" content="noindex,nofollow" /></Helmet>
        <div className="car-checkout-shell car-checkout-empty">
          <i className="fas fa-clock" aria-hidden="true" />
          <h1>Search again for a current rental quote</h1>
          <p>{error || 'Your selected quote is no longer available in this browser session.'}</p>
          <button type="button" className="car-primary-action" onClick={() => navigate('/car-rentals')}>Search rental cars</button>
        </div>
      </div>
    );
  }

  return (
    <div className="car-checkout-page">
      <Helmet>
        <title>Car Rental Request | FareTransit</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="car-checkout-shell">
        <div className="car-checkout-heading">
          <div>
            <span className="car-checkout-kicker">FareTransit assisted reservation</span>
            <h1>Complete your rental request</h1>
            <p>Enter the primary driver's details. We will verify final supplier availability and rental terms before confirming the reservation.</p>
          </div>
          <div className="car-checkout-security"><i className="fas fa-lock" aria-hidden="true" /> Secure request</div>
        </div>

        <div className="car-checkout-grid">
          <form className="car-checkout-form" onSubmit={handleSubmit}>
            <section className="car-checkout-section">
              <h2>Primary driver</h2>
              <div className="car-form-grid two-col">
                <label>First name<input required autoComplete="given-name" value={form.firstName} onChange={(e) => setField('firstName', e.target.value)} maxLength="80" /></label>
                <label>Last name<input required autoComplete="family-name" value={form.lastName} onChange={(e) => setField('lastName', e.target.value)} maxLength="80" /></label>
                <label>Email<input required type="email" autoComplete="email" value={form.email} onChange={(e) => setField('email', e.target.value)} maxLength="254" /></label>
                <label>Phone<input required type="tel" autoComplete="tel" value={form.phone} onChange={(e) => setField('phone', e.target.value)} maxLength="40" /></label>
                <label>Date of birth<input required type="date" autoComplete="bday" value={form.dateOfBirth} onChange={(e) => setField('dateOfBirth', e.target.value)} /></label>
                <label>Flight number <span>(optional)</span><input value={form.flightNumber} onChange={(e) => setField('flightNumber', e.target.value)} maxLength="32" placeholder="e.g. AA123" /></label>
              </div>
            </section>

            <section className="car-checkout-section">
              <h2>Special requests <span className="car-optional">optional</span></h2>
              <textarea
                rows="4"
                value={form.specialRequests}
                onChange={(e) => setField('specialRequests', e.target.value)}
                maxLength="1500"
                placeholder="Anything our reservation team should know?"
              />
            </section>

            <section className="car-checkout-section car-request-terms">
              <label className="car-terms-checkbox">
                <input type="checkbox" checked={form.termsAccepted} onChange={(e) => setField('termsAccepted', e.target.checked)} />
                <span>
                  I understand that this submits a reservation request to FareTransit. It does not create or confirm a supplier reservation. Availability, final price, taxes and fees, rental requirements, and supplier terms will be confirmed before the reservation is finalized.
                </span>
              </label>
            </section>

            {error && <div className="car-checkout-error" role="alert"><i className="fas fa-exclamation-circle" aria-hidden="true" /> {error}</div>}

            <button type="submit" className="car-primary-action car-submit-request" disabled={submitting || !form.termsAccepted}>
              {submitting ? <><i className="fas fa-spinner fa-spin" aria-hidden="true" /> Submitting request...</> : <>Submit reservation request <i className="fas fa-arrow-right" aria-hidden="true" /></>}
            </button>
            <p className="car-no-charge-note"><i className="fas fa-credit-card" aria-hidden="true" /> No payment is collected on this page.</p>
          </form>

          <aside className="car-checkout-summary">
            <div className="car-summary-brand"><i className="fas fa-car-side" aria-hidden="true" /><span>Enterprise</span></div>
            <h2>{vehicleName}{vehicle.or_similar !== false ? ' or similar' : ''}</h2>
            {vehicle.category && <span className="car-summary-category">{vehicle.category}</span>}

            <dl className="car-summary-list">
              <div><dt>Pickup</dt><dd>{pickup}<small>{formatDateTime(pickupAt)}</small></dd></div>
              <div><dt>Return</dt><dd>{dropoff}<small>{formatDateTime(dropoffAt)}</small></dd></div>
              {vehicle.transmission && <div><dt>Transmission</dt><dd>{vehicle.transmission}</dd></div>}
              {vehicle.seats && <div><dt>Seats</dt><dd>{vehicle.seats}</dd></div>}
            </dl>

            <div className="car-summary-total">
              <span>Estimated rental total</span>
              <strong>{money(pricing.rental_total, currency)}</strong>
              {pricing.daily_rate && <small>{money(pricing.daily_rate, currency)} estimated per day</small>}
            </div>
            <p className="car-summary-disclaimer">Price and availability are not final until FareTransit verifies the supplier reservation.</p>
          </aside>
        </div>
      </div>
    </div>
  );
}

export default CarRentalCheckoutPage;
