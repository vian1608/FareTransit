import React, { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { bookingAPI } from '../../../shared/api/api';
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_HREF } from '../../../shared/constants/supportContact';
import { normalizeError } from '../../../shared/utils/normalizeError';
import './MyBookingsPage.css';

function MyBookings() {
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [bookings, setBookings] = useState([]);
  const [searched, setSearched] = useState(false);

  const performSearch = useCallback(async (queryToSearch) => {
    const query = String(queryToSearch || '').trim();
    if (!query) {
      setError('Please enter a confirmation code or email address.');
      return;
    }

    setLoading(true);
    setError('');
    setSearched(true);

    try {
      const response = await bookingAPI.search(query);
      if (response?.success) {
        setBookings(Array.isArray(response.data) ? response.data : []);
      } else {
        setBookings([]);
        setError(normalizeError({ message: response?.error?.message || response?.message }, 'Failed to fetch bookings. Please try again.'));
      }
    } catch (err) {
      setBookings([]);
      setError(normalizeError(err, 'Unable to retrieve bookings. Check your connection or booking reference and try again.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const codeFromUrl = queryParams.get('code') || queryParams.get('reference') || '';
    if (codeFromUrl) {
      setSearchQuery(codeFromUrl);
      performSearch(codeFromUrl);
      return;
    }

    const userStr = localStorage.getItem('user');
    if (!userStr) return;
    try {
      const userObj = JSON.parse(userStr);
      if (userObj?.email) {
        setSearchQuery(userObj.email);
        performSearch(userObj.email);
      }
    } catch {
      // Ignore stale local user data. Manual booking lookup remains available.
    }
  }, [location.search, performSearch]);

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    performSearch(searchQuery);
  };

  const getBookingStatusBadge = (status) => {
    const value = String(status || 'PENDING').toUpperCase();
    if (['DONE', 'CONFIRMED', 'TICKETED', 'COMPLETED'].includes(value)) return <span className="status-badge status-badge--done">Confirmed</span>;
    if (['FAILED', 'CANCELLED'].includes(value)) return <span className="status-badge status-badge--failed">Cancelled</span>;
    return <span className="status-badge status-badge--pending">Pending</span>;
  };

  const getPaymentBadge = (status) => {
    const value = String(status || 'PENDING').toUpperCase();
    if (value === 'PAID') return <span className="status-badge status-badge--done" style={{ backgroundColor: '#d1fae5', color: '#065f46' }}><i className="fas fa-check-circle" /> Paid</span>;
    if (value === 'FAILED') return <span className="status-badge status-badge--failed" style={{ backgroundColor: '#fee2e2', color: '#991b1b' }}><i className="fas fa-exclamation-triangle" /> Payment Failed</span>;
    return <span className="status-badge status-badge--pending" style={{ backgroundColor: '#fef3c7', color: '#92400e' }}><i className="fas fa-clock" /> Payment Pending</span>;
  };

  const deriveRouteDisplay = (booking) => {
    const origin = booking.origin_code || booking.flights?.[0]?.departure_airport || booking.flight_details?.departure?.airport;
    const destination = booking.destination_code || booking.flights?.[0]?.arrival_airport || booking.flight_details?.arrival?.airport;
    return origin && destination ? `${origin} to ${destination}` : 'Details unavailable';
  };

  const deriveCarrier = (booking) => booking.carrier || booking.airline || booking.flight_details?.airline || booking.flights?.[0]?.airline || 'Details unavailable';

  const deriveDepartureDate = (booking) => {
    const raw = booking.departure_date || booking.flights?.[0]?.departure_time || booking.flights?.[0]?.departure_date || booking.flight_details?.departure?.date;
    if (!raw) return 'Details unavailable';
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? String(raw) : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const derivePassengerName = (booking) => {
    if (booking.passenger_name && booking.passenger_name !== 'Valued Customer') return booking.passenger_name;
    const traveller = booking.travellers?.[0];
    return traveller?.first_name ? [traveller.first_name, traveller.middle_name, traveller.last_name].filter(Boolean).join(' ') : 'Details unavailable';
  };

  return (
    <div className="my-bookings-page">
      <Helmet><title>My Bookings | FareTransit</title></Helmet>

      <div className="bookings-container">
        <header className="bookings-header">
          <h1>Track Your Bookings</h1>
          <p>Retrieve and view reservation details using your confirmation code or email address.</p>
        </header>

        <div className="bookings-layout">
          <div className="bookings-main-card">
            <form onSubmit={handleSearchSubmit} className="search-form-wrapper">
              <div className="search-input-group">
                <i className="fas fa-search search-icon" />
                <input
                  type="text"
                  placeholder="Enter confirmation code or email..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="search-input-field"
                  aria-label="Booking confirmation code or email"
                />
                <button type="submit" className="search-submit-btn" disabled={loading}>
                  {loading ? <><i className="fas fa-circle-notch fa-spin" /> Searching...</> : 'Retrieve'}
                </button>
              </div>
            </form>

            {error && <div className="bookings-error-banner" role="alert"><i className="fas fa-exclamation-circle" /><span>{error}</span></div>}

            <div className="bookings-results-section">
              {loading ? (
                <div className="bookings-state-container" aria-live="polite"><i className="fas fa-circle-notch fa-spin spinner-icon" /><p>Searching reservation database...</p></div>
              ) : bookings.length > 0 ? (
                <div className="bookings-list-wrapper">
                  <div className="bookings-list-title"><h3>Matches Found ({bookings.length})</h3></div>
                  <div className="bookings-grid-list">
                    {bookings.map((booking) => {
                      const code = booking.confirmation_code || booking.confirmationCode;
                      const carrier = deriveCarrier(booking);
                      const isAmtrak = carrier.toLowerCase().includes('amtrak');
                      const amount = Number(booking.customer_price ?? booking.amount ?? booking.total_amount);

                      return (
                        <div key={booking.id || code} className="booking-card-item">
                          <div className="booking-card-top">
                            <div className="card-ref-block"><span className="ref-label">CONFIRMATION CODE</span><strong className="ref-value">{code || 'N/A'}</strong></div>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>{getBookingStatusBadge(booking.status)}{getPaymentBadge(booking.payment_status)}</div>
                          </div>

                          <div className="booking-card-body">
                            <div className="booking-info-grid">
                              <div className="info-column"><span className="info-label">Passenger Name</span><strong className="info-value">{derivePassengerName(booking)}</strong></div>
                              <div className="info-column"><span className="info-label">Route</span><strong className="info-value"><i className={`fas ${isAmtrak ? 'fa-train' : 'fa-plane'} route-symbol`} />{deriveRouteDisplay(booking)}</strong></div>
                              <div className="info-column"><span className="info-label">Airline / Transit</span><strong className="info-value">{carrier}</strong></div>
                              <div className="info-column"><span className="info-label">Travel Date</span><strong className="info-value">{deriveDepartureDate(booking)}</strong></div>
                              <div className="info-column"><span className="info-label">Total Amount</span><strong className="info-value">{Number.isFinite(amount) ? `$${amount.toFixed(2)}` : 'Not available'} {booking.currency || 'USD'}</strong></div>
                              <div className="info-column"><span className="info-label">Booking Date</span><strong className="info-value">{booking.created_at ? new Date(booking.created_at).toLocaleDateString() : 'N/A'}</strong></div>
                            </div>
                          </div>

                          <div className="booking-card-actions" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                            {code && (
                              <Link to={`/booking-confirmed/${encodeURIComponent(code)}`} className="view-ticket-btn">
                                <i className="fas fa-file-alt" /> View Reservation
                              </Link>
                            )}
                            <Link to={`/contact?booking=${encodeURIComponent(code || '')}`} className="view-ticket-btn" style={{ backgroundColor: '#475569', borderColor: '#334155' }}>
                              <i className="fas fa-headset" /> Get Payment / Booking Help
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : searched ? (
                <div className="bookings-state-container"><div className="empty-icon-circle"><i className="fas fa-calendar-times" /></div><h3>No Bookings Found</h3><p>We couldn't find a reservation matching <strong>"{searchQuery}"</strong>. Verify the reference or email and try again.</p></div>
              ) : (
                <div className="bookings-state-container"><div className="search-prompt-icon"><i className="fas fa-passport" /></div><h3>Retrieve Booking Information</h3><p>Enter your confirmation code or associated email address.</p></div>
              )}
            </div>
          </div>

          <div className="bookings-sidebar-card">
            <h3>Need Assistance?</h3>
            <p>If you cannot locate your reservation or need help with a payment, change, or accessibility request, contact our support desk.</p>
            <a href={SUPPORT_PHONE_HREF} className="sidebar-phone-box" style={{ textDecoration: 'none' }}>
              <i className="fas fa-phone-alt" />
              <div><span>Call Support</span><strong>{SUPPORT_PHONE_DISPLAY}</strong></div>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MyBookings;
