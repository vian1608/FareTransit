import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import '../../../shared/styles/Confirmation.css';

function RoundTripConfirmation() {
  const bookingRef = sessionStorage.getItem('bookingReference') || '';

  // Never declare a booking confirmed from client-side state alone. Forward
  // to the canonical page, which fetches authoritative backend booking data.
  if (bookingRef) {
    return <Navigate to={`/booking-confirmed/${encodeURIComponent(bookingRef)}`} replace />;
  }

  return (
    <div className="confirmation-page">
      <Helmet><title>Reservation Reference Required | FareTransit</title></Helmet>
      <div className="container">
        <div className="confirmation-card">
          <div className="success-icon" style={{ color: '#64748b' }}>
            <i className="fas fa-info-circle" />
          </div>
          <h2>Reservation Reference Required</h2>
          <p>We cannot verify a reservation from this browser session. Use My Bookings to retrieve your saved reservation.</p>
          <div className="confirmation-actions">
            <Link to="/my-bookings" className="btn-primary">Find My Booking</Link>
            <Link to="/contact" className="btn-secondary">Contact Support</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RoundTripConfirmation;
