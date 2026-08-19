import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import '../../../shared/styles/Confirmation.css';

function OneWayConfirmation() {
  const bookingRef = sessionStorage.getItem('bookingReference') || '';

  // This legacy route must never claim a successful booking based only on
  // browser storage. The canonical confirmation page verifies the reference
  // against the backend before displaying a reservation status.
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

export default OneWayConfirmation;
