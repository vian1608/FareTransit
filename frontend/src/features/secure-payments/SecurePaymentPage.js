import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import './SecurePaymentPage.css';

const apiBase = () => (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? (process.env.REACT_APP_API_URL || 'http://localhost:5001/api')
  : '/api';

async function jsonRequest(path, options = {}) {
  const response = await fetch(`${apiBase()}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) throw new Error(body?.error?.message || `Request failed (HTTP ${response.status})`);
  return body.data;
}

function money(value, currency) {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(Number(value || 0)); }
  catch { return `${currency || 'USD'} ${Number(value || 0).toFixed(2)}`; }
}

const BRANDS = ['Visa', 'Mastercard', 'American Express', 'Discover', 'Other'];
const currentYear = new Date().getFullYear();

export default function SecurePaymentPage() {
  const { token } = useParams();
  const [authorization, setAuthorization] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [cardholderName, setCardholderName] = useState('');
  const [cardBrand, setCardBrand] = useState('');
  const [last4, setLast4] = useState('');
  const [expMonth, setExpMonth] = useState('');
  const [expYear, setExpYear] = useState('');
  const [signatureName, setSignatureName] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [billing, setBilling] = useState({ line1: '', line2: '', city: '', region: '', postalCode: '', country: 'US' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await jsonRequest(`/secure-payments/authorizations/${encodeURIComponent(token)}`);
        if (cancelled) return;
        setAuthorization(data.authorization);
        setCardholderName(data.authorization.customerName || '');
        setSignatureName(data.authorization.customerName || '');
        const method = data.authorization.paymentMethod;
        if (method) {
          setCardBrand(method.cardBrand || '');
          setLast4(method.last4 || '');
          setExpMonth(method.expMonth ? String(method.expMonth) : '');
          setExpYear(method.expYear ? String(method.expYear) : '');
          setBilling({
            line1: method.billingAddress?.line1 || '',
            line2: method.billingAddress?.line2 || '',
            city: method.billingAddress?.city || '',
            region: method.billingAddress?.region || '',
            postalCode: method.billingAddress?.postalCode || '',
            country: method.billingAddress?.country || 'US',
          });
        }
        if (['CARD_SUBMITTED', 'AUTHORIZED', 'PARTIALLY_USED', 'COMPLETED'].includes(data.authorization.status) && data.authorization.status !== 'RECOLLECTION_REQUIRED') {
          setSuccess(true);
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const submit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    const month = Number(expMonth);
    const year = Number(expYear);
    if (!accepted || !signatureName.trim() || !cardholderName.trim() || !cardBrand || !/^\d{4}$/.test(last4) || month < 1 || month > 12 || year < currentYear || year > currentYear + 30) {
      setError('Please complete the authorization, cardholder, card brand, last four digits, and valid expiration date.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await jsonRequest(`/secure-payments/authorizations/${encodeURIComponent(token)}/complete`, {
        method: 'POST',
        body: JSON.stringify({
          cardholderName,
          cardBrand,
          last4,
          expMonth: month,
          expYear: year,
          signatureName,
          billingAddress: billing,
        }),
      });
      setSuccess(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const entityType = String(authorization?.context?.entityType || '').toUpperCase();
  const isHotelAuthorization = entityType === 'HOTEL';
  const isCarAuthorization = ['CAR', 'CAR_RENTAL', 'RENTAL_CAR'].includes(entityType);
  const pageClassName = `secure-payment-page${isHotelAuthorization ? ' secure-payment-page--hotels' : ''}${isCarAuthorization ? ' secure-payment-page--cars' : ''}`;
  const paymentLabel = isHotelAuthorization ? 'HOTEL PAYMENT RECORD' : isCarAuthorization ? 'CAR RENTAL PAYMENT RECORD' : 'PAYMENT RECORD';

  if (loading) return <div className={pageClassName}><div className="secure-payment-card">Loading payment authorization…</div></div>;
  if (error && !authorization) return <div className={pageClassName}><div className="secure-payment-card"><div className="secure-payment-brand">FARETRANSIT</div><h1>Payment authorization unavailable</h1><div className="secure-payment-error">{error}</div></div></div>;
  if (!authorization) return null;

  if (success) return <div className={pageClassName}><div className="secure-payment-card secure-payment-success">
    <div className="secure-payment-brand">FARETRANSIT <span>{paymentLabel}</span></div>
    <div className="secure-payment-check">✓</div>
    <h1>Manual payment record saved</h1>
    <p>FareTransit saved only the masked card reference you provided. No full card number or card security code is collected or stored by this form.</p>
    <div className="secure-payment-summary"><span>Authorization</span><strong>{authorization.authorizationCode}</strong><span>Purpose</span><strong>{authorization.purpose}</strong></div>
    <p>You may close this page.</p>
  </div></div>;

  return <div className={pageClassName}><div className="secure-payment-card">
    <div className="secure-payment-brand">FARETRANSIT <span>{paymentLabel}</span></div>
    <h1>{authorization.recollectionOnly ? 'Update manual payment record' : 'Manual payment authorization record'}</h1>
    <p className="secure-payment-subtitle">Review the travel purpose and maximum authorized amount, then record the masked card reference for internal booking records.</p>
    <div className="secure-payment-summary">
      <span>Reference</span><strong>{authorization.context?.entityCode || authorization.authorizationCode}</strong>
      <span>Travel product</span><strong>{authorization.context?.entityType || 'TRAVEL'}</strong>
      <span>Purpose</span><strong>{authorization.purpose}</strong>
      <span>Maximum authorized</span><strong>{money(authorization.authorizedAmount, authorization.currency)}</strong>
    </div>
    {error && <div className="secure-payment-error">{error}</div>}
    <form onSubmit={submit}>
      <label>Cardholder name<input value={cardholderName} onChange={e => setCardholderName(e.target.value)} required /></label>
      <div className="secure-payment-row">
        <label>Card brand<select value={cardBrand} onChange={e => setCardBrand(e.target.value)} required><option value="">Select brand</option>{BRANDS.map(brand => <option key={brand}>{brand}</option>)}</select></label>
        <label>Last 4 digits<input inputMode="numeric" maxLength="4" autoComplete="off" value={last4} onChange={e => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="1234" required /></label>
      </div>
      <div className="secure-payment-row">
        <label>Expiration month<input type="number" min="1" max="12" value={expMonth} onChange={e => setExpMonth(e.target.value)} placeholder="MM" required /></label>
        <label>Expiration year<input type="number" min={currentYear} max={currentYear + 30} value={expYear} onChange={e => setExpYear(e.target.value)} placeholder="YYYY" required /></label>
      </div>
      <h2>Billing address</h2>
      <label>Address<input value={billing.line1} onChange={e => setBilling({ ...billing, line1: e.target.value })} /></label>
      <label>Address line 2<input value={billing.line2} onChange={e => setBilling({ ...billing, line2: e.target.value })} /></label>
      <div className="secure-payment-row"><label>City<input value={billing.city} onChange={e => setBilling({ ...billing, city: e.target.value })} /></label><label>State / Region<input value={billing.region} onChange={e => setBilling({ ...billing, region: e.target.value })} /></label></div>
      <div className="secure-payment-row"><label>Postal code<input value={billing.postalCode} onChange={e => setBilling({ ...billing, postalCode: e.target.value })} /></label><label>Country<input value={billing.country} onChange={e => setBilling({ ...billing, country: e.target.value.slice(0, 80) })} /></label></div>
      <label>Authorization name<input value={signatureName} onChange={e => setSignatureName(e.target.value)} required /></label>
      <label className="secure-payment-consent"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} /> <span>I authorize FareTransit to record this masked payment reference for the travel arrangement described above, up to the maximum authorized amount. I understand this record is not itself a chargeable payment credential.</span></label>
      <button className="secure-payment-submit" disabled={submitting}>{submitting ? 'Saving payment record…' : 'Save Manual Payment Record'}</button>
    </form>
    <div className="secure-payment-security"><strong>Masked record only</strong><p>This form accepts card brand, last four digits, expiration and billing metadata only. Do not enter a full card number or card security code. Payments must be processed through an approved external payment channel.</p></div>
  </div></div>;
}
