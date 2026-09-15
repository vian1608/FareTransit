import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { boGet, boPatch, boPost } from './backofficeApi';
import {
  BillingAddressAutocomplete,
  CardBrandSelect,
  HalfHourDateTimeInput,
  isCompleteHalfHourLocalDateTime,
  normalizeCardBrand,
  normalizeHalfHourLocalDateTime,
  toIsoOrNull
} from './CarReservationFormControls';
import './CarReservationWorkspace.css';

const money = (value, currency = 'USD') => {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(Number(value || 0)); }
  catch { return `$${Number(value || 0).toFixed(2)}`; }
};
const localDateTime = value => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const label = value => String(value || 'NONE').replaceAll('_', ' ');
const fingerprint = (form, transactions, customSections, snapshots) => JSON.stringify({ form, transactions, customSections, snapshots });

function Badge({ value }) {
  const status = String(value || 'NONE').toUpperCase();
  const positive = ['BOOKED','AUTHORIZED','SENT','READY_TO_BOOK'].some(x => status.includes(x));
  const negative = ['DECLINED','CANCELLED','FAILED'].some(x => status.includes(x));
  return <span className={`carws-badge ${positive ? 'ok' : negative ? 'bad' : 'pending'}`}>{label(status)}</span>;
}

function Field({ label: title, children, wide = false }) {
  return <label className={`carws-field ${wide ? 'wide' : ''}`}><span>{title}</span>{children}</label>;
}

function Section({ title, subtitle, children, className = '' }) {
  return <section className={`carws-card ${className}`}><div className="carws-section-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div></div>{children}</section>;
}

function blankTransaction(company = '') {
  return { amount: '', merchantName: company, merchantLogoUrl: '', collectionMethod: 'PAY_AT_COUNTER', description: 'Rental Booking Amount' };
}

function validateTimes(form) {
  if (form.pickupAt && !isCompleteHalfHourLocalDateTime(form.pickupAt)) return 'Select a complete pickup date and a time ending in :00 or :30.';
  if (form.dropoffAt && !isCompleteHalfHourLocalDateTime(form.dropoffAt)) return 'Select a complete drop-off date and a time ending in :00 or :30.';
  return '';
}

export function NewCarReservationPage() {
  return <div className="carws-loading">
    <h2>Create a car reservation</h2>
    <p>A booking number is created only after you explicitly save the local draft.</p>
    <Link className="bo-button" to="/admin/bookings/new/car">Open New Car Reservation</Link>
  </div>;
}

