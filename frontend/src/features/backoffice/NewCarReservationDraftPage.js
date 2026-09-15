import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { boGet, boPost } from './backofficeApi';
import {
  BillingAddressAutocomplete,
  CardBrandSelect,
  HalfHourDateTimeInput,
  isCompleteHalfHourLocalDateTime,
  normalizeCardBrand,
  toIsoOrNull
} from './CarReservationFormControls';
import './CarReservationWorkspace.css';

const STORAGE_KEY = 'faretransit_car_draft_v1';

const EMPTY_FORM = {
  rentalCompanyId: '', rentalCompanyName: '', rentalCompanyLogoUrl: '',
  vehicleName: '', vehicleCategory: '', pickupLocation: '', pickupAddress: '', pickupAt: '',
  dropoffLocation: '', dropoffAddress: '', dropoffAt: '', driverAge: '', mileagePolicy: '', fuelPolicy: '',
  depositTerms: '', cancellationPolicy: '', supplierNotes: '', customerName: '', dateOfBirth: '', customerEmail: '',
  customerPhone: '', cardholderName: '', cardBrand: '', cardLast4: '', addressLine1: '', addressLine2: '', city: '',
  stateProvince: '', postalCode: '', country: 'United States', totalAmount: '', currency: 'USD', supplierCost: '',
  sellingPrice: '', terms: '', internalNotes: ''
};

const EMPTY_TRANSACTIONS = [
  { amount: '', merchantName: '', merchantLogoUrl: '', collectionMethod: 'PAY_AT_COUNTER', description: 'Rental Booking Amount' },
  { amount: '', merchantName: 'FareTransit LLC', merchantLogoUrl: '', collectionMethod: 'PAY_NOW', description: 'Booking Amount' }
];

function requestId() {
  const random = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `car:${random}`;
}

function Field({ label, children, wide = false }) {
  return <label className={`carws-field ${wide ? 'wide' : ''}`}><span>{label}</span>{children}</label>;
}

function Section({ title, subtitle, children }) {
  return <section className="carws-card"><div className="carws-section-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div></div>{children}</section>;
}

function meaningful(form, transactions, customSections) {
  const ignored = new Set(['country', 'currency']);
  const hasForm = Object.entries(form || {}).some(([key, value]) => !ignored.has(key) && String(value ?? '').trim() !== '');
  const hasTransactions = (transactions || []).some(tx => String(tx.amount ?? '').trim() !== '' || (tx.merchantName && tx.merchantName !== 'FareTransit LLC' && tx.merchantName.trim() !== ''));
  const hasCustom = (customSections || []).some(section => String(section.title || section.content || '').trim() !== '');
  return hasForm || hasTransactions || hasCustom;
}

function readStoredDraft() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function validateTimes(form) {
  if (form.pickupAt && !isCompleteHalfHourLocalDateTime(form.pickupAt)) return 'Select a complete pickup date and a time ending in :00 or :30.';
  if (form.dropoffAt && !isCompleteHalfHourLocalDateTime(form.dropoffAt)) return 'Select a complete drop-off date and a time ending in :00 or :30.';
  return '';
}

