import React, { useEffect, useMemo, useState } from 'react';
import { prepareFlightForBooking } from '../../../shared/pricing/bookingPriceContract';
import './FlightResultRow.css';

function getInitials(name) {
  const words = String(name || 'Flight').split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase() || 'FL';
}

function validAirportCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : '';
}

function formatMinutes(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return '';
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (!hours) return `${mins}m`;
  if (!mins) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function formatDateShort(value) {
  if (!value || value === 'N/A') return '';
  const parsed = new Date(String(value).includes('T') ? value : `${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function dayOffset(departureDate, arrivalDate) {
  if (!departureDate || !arrivalDate) return 0;
  const dep = new Date(`${String(departureDate).slice(0, 10)}T00:00:00`);
  const arr = new Date(`${String(arrivalDate).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(dep.getTime()) || Number.isNaN(arr.getTime())) return 0;
  return Math.max(0, Math.round((arr - dep) / 86400000));
}

export function AirlineLogo({ logoUrl, name }) {
  const [failed, setFailed] = useState(!logoUrl);
  useEffect(() => setFailed(!logoUrl), [logoUrl]);

  if (failed) {
    return <div className="carrier-logo-fallback" title={name}>{getInitials(name)}</div>;
  }

  return <img src={logoUrl} alt={`${name || 'Airline'} logo`} className="carrier-logo" onError={() => setFailed(true)} />;
}

export function normalizeFlight(flight, idx = 0) {
  if (!flight) return null;

  const rawTotal = Number.parseFloat(flight.price?.total ?? flight.price?.finalPrice ?? 0);
  const rawOriginal = Number.parseFloat(flight.price?.originalApiPrice ?? flight.price?.original ?? rawTotal);
  const total = Number.isFinite(rawTotal) ? rawTotal : 0;
  const original = Number.isFinite(rawOriginal) && rawOriginal > 0 ? rawOriginal : total;
  const discountAmount = Math.max(0, Number.parseFloat(flight.price?.discountAmount ?? (original - total)) || 0);
  const discountPercent = Number.isFinite(Number(flight.price?.discountPercent)) ? Number(flight.price.discountPercent) : 0;

  return {
    ...flight,
    id: flight.id || `flight-${idx}`,
    airline: flight.airline || 'Airline',
    airline_logo: flight.airline_logo || '',
    flightNumber: flight.flightNumber || '',
    departure: {
      airport: validAirportCode(flight.departure?.airport) || '---',
      city: flight.departure?.city || '',
      time: flight.departure?.time || 'N/A',
      date: flight.departure?.date || '',
    },
    arrival: {
      airport: validAirportCode(flight.arrival?.airport) || '---',
      city: flight.arrival?.city || '',
      time: flight.arrival?.time || 'N/A',
      date: flight.arrival?.date || '',
    },
    duration: flight.duration || 'N/A',
    stops: Number.isInteger(flight.stops) ? flight.stops : Math.max(0, (flight.segments?.length || 1) - 1),
    class: flight.class || 'Economy',
    aircraft: flight.aircraft || '',
    layovers: Array.isArray(flight.layovers) ? flight.layovers : [],
    segments: Array.isArray(flight.segments) ? flight.segments : [],
    refundableStatus: flight.refundableStatus || 'Check fare rules before purchase',
    baggageAllowance: flight.baggageAllowance || 'Check airline baggage rules',
    price: {
      ...flight.price,
      total,
      finalPrice: total.toFixed(2),
      originalApiPrice: original.toFixed(2),
      discountAmount: discountAmount.toFixed(2),
      discountPercent,
      currency: flight.price?.currency || 'USD',
    },
  };
}

function layoverSummary(layover) {
  const code = validAirportCode(layover?.airportCode || layover?.airport || layover?.id);
  const duration = typeof layover?.duration === 'number' ? formatMinutes(layover.duration) : String(layover?.duration || '').trim();
  const name = layover?.airportName || layover?.name || '';
  return { code, duration, name };
}

function normalizeSegment(segment, fallbackFlight) {
  const departure = segment?.departure || segment?.departure_airport || {};
  const arrival = segment?.arrival || segment?.arrival_airport || {};
  return {
    from: validAirportCode(departure.airport || departure.id || segment?.from),
    fromName: departure.city || departure.name || segment?.fromCity || '',
    fromTime: departure.time || segment?.fromTime || '',
    fromDate: departure.date || segment?.fromDate || '',
    to: validAirportCode(arrival.airport || arrival.id || segment?.to),
    toName: arrival.city || arrival.name || segment?.toCity || '',
    toTime: arrival.time || segment?.toTime || '',
    toDate: arrival.date || segment?.toDate || '',
    duration: segment?.duration || '',
    airline: segment?.airline || fallbackFlight.airline,
    flightNumber: segment?.flightNumber || segment?.flight_number || '',
    aircraft: segment?.aircraft || segment?.airplane || '',
    class: segment?.class || segment?.travel_class || fallbackFlight.class,
    layoverAfter: segment?.layoverAfter || null,
  };
}

export function getFlightSegments(flight) {
  if (!flight || !Array.isArray(flight.segments) || flight.segments.length === 0) return [];
  return flight.segments
    .map((segment) => normalizeSegment(segment, flight))
    .filter((segment) => segment.from && segment.to);
}

export function FlightResultRow({
  flight: rawFlight,
  isExpanded = false,
  onToggleExpand,
  onSelect,
  actionLabel = 'Select Flight',
  travelersCount = 1,
  index = 0,
}) {
  const flight = useMemo(() => normalizeFlight(rawFlight, index), [rawFlight, index]);
  if (!flight) return null;

  const segments = getFlightSegments(flight);
  const layovers = flight.layovers.map(layoverSummary).filter((item) => item.code || item.name);
  const overnightOffset = dayOffset(flight.departure.date, flight.arrival.date);
  const stopLabel = flight.stops === 0 ? 'Nonstop' : `${flight.stops} stop${flight.stops === 1 ? '' : 's'}`;
  const layoverCodes = layovers.map((item) => item.code).filter(Boolean).join(', ');
  const firstLayover = layovers[0];
  const hasDiscount = Number(flight.price.discountAmount) > 0;
  const totalTravelers = Math.max(1, Number.parseInt(travelersCount || 1, 10));

  const handleSelect = (event) => {
    event?.stopPropagation?.();
    if (typeof onSelect === 'function') {
      onSelect(prepareFlightForBooking(flight, totalTravelers));
    }
  };

  return (
    <article className={`tfs-flight-option ${isExpanded ? 'is-expanded' : ''}`}>
      <div
        className="tfs-flight-option__summary"
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onClick={onToggleExpand}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onToggleExpand?.();
          }
        }}
      >
        <div className="tfs-flight-carrier">
          <AirlineLogo logoUrl={flight.airline_logo} name={flight.airline} />
          <div>
            <strong>{flight.airline}</strong>
            {flight.flightNumber && <span>{flight.flightNumber}</span>}
          </div>
        </div>

        <div className="tfs-flight-schedule">
          <strong className="tfs-flight-schedule__times">
            {flight.departure.time} – {flight.arrival.time}
            {overnightOffset > 0 && <sup>+{overnightOffset}</sup>}
          </strong>
          <span className="tfs-flight-schedule__codes">{flight.departure.airport} – {flight.arrival.airport}</span>
          <span className="tfs-flight-schedule__dates">
            {formatDateShort(flight.departure.date)}{flight.arrival.date && flight.arrival.date !== flight.departure.date ? ` → ${formatDateShort(flight.arrival.date)}` : ''}
          </span>
        </div>

        <div className="tfs-flight-duration">
          <strong>{flight.duration}</strong>
          <span>{flight.departure.airport}–{flight.arrival.airport}</span>
        </div>

        <div className={`tfs-flight-stops ${flight.stops === 0 ? 'is-nonstop' : ''}`}>
          <strong>{stopLabel}{layoverCodes ? ` · ${layoverCodes}` : ''}</strong>
          {firstLayover?.duration && <span>{firstLayover.duration}{firstLayover.code ? ` in ${firstLayover.code}` : ' layover'}</span>}
          {layovers.length > 1 && <span>{layovers.slice(1).map((item) => `${item.duration || ''} ${item.code || item.name}`.trim()).join(' · ')}</span>}
        </div>

        <div className="tfs-flight-cabin"><span>{flight.class}</span></div>

        <div className="tfs-flight-price">
          {hasDiscount && <span className="tfs-flight-price__original">${flight.price.originalApiPrice}</span>}
          <strong>${flight.price.finalPrice}</strong>
          <span className="tfs-flight-price__caption">fare total · {totalTravelers} traveler{totalTravelers === 1 ? '' : 's'}</span>
          {hasDiscount && <span className="tfs-flight-price__saving">Save ${flight.price.discountAmount}</span>}
        </div>

        <button type="button" className="tfs-flight-select" onClick={handleSelect}>{actionLabel}</button>
        <button
          type="button"
          className="tfs-flight-expand"
          aria-label={isExpanded ? 'Collapse flight details' : 'Expand flight details'}
          onClick={(event) => { event.stopPropagation(); onToggleExpand?.(); }}
        >
          <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'}`} />
        </button>
      </div>

      {isExpanded && (
        <div className="tfs-flight-option__details">
          <div className="tfs-flight-detail-heading">
            <div>
              <strong>Flight details</strong>
              <span>{flight.departure.airport} to {flight.arrival.airport} · {flight.duration}</span>
            </div>
            <button type="button" className="tfs-flight-select tfs-flight-select--detail" onClick={handleSelect}>{actionLabel}</button>
          </div>

          {segments.length > 0 ? (
            <div className="tfs-flight-segments">
              {segments.map((segment, segmentIndex) => {
                const matchingLayover = layovers[segmentIndex];
                const explicitLayover = segment.layoverAfter ? layoverSummary(segment.layoverAfter) : matchingLayover;
                return (
                  <React.Fragment key={`${segment.from}-${segment.to}-${segmentIndex}`}>
                    <div className="tfs-flight-segment">
                      <div className="tfs-flight-segment__route">
                        <div><strong>{segment.fromTime || '—'}</strong><span>{segment.fromName || segment.from} ({segment.from})</span><small>{formatDateShort(segment.fromDate)}</small></div>
                        <div className="tfs-flight-segment__line"><i className="fas fa-plane" /></div>
                        <div><strong>{segment.toTime || '—'}</strong><span>{segment.toName || segment.to} ({segment.to})</span><small>{formatDateShort(segment.toDate)}</small></div>
                      </div>
                      <div className="tfs-flight-segment__meta">
                        <span><strong>{segment.airline}</strong>{segment.flightNumber ? ` · ${segment.flightNumber}` : ''}</span>
                        {segment.duration && <span>{segment.duration}</span>}
                        {segment.aircraft && <span>{segment.aircraft}</span>}
                        {segment.class && <span>{segment.class}</span>}
                      </div>
                    </div>
                    {segmentIndex < segments.length - 1 && explicitLayover && (
                      <div className="tfs-flight-layover">
                        <i className="far fa-clock" />
                        <strong>{explicitLayover.duration || 'Connection'}</strong>
                        <span>layover in {explicitLayover.name || explicitLayover.code}{explicitLayover.code && explicitLayover.name ? ` (${explicitLayover.code})` : ''}</span>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          ) : (
            <div className="tfs-flight-aggregate-details">
              <div className="tfs-flight-aggregate-route">
                <div><strong>{flight.departure.time}</strong><span>{flight.departure.city || flight.departure.airport} ({flight.departure.airport})</span><small>{formatDateShort(flight.departure.date)}</small></div>
                <div className="tfs-flight-aggregate-line"><span>{flight.duration}</span><i /></div>
                <div><strong>{flight.arrival.time}</strong><span>{flight.arrival.city || flight.arrival.airport} ({flight.arrival.airport})</span><small>{formatDateShort(flight.arrival.date)}</small></div>
              </div>
              {layovers.length > 0 && (
                <div className="tfs-flight-layover-list">
                  {layovers.map((layover, layoverIndex) => (
                    <div className="tfs-flight-layover" key={`${layover.code}-${layoverIndex}`}>
                      <i className="far fa-clock" />
                      <strong>{layover.duration || 'Connection'}</strong>
                      <span>layover in {layover.name || layover.code}{layover.code && layover.name ? ` (${layover.code})` : ''}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="tfs-flight-source-note">
                Per-segment timing was not included in this supplier response, so FareTransit is showing only verified route and layover information instead of estimating segment times.
              </p>
            </div>
          )}

          <div className="tfs-flight-fare-notes">
            <span><i className="fas fa-suitcase-rolling" /> {flight.baggageAllowance}</span>
            <span><i className="fas fa-undo-alt" /> {flight.refundableStatus}</span>
          </div>
        </div>
      )}
    </article>
  );
}

export default FlightResultRow;
