import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { boPost } from './backofficeApi';

const EMPTY = {
  customerName: '', customerEmail: '', customerPhone: '',
  destination: '', propertyName: '', supplierName: '',
  checkIn: '', checkOut: '', rooms: 1, adults: 1, children: 0,
  roomType: '', supplierConfirmationNumber: '', rate: '', taxesFees: '', total: '',
  currency: 'USD', paymentStatus: 'PENDING', status: 'REQUESTED',
  cancellationPolicy: '', cancellationDeadline: '', notes: ''
};

function validEmail(value) {
  return !value || /^\S+@\S+\.\S+$/.test(String(value).trim());
}

function validStay(checkIn, checkOut) {
  if (!checkIn || !checkOut) return false;
  const start = new Date(`${checkIn}T00:00:00Z`);
  const end = new Date(`${checkOut}T00:00:00Z`);
  return !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start;
}

function Field({ label, children, wide = false }) {
  return <label className={`carws-field ${wide ? 'wide' : ''}`}><span>{label}</span>{children}</label>;
}

export default function HotelBookingCreatePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  const calculatedTotal = useMemo(() => {
    const rate = Number(form.rate || 0);
    const fees = Number(form.taxesFees || 0);
    return Number.isFinite(rate + fees) ? Math.round((rate + fees) * 100) / 100 : 0;
  }, [form.rate, form.taxesFees]);

  const submit = async event => {
    event.preventDefault();
    setError('');
    if (!form.destination.trim() || !form.propertyName.trim() || !form.checkIn || !form.checkOut) {
      setError('Destination, property, check-in and check-out are required.');
      return;
    }
    if (!validStay(form.checkIn, form.checkOut)) {
      setError('Check-out must be after check-in.');
      return;
    }
    if (!validEmail(form.customerEmail)) {
      setError('Enter a valid customer email.');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        ...form,
        customerName: form.customerName.trim(),
        customerEmail: form.customerEmail.trim().toLowerCase(),
        customerPhone: form.customerPhone.trim(),
        destination: form.destination.trim(),
        propertyName: form.propertyName.trim(),
        supplierName: form.supplierName.trim(),
        rooms: Number(form.rooms || 1),
        adults: Number(form.adults || 1),
        children: Number(form.children || 0),
        rate: form.rate === '' ? 0 : Number(form.rate),
        taxesFees: form.taxesFees === '' ? 0 : Number(form.taxesFees),
        total: form.total === '' ? calculatedTotal : Number(form.total)
      };
      const created = await boPost('/bookings/hotels', payload);
      if (!created?.id) throw new Error('Hotel booking was created without an ID.');
      navigate(`/admin/bookings/hotels/${encodeURIComponent(created.id)}`, { replace: true });
    } catch (requestError) {
      setError(requestError.message || 'Unable to create hotel booking.');
      setBusy(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return <div className="carws">
    <div className="carws-header">
      <div><Link to="/admin/bookings?type=hotel" className="carws-back">← Hotels</Link><div className="carws-title-row"><h1>New Hotel Booking</h1><span className="carws-badge pending">NOT SAVED</span></div><p>Create a customer-linked hotel reservation with validated stay dates.</p></div>
    </div>
    {error && <div className="carws-message error" role="alert">{error}</div>}
    <form onSubmit={submit}>
      <section className="carws-card">
        <div className="carws-section-head"><div><h2>Customer</h2><p>Contact details are used by Customers, My Bookings and service-parity reporting.</p></div></div>
        <div className="carws-form-grid">
          <Field label="Full name"><input autoComplete="name" value={form.customerName} onChange={event => set('customerName', event.target.value)} /></Field>
          <Field label="Email"><input type="email" autoComplete="email" value={form.customerEmail} onChange={event => set('customerEmail', event.target.value)} /></Field>
          <Field label="Phone"><input autoComplete="tel" value={form.customerPhone} onChange={event => set('customerPhone', event.target.value)} /></Field>
        </div>
      </section>

      <section className="carws-card">
        <div className="carws-section-head"><div><h2>Stay details</h2><p>Property, dates, occupancy and supplier confirmation.</p></div></div>
        <div className="carws-form-grid">
          <Field label="Destination"><input required value={form.destination} onChange={event => set('destination', event.target.value)} /></Field>
          <Field label="Property name"><input required value={form.propertyName} onChange={event => set('propertyName', event.target.value)} /></Field>
          <Field label="Supplier"><input value={form.supplierName} onChange={event => set('supplierName', event.target.value)} /></Field>
          <Field label="Room type"><input value={form.roomType} onChange={event => set('roomType', event.target.value)} /></Field>
          <Field label="Check-in"><input required type="date" value={form.checkIn} onChange={event => set('checkIn', event.target.value)} /></Field>
          <Field label="Check-out"><input required type="date" min={form.checkIn || undefined} value={form.checkOut} onChange={event => set('checkOut', event.target.value)} /></Field>
          <Field label="Rooms"><input type="number" min="1" value={form.rooms} onChange={event => set('rooms', event.target.value)} /></Field>
          <Field label="Adults"><input type="number" min="1" value={form.adults} onChange={event => set('adults', event.target.value)} /></Field>
          <Field label="Children"><input type="number" min="0" value={form.children} onChange={event => set('children', event.target.value)} /></Field>
          <Field label="Supplier confirmation"><input value={form.supplierConfirmationNumber} onChange={event => set('supplierConfirmationNumber', event.target.value)} /></Field>
        </div>
      </section>

      <section className="carws-card">
        <div className="carws-section-head"><div><h2>Pricing & policies</h2><p>Amounts stay explicit and service-neutral in the canonical payments view.</p></div></div>
        <div className="carws-form-grid">
          <Field label="Base rate"><input type="number" min="0" step="0.01" value={form.rate} onChange={event => set('rate', event.target.value)} /></Field>
          <Field label="Taxes & fees"><input type="number" min="0" step="0.01" value={form.taxesFees} onChange={event => set('taxesFees', event.target.value)} /></Field>
          <Field label={`Customer total${form.total === '' ? ` (calculated ${calculatedTotal.toFixed(2)})` : ''}`}><input type="number" min="0" step="0.01" value={form.total} onChange={event => set('total', event.target.value)} /></Field>
          <Field label="Currency"><select value={form.currency} onChange={event => set('currency', event.target.value)}><option>USD</option><option>CAD</option><option>EUR</option><option>GBP</option></select></Field>
          <Field label="Payment status"><select value={form.paymentStatus} onChange={event => set('paymentStatus', event.target.value)}><option>PENDING</option><option>PAID</option><option>FAILED</option><option>REFUNDED</option></select></Field>
          <Field label="Booking status"><select value={form.status} onChange={event => set('status', event.target.value)}><option>REQUESTED</option><option>CONFIRMED</option><option>CANCELLED</option><option>COMPLETED</option></select></Field>
          <Field label="Cancellation deadline"><input type="date" value={form.cancellationDeadline} onChange={event => set('cancellationDeadline', event.target.value)} /></Field>
          <Field label="Cancellation policy" wide><textarea value={form.cancellationPolicy} onChange={event => set('cancellationPolicy', event.target.value)} /></Field>
          <Field label="Internal notes" wide><textarea value={form.notes} onChange={event => set('notes', event.target.value)} /></Field>
        </div>
      </section>

      <div className="carws-sticky-actions"><Link className="bo-button secondary" to="/admin/bookings?type=hotel">Cancel</Link><button className="bo-button" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create Hotel Booking'}</button></div>
    </form>
  </div>;
}
