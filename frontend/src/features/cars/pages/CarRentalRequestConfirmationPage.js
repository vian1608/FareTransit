import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { carRentalApi } from '../carRentalApi';
import './CarRentalRequestConfirmationPage.css';

function loadCached(reference) {
  try {
    const raw = sessionStorage.getItem(`carRequest:${reference}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
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

function dateTime(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return value || '—';
  return date.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  });
}

function CarRentalRequestConfirmationPage() {
  const { reference = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const normalizedReference = String(reference).toUpperCase();
  const stateBooking = location.state?.booking || null;
  const [booking, setBooking] = useState(() => stateBooking || loadCached(normalizedReference));
  const [refreshNotice, setRefreshNotice] = useState('');

  useEffect(() => {
    const cached = stateBooking || loadCached(normalizedReference);
    if (cached && !booking) setBooking(cached);
    const token = cached?.requestToken;
    if (!token) return undefined;

    let live = true;
    carRentalApi.getBooking(normalizedReference, token)
      .then((response) => {
        if (!live || !response?.success || !response.data) return;
        const merged = { ...cached, ...response.data, requestToken: token };
        setBooking(merged);
        try {
          sessionStorage.setItem(`carRequest:${normalizedReference}`, JSON.stringify(merged));
        } catch {
          // Session persistence is optional.
        }
      })
      .catch(() => {
        if (live && cached) setRefreshNotice('Status refresh is temporarily unavailable. The request details shown below were saved when you submitted it.');
      });

    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedReference]);

  if (!booking) {
    return (
      <div className="car-request-page">
        <Helmet><title>Car Rental Request | FareTransit</title><meta name="robots" content="noindex,nofollow" /></Helmet>
        <div className="car-request-card car-request-missing">
          <i className="fas fa-file-alt" aria-hidden="true" />
          <h1>Reservation request details are not available in this browser</h1>
          <p>For privacy, public request details require the secure browser session that created the request. If you already received a FareTransit email, use the reference in that message or call us for assistance.</p>
          <button type="button" onClick={() => navigate('/car-rentals')}>Search rental cars</button>
          <a href="tel:+18887808855">Call +1 (888) 780-8855</a>
        </div>
      </div>
    );
  }

  const isBooked = booking.status === 'BOOKED';
  const vehicle = booking.vehicleName || booking.vehicleCategory || 'Rental car';

  return (
    <div className="car-request-page">
      <Helmet>
        <title>{isBooked ? 'Car Rental Confirmed' : 'Reservation Request Received'} | FareTransit</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="car-request-card">
        <div className={`car-request-status-icon ${isBooked ? 'is-booked' : ''}`}>
          <i className={isBooked ? 'fas fa-check' : 'fas fa-hourglass-half'} aria-hidden="true" />
        </div>
        <span className="car-request-eyebrow">FareTransit car rental</span>
        <h1>{isBooked ? 'Your reservation is confirmed' : 'Reservation request received'}</h1>
        <p className="car-request-lead">
          {isBooked
            ? 'FareTransit has marked this rental reservation as booked.'
            : 'Your request is in our reservation workflow. We will verify supplier availability, final pricing, taxes or fees, and rental terms before confirming it.'}
        </p>

        {refreshNotice && <div className="car-request-notice">{refreshNotice}</div>}

        <div className="car-reference-box">
          <span>FareTransit reference</span>
          <strong>{booking.bookingReference || normalizedReference}</strong>
          <span className={`car-request-status-pill ${isBooked ? 'is-booked' : ''}`}>{isBooked ? 'Confirmed' : 'Pending confirmation'}</span>
        </div>

        <div className="car-request-details">
          <div><span>Supplier</span><strong>{booking.supplier || 'Enterprise'}</strong></div>
          <div><span>Vehicle</span><strong>{vehicle}</strong></div>
          <div><span>Pickup</span><strong>{booking.pickupLocation || '—'}</strong><small>{dateTime(booking.pickupAt)}</small></div>
          <div><span>Return</span><strong>{booking.dropoffLocation || '—'}</strong><small>{dateTime(booking.dropoffAt)}</small></div>
          <div className="car-request-price"><span>{isBooked ? 'Reservation total' : 'Estimated rental total'}</span><strong>{money(booking.totalAmount, booking.currency || 'USD')}</strong></div>
        </div>

        {!isBooked && (
          <div className="car-request-next">
            <h2>What happens next</h2>
            <ol>
              <li><span>1</span><div><strong>Request received</strong><p>Your FareTransit reference has been created.</p></div></li>
              <li><span>2</span><div><strong>Supplier verification</strong><p>Our reservation team checks current availability, final price, and rental requirements.</p></div></li>
              <li><span>3</span><div><strong>Final confirmation</strong><p>Once the supplier reservation is secured, FareTransit sends your final confirmation details.</p></div></li>
            </ol>
          </div>
        )}

        <div className="car-request-actions">
          <a className="car-request-primary" href="tel:+18887808855"><i className="fas fa-phone" aria-hidden="true" /> Call FareTransit</a>
          <button type="button" onClick={() => navigate('/car-rentals')}>Search another car</button>
        </div>

        {!isBooked && (
          <p className="car-request-legal"><strong>Important:</strong> This page confirms receipt of your FareTransit reservation request. It is not an Enterprise or supplier confirmation until the status above changes to Confirmed and FareTransit provides final reservation details.</p>
        )}
      </div>
    </div>
  );
}

export default CarRentalRequestConfirmationPage;
