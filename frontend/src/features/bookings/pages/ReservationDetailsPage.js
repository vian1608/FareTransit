import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useParams } from 'react-router-dom';
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_HREF } from '../../../shared/constants/supportContact';
import './ReservationDetailsPage.css';

const clean = value => value === null || value === undefined || value === '' ? null : String(value);

function titleCase(value, fallback = 'Pending') {
  const text = clean(value) || fallback;
  return text
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/(^|\s)\S/g, letter => letter.toUpperCase());
}

function formatDateTime(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  });
}

function formatDate(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatMoney(total, currency = 'USD') {
  const number = Number(total);
  if (!Number.isFinite(number)) return 'Not available';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(number);
  } catch {
    return `$${number.toFixed(2)} ${currency || 'USD'}`;
  }
}

function StatusPill({ children, tone = 'neutral' }) {
  return <span className={`reservation-detail-pill reservation-detail-pill--${tone}`}>{children}</span>;
}

function DetailItem({ label, value, wide = false }) {
  return (
    <div className={`reservation-detail-item${wide ? ' reservation-detail-item--wide' : ''}`}>
      <span>{label}</span>
      <strong>{value || 'Not available'}</strong>
    </div>
  );
}

function CarReservation({ data }) {
  const car = data.car || {};
  return (
    <>
      <section className="reservation-detail-card">
        <div className="reservation-detail-section-heading">
          <div><span className="reservation-detail-eyebrow">CAR RENTAL</span><h2>Rental details</h2></div>
        </div>
        <div className="reservation-detail-grid">
          <DetailItem label="Rental company" value={car.rentalCompanyName} />
          <DetailItem label="Vehicle" value={car.vehicleName || car.vehicleCategory} />
          <DetailItem label="Pickup location" value={car.pickupLocation} />
          <DetailItem label="Pickup" value={formatDateTime(car.pickupAt)} />
          <DetailItem label="Drop-off location" value={car.dropoffLocation} />
          <DetailItem label="Drop-off" value={formatDateTime(car.dropoffAt)} />
          <DetailItem label="Supplier confirmation" value={car.supplierConfirmation} />
          <DetailItem label="Driver age" value={car.driverAge ? String(car.driverAge) : null} />
          <DetailItem label="Mileage policy" value={car.mileagePolicy} />
          <DetailItem label="Fuel policy" value={car.fuelPolicy} />
          {car.depositTerms && <DetailItem wide label="Deposit terms" value={car.depositTerms} />}
          {car.cancellationPolicy && <DetailItem wide label="Cancellation policy" value={car.cancellationPolicy} />}
        </div>
      </section>

      {data.authorization && (
        <section className="reservation-detail-card">
          <div className="reservation-detail-section-heading">
            <div><span className="reservation-detail-eyebrow">AUTHORIZATION</span><h2>Authorization status</h2></div>
          </div>
          <div className="reservation-detail-grid">
            <DetailItem label="Status" value={titleCase(data.authorization.status)} />
            <DetailItem label="Version" value={`Version ${data.authorization.version || 1}`} />
            <DetailItem label="Authorized amount" value={formatMoney(data.authorization.totalAmount, data.authorization.currency)} />
            <DetailItem label="Sent" value={data.authorization.sentAt ? formatDateTime(data.authorization.sentAt) : 'Not sent'} />
            <DetailItem label="Viewed" value={data.authorization.viewedAt ? formatDateTime(data.authorization.viewedAt) : 'Not viewed'} />
            <DetailItem label="Authorized" value={data.authorization.authorizedAt ? formatDateTime(data.authorization.authorizedAt) : 'Not yet'} />
          </div>
        </section>
      )}
    </>
  );
}

