import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { adminAPI, getApiErrorMessage } from '../../../shared/api/api';
import './AdminBookingWorkspace.css';

const emptyPassenger = () => ({
  id: null,
  role: 'adult',
  title: '',
  firstName: '',
  middleName: '',
  lastName: '',
  dateOfBirth: '',
  gender: '',
  nationality: '',
  passportNumber: '',
  passportExpiry: ''
});

const unwrapBooking = response => response?.booking || response?.data?.booking || response?.data || response || null;
const text = value => (value === null || value === undefined ? '' : String(value));

function normalizePassenger(row = {}) {
  return {
    id: row.id || null,
    role: text(row.role || row.passengerType || row.passenger_type || 'adult').toLowerCase(),
    title: text(row.title),
    firstName: text(row.first_name || row.firstName),
    middleName: text(row.middle_name || row.middleName),
    lastName: text(row.last_name || row.lastName),
    dateOfBirth: text(row.date_of_birth || row.dateOfBirth).slice(0, 10),
    gender: text(row.gender),
    nationality: text(row.nationality),
    passportNumber: text(row.passport_number || row.passportNumber),
    passportExpiry: text(row.passport_expiry || row.passportExpiry).slice(0, 10)
  };
}

function normalizeSegments(booking) {
  if (!booking) return [];
  const direct = booking.itinerary_segments || booking.itinerarySegments;
  if (Array.isArray(direct) && direct.length) return direct;
  const outbound = booking.outbound_segments || booking.itinerary?.outbound || [];
  const inbound = booking.return_segments || booking.itinerary?.return || [];
  if (outbound.length || inbound.length) {
    return [
      ...outbound.map((segment, index) => ({ ...segment, journey_direction: 'outbound', segment_sequence: index + 1 })),
      ...inbound.map((segment, index) => ({ ...segment, journey_direction: 'return', segment_sequence: index + 1 }))
    ];
  }
  return (booking.flights || []).map((flight, index) => ({
    ...flight,
    journey_direction: ['return', 'inbound'].includes(text(flight.leg || flight.direction).toLowerCase()) ? 'return' : 'outbound',
    segment_sequence: index + 1
  }));
}

function segmentView(segment = {}) {
  return {
    id: segment.id || `${segment.journey_direction || 'outbound'}-${segment.segment_sequence || segment.sequence || 0}`,
    direction: ['return', 'inbound'].includes(text(segment.journey_direction || segment.direction || segment.leg).toLowerCase()) ? 'return' : 'outbound',
    sequence: Number(segment.segment_sequence || segment.sequence || 1),
    airline: segment.carrier_name || segment.airline_name || segment.airlineName || segment.airline || 'Airline',
    carrierCode: text(segment.carrier_code || segment.marketing_carrier_code || segment.airlineCode).toUpperCase(),
    flightNumber: text(segment.flight_number || segment.flightNumber),
    origin: text(segment.origin_airport || segment.originCode || segment.departure_airport || segment.departureAirport).toUpperCase(),
    destination: text(segment.destination_airport || segment.destinationCode || segment.arrival_airport || segment.arrivalAirport).toUpperCase(),
    originName: segment.origin_city || segment.originName || segment.departure_city || '',
    destinationName: segment.destination_city || segment.destinationName || segment.arrival_city || '',
    departureDate: text(segment.departure_date || segment.departureDate).slice(0, 10),
    departureTime: text(segment.departure_time || segment.departureTime || segment.departure_time_str),
    arrivalDate: text(segment.arrival_date || segment.arrivalDate || segment.departure_date || segment.departureDate).slice(0, 10),
    arrivalTime: text(segment.arrival_time || segment.arrivalTime || segment.arrival_time_str),
    cabin: segment.cabin || segment.cabin_class || segment.cabinClass || 'Economy',
    aircraft: segment.aircraft || segment.aircraft_type || '',
    logo: segment.airline_logo_url || segment.airlineLogoUrl || ''
  };
}