export default function CarReservationWorkspace() {
  const { id } = useParams();
  const location = useLocation();
  const baselineRef = useRef('');
  const [bundle, setBundle] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [tab, setTab] = useState('overview');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState(location.state?.savedMessage ? { type: 'success', text: location.state.savedMessage } : null);
  const [form, setForm] = useState({});
  const [transactions, setTransactions] = useState([]);
  const [customSections, setCustomSections] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [sameDropoff, setSameDropoff] = useState(false);

  const reference = bundle?.reservation?.booking_reference || id;
  const reservation = bundle?.reservation || {};
  const authorization = bundle?.latestAuthorization || null;

  const hydrate = data => {
    setBundle(data);
    const r = data?.reservation || {};
    const c = data?.car || {};
    const t = data?.travellers?.[0] || {};
    const b = data?.billing || {};
    const a = data?.latestAuthorization || {};
    const fin = data?.internalFinancials || {};
    const nextForm = {
      rentalCompanyId: c.rental_company_id || '',
      rentalCompanyName: c.rental_company_name || '',
      rentalCompanyLogoUrl: c.rental_company_logo_url || '',
      vehicleName: c.vehicle_name || '',
      vehicleCategory: c.vehicle_category || '',
      pickupLocation: c.pickup_location || '',
      pickupAddress: c.pickup_address || c.pickup_location || '',
      pickupAt: normalizeHalfHourLocalDateTime(localDateTime(c.pickup_at)),
      dropoffLocation: c.dropoff_location || '',
      dropoffAddress: c.dropoff_address || c.dropoff_location || '',
      dropoffAt: normalizeHalfHourLocalDateTime(localDateTime(c.dropoff_at)),
      driverAge: c.driver_age || '',
      supplierConfirmation: c.supplier_confirmation || '',
      supplierNotes: c.supplier_notes || '',
      mileagePolicy: c.mileage_policy || '',
      fuelPolicy: c.fuel_policy || '',
      depositTerms: c.deposit_terms || '',
      cancellationPolicy: c.cancellation_policy || '',
      customerName: t.full_name || r.customer_name || '',
      dateOfBirth: t.date_of_birth || '',
      customerEmail: t.email || r.customer_email || '',
      customerPhone: t.phone || r.customer_phone || '',
      cardholderName: b.cardholder_name || '',
      cardBrand: normalizeCardBrand(b.card_brand || ''),
      cardLast4: b.card_last4 || '',
      addressLine1: b.address_line_1 || '',
      addressLine2: b.address_line_2 || '',
      city: b.city || '',
      stateProvince: b.state_province || '',
      postalCode: b.postal_code || '',
      country: b.country || 'United States',
      totalAmount: a.total_amount ?? r.total_amount ?? '',
      currency: a.currency || r.currency || 'USD',
      supplierCost: fin.supplier_cost ?? '',
      sellingPrice: fin.selling_price ?? r.total_amount ?? '',
      terms: a.terms_snapshot?.text || c.draft_terms || '',
      internalNotes: c.internal_notes || fin.admin_notes || ''
    };
    const txSource = a.transactions?.length
      ? a.transactions.map(x => ({ amount: x.amount, merchantName: x.merchant_name || '', merchantLogoUrl: x.merchant_logo_url || '', collectionMethod: x.collection_method || 'PAY_NOW', description: x.description || '' }))
      : (c.draft_payment_data?.transactions || []);
    const nextTransactions = txSource.length ? txSource : [blankTransaction(c.rental_company_name || ''), { amount: '', merchantName: 'FareTransit LLC', merchantLogoUrl: '', collectionMethod: 'PAY_NOW', description: 'Booking Amount' }];
    const nextCustomSections = a.custom_sections?.length ? a.custom_sections : (c.draft_custom_sections || []);
    const nextSnapshots = (data?.snapshots || []).map(x => ({ imageUrl: x.image_url, storagePath: x.storage_path, caption: x.caption || '' }));
    setForm(nextForm);
    setTransactions(nextTransactions);
    setCustomSections(nextCustomSections);
    setSnapshots(nextSnapshots);
    setSameDropoff(Boolean(nextForm.pickupLocation && nextForm.dropoffLocation && nextForm.pickupLocation.trim() === nextForm.dropoffLocation.trim()));
    baselineRef.current = fingerprint(nextForm, nextTransactions, nextCustomSections, nextSnapshots);
  };

  const load = async () => {
    const data = await boGet(`/bookings/cars/${encodeURIComponent(id)}`);
    hydrate(data);
  };

  useEffect(() => {
    let mounted = true;
    Promise.all([boGet(`/bookings/cars/${encodeURIComponent(id)}`), boGet('/bookings/cars/companies').catch(() => [])])
      .then(([data, companyRows]) => { if (mounted) { hydrate(data); setCompanies(Array.isArray(companyRows) ? companyRows : []); } })
      .catch(error => { if (mounted) setMessage({ type: 'error', text: error.message }); });
    return () => { mounted = false; };
  }, [id]);

  const currentFingerprint = useMemo(() => fingerprint(form, transactions, customSections, snapshots), [form, transactions, customSections, snapshots]);
  const isDirty = Boolean(bundle && baselineRef.current && currentFingerprint !== baselineRef.current);

  useEffect(() => {
    const warn = event => {
      if (!isDirty || busy) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty, busy]);

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const setPickupLocation = value => {
    setForm(prev => ({
      ...prev,
      pickupLocation: value,
      pickupAddress: value,
      ...(sameDropoff ? { dropoffLocation: value, dropoffAddress: value } : {})
    }));
  };

  const setDropoffLocation = value => setForm(prev => ({ ...prev, dropoffLocation: value, dropoffAddress: value }));

  const toggleSameDropoff = checked => {
    setSameDropoff(checked);
    if (checked) {
      setForm(prev => ({ ...prev, dropoffLocation: prev.pickupLocation, dropoffAddress: prev.pickupAddress || prev.pickupLocation }));
    }
  };

  const applyBillingAddress = suggestion => {
    setForm(prev => ({
      ...prev,
      addressLine1: suggestion.addressLine1 || prev.addressLine1,
      addressLine2: suggestion.addressLine2 || '',
      city: suggestion.city || prev.city,
      stateProvince: suggestion.state || prev.stateProvince,
      postalCode: suggestion.postalCode || prev.postalCode,
      country: suggestion.country || prev.country
    }));
  };

  const payload = useMemo(() => ({
    customer: { fullName: form.customerName, dateOfBirth: form.dateOfBirth, email: form.customerEmail, phone: form.customerPhone },
    billing: {
      cardholderName: form.cardholderName, cardBrand: normalizeCardBrand(form.cardBrand), cardLast4: form.cardLast4,
      addressLine1: form.addressLine1, addressLine2: form.addressLine2, city: form.city,
      stateProvince: form.stateProvince, postalCode: form.postalCode, country: form.country,
      email: form.customerEmail, phone: form.customerPhone
    },
    car: {
      rentalCompanyId: form.rentalCompanyId || null, rentalCompanyName: form.rentalCompanyName,
      rentalCompanyLogoUrl: form.rentalCompanyLogoUrl, vehicleName: form.vehicleName,
      vehicleCategory: form.vehicleCategory, pickupLocation: form.pickupLocation,
      pickupAddress: form.pickupAddress || form.pickupLocation, pickupAt: toIsoOrNull(form.pickupAt), dropoffLocation: form.dropoffLocation,
      dropoffAddress: form.dropoffAddress || form.dropoffLocation, dropoffAt: toIsoOrNull(form.dropoffAt), driverAge: form.driverAge ? Number(form.driverAge) : null,
      supplierConfirmation: form.supplierConfirmation, supplierNotes: form.supplierNotes,
      mileagePolicy: form.mileagePolicy, fuelPolicy: form.fuelPolicy, depositTerms: form.depositTerms,
      cancellationPolicy: form.cancellationPolicy
    },
    payment: { totalAmount: form.totalAmount, currency: form.currency || 'USD', transactions },
    terms: form.terms,
    customSections,
    snapshots,
    internalFinancials: { supplierCost: form.supplierCost, sellingPrice: form.sellingPrice, adminNotes: form.internalNotes },
    internalNotes: form.internalNotes
  }), [form, transactions, customSections, snapshots]);

  const run = async (name, action, success) => {
    setBusy(name); setMessage(null);
    try { const result = await action(); if (success) setMessage({ type: 'success', text: success }); return result; }
    catch (error) { setMessage({ type: 'error', text: error.message }); throw error; }
    finally { setBusy(''); }
  };

  const save = async (announce = true) => {
    const validationError = validateTimes(form);
    if (validationError) {
      setMessage({ type: 'error', text: validationError });
      return null;
    }
    try {
      const data = await run('save', () => boPatch(`/bookings/cars/${encodeURIComponent(reference)}`, payload), '');
      hydrate(data);
      if (announce) {
        setMessage({ type: 'success', text: 'Booking details saved successfully.' });
        requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
      }
      return data;
    } catch {
      return null;
    }
  };

  const draft = async () => {
    const saved = await save(false);
    if (!saved) return;
    try {
      await run('draft', () => boPost(`/bookings/cars/${encodeURIComponent(reference)}/authorization/draft`, { payment: payload.payment, terms: form.terms, customSections }), 'Authorization draft saved.');
      await load(); setTab('authorization');
    } catch {}
  };

  const sendAuthorization = async () => {
    if (!window.confirm(`Send this authorization to ${form.customerEmail || 'the customer'} from support@faretransit.com?`)) return;
    try {
      await run('send', () => boPost(`/bookings/cars/${encodeURIComponent(reference)}/authorization/send`, {}), 'Authorization sent successfully.');
      await load(); setTab('authorization');
    } catch {}
  };

  const createRevision = async () => {
    try {
      await run('revision', () => boPost(`/bookings/cars/${encodeURIComponent(reference)}/authorization/revision`, {}), 'A new editable authorization revision was created.');
      await load(); setTab('authorization');
    } catch {}
  };

  const markBooked = async () => {
    const confirmation = window.prompt('Enter the rental-company confirmation number:', form.supplierConfirmation || '');
    if (!confirmation) return;
    try {
      await run('booked', () => boPost(`/bookings/cars/${encodeURIComponent(reference)}/booked`, { supplierConfirmation: confirmation }), 'Reservation marked BOOKED.');
      await load();
    } catch {}
  };

  const preview = () => {
    if (!authorization) return setMessage({ type: 'error', text: 'Generate an authorization draft first.' });
    if (!authorization.authorization_token) return setMessage({ type: 'warning', text: 'A secure customer preview link is created when the authorization is sent. You can review the exact draft in the Authorization tab before sending.' });
    window.open(`/car-authorization.html?token=${encodeURIComponent(authorization.authorization_token)}`, '_blank', 'noopener,noreferrer');
  };

  const uploadSnapshot = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
    try {
      const asset = await run('upload', () => boPost('/bookings/cars/assets', { dataUrl, filename: file.name, bookingReference: reference, kind: 'snapshot' }), 'Snapshot uploaded. Save the reservation to attach it.');
      setSnapshots(prev => [...prev, asset]);
    } catch {}
    event.target.value = '';
  };

  const chooseCompany = companyId => {
    const company = companies.find(x => x.id === companyId);
    setForm(prev => ({ ...prev, rentalCompanyId: companyId, rentalCompanyName: company?.display_name || prev.rentalCompanyName, rentalCompanyLogoUrl: company?.logo_url || prev.rentalCompanyLogoUrl }));
    if (company) setTransactions(prev => prev.map((tx, index) => index === 0 && !tx.merchantName ? { ...tx, merchantName: company.merchant_descriptor || company.display_name } : tx));
  };

  const guardBack = event => {
    if (!isDirty) return;
    if (!window.confirm('You have unsaved changes. Leave this booking without saving?')) event.preventDefault();
  };

  if (!bundle) return <div className="carws-loading"><h2>Loading car reservation…</h2>{message && <p>{message.text}</p>}</div>;

  const tabs = ['overview','rental','customer','authorization','activity'];
  return <div className="carws">
    <div className="carws-header">
      <div>
        <Link to="/admin/bookings?type=car" className="carws-back" onClick={guardBack}>← Cars</Link>
        <div className="carws-title-row"><h1>{reference}</h1><Badge value={reservation.reservation_status} />{isDirty && <span className="carws-unsaved-indicator">Unsaved changes</span>}</div>
        <p>{form.rentalCompanyName || 'Car rental'}{form.vehicleName ? ` · ${form.vehicleName}` : ''}</p>
      </div>
      <div className="carws-header-actions">
        <button className="bo-button secondary" onClick={() => save()} disabled={!!busy}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
        <button className="bo-button secondary" onClick={preview}>Preview</button>
        <button className="bo-button" onClick={sendAuthorization} disabled={!!busy || !authorization}>Send Authorization</button>
      </div>
    </div>

    {message && <div className={`carws-message ${message.type}`}>{message.text}</div>}

    <div className="carws-summary">
      <div><span>Customer</span><strong>{form.customerName || '—'}</strong><small>{form.customerEmail || 'No email yet'}</small></div>
      <div><span>Total</span><strong>{money(form.totalAmount, form.currency)}</strong><small>{form.currency || 'USD'}</small></div>
      <div><span>Reservation</span><Badge value={reservation.reservation_status} /></div>
      <div><span>Authorization</span><Badge value={reservation.authorization_status} /><small>{authorization?.version ? `Version ${authorization.version}` : 'No version yet'}</small></div>
    </div>

    <nav className="carws-tabs" aria-label="Car reservation sections">
      {tabs.map(item => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item === 'customer' ? 'Customer & Billing' : item.charAt(0).toUpperCase() + item.slice(1)}</button>)}
    </nav>

    {tab === 'overview' && <>
      <Section title="Reservation overview" subtitle="The operational snapshot for this rental.">
        <div className="carws-overview-grid">
          <div><span>Rental company</span><strong>{form.rentalCompanyName || '—'}</strong></div>
          <div><span>Vehicle</span><strong>{form.vehicleName || form.vehicleCategory || '—'}</strong></div>
          <div><span>Pickup</span><strong>{form.pickupLocation || '—'}</strong><small>{form.pickupAt ? new Date(form.pickupAt).toLocaleString() : '—'}</small></div>
          <div><span>Drop-off</span><strong>{form.dropoffLocation || '—'}</strong><small>{form.dropoffAt ? new Date(form.dropoffAt).toLocaleString() : '—'}</small></div>
        </div>
      </Section>
      <Section title="Workflow" subtitle="Reservation and customer authorization move independently.">
        <div className="carws-lifecycle"><span>DRAFT</span><b>→</b><span>AUTH PENDING</span><b>→</b><span>READY TO BOOK</span><b>→</b><span>BOOKING IN PROGRESS</span><b>→</b><span>BOOKED</span></div>
        <div className="carws-lifecycle secondary"><span>NONE</span><b>→</b><span>DRAFT</span><b>→</b><span>SENT</span><b>→</b><span>VIEWED</span><b>→</b><span>AUTHORIZED</span></div>
      </Section>
      <div className="carws-action-strip"><button className="bo-button" onClick={draft} disabled={!!busy}>{busy === 'draft' ? 'Saving…' : 'Generate / Save Authorization Draft'}</button><button className="bo-button secondary" onClick={markBooked} disabled={!!busy}>Mark Booked</button></div>
    </>}

    {tab === 'rental' && <Section title="Rental details" subtitle="Supplier, vehicle, pickup/drop-off and rental policies.">
      <div className="carws-form-grid">
        <Field label="Rental company"><select value={form.rentalCompanyId} onChange={e => chooseCompany(e.target.value)}><option value="">Custom / select company</option>{companies.map(company => <option key={company.id} value={company.id}>{company.display_name}</option>)}</select></Field>
        <Field label="Company name"><input value={form.rentalCompanyName} onChange={e => set('rentalCompanyName', e.target.value)} /></Field>
        <Field label="Company logo URL"><input value={form.rentalCompanyLogoUrl} onChange={e => set('rentalCompanyLogoUrl', e.target.value)} /></Field>
        <Field label="Vehicle"><input value={form.vehicleName} onChange={e => set('vehicleName', e.target.value)} placeholder="Toyota Corolla or Similar" /></Field>
        <Field label="Vehicle category"><input value={form.vehicleCategory} onChange={e => set('vehicleCategory', e.target.value)} /></Field>
        <Field label="Driver age"><input type="number" min="18" max="99" value={form.driverAge} onChange={e => set('driverAge', e.target.value)} /></Field>
        <Field label="Pickup location"><input value={form.pickupLocation} onChange={e => setPickupLocation(e.target.value)} /></Field>
        <Field label="Pickup date / time"><HalfHourDateTimeInput idPrefix="pickup" value={form.pickupAt} onChange={value => set('pickupAt', value)} /></Field>
        <label className="carws-same-location"><input type="checkbox" checked={sameDropoff} onChange={e => toggleSameDropoff(e.target.checked)} />Drop-off location is the same as pickup</label>
        <Field label="Drop-off location"><input value={form.dropoffLocation} disabled={sameDropoff} onChange={e => setDropoffLocation(e.target.value)} /></Field>
        <Field label="Drop-off date / time"><HalfHourDateTimeInput idPrefix="dropoff" value={form.dropoffAt} onChange={value => set('dropoffAt', value)} /></Field>
        <Field label="Mileage policy"><input value={form.mileagePolicy} onChange={e => set('mileagePolicy', e.target.value)} /></Field>
        <Field label="Fuel policy"><input value={form.fuelPolicy} onChange={e => set('fuelPolicy', e.target.value)} /></Field>
        <Field label="Supplier confirmation"><input value={form.supplierConfirmation} onChange={e => set('supplierConfirmation', e.target.value)} /></Field>
        <Field label="Deposit terms" wide><textarea value={form.depositTerms} onChange={e => set('depositTerms', e.target.value)} /></Field>
        <Field label="Cancellation policy" wide><textarea value={form.cancellationPolicy} onChange={e => set('cancellationPolicy', e.target.value)} /></Field>
        <Field label="Supplier notes" wide><textarea value={form.supplierNotes} onChange={e => set('supplierNotes', e.target.value)} /></Field>
      </div>
      <div className="carws-action-strip"><button className="bo-button" onClick={() => save()} disabled={!!busy}>{busy === 'save' ? 'Saving…' : 'Save Rental Details'}</button></div>
    </Section>}

    {tab === 'customer' && <div className="carws-two-col">
      <Section title="Renter / Driver">
        <div className="carws-form-grid one">
          <Field label="Full name"><input autoComplete="name" value={form.customerName} onChange={e => set('customerName', e.target.value)} /></Field>
          <Field label="Date of birth"><input type="date" value={form.dateOfBirth} onChange={e => set('dateOfBirth', e.target.value)} /></Field>
          <Field label="Email — authorization is sent here"><input type="email" autoComplete="email" value={form.customerEmail} onChange={e => set('customerEmail', e.target.value)} /></Field>
          <Field label="Phone"><input autoComplete="tel" value={form.customerPhone} onChange={e => set('customerPhone', e.target.value)} /></Field>
        </div>
      </Section>
      <Section title="Billing" subtitle="Only masked card details are stored here.">
        <div className="carws-form-grid one">
          <Field label="Cardholder"><input autoComplete="cc-name" value={form.cardholderName} onChange={e => set('cardholderName', e.target.value)} /></Field>
          <div className="carws-split"><Field label="Card brand"><CardBrandSelect value={form.cardBrand} onChange={value => set('cardBrand', value)} /></Field><Field label="Last 4"><input maxLength="4" inputMode="numeric" autoComplete="cc-number" value={form.cardLast4} onChange={e => set('cardLast4', e.target.value.replace(/\D/g, '').slice(0,4))} /></Field></div>
          <Field label="Address line 1"><BillingAddressAutocomplete value={form.addressLine1} onChange={value => set('addressLine1', value)} onSelect={applyBillingAddress} /></Field>
          <Field label="Address line 2"><input autoComplete="billing address-line2" value={form.addressLine2} onChange={e => set('addressLine2', e.target.value)} /></Field>
          <div className="carws-split three"><Field label="City"><input autoComplete="billing address-level2" value={form.city} onChange={e => set('city', e.target.value)} /></Field><Field label="State"><input autoComplete="billing address-level1" value={form.stateProvince} onChange={e => set('stateProvince', e.target.value)} /></Field><Field label="ZIP"><input autoComplete="billing postal-code" value={form.postalCode} onChange={e => set('postalCode', e.target.value)} /></Field></div>
          <Field label="Country"><input autoComplete="billing country-name" value={form.country} onChange={e => set('country', e.target.value)} /></Field>
        </div>
      </Section>
      <div className="carws-action-strip full"><button className="bo-button" onClick={() => save()} disabled={!!busy}>{busy === 'save' ? 'Saving…' : 'Save Customer & Billing'}</button></div>
    </div>}

    {tab === 'authorization' && <>
      <Section title="Payment authorization" subtitle="Customer-facing authorization contains the total, merchant splits, collection method, rental details and terms.">
        <div className="carws-auth-top">
          <Field label="Total amount authorized"><input type="number" step="0.01" value={form.totalAmount} onChange={e => set('totalAmount', e.target.value)} /></Field>
          <Field label="Currency"><select value={form.currency} onChange={e => set('currency', e.target.value)}><option>USD</option><option>CAD</option><option>EUR</option><option>GBP</option></select></Field>
          <div><span className="carws-mini-label">Current authorization</span><div><Badge value={authorization?.status || reservation.authorization_status} />{authorization?.version && <small className="carws-version">v{authorization.version}</small>}</div></div>
        </div>
        <h3 className="carws-subtitle">Transactions</h3>
        <div className="carws-transactions">{transactions.map((tx, index) => <div className="carws-transaction" key={index}><div className="carws-transaction-head"><strong>Transaction {index + 1}</strong><button type="button" onClick={() => setTransactions(prev => prev.filter((_, i) => i !== index))}>Remove</button></div><div className="carws-form-grid"><Field label="Amount"><input type="number" step="0.01" value={tx.amount} onChange={e => setTransactions(prev => prev.map((item,i) => i === index ? { ...item, amount: e.target.value } : item))} /></Field><Field label="Merchant name"><input value={tx.merchantName || ''} onChange={e => setTransactions(prev => prev.map((item,i) => i === index ? { ...item, merchantName: e.target.value } : item))} /></Field><Field label="Collection"><select value={tx.collectionMethod || 'PAY_NOW'} onChange={e => setTransactions(prev => prev.map((item,i) => i === index ? { ...item, collectionMethod: e.target.value } : item))}><option value="PAY_NOW">Pay Now</option><option value="PAY_AT_COUNTER">Pay at Counter</option></select></Field><Field label="Description"><input value={tx.description || ''} onChange={e => setTransactions(prev => prev.map((item,i) => i === index ? { ...item, description: e.target.value } : item))} /></Field></div></div>)}</div>
        <button className="bo-button secondary" type="button" onClick={() => setTransactions(prev => [...prev, blankTransaction()])}>+ Add Transaction</button>
        <div className="carws-note">Internal supplier cost and margin are never shown in the customer-facing authorization.</div>
      </Section>

      <Section title="Terms & Conditions"><textarea className="carws-terms" value={form.terms} onChange={e => set('terms', e.target.value)} /></Section>

      <Section title="Custom sections" subtitle="Optional content can be included in the customer authorization or kept admin-only.">
        {customSections.map((section,index) => <div className="carws-custom" key={index}><Field label="Title"><input value={section.title || ''} onChange={e => setCustomSections(prev => prev.map((x,i) => i === index ? { ...x, title: e.target.value } : x))} /></Field><Field label="Content" wide><textarea value={section.content || ''} onChange={e => setCustomSections(prev => prev.map((x,i) => i === index ? { ...x, content: e.target.value } : x))} /></Field><Field label="Visibility"><select value={section.visibility || 'CUSTOMER_VISIBLE'} onChange={e => setCustomSections(prev => prev.map((x,i) => i === index ? { ...x, visibility: e.target.value } : x))}><option value="CUSTOMER_VISIBLE">Customer Visible</option><option value="ADMIN_ONLY">Admin Only</option></select></Field><button className="carws-remove" type="button" onClick={() => setCustomSections(prev => prev.filter((_,i) => i !== index))}>Remove section</button></div>)}
        <button className="bo-button secondary" type="button" onClick={() => setCustomSections(prev => [...prev, { title: '', content: '', visibility: 'CUSTOMER_VISIBLE' }])}>+ Add Custom Section</button>
      </Section>

      <Section title="Vehicle snapshots" subtitle="Optional images can be attached to the authorization evidence.">
        <label className="carws-upload">+ Upload Snapshot<input type="file" accept="image/*" onChange={uploadSnapshot} /></label>
        <div className="carws-snapshots">{snapshots.map((snap,index) => <div className="carws-snapshot" key={`${snap.imageUrl}-${index}`}><img src={snap.imageUrl} alt={snap.caption || `Vehicle snapshot ${index + 1}`} /><input value={snap.caption || ''} placeholder="Caption" onChange={e => setSnapshots(prev => prev.map((x,i) => i === index ? { ...x, caption: e.target.value } : x))} /><button type="button" onClick={() => setSnapshots(prev => prev.filter((_,i) => i !== index))}>Remove</button></div>)}</div>
      </Section>

      <Section title="Internal financials" subtitle="Admin-only. Never exposed to the customer.">
        <div className="carws-form-grid"><Field label="Supplier / corporate cost"><input type="number" step="0.01" value={form.supplierCost} onChange={e => set('supplierCost', e.target.value)} /></Field><Field label="Selling price"><input type="number" step="0.01" value={form.sellingPrice} onChange={e => set('sellingPrice', e.target.value)} /></Field><Field label="Internal notes" wide><textarea value={form.internalNotes} onChange={e => set('internalNotes', e.target.value)} /></Field></div>
      </Section>

      <div className="carws-sticky-actions"><button className="bo-button secondary" onClick={() => save()} disabled={!!busy}>{busy === 'save' ? 'Saving…' : 'Save Reservation'}</button><button className="bo-button" onClick={draft} disabled={!!busy}>Generate / Save Draft</button><button className="bo-button secondary" onClick={preview}>Preview Customer View</button><button className="bo-button" onClick={sendAuthorization} disabled={!!busy || !authorization}>Send Authorization</button><button className="bo-button secondary" onClick={createRevision} disabled={!!busy || !authorization}>Create Revision</button><button className="bo-button secondary" onClick={markBooked} disabled={!!busy}>Mark Booked</button></div>
    </>}

    {tab === 'activity' && <>
      <Section title="Authorization history">
        <div className="carws-history">{(bundle.authorizations || []).map(item => <div key={item.id}><strong>v{item.version}</strong><Badge value={item.status} /><span>{item.sent_at ? `Sent ${new Date(item.sent_at).toLocaleString()}` : 'Not sent'}</span><span>{item.authorized_at ? `Authorized ${new Date(item.authorized_at).toLocaleString()}` : ''}</span></div>)}{!(bundle.authorizations || []).length && <p className="bo-muted">No authorization versions yet.</p>}</div>
      </Section>
      <Section title="Reservation activity">
        <div className="carws-activity">{(bundle.activity || []).map(item => <div key={item.id}><span className="carws-dot"></span><div><strong>{label(item.action)}</strong><small>{item.created_at ? new Date(item.created_at).toLocaleString() : ''}{item.actor_id ? ` · ${item.actor_id}` : ''}</small></div></div>)}{!(bundle.activity || []).length && <p className="bo-muted">No activity recorded yet.</p>}</div>
      </Section>
    </>}
  </div>;
}