function HotelReservation({ data }) {
  const hotel = data.hotel || {};
  return (
    <section className="reservation-detail-card">
      <div className="reservation-detail-section-heading">
        <div><span className="reservation-detail-eyebrow">HOTEL</span><h2>Stay details</h2></div>
      </div>
      <div className="reservation-detail-grid">
        <DetailItem label="Property" value={hotel.propertyName} />
        <DetailItem label="Destination" value={hotel.destination} />
        <DetailItem label="Check-in" value={formatDate(hotel.checkIn)} />
        <DetailItem label="Check-out" value={formatDate(hotel.checkOut)} />
        <DetailItem label="Rooms" value={hotel.rooms ? String(hotel.rooms) : null} />
        <DetailItem label="Guests" value={hotel.adults != null ? `${hotel.adults} adult${Number(hotel.adults) === 1 ? '' : 's'}${Number(hotel.children || 0) ? `, ${hotel.children} child${Number(hotel.children) === 1 ? '' : 'ren'}` : ''}` : null} />
        <DetailItem label="Room type" value={hotel.roomType} />
        <DetailItem label="Supplier" value={hotel.supplierName} />
        <DetailItem label="Supplier confirmation" value={hotel.supplierConfirmation} />
        {hotel.cancellationDeadline && <DetailItem label="Cancellation deadline" value={formatDateTime(hotel.cancellationDeadline)} />}
        {hotel.cancellationPolicy && <DetailItem wide label="Cancellation policy" value={hotel.cancellationPolicy} />}
      </div>
    </section>
  );
}

function segmentLabel(segment = {}) {
  const origin = segment.departureAirport || segment.originCode || segment.departure_airport || segment.origin_airport;
  const destination = segment.arrivalAirport || segment.destinationCode || segment.arrival_airport || segment.destination_airport;
  return origin && destination ? `${origin} → ${destination}` : 'Flight segment';
}

