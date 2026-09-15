import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { boGet } from './backofficeApi';

const money = (value, currency = 'USD') => {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(Number(value || 0)); }
  catch { return `${Number(value || 0).toFixed(2)} ${currency || 'USD'}`; }
};
const when = value => value ? new Date(value).toLocaleString() : '—';

function Section({ title, children, emptyText }) {
  const list = Array.isArray(children) ? children : [children].filter(Boolean);
  return <section className="bo-card"><h2>{title}</h2>{list.length ? list : <div className="bo-muted">{emptyText}</div>}</section>;
}

export default function TripDetailPageEnhanced() {
  const { id } = useParams();
  const [state, setState] = useState({ loading: true, data: null, error: '' });

  useEffect(() => {
    let active = true;
    boGet(`/trips/${encodeURIComponent(id)}`)
      .then(data => { if (active) setState({ loading: false, data, error: '' }); })
      .catch(error => { if (active) setState({ loading: false, data: null, error: error.message || 'Unable to load trip.' }); });
    return () => { active = false; };
  }, [id]);

  if (state.loading) return <div className="bo-card">Loading trip…</div>;
  if (state.error || !state.data) return <div className="bo-card bo-error">{state.error || 'Trip not found.'}</div>;

  const trip = state.data;
  const flights = trip.items?.flights || [];
  const hotels = trip.items?.hotels || [];
  const cars = trip.items?.cars || [];

  return <>
    <div className="bo-page-header"><div><h1>{trip.trip_code || 'Trip Details'}</h1><div className="bo-muted">{trip.title || 'FareTransit trip'}</div></div><div className="bo-actions"><Link className="bo-button secondary" to="/admin/trips">Back</Link></div></div>
    <div className="bo-card"><strong>{trip.destination || 'Destination not set'}</strong> · {trip.start_date || '—'} to {trip.end_date || '—'} · {trip.status || 'PLANNING'}</div>

    <div className="bo-grid">
      <div className="bo-card bo-kpi"><span className="bo-muted">Flights</span><strong>{flights.length}</strong></div>
      <div className="bo-card bo-kpi"><span className="bo-muted">Hotels</span><strong>{hotels.length}</strong></div>
      <div className="bo-card bo-kpi"><span className="bo-muted">Cars</span><strong>{cars.length}</strong></div>
    </div>

    <div className="bo-two-col">
      <Section title="Flights" emptyText="No flights attached to this trip.">
        {flights.map(item => <div className="bo-list" key={item.id}><div><Link to={`/admin/bookings/flights/${encodeURIComponent(item.confirmation_code)}`}><strong>{item.confirmation_code}</strong></Link><div>{item.status} · {money(item.total_amount, item.currency)}</div></div></div>)}
      </Section>
      <Section title="Hotels" emptyText="No hotels attached to this trip.">
        {hotels.map(item => <div className="bo-list" key={item.id}><div><Link to={`/admin/bookings/hotels/${encodeURIComponent(item.id)}`}><strong>{item.property_name || item.hotel_code}</strong></Link><div>{item.status} · {item.check_in || '—'} to {item.check_out || '—'} · {money(item.total, item.currency)}</div></div></div>)}
      </Section>
    </div>

    <Section title="Car rentals" emptyText="No car rentals attached to this trip.">
      {cars.map(item => <div className="bo-list" key={item.id}><div><Link to={`/admin/bookings/cars/${encodeURIComponent(item.booking_reference || item.id)}`}><strong>{item.booking_reference || 'Car reservation'}</strong></Link><div>{item.rental_company_name || 'Rental company'} · {item.vehicle_name || 'Vehicle'} · {item.status || item.reservation_status}</div><div className="bo-muted">{item.pickup_location || 'Pickup not set'} ({when(item.pickup_at)}) → {item.dropoff_location || 'Drop-off not set'} ({when(item.dropoff_at)}) · {money(item.total_amount, item.currency)}</div></div></div>)}
    </Section>
  </>;
}
