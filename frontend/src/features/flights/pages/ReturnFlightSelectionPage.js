import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { flightAPI } from '../../../shared/api/api';
import FlightResultRow, { normalizeFlight } from '../components/FlightResultRow';
import './SearchResultsPage.css';

function ReturnFlightSelection() {
  const navigate = useNavigate();
  const [flights, setFlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useState(null);

  // Accordion Expand State
  const [expandedFlightId, setExpandedFlightId] = useState(null);

  useEffect(() => {
    const outboundFlight = JSON.parse(sessionStorage.getItem('selectedFlight') || 'null');
    const params = JSON.parse(sessionStorage.getItem('searchParams') || '{}');
    
    if (!outboundFlight || !params.returnDate) {
      navigate('/');
      return;
    }

    setSearchParams(params);

    // Set search return parameter: reverse route
    searchReturnFlights({
      from: params.to,
      to: params.from,
      departure: params.returnDate,
      adults: params.adults || 1,
      children: params.children || 0,
      infants: params.infants || 0,
      travelClass: params.travelClass || 'economy',
      currency: params.currency || 'USD'
    });
  }, [navigate]);

  const searchReturnFlights = async (params) => {
    try {
      setLoading(true);
      const response = await flightAPI.search(params);
      setFlights(response.data?.flights || []);
    } catch (err) {
      console.error('Error searching return flights:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectReturnFlight = (flight) => {
    sessionStorage.setItem('returnFlight', JSON.stringify(flight));
    navigate('/booking');
  };

  const toggleExpandFlight = (flightId) => {
    setExpandedFlightId(prev => (prev === flightId ? null : flightId));
  };

  const normalizedFlights = flights
    .map((f, idx) => normalizeFlight(f, idx))
    .filter(Boolean);

  // Rendering Loading Skeletons for a modern feel
  if (loading) {
    return (
      <div className="search-results-page">
        <div className="container" style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <div className="results-toolbar-comparison" style={{ marginBottom: '20px' }}>
            <div className="skeleton-line-title pulsing"></div>
          </div>

          <div className="flight-results-rows-container">
            {[1, 2, 3].map((n) => (
              <div key={n} className="flight-card skeleton-card">
                <div className="flight-header skeleton-flex">
                  <div className="skeleton-circle pulsing"></div>
                  <div className="skeleton-lines">
                    <div className="skeleton-line-heading pulsing"></div>
                    <div className="skeleton-line-sub pulsing"></div>
                  </div>
                  <div className="skeleton-price-block pulsing"></div>
                </div>
                <div className="flight-details skeleton">
                  <div className="skeleton-route-bar pulsing"></div>
                  <div className="skeleton-info-tags pulsing"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="search-results-page">
      <div className="container" style={{ maxWidth: '1000px', margin: '0 auto' }}>
        
        {/* Results Toolbar */}
        <div className="results-toolbar-comparison" style={{ marginBottom: '20px' }}>
          <div className="results-meta-text">
            <h2 style={{ fontSize: '1.4rem', color: '#1e293b', fontWeight: 700, margin: '0 0 4px 0' }}>Select Return Flight</h2>
            <p style={{ fontSize: '0.875rem', color: '#64748b', margin: 0, fontWeight: 500 }}>
              Choose your returning flight from {searchParams?.to?.split('(')[0]?.trim()} to {searchParams?.from?.split('(')[0]?.trim()} to complete your round-trip booking
            </p>
          </div>
        </div>

        {/* Flight results list */}
        <div className="flight-results-rows-container">
          {normalizedFlights.length === 0 ? (
            <div className="no-results-card">
              <div className="no-results-icon-circle">
                <i className="fas fa-plane-departure"></i>
              </div>
              <h3>No return flights found</h3>
              <p>No return flights match your outbound selection, date, and routes. Try modifying your travel criteria.</p>
              <button onClick={() => navigate('/')} className="btn-outline-modify">Back to Home</button>
            </div>
          ) : (
            normalizedFlights.map((flight) => (
              <FlightResultRow
                key={flight.id}
                flight={flight}
                isExpanded={expandedFlightId === flight.id}
                onToggleExpand={() => toggleExpandFlight(flight.id)}
                onSelect={handleSelectReturnFlight}
                actionLabel="Select Return Flight"
                travelersCount={parseInt(searchParams?.adults || 1, 10)}
              />
            ))
          )}
        </div>

      </div>
    </div>
  );
}

export default ReturnFlightSelection;
