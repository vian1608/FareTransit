import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { adminAPI } from '../../../shared/api/api';
import './AdminDashboardPage.css';

function AdminDashboard() {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filter States
  const [filters, setFilters] = useState({
    reference: '',
    name: '',
    email: '',
    date: '',
    status: ''
  });

  // Selected Booking details modal/panel state
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [internalNotes, setInternalNotes] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [updatingRecord, setUpdatingRecord] = useState(false);

  const loadData = useCallback(async (activeFilters = filters) => {
    try {
      setLoading(true);
      setError('');
      
      // Clean empty filters before querying API
      const queryFilters = {};
      Object.keys(activeFilters).forEach(key => {
        if (activeFilters[key]) {
          queryFilters[key] = activeFilters[key];
        }
      });

      const [bookingsRes, statsRes] = await Promise.all([
        adminAPI.getBookings(queryFilters),
        adminAPI.getStats()
      ]);

      if (bookingsRes.success && statsRes.success) {
        setBookings(bookingsRes.data || []);
        setStats(statsRes.data || null);
      } else {
        setError('Failed to fetch dashboard data from server.');
      }
    } catch (err) {
      console.error('Failed to load admin dashboard data:', err);
      setError('Unable to reach server. Please ensure database and backend are running.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Authenticate Admin Session on Mount
  useEffect(() => {
    const adminSession = sessionStorage.getItem('adminSession');
    if (!adminSession) {
      navigate('/admin/login');
      return;
    }
    loadData();
  }, [navigate, loadData]);

  const handleFilterChange = (field, value) => {
    const updatedFilters = { ...filters, [field]: value };
    setFilters(updatedFilters);
    loadData(updatedFilters);
  };

  const handleClearFilters = () => {
    const cleared = { reference: '', name: '', email: '', date: '', status: '' };
    setFilters(cleared);
    loadData(cleared);
  };

  const handleSelectBooking = (booking) => {
    setSelectedBooking(booking);
    setInternalNotes(booking.internalNotes || '');
    setNewStatus(booking.bookingStatus || 'pending');
  };

  const handleUpdateStatusAndNotes = async (e) => {
    e.preventDefault();
    if (!selectedBooking) return;
    setUpdatingRecord(true);

    try {
      const response = await adminAPI.updateBooking(selectedBooking.id, {
        bookingStatus: newStatus,
        internalNotes: internalNotes
      });

      if (response.success) {
        setSelectedBooking(response.data);
        // Refresh grid
        loadData();
        alert('Booking updated successfully!');
      } else {
        alert('Failed to update booking status.');
      }
    } catch (err) {
      console.error('Update status failed:', err);
      alert('Error updating booking status.');
    } finally {
      setUpdatingRecord(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('adminSession');
    navigate('/admin/login');
  };

  if (loading && bookings.length === 0) {
    return (
      <div className="admin-loading-container">
        <i className="fas fa-circle-notch fa-spin"></i>
        <p>Loading management console...</p>
      </div>
    );
  }

  return (
    <div className="admin-dashboard-page">
      <Helmet>
        <title>Admin Dashboard | FareTransit</title>
      </Helmet>

      {/* ADMIN NAV BAR */}
      <header className="admin-nav">
        <div className="admin-nav-container">
          <div className="admin-logo">
            <i className="fas fa-shield-alt"></i>
            <span>FareTransit Admin</span>
          </div>
          <button onClick={handleLogout} className="admin-logout-btn">
            <i className="fas fa-sign-out-alt"></i> Sign Out
          </button>
        </div>
      </header>

      <div className="admin-main-container">
        
        {/* STATS OVERVIEW CARDS */}
        {stats && (
          <section className="admin-stats-section">
            <div className="stats-grid">
              <div className="stat-card stat-card--pending">
                <h3>Pending</h3>
                <p className="stat-value">{stats.pendingCount || 0}</p>
                <small>Requires manual ticket</small>
              </div>
              <div className="stat-card stat-card--confirmed">
                <h3>Confirmed</h3>
                <p className="stat-value">{stats.confirmedCount || 0}</p>
                <small>Manually issued</small>
              </div>
              <div className="stat-card stat-card--completed">
                <h3>Completed</h3>
                <p className="stat-value">{stats.completedCount || 0}</p>
                <small>Completed trips</small>
              </div>
              <div className="stat-card stat-card--cancelled">
                <h3>Cancelled</h3>
                <p className="stat-value">{stats.cancelledCount || 0}</p>
                <small>Refunded/Rejected</small>
              </div>
              <div className="stat-card stat-card--revenue">
                <h3>Total Revenue</h3>
                <p className="stat-value">${parseFloat(stats.totalRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                <small>Secure Stripe sales</small>
              </div>
            </div>
          </section>
        )}

        {error && (
          <div className="admin-error-banner">
            <i className="fas fa-exclamation-circle"></i> {error}
          </div>
        )}

        {/* WORKSPACE LAYOUT */}
        <div className="admin-workspace-grid">
          
          {/* SEARCH & BOOKINGS LIST PANEL */}
          <div className="admin-list-panel">
            
            {/* Search Filters Row */}
            <div className="admin-filters-card">
              <h3>Search & Filters</h3>
              <div className="filters-inputs-row">
                <input 
                  type="text" 
                  placeholder="Booking Ref (e.g. TFS-)" 
                  value={filters.reference}
                  onChange={(e) => handleFilterChange('reference', e.target.value)}
                  className="admin-input"
                />
                <input 
                  type="text" 
                  placeholder="Passenger Name" 
                  value={filters.name}
                  onChange={(e) => handleFilterChange('name', e.target.value)}
                  className="admin-input"
                />
                <input 
                  type="email" 
                  placeholder="Contact Email" 
                  value={filters.email}
                  onChange={(e) => handleFilterChange('email', e.target.value)}
                  className="admin-input"
                />
                <input 
                  type="date" 
                  value={filters.date}
                  onChange={(e) => handleFilterChange('date', e.target.value)}
                  className="admin-input"
                />
                <select 
                  value={filters.status}
                  onChange={(e) => handleFilterChange('status', e.target.value)}
                  className="admin-select"
                >
                  <option value="">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button onClick={handleClearFilters} className="admin-secondary-btn">
                  Clear Filters
                </button>
              </div>
            </div>

            {/* Bookings Grid Table */}
            <div className="admin-table-card">
              <div className="card-header-row">
                <h2>Flight Bookings List</h2>
                <span>{bookings.length} record(s)</span>
              </div>
              
              <div className="admin-table-wrapper">
                <table className="admin-data-table">
                  <thead>
                    <tr>
                      <th>Ref Code</th>
                      <th>Customer Name</th>
                      <th>Email</th>
                      <th>Web Price</th>
                      <th>API Original</th>
                      <th>Status</th>
                      <th>Date Added</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.length === 0 ? (
                      <tr>
                        <td colSpan="8" style={{ textCenter: 'center', padding: '2rem', color: '#64748b' }}>
                          No booking records found matching search queries.
                        </td>
                      </tr>
                    ) : (
                      bookings.map((booking) => (
                        <tr key={booking.id} className={selectedBooking?.id === booking.id ? 'active-row' : ''}>
                          <td style={{ fontWeight: '700' }}>{booking.bookingReference}</td>
                          <td>{booking.customerName}</td>
                          <td>{booking.email}</td>
                          <td style={{ fontWeight: '700', color: '#1e3a5f' }}>${parseFloat(booking.displayedWebsitePrice).toFixed(2)}</td>
                          <td style={{ color: '#64748b', fontSize: '0.85rem' }}>${parseFloat(booking.originalApiPrice).toFixed(2)}</td>
                          <td>
                            <span className={`status-badge status-badge--${booking.bookingStatus}`}>
                              {booking.bookingStatus}
                            </span>
                          </td>
                          <td>{new Date(booking.createdAt).toLocaleDateString()}</td>
                          <td>
                            <button 
                              onClick={() => handleSelectBooking(booking)} 
                              className="admin-action-btn"
                            >
                              Manage <i className="fas fa-chevron-right" style={{ fontSize: '0.7rem', marginLeft: '4px' }}></i>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

          {/* DETAILED BOOKING MANAGEMENT DRAWER */}
          <aside className="admin-detail-panel">
            {selectedBooking ? (
              <div className="admin-detail-card">
                <div className="detail-header">
                  <h3>Booking Details</h3>
                  <span className="ref-tag">{selectedBooking.bookingReference}</span>
                </div>

                {/* Status Update Section */}
                <form onSubmit={handleUpdateStatusAndNotes} className="detail-update-box">
                  <div className="detail-form-group">
                    <label>Update Booking Status</label>
                    <select 
                      value={newStatus} 
                      onChange={(e) => setNewStatus(e.target.value)}
                      className="admin-select"
                    >
                      <option value="pending">Pending Confirmation</option>
                      <option value="confirmed">Confirmed / Issued</option>
                      <option value="cancelled">Cancelled / Refunded</option>
                      <option value="completed">Completed Trip</option>
                    </select>
                  </div>

                  <div className="detail-form-group" style={{ marginTop: '10px' }}>
                    <label>Internal Audit Notes</label>
                    <textarea 
                      rows={3} 
                      value={internalNotes}
                      onChange={(e) => setInternalNotes(e.target.value)}
                      placeholder="Add status updates, confirmation numbers, or refund notes."
                      className="admin-textarea"
                    />
                  </div>

                  <button 
                    type="submit" 
                    disabled={updatingRecord} 
                    className="admin-primary-btn"
                    style={{ width: '100%', marginTop: '12px' }}
                  >
                    {updatingRecord ? 'Saving Updates...' : 'Apply Status & Notes'}
                  </button>
                </form>

                {/* Pricing summary */}
                <div className="detail-section">
                  <h4>Transaction Info</h4>
                  <div className="meta-data-grid">
                    <div>
                      <span>Stripe Sale Total</span>
                      <strong style={{ color: '#10b981' }}>${parseFloat(selectedBooking.displayedWebsitePrice).toFixed(2)} USD</strong>
                    </div>
                    <div>
                      <span>API original price</span>
                      <strong>${parseFloat(selectedBooking.originalApiPrice).toFixed(2)} USD</strong>
                    </div>
                    <div>
                      <span>Sales Channel</span>
                      <span>Stripe Checkout</span>
                    </div>
                    <div>
                      <span>Transaction ID</span>
                      <small className="ref-code" style={{ display: 'block', fontSize: '0.75rem', overflowWrap: 'anywhere' }}>{selectedBooking.transactionId || 'Offline'}</small>
                    </div>
                  </div>
                </div>

                {/* Primary Contact Details */}
                <div className="detail-section">
                  <h4>Primary Contact</h4>
                  <p style={{ margin: '4px 0' }}><strong>Name:</strong> {selectedBooking.customerName}</p>
                  <p style={{ margin: '4px 0' }}><strong>Email:</strong> {selectedBooking.email}</p>
                  <p style={{ margin: '4px 0' }}><strong>Phone:</strong> {selectedBooking.phone}</p>
                </div>

                {/* Flight summary */}
                <div className="detail-section">
                  <h4>Itinerary Details</h4>
                  {selectedBooking.flight ? (() => {
                    const f = selectedBooking.flight;
                    const depCity = f.departure?.city || 'Origin';
                    const arrCity = f.arrival?.city || 'Destination';
                    return (
                      <div className="itinerary-quick-details" style={{ padding: '10px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div className="summary-airline-row">
                          <strong>{f.airline}</strong>
                          <span className="flight-num-badge" style={{ backgroundColor: '#1e3a5f', padding: '2px 6px', borderRadius: '4px', color: '#fff', fontSize: '0.75rem' }}>{f.flightNumber}</span>
                        </div>
                        <p style={{ margin: '8px 0 4px 0', fontSize: '0.85rem' }}>
                          <strong>Route:</strong> {depCity} ({f.departure?.airport}) → {arrCity} ({f.arrival?.airport})
                        </p>
                        <p style={{ margin: '4px 0', fontSize: '0.85rem' }}>
                          <strong>Departure:</strong> {f.departure?.time} on {f.departure?.date}
                        </p>
                        <p style={{ margin: '4px 0', fontSize: '0.85rem' }}>
                          <strong>Arrival:</strong> {f.arrival?.time} on {f.arrival?.date}
                        </p>
                        <p style={{ margin: '4px 0', fontSize: '0.85rem' }}>
                          <strong>Class:</strong> {f.class} | <strong>Stops:</strong> {f.stops === 0 ? 'Nonstop' : `${f.stops} stop(s)`}
                        </p>

                        {/* If there is a return flight in the database json */}
                        {f.returnFlight && (() => {
                          const r = f.returnFlight;
                          return (
                            <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed #cbd5e1' }}>
                              <div className="summary-airline-row">
                                <strong>Return: {r.airline}</strong>
                                <span className="flight-num-badge" style={{ backgroundColor: '#8b1538', padding: '2px 6px', borderRadius: '4px', color: '#fff', fontSize: '0.75rem' }}>{r.flightNumber}</span>
                              </div>
                              <p style={{ margin: '8px 0 4px 0', fontSize: '0.85rem' }}>
                                <strong>Departure:</strong> {r.departure?.time} on {r.departure?.date}
                              </p>
                              <p style={{ margin: '4px 0', fontSize: '0.85rem' }}>
                                <strong>Arrival:</strong> {r.arrival?.time} on {r.arrival?.date}
                              </p>
                            </div>
                          );
                        })()}
                        
                        {f.billingAddress && (
                          <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed #cbd5e1', fontSize: '0.8rem', color: '#475569' }}>
                            <strong>Billing Address:</strong> {f.billingAddress.street}, {f.billingAddress.city}, {f.billingAddress.state} {f.billingAddress.zip}, {f.billingAddress.country}
                          </div>
                        )}
                        {f.specialRequests && (
                          <div style={{ marginTop: '6px', fontSize: '0.8rem', color: '#475569' }}>
                            <strong>Special Requests:</strong> Wheelchair: {f.specialRequests.wheelchair ? 'Yes' : 'No'} | Meal: {f.specialRequests.mealPreference} | Note: {f.specialRequests.notes || 'None'}
                          </div>
                        )}
                      </div>
                    );
                  })() : <p>No flight details present.</p>}
                </div>

                {/* Travelers detailed list */}
                <div className="detail-section">
                  <h4>Travelers Credentials ({selectedBooking.passengers ? selectedBooking.passengers.length : 0})</h4>
                  {selectedBooking.passengers && selectedBooking.passengers.map((traveler, tIdx) => (
                    <div key={tIdx} style={{ fontSize: '0.85rem', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', marginBottom: '8px', backgroundColor: '#ffffff' }}>
                      <p style={{ margin: '0 0 4px 0' }}><strong>{tIdx + 1}. {traveler.firstName} {traveler.middleName || ''} {traveler.lastName}</strong> ({traveler.role})</p>
                      <p style={{ margin: '2px 0', color: '#475569' }}><strong>DOB:</strong> {traveler.dateOfBirth} | <strong>Gender:</strong> {traveler.gender}</p>
                      <p style={{ margin: '2px 0', color: '#475569' }}><strong>Nationality:</strong> {traveler.nationality}</p>
                      {traveler.passportNumber && (
                        <p style={{ margin: '2px 0', color: '#475569' }}><strong>Passport:</strong> {traveler.passportNumber} (Expires: {traveler.passportExpiry})</p>
                      )}
                      {traveler.knownTravelerNumber && (
                        <p style={{ margin: '2px 0', color: '#475569' }}><strong>KTN:</strong> {traveler.knownTravelerNumber}</p>
                      )}
                      {traveler.redressNumber && (
                        <p style={{ margin: '2px 0', color: '#475569' }}><strong>Redress:</strong> {traveler.redressNumber}</p>
                      )}
                    </div>
                  ))}
                </div>

              </div>
            ) : (
              <div className="admin-detail-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px', color: '#64748b' }}>
                <div>
                  <i className="fas fa-inbox" style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem', opacity: 0.5 }}></i>
                  Select a booking row to review details and issue tickets.
                </div>
              </div>
            )}
          </aside>

        </div>

      </div>
    </div>
  );
}

export default AdminDashboard;
