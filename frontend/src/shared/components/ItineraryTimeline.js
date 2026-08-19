import React, { useState } from 'react';
import { getArrivalDayShiftLabel, calculateLayoverDuration, resolveAirlineName, getCarrierLogoUrl } from '../utils/gdsItineraryHelper';

function AirlineLogoBox({ carrierCode, airlineName }) {
  const [imgError, setImgError] = useState(false);
  const logoUrl = getCarrierLogoUrl(carrierCode);

  if (imgError || !logoUrl || !carrierCode) {
    return (
      <div style={{ width: '60px', height: '44px', flex: '0 0 60px', border: '1px solid #d7e0ec', borderRadius: '8px', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '0.85rem', color: '#1e3a5f' }}>
        {carrierCode || 'FLT'}
      </div>
    );
  }

  return (
    <div style={{ width: '60px', height: '44px', flex: '0 0 60px', border: '1px solid #d7e0ec', borderRadius: '8px', background: '#ffffff', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <img
        src={logoUrl}
        alt={airlineName || carrierCode}
        onError={() => setImgError(true)}
        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
      />
    </div>
  );
}

const cleanCode = (value) => {
  const text = String(value || '').trim().toUpperCase();
  const match = text.match(/(?:^|\()([A-Z]{3})(?:\)|$)/);
  return match?.[1] || (/^[A-Z]{3}$/.test(text) ? text : '');
};

const formatTravelDate = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  let date;
  if (isoMatch) {
    date = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  } else {
    date = new Date(text);
  }

  if (Number.isNaN(date.getTime())) return text;

  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

const airportFor = (segment = {}, side = 'departure') => {
  const isDeparture = side === 'departure';
  const nested = isDeparture ? segment.departure : segment.arrival;
  const alternateNested = isDeparture ? segment.origin : segment.destination;
  const candidates = isDeparture
    ? [
        segment.origin_airport,
        segment.origin_code,
        segment.originCode,
        segment.departureAirport,
        segment.departure_airport,
        nested?.airport,
        nested?.airportCode,
        nested?.iataCode,
        nested?.iata,
        nested?.code,
        alternateNested?.airport,
        alternateNested?.airportCode,
        alternateNested?.iataCode,
        alternateNested?.code,
      ]
    : [
        segment.destination_airport,
        segment.destination_code,
        segment.destinationCode,
        segment.arrivalAirport,
        segment.arrival_airport,
        nested?.airport,
        nested?.airportCode,
        nested?.iataCode,
        nested?.iata,
        nested?.code,
        alternateNested?.airport,
        alternateNested?.airportCode,
        alternateNested?.iataCode,
        alternateNested?.code,
      ];

  for (const candidate of candidates) {
    const code = cleanCode(candidate);
    if (code) return code;
  }
  return '';
};

const timeFor = (segment = {}, side = 'departure') => {
  const nested = side === 'departure' ? segment.departure : segment.arrival;
  return String(
    (side === 'departure'
      ? (segment.departure_time || segment.departureTime)
      : (segment.arrival_time || segment.arrivalTime)) ||
    nested?.time ||
    nested?.localTime ||
    ''
  ).trim();
};

const dateFor = (segment = {}, side = 'departure') => {
  const nested = side === 'departure' ? segment.departure : segment.arrival;
  return String(
    (side === 'departure'
      ? (segment.departure_date || segment.departureDate || segment.departureAt)
      : (segment.arrival_date || segment.arrivalDate || segment.arrivalAt)) ||
    nested?.date ||
    nested?.localDate ||
    ''
  ).trim();
};

const cityFor = (segment = {}, side = 'departure') => {
  const nested = side === 'departure' ? segment.departure : segment.arrival;
  const alternateNested = side === 'departure' ? segment.origin : segment.destination;
  return String(
    (side === 'departure'
      ? (segment.origin_city || segment.originCity || segment.departureCity)
      : (segment.destination_city || segment.destinationCity || segment.arrivalCity)) ||
    nested?.city ||
    nested?.cityName ||
    alternateNested?.city ||
    alternateNested?.cityName ||
    ''
  ).trim();
};

const carrierFor = (segment = {}) => String(
  segment.carrier_code ||
  segment.marketing_carrier_code ||
  segment.carrierCode ||
  segment.marketingCarrierCode ||
  segment.airlineCode ||
  segment.airline?.code ||
  ''
).trim().toUpperCase();

const flightNumberFor = (segment = {}) => String(
  segment.flight_number || segment.flightNumber || segment.number || ''
).trim();

export default function ItineraryTimeline({ segments = [], title = '', variant = 'web' }) {
  if (!Array.isArray(segments) || segments.length === 0) return null;

  const normalizedSegments = segments.map((segment) => ({
    ...segment,
    origin_airport: airportFor(segment, 'departure'),
    destination_airport: airportFor(segment, 'arrival'),
    origin_city: cityFor(segment, 'departure'),
    destination_city: cityFor(segment, 'arrival'),
    departure_time: timeFor(segment, 'departure'),
    arrival_time: timeFor(segment, 'arrival'),
    departure_date: dateFor(segment, 'departure'),
    arrival_date: dateFor(segment, 'arrival'),
    carrier_code: carrierFor(segment),
    flight_number: flightNumberFor(segment),
  }));

  const firstSeg = normalizedSegments[0];
  const lastSeg = normalizedSegments[normalizedSegments.length - 1];

  const overallDepDate = firstSeg.departure_date || '';
  const overallArrDate = lastSeg.arrival_date || '';
  const arrivalLabel = getArrivalDayShiftLabel(overallDepDate, overallArrDate);

  const uniqueCarriers = Array.from(new Set(normalizedSegments.map(s => s.carrier_code).filter(Boolean)));
  const isMultiCarrier = uniqueCarriers.length > 1;
  const primaryCarrierCode = uniqueCarriers[0] || 'FLT';
  const primaryAirlineName = isMultiCarrier ? 'Multiple Airlines' : resolveAirlineName(primaryCarrierCode, firstSeg.carrier_name || firstSeg.airlineName || firstSeg.airline);

  const nodes = [];

  nodes.push({
    type: 'origin',
    isEndpoint: true,
    airportCode: firstSeg.origin_airport || '---',
    cityName: firstSeg.origin_city || '',
    time: firstSeg.departure_time || '',
    date: overallDepDate,
    label: 'DEPARTURE',
    labelStyle: { color: '#8b1236', fontWeight: '800' }
  });

  for (let i = 0; i < normalizedSegments.length - 1; i++) {
    const segArr = normalizedSegments[i];
    const segNextDep = normalizedSegments[i + 1];

    const arrDate = segArr.arrival_date || '';
    const arrTime = segArr.arrival_time || '';
    const depDate = segNextDep.departure_date || '';
    const depTime = segNextDep.departure_time || '';

    const layoverText = calculateLayoverDuration(arrDate, arrTime, depDate, depTime);

    nodes.push({
      type: 'connection',
      isEndpoint: false,
      airportCode: segArr.destination_airport || segNextDep.origin_airport || '---',
      cityName: segArr.destination_city || segNextDep.origin_city || '',
      time: arrTime,
      date: arrDate || depDate,
      label: layoverText ? layoverText.toUpperCase() : 'CONNECTION',
      labelStyle: { color: '#0369a1', fontWeight: '700' }
    });
  }

  nodes.push({
    type: 'destination',
    isEndpoint: true,
    airportCode: lastSeg.destination_airport || '---',
    cityName: lastSeg.destination_city || '',
    time: lastSeg.arrival_time || '',
    date: overallArrDate,
    label: arrivalLabel,
    labelStyle: {
      color: arrivalLabel.includes('+') ? '#d97706' : '#15803d',
      fontWeight: '800'
    }
  });

  const headingTitle = title || 'Flight Route Timeline';

  return (
    <div className="itinerary-timeline-container" style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '20px', marginBottom: '20px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '18px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
        <AirlineLogoBox carrierCode={primaryCarrierCode} airlineName={primaryAirlineName} />
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '800', color: '#1e3a5f', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {headingTitle}
          </h3>
          <span style={{ fontSize: '0.82rem', fontWeight: '600', color: '#64748b' }}>
            {primaryAirlineName}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', width: '100%' }}>
        {nodes.map((node, idx) => {
          const segForLeg = normalizedSegments[idx];
          const carrier = segForLeg?.carrier_code || '';
          const flightNum = segForLeg?.flight_number || '';
          const flightCode = carrier && flightNum ? `${carrier} ${flightNum}` : (carrier || flightNum || '');
          const formattedDate = formatTravelDate(node.date);

          return (
            <React.Fragment key={`${node.type}-${idx}-${node.airportCode}`}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', minWidth: node.isEndpoint ? '110px' : '75px' }}>
                {formattedDate && (
                  <div
                    className="itinerary-node-date"
                    style={{
                      marginBottom: '5px',
                      padding: node.isEndpoint ? '3px 8px' : '2px 6px',
                      borderRadius: '999px',
                      background: node.isEndpoint ? '#f1f5f9' : '#f8fafc',
                      border: '1px solid #e2e8f0',
                      color: '#475569',
                      fontSize: node.isEndpoint ? '0.72rem' : '0.64rem',
                      fontWeight: '750',
                      lineHeight: 1.2,
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <i className="far fa-calendar-alt" aria-hidden="true" style={{ marginRight: '4px' }} />
                    {formattedDate}
                  </div>
                )}

                <div style={{ fontSize: node.isEndpoint ? '1.35rem' : '0.9rem', fontWeight: node.isEndpoint ? '800' : '700', color: '#1e293b', lineHeight: 1.2, minHeight: '24px', display: 'flex', alignItems: 'center' }}>
                  {node.time}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: node.isEndpoint ? '6px' : '4px', margin: '6px 0' }}>
                  <div style={{
                    width: node.isEndpoint ? '16px' : '10px',
                    height: node.isEndpoint ? '16px' : '10px',
                    borderRadius: '50%',
                    background: node.type === 'origin' ? '#8b1236' : (node.type === 'destination' ? '#15803d' : '#0284c7'),
                    border: '2px solid #ffffff',
                    boxShadow: '0 0 0 2px rgba(0,0,0,0.1)'
                  }} />
                  <span style={{
                    fontSize: node.isEndpoint ? '2.4rem' : '1.25rem',
                    fontWeight: node.isEndpoint ? '800' : '750',
                    color: '#0f172a',
                    lineHeight: 1,
                    letterSpacing: '0.5px'
                  }}>
                    {node.airportCode}
                  </span>
                </div>

                <div style={{ fontSize: node.isEndpoint ? '0.78rem' : '0.68rem', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '2px', ...node.labelStyle }}>
                  {node.label}
                </div>
                {node.cityName && (
                  <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '1px' }}>
                    {node.cityName}
                  </div>
                )}
              </div>

              {idx < nodes.length - 1 && (
                <div style={{ flex: 1, minWidth: '90px', margin: '0 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  {flightCode && (
                    <div className="flight-number-badge" style={{ fontSize: '0.75rem', fontWeight: '700', color: '#334155', background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '3px 10px', borderRadius: '999px', whiteSpace: 'nowrap', marginBottom: '6px' }}>
                      ✈ {flightCode}
                    </div>
                  )}

                  <div style={{ width: '100%', display: 'flex', alignItems: 'center', position: 'relative' }}>
                    <div style={{ flex: 1, borderTop: '2px dashed #94a3b8' }} />
                    <i
                      className="fas fa-plane"
                      aria-hidden="true"
                      style={{
                        color: '#8b1236',
                        fontSize: '0.9rem',
                        transform: 'rotate(0deg)',
                        transformOrigin: 'center',
                        display: 'inline-block',
                        margin: '0 6px'
                      }}
                    />
                    <div style={{ flex: 1, borderTop: '2px dashed #94a3b8' }} />
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