function FlightReservation({ data }) {
  const flight = data.flight || {};
  const itinerary = flight.itinerary || {};
  const segments = useMemo(() => {
    const outbound = Array.isArray(itinerary.outbound) ? itinerary.outbound : [];
    const returned = Array.isArray(itinerary.return) ? itinerary.return : [];
    if (outbound.length || returned.length) return [...outbound, ...returned];
    return Array.isArray(flight.flights) ? flight.flights : [];
  }, [flight.flights, itinerary.outbound, itinerary.return]);

  return (
    <section className="reservation-detail-card">
      <div className="reservation-detail-section-heading">
        <div><span className="reservation-detail-eyebrow">FLIGHT</span><h2>Itinerary</h2></div>
      </div>
      {segments.length ? (
        <div className="reservation-flight-list">
          {segments.map((segment, index) => (
            <article className="reservation-flight-segment" key={`${segment.flightNumber || 'segment'}-${index}`}>
              <div className="reservation-flight-route">{segmentLabel(segment)}</div>
              <div className="reservation-flight-meta">
                <span>{segment.airlineName || segment.carrierName || flight.airlineName || 'Airline'}</span>
                {(segment.flightNumber || segment.flight_number) && <span>Flight {segment.flightNumber || segment.flight_number}</span>}
                {(segment.departureDate || segment.departure_date) && <span>{formatDate(segment.departureDate || segment.departure_date)}</span>}
                {(segment.departureTime || segment.departure_time) && <span>{segment.departureTime || segment.departure_time}</span>}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="reservation-detail-muted">Itinerary details are not available yet.</p>
      )}
      <div className="reservation-detail-grid reservation-detail-grid--spaced">
        <DetailItem label="Airline confirmation" value={flight.airlineConfirmationNumber} />
        <DetailItem label="Ticket number" value={flight.ticketNumber} />
      </div>
    </section>
  );
}

function serviceDescription(serviceType) {
  if (serviceType === 'CAR') return 'Car rental reservation';
  if (serviceType === 'HOTEL') return 'Hotel reservation';
  return 'Flight reservation';
}

function ReservationDetailsPage() {
  const { reference } = useParams();
  const [state, setState] = useState({ loading: true, data: null, error: '' });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      setState({ loading: true, data: null, error: '' });
      try {
        const response = await fetch(`/api/bookings/reservation/${encodeURIComponent(reference || '')}`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' }
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.success || !payload?.data) {
          throw new Error(payload?.error?.message || 'Reservation could not be loaded.');
        }
        if (!cancelled) setState({ loading: false, data: payload.data, error: '' });
      } catch (error) {
        if (error?.name === 'AbortError') return;
        if (!cancelled) setState({ loading: false, data: null, error: error?.message || 'Reservation could not be loaded.' });
      }
    }

    load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [reference]);

  const data = state.data;
  const serviceType = String(data?.serviceType || '').toUpperCase();
  const status = data?.status || 'PENDING';
  const statusTone = ['BOOKED', 'CONFIRMED', 'TICKETED', 'DONE', 'COMPLETED'].includes(String(status).toUpperCase()) ? 'success' : 'warning';

  if (state.loading) {
    return (
      <div className="reservation-detail-page">
        <Helmet><title>Loading Reservation | FareTransit</title><meta name="robots" content="noindex,nofollow" /></Helmet>
        <div className="reservation-detail-state"><i className="fas fa-circle-notch fa-spin" /><h2>Loading reservation</h2><p>Retrieving the latest saved details.</p></div>
      </div>
    );
  }

  if (state.error || !data) {
    return (
      <div className="reservation-detail-page">
        <Helmet><title>Reservation Not Found | FareTransit</title><meta name="robots" content="noindex,nofollow" /></Helmet>
        <div className="reservation-detail-state reservation-detail-state--error">
          <i className="fas fa-exclamation-circle" />
          <h2>Reservation lookup failed</h2>
          <p>{state.error || 'We could not load this reservation.'}</p>
          <div className="reservation-detail-actions"><Link to="/my-bookings">Back to My Bookings</Link><a href={SUPPORT_PHONE_HREF}>Call {SUPPORT_PHONE_DISPLAY}</a></div>
        </div>
      </div>
    );
  }

  const customerLabel = serviceType === 'FLIGHT' ? 'Passenger' : serviceType === 'HOTEL' ? 'Guest / Customer' : 'Renter / Customer';

  return (
    <div className="reservation-detail-page">
      <Helmet><title>{data.reference || reference} Reservation | FareTransit</title><meta name="robots" content="noindex,nofollow" /></Helmet>
      <div className="reservation-detail-shell">
        <div className="reservation-detail-topbar"><Link to="/my-bookings"><i className="fas fa-arrow-left" /> Back to My Bookings</Link></div>

        <header className="reservation-detail-hero">
          <div>
            <span className="reservation-detail-eyebrow">FARETRANSIT RESERVATION</span>
            <h1>{data.reference || reference}</h1>
            <p>{serviceDescription(serviceType)} · Created {formatDate(data.createdAt)}</p>
          </div>
          <div className="reservation-detail-pills">
            <StatusPill tone={statusTone}>{titleCase(status)}</StatusPill>
            {serviceType === 'CAR' && <StatusPill tone="neutral">Authorization {titleCase(data.authorizationStatus, 'Not Started')}</StatusPill>}
            {(serviceType === 'FLIGHT' || serviceType === 'HOTEL') && <StatusPill tone="neutral">Payment {titleCase(data.paymentStatus)}</StatusPill>}
          </div>
        </header>

        <section className="reservation-detail-card">
          <div className="reservation-detail-section-heading"><div><span className="reservation-detail-eyebrow">OVERVIEW</span><h2>Reservation summary</h2></div></div>
          <div className="reservation-detail-grid">
            <DetailItem label={customerLabel} value={data.customer?.name} />
            <DetailItem label="Email" value={data.customer?.email} />
            <DetailItem label="Phone" value={data.customer?.phone} />
            <DetailItem label="Total" value={formatMoney(data.pricing?.total, data.pricing?.currency)} />
          </div>
        </section>

        {serviceType === 'CAR' ? <CarReservation data={data} /> : serviceType === 'HOTEL' ? <HotelReservation data={data} /> : <FlightReservation data={data} />}

        <section className="reservation-detail-help">
          <div><h3>Need help with this reservation?</h3><p>Have your reference <strong>{data.reference || reference}</strong> ready when contacting FareTransit.</p></div>
          <a href={SUPPORT_PHONE_HREF}><i className="fas fa-phone-alt" /> {SUPPORT_PHONE_DISPLAY}</a>
        </section>
      </div>
    </div>
  );
}

export default ReservationDetailsPage;