export default function NewCarReservationDraftPage() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [transactions, setTransactions] = useState(EMPTY_TRANSACTIONS);
  const [customSections, setCustomSections] = useState([]);
  const [sameDropoff, setSameDropoff] = useState(false);
  const [clientRequestId, setClientRequestId] = useState(requestId);
  const [recovery, setRecovery] = useState(() => readStoredDraft());
  const [ready, setReady] = useState(() => !readStoredDraft());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    boGet('/bookings/cars/companies').then(rows => setCompanies(Array.isArray(rows) ? rows : [])).catch(() => setCompanies([]));
  }, []);

  const isMeaningful = useMemo(() => meaningful(form, transactions, customSections), [form, transactions, customSections]);

  useEffect(() => {
    if (!ready) return;
    if (!isMeaningful) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const timer = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, clientRequestId, form, transactions, customSections, sameDropoff, savedAt: new Date().toISOString() }));
    }, 250);
    return () => clearTimeout(timer);
  }, [ready, isMeaningful, clientRequestId, form, transactions, customSections, sameDropoff]);

  useEffect(() => {
    const warn = event => {
      if (!ready || !isMeaningful || busy) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [ready, isMeaningful, busy]);

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
    if (checked) setForm(prev => ({ ...prev, dropoffLocation: prev.pickupLocation, dropoffAddress: prev.pickupAddress || prev.pickupLocation }));
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

  const continueDraft = () => {
    const draft = recovery || {};
    const restored = { ...EMPTY_FORM, ...(draft.form || {}) };
    setForm(restored);
    setTransactions(Array.isArray(draft.transactions) && draft.transactions.length ? draft.transactions : EMPTY_TRANSACTIONS);
    setCustomSections(Array.isArray(draft.customSections) ? draft.customSections : []);
    setSameDropoff(typeof draft.sameDropoff === 'boolean' ? draft.sameDropoff : Boolean(restored.pickupLocation && restored.dropoffLocation && restored.pickupLocation === restored.dropoffLocation));
    setClientRequestId(draft.clientRequestId || requestId());
    setRecovery(null);
    setReady(true);
  };

  const discardStoredDraft = () => {
    localStorage.removeItem(STORAGE_KEY);
    setForm(EMPTY_FORM);
    setTransactions(EMPTY_TRANSACTIONS);
    setCustomSections([]);
    setSameDropoff(false);
    setClientRequestId(requestId());
    setRecovery(null);
    setReady(true);
  };

  const chooseCompany = companyId => {
    const company = companies.find(item => item.id === companyId);
    setForm(prev => ({
      ...prev,
      rentalCompanyId: companyId,
      rentalCompanyName: company?.display_name || prev.rentalCompanyName,
      rentalCompanyLogoUrl: company?.logo_url || prev.rentalCompanyLogoUrl
    }));
    if (company) {
      setTransactions(prev => prev.map((tx, index) => index === 0 ? { ...tx, merchantName: tx.merchantName || company.merchant_descriptor || company.display_name } : tx));
    }
  };

  const payload = useMemo(() => ({
    clientRequestId,
    customer: { fullName: form.customerName, dateOfBirth: form.dateOfBirth, email: form.customerEmail, phone: form.customerPhone },
    billing: {
      cardholderName: form.cardholderName, cardBrand: normalizeCardBrand(form.cardBrand), cardLast4: form.cardLast4,
      addressLine1: form.addressLine1, addressLine2: form.addressLine2, city: form.city,
      stateProvince: form.stateProvince, postalCode: form.postalCode, country: form.country,
      email: form.customerEmail, phone: form.customerPhone
    },
    car: {
      rentalCompanyId: form.rentalCompanyId || null, rentalCompanyName: form.rentalCompanyName,
      rentalCompanyLogoUrl: form.rentalCompanyLogoUrl, vehicleName: form.vehicleName, vehicleCategory: form.vehicleCategory,
      pickupLocation: form.pickupLocation, pickupAddress: form.pickupAddress || form.pickupLocation,
      pickupAt: toIsoOrNull(form.pickupAt),
      dropoffLocation: form.dropoffLocation, dropoffAddress: form.dropoffAddress || form.dropoffLocation,
      dropoffAt: toIsoOrNull(form.dropoffAt),
      driverAge: form.driverAge ? Number(form.driverAge) : null, mileagePolicy: form.mileagePolicy,
      fuelPolicy: form.fuelPolicy, depositTerms: form.depositTerms, cancellationPolicy: form.cancellationPolicy,
      supplierNotes: form.supplierNotes
    },
    payment: { totalAmount: form.totalAmount, currency: form.currency || 'USD', transactions },
    terms: form.terms,
    customSections,
    internalFinancials: { supplierCost: form.supplierCost, sellingPrice: form.sellingPrice, adminNotes: form.internalNotes },
    internalNotes: form.internalNotes
  }), [clientRequestId, form, transactions, customSections]);

  const saveDraft = async () => {
    if (busy) return;
    const validationError = validateTimes(form);
    if (validationError) {
      setMessage(validationError);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const bundle = await boPost('/bookings/cars', payload);
      const reference = bundle?.reservation?.booking_reference;
      if (!reference) throw new Error('Reservation was saved without a booking reference.');
      localStorage.removeItem(STORAGE_KEY);
      window.scrollTo({ top: 0, behavior: 'auto' });
      navigate(`/admin/bookings/cars/${encodeURIComponent(reference)}`, { replace: true, state: { savedMessage: 'Booking details saved successfully.' } });
    } catch (error) {
      setMessage(error.message || 'Unable to save the car reservation.');
      setBusy(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const cancel = () => {
    if (isMeaningful && !window.confirm('Discard this unsaved local car reservation draft? No database record has been created.')) return;
    localStorage.removeItem(STORAGE_KEY);
    navigate('/admin/bookings?type=car');
  };

  if (!ready && recovery) {
    return <div className="carws carws-new-draft">
      <section className="carws-card carws-recovery-card">
        <div className="carws-section-head"><div><h2>Unfinished car reservation</h2><p>A local draft was found in this browser. It has not been saved to the FareTransit database and does not have a booking number.</p></div></div>
        <div className="carws-recovery-meta">Last saved locally: {recovery.savedAt ? new Date(recovery.savedAt).toLocaleString() : 'Unknown'}</div>
        <div className="carws-action-strip">
          <button className="bo-button" onClick={continueDraft}>Continue Draft</button>
          <button className="bo-button secondary" onClick={discardStoredDraft}>Discard Draft</button>
          <Link className="bo-button secondary" to="/admin/bookings?type=car">Back to Cars</Link>
        </div>
      </section>
    </div>;
  }

  return <div className="carws carws-new-draft">
    <div className="carws-header">
      <div>
        <button className="carws-back carws-link-button" onClick={cancel}>← Cars</button>
        <div className="carws-title-row"><h1>New Car Reservation</h1><span className="carws-badge pending">NOT SAVED</span></div>
        <p>No booking number or database record exists until you click <strong>Save Draft</strong>.</p>
      </div>
      <div className="carws-header-actions">
        <button className="bo-button secondary" onClick={cancel} disabled={busy}>Cancel</button>
        <button className="bo-button" onClick={saveDraft} disabled={busy}>{busy ? 'Saving…' : 'Save Draft'}</button>
      </div>
    </div>

    {message && <div className="carws-message error">{message}</div>}
    <div className="carws-unsaved-note"><strong>Browser-only draft.</strong> Your changes are recovered locally if you refresh or accidentally close the tab. FareTransit creates the booking ID only after Save Draft succeeds.</div>

    <Section title="Rental details" subtitle="Supplier, vehicle and pickup/drop-off information.">
      <div className="carws-form-grid">
        <Field label="Rental company"><select value={form.rentalCompanyId} onChange={e => chooseCompany(e.target.value)}><option value="">Custom / select company</option>{companies.map(company => <option key={company.id} value={company.id}>{company.display_name}</option>)}</select></Field>
        <Field label="Company name"><input value={form.rentalCompanyName} onChange={e => set('rentalCompanyName', e.target.value)} /></Field>
        <Field label="Company logo URL"><input value={form.rentalCompanyLogoUrl} onChange={e => set('rentalCompanyLogoUrl', e.target.value)} /></Field>
        <Field label="Vehicle"><input value={form.vehicleName} onChange={e => set('vehicleName', e.target.value)} placeholder="Toyota Corolla or Similar" /></Field>
        <Field label="Vehicle category"><input value={form.vehicleCategory} onChange={e => set('vehicleCategory', e.target.value)} /></Field>
        <Field label="Driver age"><input type="number" min="18" max="99" value={form.driverAge} onChange={e => set('driverAge', e.target.value)} /></Field>
        <Field label="Pickup location"><input value={form.pickupLocation} onChange={e => setPickupLocation(e.target.value)} /></Field>
        <Field label="Pickup date / time"><HalfHourDateTimeInput idPrefix="new-pickup" value={form.pickupAt} onChange={value => set('pickupAt', value)} /></Field>
        <label className="carws-same-location"><input type="checkbox" checked={sameDropoff} onChange={e => toggleSameDropoff(e.target.checked)} />Drop-off location is the same as pickup</label>
        <Field label="Drop-off location"><input value={form.dropoffLocation} disabled={sameDropoff} onChange={e => setDropoffLocation(e.target.value)} /></Field>
        <Field label="Drop-off date / time"><HalfHourDateTimeInput idPrefix="new-dropoff" value={form.dropoffAt} onChange={value => set('dropoffAt', value)} /></Field>
        <Field label="Mileage policy"><input value={form.mileagePolicy} onChange={e => set('mileagePolicy', e.target.value)} /></Field>
        <Field label="Fuel policy"><input value={form.fuelPolicy} onChange={e => set('fuelPolicy', e.target.value)} /></Field>
        <Field label="Deposit terms" wide><textarea value={form.depositTerms} onChange={e => set('depositTerms', e.target.value)} /></Field>
        <Field label="Cancellation policy" wide><textarea value={form.cancellationPolicy} onChange={e => set('cancellationPolicy', e.target.value)} /></Field>
        <Field label="Supplier notes" wide><textarea value={form.supplierNotes} onChange={e => set('supplierNotes', e.target.value)} /></Field>
      </div>
    </Section>

    <div className="carws-two-col">
      <Section title="Renter / Driver">
        <div className="carws-form-grid one">
          <Field label="Full name"><input autoComplete="name" value={form.customerName} onChange={e => set('customerName', e.target.value)} /></Field>
          <Field label="Date of birth"><input type="date" value={form.dateOfBirth} onChange={e => set('dateOfBirth', e.target.value)} /></Field>
          <Field label="Email"><input type="email" autoComplete="email" value={form.customerEmail} onChange={e => set('customerEmail', e.target.value)} /></Field>
          <Field label="Phone"><input autoComplete="tel" value={form.customerPhone} onChange={e => set('customerPhone', e.target.value)} /></Field>
        </div>
      </Section>
      <Section title="Billing" subtitle="Only masked card information is stored.">
        <div className="carws-form-grid one">
          <Field label="Cardholder"><input autoComplete="cc-name" value={form.cardholderName} onChange={e => set('cardholderName', e.target.value)} /></Field>
          <div className="carws-split"><Field label="Card brand"><CardBrandSelect value={form.cardBrand} onChange={value => set('cardBrand', value)} /></Field><Field label="Last 4"><input maxLength="4" inputMode="numeric" autoComplete="cc-number" value={form.cardLast4} onChange={e => set('cardLast4', e.target.value.replace(/\D/g, '').slice(0,4))} /></Field></div>
          <Field label="Address line 1"><BillingAddressAutocomplete value={form.addressLine1} onChange={value => set('addressLine1', value)} onSelect={applyBillingAddress} /></Field>
          <Field label="Address line 2"><input autoComplete="billing address-line2" value={form.addressLine2} onChange={e => set('addressLine2', e.target.value)} /></Field>
          <div className="carws-split three"><Field label="City"><input autoComplete="billing address-level2" value={form.city} onChange={e => set('city', e.target.value)} /></Field><Field label="State"><input autoComplete="billing address-level1" value={form.stateProvince} onChange={e => set('stateProvince', e.target.value)} /></Field><Field label="ZIP"><input autoComplete="billing postal-code" value={form.postalCode} onChange={e => set('postalCode', e.target.value)} /></Field></div>
          <Field label="Country"><input autoComplete="billing country-name" value={form.country} onChange={e => set('country', e.target.value)} /></Field>
        </div>
      </Section>
    </div>

    <Section title="Pricing & payment authorization" subtitle="You can prepare amounts now. Authorization is generated only after the reservation is saved.">
      <div className="carws-auth-top">
        <Field label="Customer total"><input type="number" step="0.01" value={form.totalAmount} onChange={e => set('totalAmount', e.target.value)} /></Field>
        <Field label="Currency"><select value={form.currency} onChange={e => set('currency', e.target.value)}><option>USD</option><option>CAD</option><option>EUR</option><option>GBP</option></select></Field>
        <Field label="Supplier / corporate cost"><input type="number" step="0.01" value={form.supplierCost} onChange={e => set('supplierCost', e.target.value)} /></Field>
        <Field label="Selling price"><input type="number" step="0.01" value={form.sellingPrice} onChange={e => set('sellingPrice', e.target.value)} /></Field>
      </div>
      <h3 className="carws-subtitle">Transactions</h3>
      <div className="carws-transactions">{transactions.map((tx, index) => <div className="carws-transaction" key={index}><div className="carws-transaction-head"><strong>Transaction {index + 1}</strong><button type="button" onClick={() => setTransactions(prev => prev.filter((_, i) => i !== index))}>Remove</button></div><div className="carws-form-grid"><Field label="Amount"><input type="number" step="0.01" value={tx.amount} onChange={e => setTransactions(prev => prev.map((item,i) => i === index ? { ...item, amount: e.target.value } : item))} /></Field><Field label="Merchant name"><input value={tx.merchantName || ''} onChange={e => setTransactions(prev => prev.map((item,i) => i === index ? { ...item, merchantName: e.target.value } : item))} /></Field><Field label="Collection"><select value={tx.collectionMethod || 'PAY_NOW'} onChange={e => setTransactions(prev => prev.map((item,i) => i === index ? { ...item, collectionMethod: e.target.value } : item))}><option value="PAY_NOW">Pay Now</option><option value="PAY_AT_COUNTER">Pay at Counter</option></select></Field><Field label="Description"><input value={tx.description || ''} onChange={e => setTransactions(prev => prev.map((item,i) => i === index ? { ...item, description: e.target.value } : item))} /></Field></div></div>)}</div>
      <button className="bo-button secondary" type="button" onClick={() => setTransactions(prev => [...prev, { amount: '', merchantName: '', merchantLogoUrl: '', collectionMethod: 'PAY_NOW', description: '' }])}>+ Add Transaction</button>
      <Field label="Terms & Conditions" wide><textarea className="carws-terms" value={form.terms} onChange={e => set('terms', e.target.value)} placeholder="Leave blank to use FareTransit's default car-rental authorization terms." /></Field>
      <Field label="Internal notes" wide><textarea value={form.internalNotes} onChange={e => set('internalNotes', e.target.value)} /></Field>
    </Section>

    <Section title="Snapshots & authorization" subtitle="These require a persistent booking and stay locked until the first save.">
      <div className="carws-locked-grid"><div><strong>Vehicle snapshots</strong><p>Save Draft first, then upload images to the booking.</p></div><div><strong>Customer authorization</strong><p>Save Draft first, then generate, preview and send the authorization from the booking workspace.</p></div></div>
    </Section>

    <div className="carws-sticky-actions">
      <button className="bo-button secondary" onClick={cancel} disabled={busy}>Cancel</button>
      <button className="bo-button" onClick={saveDraft} disabled={busy}>{busy ? 'Creating reservation…' : 'Save Draft & Create Booking ID'}</button>
    </div>
  </div>;
}