function formatDate(value) {
  if (!value) return 'Date not saved';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function formatClock(value) {
  if (!value) return '—';
  const match = text(value).match(/^(\d{1,2}):?(\d{2})/);
  if (!match) return value;
  const hour = Number(match[1]);
  const minute = match[2];
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const display = hour % 12 || 12;
  return `${display}:${minute} ${suffix}`;
}

function ageFromDob(value) {
  if (!value) return null;
  const dob = new Date(`${value}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const beforeBirthday = today.getMonth() < dob.getMonth() || (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

function layoverBetween(first, second) {
  if (!first?.arrivalDate || !first?.arrivalTime || !second?.departureDate || !second?.departureTime) return null;
  const parse = (date, timeValue) => {
    const match = text(timeValue).match(/^(\d{1,2}):?(\d{2})/);
    if (!match) return null;
    const d = new Date(`${date}T${String(match[1]).padStart(2, '0')}:${match[2]}:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const arrival = parse(first.arrivalDate, first.arrivalTime);
  const departure = parse(second.departureDate, second.departureTime);
  if (!arrival || !departure) return null;
  const minutes = Math.round((departure - arrival) / 60000);
  if (minutes <= 0 || minutes > 24 * 60) return null;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours ? `${hours}h ` : ''}${mins}m layover in ${first.destination}`;
}

function PassengerSummaryCard({ passenger, index }) {
  const age = ageFromDob(passenger.dateOfBirth);
  const maskedPassport = passenger.passportNumber
    ? `•••• ${passenger.passportNumber.slice(-4)}`
    : 'No passport saved';
  return (
    <div className="abx-passenger-summary">
      <div className="abx-passenger-avatar">{index + 1}</div>
      <div>
        <strong>{[passenger.title, passenger.firstName, passenger.middleName, passenger.lastName].filter(Boolean).join(' ') || `Passenger ${index + 1}`}</strong>
        <span>{passenger.role || 'adult'}{age !== null ? ` · ${age} yrs` : ''}{passenger.nationality ? ` · ${passenger.nationality}` : ''}</span>
        <small>{maskedPassport}</small>
      </div>
    </div>
  );
}

function Journey({ label, segments }) {
  if (!segments.length) return null;
  return (
    <div className="abx-journey">
      <div className="abx-journey-title">
        <span>{label}</span>
        <strong>{segments[0].origin} → {segments[segments.length - 1].destination}</strong>
      </div>
      <div className="abx-timeline">
        {segments.map((segment, index) => {
          const layover = index < segments.length - 1 ? layoverBetween(segment, segments[index + 1]) : null;
          return (
            <React.Fragment key={`${segment.id}-${index}`}>
              <details className="abx-flight" open={index === 0}>
                <summary>
                  <div className="abx-airline-mark">
                    {segment.logo ? <img src={segment.logo} alt="" /> : <span>✈</span>}
                  </div>
                  <div className="abx-flight-main">
                    <strong>{segment.origin} <span>→</span> {segment.destination}</strong>
                    <small>{segment.airline} {segment.carrierCode} {segment.flightNumber}</small>
                  </div>
                  <div className="abx-flight-time">
                    <strong>{formatClock(segment.departureTime)} – {formatClock(segment.arrivalTime)}</strong>
                    <small>{formatDate(segment.departureDate)}</small>
                  </div>
                </summary>
                <div className="abx-flight-detail">
                  <div><span>Departure</span><strong>{segment.origin}</strong><small>{segment.originName || 'Airport'} · {formatClock(segment.departureTime)}</small></div>
                  <div className="abx-route-line"><i /><b>✈</b><i /></div>
                  <div><span>Arrival</span><strong>{segment.destination}</strong><small>{segment.destinationName || 'Airport'} · {formatClock(segment.arrivalTime)}</small></div>
                  <div className="abx-flight-meta"><span>{segment.cabin}</span>{segment.aircraft && <span>{segment.aircraft}</span>}<span>Flight {segment.carrierCode} {segment.flightNumber}</span></div>
                </div>
              </details>
              {layover && <div className="abx-layover"><span>●</span>{layover}</div>}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

export default function AdminBookingWorkspace() {
  const { code } = useParams();
  const [booking, setBooking] = useState(null);
  const [passengers, setPassengers] = useState([]);
  const [contact, setContact] = useState({ email: '', phone: '', countryCode: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [passengerEditorOpen, setPassengerEditorOpen] = useState(false);

  const hydrate = useCallback(next => {
    if (!next) return;
    setBooking(next);
    const raw = next.travellers || next.passengers || [];
    let normalized = Array.isArray(raw) ? raw.map(normalizePassenger) : [];
    if (!normalized.length) {
      const parts = text(next.passenger_name).trim().split(/\s+/).filter(Boolean);
      normalized = [{ ...emptyPassenger(), firstName: parts[0] || '', lastName: parts.slice(1).join(' ') || '' }];
    }
    setPassengers(normalized);
    const primaryContact = next.contacts?.[0] || {};
    setContact({
      email: text(primaryContact.email || next.email),
      phone: text(primaryContact.phone_number || primaryContact.phone || next.phone),
      countryCode: text(primaryContact.country_code)
    });
  }, []);

  const load = useCallback(async () => {
    if (!code) return;
    setLoading(true);
    setError('');
    try {
      const response = await adminAPI.getBookingById(code);
      const next = unwrapBooking(response);
      if (!next?.id) throw new Error('Booking details could not be loaded.');
      hydrate(next);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to load booking workspace.'));
    } finally {
      setLoading(false);
    }
  }, [code, hydrate]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!code) return undefined;
    const desiredTitle = `${code} | Booking Editor`;
    const enforceTitle = () => {
      if (document.title !== desiredTitle) document.title = desiredTitle;
    };
    enforceTitle();
    const observer = new MutationObserver(enforceTitle);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [code]);

  useEffect(() => {
    if (!code) return undefined;

    const decorate = () => {
      document.querySelectorAll('.admin-booking-detail-route .adv2-editor-section').forEach(section => {
        if (!section.dataset.abxCollapsible) {
          section.dataset.abxCollapsible = 'true';
          section.classList.add('abx-collapsed');
        }
      });
      document.querySelectorAll('.admin-booking-detail-route .adv2-segment-card').forEach(card => {
        if (!card.dataset.abxCollapsible) {
          card.dataset.abxCollapsible = 'true';
          card.classList.add('abx-collapsed');
        }
      });
    };

    const onClick = event => {
      const header = event.target?.closest?.('.adv2-editor-section__header');
      if (header && !event.target.closest('button, input, select, textarea, a')) {
        header.closest('.adv2-editor-section')?.classList.toggle('abx-collapsed');
        return;
      }
      const segmentHead = event.target?.closest?.('.adv2-segment-card__head');
      if (segmentHead && !event.target.closest('button, input, select, textarea, a')) {
        segmentHead.closest('.adv2-segment-card')?.classList.toggle('abx-collapsed');
      }
    };

    decorate();
    const observer = new MutationObserver(decorate);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', onClick, true);
    return () => {
      observer.disconnect();
      document.removeEventListener('click', onClick, true);
    };
  }, [code]);

  const segments = useMemo(() => normalizeSegments(booking).map(segmentView).sort((a, b) => {
    if (a.direction !== b.direction) return a.direction === 'outbound' ? -1 : 1;
    return a.sequence - b.sequence;
  }), [booking]);
  const outbound = segments.filter(segment => segment.direction === 'outbound');
  const inbound = segments.filter(segment => segment.direction === 'return');

  const updatePassenger = (index, field, value) => {
    setPassengers(current => current.map((passenger, idx) => idx === index ? { ...passenger, [field]: value } : passenger));
  };

  const removePassenger = index => {
    setPassengers(current => current.length <= 1 ? current : current.filter((_, idx) => idx !== index));
  };

  const savePassengers = async () => {
    if (!booking?.id || saving) return;
    setSaving(true);
    setError('');
    setMessage('');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/admin/bookings/${booking.id}/passenger-details`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ passengers, contact, replacePassengers: true }),
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.success === false) {
        throw new Error(data?.error?.message || `Passenger update failed with HTTP ${response.status}.`);
      }
      const next = unwrapBooking(data);
      if (next?.id) hydrate(next);
      setMessage(data.message || 'Passenger details saved.');
      setPassengerEditorOpen(false);
    } catch (err) {
      setError(err?.name === 'AbortError' ? 'Passenger save timed out. Nothing will stay stuck; retry after checking your connection.' : (err?.message || 'Unable to save passenger details.'));
    } finally {
      clearTimeout(timer);
      setSaving(false);
    }
  };

  if (loading) {
    return <section className="abx-workspace abx-loading">Loading booking workspace…</section>;
  }

  return (
    <section className="abx-workspace">
      <header className="abx-workspace-header">
        <div>
          <div className="abx-eyebrow">Booking Editor</div>
          <h1>{code}</h1>
          <p>{booking?.passenger_name || 'Passenger'} · {booking?.email || 'No email'} · {booking?.status || 'PENDING'}</p>
        </div>
        <div className="abx-header-actions">
          <a className="abx-button abx-button-secondary" href="/admin/dashboard">← All Bookings</a>
          <button className="abx-button" type="button" onClick={load}>Refresh</button>
        </div>
      </header>

      {error && <div className="abx-alert abx-alert-error" role="alert">{error}</div>}
      {message && <div className="abx-alert abx-alert-success">{message}</div>}

      <div className="abx-overview-grid">
        <details className="abx-panel" open>
          <summary>
            <div><span className="abx-panel-icon">👤</span><strong>Passengers</strong><small>{passengers.length} traveler{passengers.length === 1 ? '' : 's'}</small></div>
            <span className="abx-chevron">⌄</span>
          </summary>
          <div className="abx-panel-body">
            <div className="abx-passenger-grid">
              {passengers.map((passenger, index) => <PassengerSummaryCard passenger={passenger} index={index} key={passenger.id || index} />)}
            </div>
            <div className="abx-contact-strip"><span>✉ {contact.email || 'No email saved'}</span><span>☎ {contact.phone || 'No phone saved'}</span></div>
            <button className="abx-button" type="button" onClick={() => setPassengerEditorOpen(current => !current)}>
              {passengerEditorOpen ? 'Close Passenger Editor' : 'Edit Passenger & Contact Details'}
            </button>

            {passengerEditorOpen && (
              <div className="abx-editor">
                {passengers.map((passenger, index) => (
                  <details className="abx-passenger-editor" open={index === 0} key={passenger.id || index}>
                    <summary><strong>Passenger {index + 1}</strong><span>{passenger.firstName} {passenger.lastName}</span><b>⌄</b></summary>
                    <div className="abx-form-grid">
                      <label><span>Passenger type</span><select value={passenger.role} onChange={event => updatePassenger(index, 'role', event.target.value)}><option value="adult">Adult</option><option value="child">Child</option><option value="infant">Infant</option></select></label>
                      <label><span>Title</span><select value={passenger.title} onChange={event => updatePassenger(index, 'title', event.target.value)}><option value="">None</option><option>Mr</option><option>Ms</option><option>Mrs</option><option>Dr</option></select></label>
                      <label><span>First name *</span><input value={passenger.firstName} onChange={event => updatePassenger(index, 'firstName', event.target.value)} /></label>
                      <label><span>Middle name</span><input value={passenger.middleName} onChange={event => updatePassenger(index, 'middleName', event.target.value)} /></label>
                      <label><span>Last name *</span><input value={passenger.lastName} onChange={event => updatePassenger(index, 'lastName', event.target.value)} /></label>
                      <label><span>Date of birth</span><input type="date" value={passenger.dateOfBirth} onChange={event => updatePassenger(index, 'dateOfBirth', event.target.value)} /></label>
                      <label><span>Gender</span><select value={passenger.gender} onChange={event => updatePassenger(index, 'gender', event.target.value)}><option value="">Not specified</option><option value="Male">Male</option><option value="Female">Female</option><option value="X">X / Unspecified</option></select></label>
                      <label><span>Nationality</span><input value={passenger.nationality} onChange={event => updatePassenger(index, 'nationality', event.target.value)} placeholder="e.g. United States" /></label>
                      <label><span>Passport number</span><input value={passenger.passportNumber} onChange={event => updatePassenger(index, 'passportNumber', event.target.value.toUpperCase())} autoComplete="off" /></label>
                      <label><span>Passport expiry</span><input type="date" value={passenger.passportExpiry} onChange={event => updatePassenger(index, 'passportExpiry', event.target.value)} /></label>
                    </div>
                    {passengers.length > 1 && <button className="abx-link-danger" type="button" onClick={() => removePassenger(index)}>Remove passenger</button>}
                  </details>
                ))}

                <button className="abx-button abx-button-secondary" type="button" onClick={() => setPassengers(current => [...current, emptyPassenger()])}>+ Add Passenger</button>

                <div className="abx-contact-editor">
                  <h3>Primary Contact</h3>
                  <div className="abx-form-grid abx-form-grid-3">
                    <label><span>Email</span><input type="email" value={contact.email} onChange={event => setContact(current => ({ ...current, email: event.target.value }))} /></label>
                    <label><span>Phone</span><input value={contact.phone} onChange={event => setContact(current => ({ ...current, phone: event.target.value }))} placeholder="+1 213 965 9727" /></label>
                    <label><span>Country code</span><input value={contact.countryCode} onChange={event => setContact(current => ({ ...current, countryCode: event.target.value }))} placeholder="+1" /></label>
                  </div>
                </div>

                <div className="abx-editor-footer">
                  <span>Changing identity details after authorization may require the passenger to authorize again.</span>
                  <button className="abx-button" type="button" onClick={savePassengers} disabled={saving}>{saving ? 'Saving…' : 'Save Passenger Details'}</button>
                </div>
              </div>
            )}
          </div>
        </details>

        <details className="abx-panel" open>
          <summary>
            <div><span className="abx-panel-icon">✈</span><strong>Flight Itinerary</strong><small>{segments.length} flight segment{segments.length === 1 ? '' : 's'}</small></div>
            <span className="abx-chevron">⌄</span>
          </summary>
          <div className="abx-panel-body">
            {segments.length === 0 ? <div className="abx-empty">No saved itinerary. Use the Itinerary section below to import or add flights.</div> : (
              <>
                <Journey label={inbound.length ? 'Outbound' : (outbound.length > 1 ? 'Trip / Multi-city' : 'Flight')} segments={outbound} />
                <Journey label="Return" segments={inbound} />
              </>
            )}
          </div>
        </details>
      </div>

      <div className="abx-section-hint">Booking controls below are compact by default. Click any section heading or flight segment heading to expand it.</div>
    </section>
  );
}
