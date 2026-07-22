import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import '../../../shared/styles/Confirmation.css';

function OneWayConfirmation() {
  const [bookingRef, setBookingRef] = useState('');

  useEffect(() => {
    const ref = sessionStorage.getItem('bookingReference');
    setBookingRef(ref || 'N/A');

    // Fire Google Ads conversion event
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'conversion', {
          'send_to': 'AW-18166581434/W9aXCMPzpq8cELqRwNZD',
          'transaction_id': ref || ''
      });
    }
  }, []);

  return (
    <div className="confirmation-page">
      <div className="container">
        <div className="confirmation-card">
          <div className="success-icon">
            <i className="fas fa-check-circle"></i>
          </div>
          <h2>Booking Confirmed!</h2>
          <p>Your one-way flight has been successfully booked.</p>
          <div className="booking-reference">
            <strong>Booking Reference:</strong> {bookingRef}
          </div>
          <div className="confirmation-actions">
            <Link to="/" className="btn-primary">Book Another Flight</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default OneWayConfirmation;
