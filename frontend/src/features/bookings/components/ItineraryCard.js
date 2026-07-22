import React, { useState, useEffect } from 'react';
import './ItineraryCard.css';

// Inline logo with fallback
function CardAirlineLogo({ logoUrl, name }) {
  const [err, setErr] = useState(!logoUrl);
  useEffect(() => { setErr(!logoUrl); }, [logoUrl]);

  if (err) {
    const initials = name
      ? name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
      : 'FL';
    return <div className="itin-logo-fallback" title={name}>{initials}</div>;
  }
  return <img src={logoUrl} alt={name} className="itin-logo" onError={() => setErr(true)} />;
}

function ItineraryCard({ flight, label, labelColor, isTrain }) {
  const [expanded, setExpanded] = useState(false);

  if (!flight) return null;

  const airline = flight.airline || 'Airline';
  const flightNum = flight.flightNumber || '';
  const depTime = flight.departure?.time || '--:--';
  const arrTime = flight.arrival?.time || '--:--';
  const depAirport = flight.departure?.airport || '---';
  const arrAirport = flight.arrival?.airport || '---';
  const depDate = flight.departure?.date || '';
  const arrDate = flight.arrival?.date || '';
  const depCity = flight.departure?.city || '';
  const arrCity = flight.arrival?.city || '';
  const duration = flight.duration || 'N/A';
  const stops = typeof flight.stops === 'number' ? flight.stops : 0;
  const cabinClass = flight.class || 'Economy';
  const aircraft = flight.aircraft || '';
  const baggageAllowance = flight.baggageAllowance || 'Standard Baggage Rules Apply';
  const layovers = Array.isArray(flight.layovers) ? flight.layovers : [];

  const stopsLabel = stops === 0 ? 'Nonstop' : stops === 1 ? '1 stop' : `${stops} stops`;
  const cardId = `itin-detail-${label?.toLowerCase() || 'flight'}`;

  return (
    <div className={`itin-card ${expanded ? 'itin-card--expanded' : ''}`}>
      {/* Badge */}
      <span className="itin-badge" style={{ backgroundColor: labelColor || '#1e3a5f' }}>
        {label}
      </span>

      {/* Collapsed summary row */}
      <div
        className="itin-summary-row"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-controls={cardId}
        onClick={() => setExpanded(prev => !prev)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(prev => !prev); }
        }}
      >
        {/* Left: logo + airline */}
        <div className="itin-col-carrier">
          <CardAirlineLogo logoUrl={flight.airline_logo} name={airline} />
          <div className="itin-carrier-text">
            <span className="itin-airline-name">{airline}</span>
            <span className="itin-flight-num">{flightNum}</span>
          </div>
        </div>

        {/* Center: times + airports */}
        <div className="itin-col-route">
          <div className="itin-times">
            <span className="itin-time">{depTime}</span>
            <span className="itin-route-dash">—</span>
            <span className="itin-time">{arrTime}</span>
          </div>
          <div className="itin-airports">
            <span>{depAirport}</span>
            <i className={`fas ${isTrain ? 'fa-train' : 'fa-arrow-right'} itin-route-arrow`}></i>
            <span>{arrAirport}</span>
          </div>
        </div>

        {/* Right: duration, stops, chevron */}
        <div className="itin-col-meta">
          <span className="itin-duration">{duration}</span>
          <span className={`itin-stops ${stops === 0 ? 'itin-stops--nonstop' : ''}`}>{stopsLabel}</span>
        </div>

        <i className={`fas fa-chevron-down itin-chevron ${expanded ? 'itin-chevron--rotated' : ''}`}></i>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div id={cardId} className="itin-details">
          <div className="itin-details-grid">
            {/* Departure */}
            <div className="itin-detail-point">
              <div className="itin-detail-dot"></div>
              <div>
                <strong className="itin-detail-time">{depTime}</strong>
                <span className="itin-detail-airport">{depCity ? `${depCity} (${depAirport})` : depAirport}</span>
                <span className="itin-detail-date">{depDate}</span>
              </div>
            </div>

            {/* Segment info */}
            <div className="itin-segment-bar">
              <div className="itin-segment-line"></div>
              <div className="itin-segment-info">
                <span><i className={`fas ${isTrain ? 'fa-subway' : 'fa-plane'}`}></i> {duration} · {airline} {flightNum}</span>
                {aircraft && <span><i className="fas fa-jet-fighter"></i> {aircraft}</span>}
                <span><i className="fas fa-chair"></i> {cabinClass}</span>
                <span><i className="fas fa-suitcase"></i> {baggageAllowance}</span>
              </div>
            </div>

            {/* Layovers */}
            {layovers.map((layover, idx) => (
              <div key={idx} className="itin-layover-block">
                <div className="itin-layover-dot"></div>
                <div className="itin-layover-info">
                  <i className="fas fa-clock"></i>
                  <span>
                    {Math.floor((layover.duration || 0) / 60)}h {(layover.duration || 0) % 60}m layover in {layover.airportName || layover.airportCode} ({layover.airportCode})
                  </span>
                </div>
              </div>
            ))}

            {/* Arrival */}
            <div className="itin-detail-point">
              <div className="itin-detail-dot itin-detail-dot--end"></div>
              <div>
                <strong className="itin-detail-time">{arrTime}</strong>
                <span className="itin-detail-airport">{arrCity ? `${arrCity} (${arrAirport})` : arrAirport}</span>
                <span className="itin-detail-date">{arrDate}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ItineraryCard;
