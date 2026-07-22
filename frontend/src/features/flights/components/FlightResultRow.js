import React, { useState, useEffect } from 'react';
import './FlightResultRow.css'; // Dedicated CSS or shared styling references



// Helper to get initials for fallback logo
function getInitials(name) {
  if (!name) return 'FL';
  const parts = name.split(' ').filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

// AirlineLogo Component with Safe Fallbacks
export function AirlineLogo({ logoUrl, name }) {
  const [error, setError] = useState(!logoUrl);

  useEffect(() => {
    setError(!logoUrl);
  }, [logoUrl]);

  if (error) {
    return (
      <div className="carrier-logo-fallback" title={name}>
        {getInitials(name)}
      </div>
    );
  }

  return (
    <img 
      src={logoUrl} 
      alt={name} 
      className="carrier-logo"
      onError={() => setError(true)}
    />
  );
}

// Safe data normalization for cards rendering
export function normalizeFlight(flight, idx) {
  if (!flight) return null;
  const parsedPrice = parseFloat(flight.price?.total || 0);
  return {
    id: flight.id || `normalized-flight-${idx}-${Math.random()}`,
    airline: flight.airline || 'Unknown Airline',
    airline_logo: flight.airline_logo || '',
    flightNumber: flight.flightNumber || 'N/A',
    price: {
      total: parsedPrice,
      formatted: flight.price?.formatted || `$${parsedPrice.toFixed(2)}`
    },
    departure: {
      airport: flight.departure?.airport || 'N/A',
      city: flight.departure?.city || 'Origin',
      time: flight.departure?.time || 'N/A',
      date: flight.departure?.date || 'N/A'
    },
    arrival: {
      airport: flight.arrival?.airport || 'N/A',
      city: flight.arrival?.city || 'Destination',
      time: flight.arrival?.time || 'N/A',
      date: flight.arrival?.date || 'N/A'
    },
    duration: flight.duration || 'N/A',
    stops: typeof flight.stops === 'number' ? flight.stops : 0,
    class: flight.class || 'Economy',
    aircraft: flight.aircraft || '',
    layovers: Array.isArray(flight.layovers) ? flight.layovers : [],
    isTrain: !!flight.isTrain,
    refundableStatus: flight.refundableStatus || 'Non-Refundable',
    baggageAllowance: flight.baggageAllowance || 'Standard Baggage Rules Apply',
    segments: flight.segments || []
  };
}

// Helper to parse or generate segments for the timeline
export function getFlightSegments(flight) {
  if (!flight) return [];
  
  // If exact segments are available from SerpAPI response
  if (Array.isArray(flight.segments) && flight.segments.length > 0) {
    return flight.segments.map((seg, sIdx) => ({
      from: seg.departure?.airport || flight.departure.airport,
      fromCity: seg.departure?.city || (sIdx === 0 ? flight.departure.city : ''),
      fromTime: seg.departure?.time || 'N/A',
      fromDate: seg.departure?.date || flight.departure.date,
      to: seg.arrival?.airport || flight.arrival.airport,
      toCity: seg.arrival?.city || (sIdx === flight.segments.length - 1 ? flight.arrival.city : ''),
      toTime: seg.arrival?.time || 'N/A',
      toDate: seg.arrival?.date || flight.arrival.date,
      airline: seg.carrier || flight.airline,
      flightNumber: seg.number ? `${seg.carrier || ''}${seg.number}` : flight.flightNumber,
      aircraft: seg.aircraft || flight.aircraft || 'Boeing / Airbus',
      class: flight.class || 'Economy',
      duration: seg.duration || 'N/A',
      layoverAfter: flight.layovers?.[sIdx] ? {
        airport: flight.layovers[sIdx].airportCode,
        name: flight.layovers[sIdx].airportName || flight.layovers[sIdx].airportCode,
        duration: `${Math.floor(flight.layovers[sIdx].duration / 60)}h ${flight.layovers[sIdx].duration % 60}m`,
        durationMinutes: flight.layovers[sIdx].duration
      } : null
    }));
  }

  // Dynamic fallback when segments are empty
  const segments = [];
  if (!flight.layovers || flight.layovers.length === 0) {
    segments.push({
      from: flight.departure.airport,
      fromCity: flight.departure.city,
      fromTime: flight.departure.time,
      fromDate: flight.departure.date,
      to: flight.arrival.airport,
      toCity: flight.arrival.city,
      toTime: flight.arrival.time,
      toDate: flight.arrival.date,
      airline: flight.airline,
      flightNumber: flight.flightNumber,
      aircraft: flight.aircraft || 'Boeing / Airbus',
      class: flight.class,
      duration: flight.duration,
      layoverAfter: null
    });
  } else {
    let currentFrom = {
      airport: flight.departure.airport,
      city: flight.departure.city,
      time: flight.departure.time,
      date: flight.departure.date
    };

    flight.layovers.forEach((layover, index) => {
      segments.push({
        from: currentFrom.airport,
        fromCity: currentFrom.city,
        fromTime: currentFrom.time,
        fromDate: currentFrom.date,
        to: layover.airportCode,
        toCity: layover.airportName || layover.airportCode,
        toTime: 'Connection',
        toDate: currentFrom.date,
        airline: flight.airline,
        flightNumber: flight.flightNumber.split(',')[index]?.trim() || flight.flightNumber,
        aircraft: flight.aircraft || 'Boeing / Airbus',
        class: flight.class,
        duration: 'Flight segment',
        layoverAfter: {
          airport: layover.airportCode,
          name: layover.airportName || layover.airportCode,
          duration: `${Math.floor(layover.duration / 60)}h ${layover.duration % 60}m`,
          durationMinutes: layover.duration
        }
      });

      currentFrom = {
        airport: layover.airportCode,
        city: layover.airportName || layover.airportCode,
        time: 'Departure',
        date: currentFrom.date
      };
    });

    // Add final segment
    segments.push({
      from: currentFrom.airport,
      fromCity: currentFrom.city,
      fromTime: currentFrom.time,
      fromDate: currentFrom.date,
      to: flight.arrival.airport,
      toCity: flight.arrival.city,
      toTime: flight.arrival.time,
      toDate: flight.arrival.date,
      airline: flight.airline,
      flightNumber: flight.flightNumber.split(',')[flight.layovers.length]?.trim() || flight.flightNumber,
      aircraft: flight.aircraft || 'Boeing / Airbus',
      class: flight.class,
      duration: 'Flight segment',
      layoverAfter: null
    });
  }

  return segments;
}

function FlightResultRow({ flight, isExpanded, onToggleExpand, onSelect, actionLabel = "Select Flight", isRail = false, travelersCount = 1 }) {
  const segments = getFlightSegments(flight);
  
  // Construct short connection/layover string
  let stopsText = 'Nonstop';
  if (flight.stops === 1 && flight.layovers?.[0]) {
    stopsText = `1 stop · ${flight.layovers[0].airportCode} · ${Math.floor(flight.layovers[0].duration / 60)}h ${flight.layovers[0].duration % 60}m`;
  } else if (flight.stops > 1) {
    const layoverCodes = flight.layovers.map(l => l.airportCode).join(', ');
    stopsText = `${flight.stops} stops · ${layoverCodes}`;
  }

  // Check if connection is overnight or very tight (< 45 min)
  const isTightConnection = flight.layovers?.some(l => l.duration < 45);

  return (
    <div className={`flight-row-card ${isExpanded ? 'expanded' : ''} ${isRail ? 'flight-row-card--rail' : ''}`}>
      {/* Collapsed Header comparison row */}
      <div 
        className="flight-row-header-summary" 
        onClick={onToggleExpand}
        role="button"
        aria-expanded={isExpanded}
        aria-controls={`details-${flight.id}`}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleExpand();
          }
        }}
      >
        {/* 1. Logo & Carrier */}
        <div className="col-carrier">
          <AirlineLogo logoUrl={flight.airline_logo} name={flight.airline} />
          <div className="carrier-info-text">
            <span className="carrier-name">{flight.airline}</span>
            <span className="carrier-flight-number-sub">{flight.flightNumber}</span>
          </div>
        </div>

        {/* 2. Times & Airport Codes */}
        <div className="col-times">
          <span className="route-times">{flight.departure.time} – {flight.arrival.time}</span>
          <span className="route-airports-codes">
            <span>{flight.departure.airport}</span>
            <span className="route-date-sub">{flight.departure.date}</span>
            <span> – </span>
            <span>{flight.arrival.airport}</span>
            <span className="route-date-sub">{flight.arrival.date}</span>
          </span>
        </div>

        {/* 3. Duration */}
        <div className="col-duration">
          <span className="journey-duration">{flight.duration}</span>
          <span className="secondary-label">{flight.departure.city} to {flight.arrival.city}</span>
        </div>

        {/* 4. Stops & Layover summary */}
        <div className="col-stops">
          <span className={`stops-count-label ${flight.stops > 0 ? 'has-stops' : 'nonstop'} ${isTightConnection ? 'warning-text' : ''}`}>
            {stopsText}
          </span>
        </div>

        {/* 5. Class */}
        <div className="col-class">
          <span className="cabin-class-badge">{flight.class}</span>
        </div>

        {/* 6. Price & Chevron toggle */}
        <div className="col-price-action">
          <div className="price-block">
            <span className="row-price">{flight.price.formatted}</span>
            <span className="row-fare-badge">Web Fare Only</span>
          </div>
          <button 
            type="button" 
            className="mobile-select-btn" 
            onClick={(e) => {
              e.stopPropagation(); // Avoid triggering details toggle
              onSelect(flight);
            }}
          >
            Select
          </button>
          <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'} row-expand-chevron`}></i>
        </div>
      </div>

      {/* Expandable Dropdown Section */}
      {isExpanded && (
        <div id={`details-${flight.id}`} className="flight-row-expanded-details animate-slide-down">
          <div className="expanded-details-grid">
            {/* Timeline layout */}
            <div className="itinerary-timeline-column">
              <div className="vertical-timeline-container">
                {segments.map((segment, segIdx) => {
                  const isConnectionTight = segment.layoverAfter && segment.layoverAfter.durationMinutes < 45;
                  return (
                    <React.Fragment key={segIdx}>
                      {/* Segment Start node */}
                      <div className="timeline-node start">
                        <div className="timeline-dot"></div>
                        <div className="timeline-time-airport">
                          <strong className="timeline-time">{segment.fromTime}</strong>
                          <span className="timeline-airport-name">
                            · {segment.fromCity} ({segment.from}) · {segment.fromDate}
                          </span>
                        </div>
                      </div>

                      {/* Segment journey travel bar */}
                      <div className="timeline-segment-travel">
                        <div className="timeline-connecting-bar"></div>
                        <div className="timeline-segment-info-grid">
                          <div className="segment-carrier-detail">
                            <i className={`fas ${isRail ? 'fa-subway' : 'fa-plane'} segment-type-icon`}></i>
                            <span>Travel time: {segment.duration} · {segment.airline} · {segment.flightNumber}</span>
                          </div>
                          <div className="segment-aircraft-class">
                            <span>Class: {segment.class} · Aircraft: {segment.aircraft}</span>
                          </div>
                        </div>
                      </div>

                      {/* Segment End node */}
                      <div className="timeline-node end">
                        <div className="timeline-dot"></div>
                        <div className="timeline-time-airport">
                          <strong className="timeline-time">{segment.toTime}</strong>
                          <span className="timeline-airport-name">
                            · {segment.toCity} ({segment.to}) · {segment.toDate}
                          </span>
                        </div>
                      </div>

                      {/* Connection/Layover alert bar */}
                      {segment.layoverAfter && (
                        <div className={`timeline-connection-row ${isConnectionTight ? 'tight-warning' : ''}`}>
                          <div className="timeline-connecting-bar dashed"></div>
                          <div className="connection-details-box">
                            <i className="fas fa-clock connection-clock-icon"></i>
                            <span>
                              {segment.layoverAfter.duration} connection in {segment.layoverAfter.name} ({segment.layoverAfter.airport})
                              {isConnectionTight && ' (Tight Connection Alert)'}
                            </span>
                          </div>
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* Selection & Fare details Column */}
            <div className="expanded-fare-restrictions-column">
              <div className="fare-details-card">
                <h4>Fare and Booking Details</h4>
                
                <div className="fare-amenities-list">
                  <div className="amenity-item">
                    <i className="fas fa-suitcase-rolling amenity-icon"></i>
                    <div>
                      <h5>Baggage Allowance</h5>
                      <p>{flight.baggageAllowance}</p>
                    </div>
                  </div>
                  <div className="amenity-item">
                    <i className="fas fa-undo-alt amenity-icon"></i>
                    <div>
                      <h5>Refundability</h5>
                      <p>{flight.refundableStatus}</p>
                    </div>
                  </div>
                  <div className="amenity-item">
                    <i className="fas fa-ticket-alt amenity-icon"></i>
                    <div>
                      <h5>Fare Category</h5>
                      <p>Standard cabin ticket including 24/7 client logistical support.</p>
                    </div>
                  </div>
                </div>

                <div className="fare-total-price-block">
                  <span className="fare-label">Total Price ({travelersCount} traveler{travelersCount > 1 ? 's' : ''})</span>
                  <span className="fare-total-price">{flight.price.formatted}</span>
                </div>

                <button 
                  type="button" 
                  className="expanded-select-flight-btn"
                  onClick={() => onSelect(flight)}
                >
                  {actionLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FlightResultRow;
