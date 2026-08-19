import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import './SecurePaymentPage.css';

const apiBase = () => (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? (process.env.REACT_APP_API_URL || 'http://localhost:5001/api') : '/api';

async function jsonRequest(path, options = {}) {
  const response = await fetch(`${apiBase()}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) throw new Error(body?.error?.message || `Request failed (HTTP ${response.status})`);
  return body.data;
}

function loadScript(src, integrity) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (window.VGSCollect) return resolve();
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    if (integrity) { script.integrity = integrity; script.crossOrigin = 'anonymous'; }
    script.onload = resolve;
    script.onerror = () => reject(new Error('The secure card-entry library could not be loaded.'));
    document.head.appendChild(script);
  });
}

function findAlias(node, fieldName) {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const item of node) { const found = findAlias(item, fieldName); if (found) return found; }
    return null;
  }
  if (typeof node !== 'object') return null;
  if ((node.name === fieldName || node.value === fieldName || node.field === fieldName) && typeof node.alias === 'string') return node.alias;
  if (node[fieldName]) {
    if (typeof node[fieldName] === 'string' && (node[fieldName].startsWith('tok_') || node[fieldName].startsWith('alias_'))) return node[fieldName];
    if (typeof node[fieldName]?.alias === 'string') return node[fieldName].alias;
  }
  for (const value of Object.values(node)) { const found = findAlias(value, fieldName); if (found) return found; }
  return null;
}

const fieldCss = {
  'font-family': 'Inter, Arial, sans-serif',
  'font-size': '16px',
  color: '#172033',
  height: '48px',
  padding: '0 13px',
  border: '1px solid #cfd7e4',
  'border-radius': '10px',
  'box-sizing': 'border-box',
  width: '100%',
  background: '#fff',
  outline: 'none',
};

function money(value, currency) {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(Number(value || 0)); }
  catch { return `${currency || 'USD'} ${Number(value || 0).toFixed(2)}`; }
}

export default function SecurePaymentPage() {
  const { token } = useParams();
  const formRef = useRef(null);
  const formStateRef = useRef({});
  const [authorization, setAuthorization] = useState(null);
  const [vault, setVault] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formReady, setFormReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [cardholderName, setCardholderName] = useState('');
  const [signatureName, setSignatureName] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [billing, setBilling] = useState({ line1: '', city: '', region: '', postalCode: '', country: 'US' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await jsonRequest(`/secure-payments/authorizations/${encodeURIComponent(token)}`);
        if (cancelled) return;
        setAuthorization(data.authorization);
        setVault(data.vault);
        setCardholderName(data.authorization.customerName || '');
        setSignatureName(data.authorization.customerName || '');
        if (data.authorization.status === 'CARD_READY' || data.authorization.status === 'PARTIALLY_USED' || data.authorization.status === 'COMPLETED') setSuccess(true);
      } catch (e) { if (!cancelled) setError(e.message); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; try { formRef.current?.unmount?.(); } catch { /* best effort */ } };
  }, [token]);

  useEffect(() => {
    if (!authorization || success || !vault?.collectEnabled) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const config = await jsonRequest(`/secure-payments/authorizations/${encodeURIComponent(token)}/collect-config`);
        await loadScript(config.collectScript, config.collectIntegrity);
        if (cancelled || !window.VGSCollect) return;
        const form = window.VGSCollect.create(config.vaultId, config.environment, state => { formStateRef.current = state || {}; });
        if (config.collectCname) form.useCname(config.collectCname);
        if (config.collectRouteId) form.setRouteId(config.collectRouteId);
        const common = { css: fieldCss };
        if (!authorization.recollectionOnly) {
          form.field('#tfs-vgs-pan', { ...common, type: 'card-number', name: 'card_number', placeholder: 'Card number', showCardIcon: true, autoComplete: 'cc-number', validations: ['required', 'validCardNumber'], tokenization: { format: 'UUID', storage: 'PERSISTENT' } });
          form.field('#tfs-vgs-exp', { ...common, type: 'card-expiration-date', name: 'card_expiration', placeholder: 'MM / YYYY', autoComplete: 'cc-exp', validations: ['required', 'validCardExpirationDate'], tokenization: { format: 'UUID', storage: 'PERSISTENT' } });
        }
        form.field('#tfs-vgs-cvv', { ...common, type: 'card-security-code', name: 'card_cvv', placeholder: 'CVV', autoComplete: 'cc-csc', validations: ['required', 'validCardSecurityCode'], tokenization: { format: 'UUID', storage: 'VOLATILE' } });
        formRef.current = { form, config };
        setFormReady(true);
      } catch (e) { if (!cancelled) setError(e.message); }
    })();
    return () => { cancelled = true; };
  }, [authorization, success, token, vault]);

  const submit = event => {
    event.preventDefault();
    if (!formRef.current?.form || submitting) return;
    if (!authorization.recollectionOnly && (!accepted || !signatureName.trim() || !cardholderName.trim())) {
      setError('Please confirm the authorization terms, cardholder name, and authorization name.');
      return;
    }
    setSubmitting(true); setError('');
    const { form, config } = formRef.current;
    form.createAliases({ access_token: `Bearer ${config.accessToken}` }, async (status, response) => {
      try {
        if (Number(status) < 200 || Number(status) >= 300) throw new Error('The secure vault did not accept the card details. Please check the fields and retry.');
        const panAlias = authorization.recollectionOnly ? null : findAlias(response, 'card_number');
        const expirationAlias = authorization.recollectionOnly ? null : findAlias(response, 'card_expiration');
        const cvvAlias = findAlias(response, 'card_cvv');
        if (!cvvAlias || (!authorization.recollectionOnly && (!panAlias || !expirationAlias))) throw new Error('The vault response did not contain all required aliases. No card values were saved by FareTransit. Please retry.');
        const cardState = formStateRef.current?.card_number || {};
        await jsonRequest(`/secure-payments/authorizations/${encodeURIComponent(token)}/complete`, {
          method: 'POST',
          body: JSON.stringify({
            panAlias,
            expirationAlias,
            cvvAlias,
            cardBrand: cardState.cardType || null,
            last4: cardState.last4 || null,
            cardholderName,
            signatureName,
            billingAddress: billing,
          }),
        });
        try { form.reset?.(); } catch { /* best effort */ }
        setSuccess(true);
      } catch (e) { setError(e.message); }
      finally { setSubmitting(false); }
    }, () => { setSubmitting(false); setError('Please correct the highlighted secure card fields and try again.'); });
  };

  const entityType = String(authorization?.context?.entityType || '').toUpperCase();
  const isHotelAuthorization = entityType === 'HOTEL';
  const isCarAuthorization = ['CAR', 'CAR_RENTAL', 'RENTAL_CAR'].includes(entityType);
  const pageClassName = `secure-payment-page${isHotelAuthorization ? ' secure-payment-page--hotels' : ''}${isCarAuthorization ? ' secure-payment-page--cars' : ''}`;
  const paymentLabel = isHotelAuthorization ? 'HOTEL SECURE PAYMENT' : isCarAuthorization ? 'CAR RENTAL SECURE PAYMENT' : 'SECURE PAYMENT';

  if (loading) return <div className={pageClassName}><div className="secure-payment-card">Loading secure authorization…</div></div>;
  if (error && !authorization) return <div className={pageClassName}><div className="secure-payment-card"><div className="secure-payment-brand">THE FINAL SEAT</div><h1>Secure authorization unavailable</h1><div className="secure-payment-error">{error}</div></div></div>;
  if (!authorization) return null;

  if (success) return <div className={pageClassName}><div className="secure-payment-card secure-payment-success"><div className="secure-payment-brand">THE FINAL SEAT <span>{paymentLabel}</span></div><div className="secure-payment-check">✓</div><h1>{authorization.recollectionOnly ? 'Security code updated' : 'Payment method secured'}</h1><p>Your payment information was sent directly to the secure vault. FareTransit stores only vault references and masked card metadata.</p><div className="secure-payment-summary"><span>Authorization</span><strong>{authorization.authorizationCode}</strong><span>Purpose</span><strong>{authorization.purpose}</strong></div><p>You may close this page.</p></div></div>;

  return <div className={pageClassName}><div className="secure-payment-card">
    <div className="secure-payment-brand">THE FINAL SEAT <span>{paymentLabel}</span></div>
    <h1>{authorization.recollectionOnly ? 'Update card security code' : 'Secure payment authorization'}</h1>
    <p className="secure-payment-subtitle">Review the travel purpose and authorized maximum before providing your payment method.</p>
    <div className="secure-payment-summary">
      <span>Reference</span><strong>{authorization.context?.entityCode || authorization.authorizationCode}</strong>
      <span>Travel product</span><strong>{authorization.context?.entityType || 'TRAVEL'}</strong>
      <span>Purpose</span><strong>{authorization.purpose}</strong>
      <span>Maximum authorized</span><strong>{money(authorization.authorizedAmount, authorization.currency)}</strong>
    </div>
    {!vault?.configured && <div className="secure-payment-error">The secure card vault is not configured yet. Please contact FareTransit.</div>}
    {vault?.configured && vault?.usesSandboxDefaultTtl && <div className="secure-payment-warning">Sandbox test mode is using VGS&apos;s default {vault.effectiveCvvTtlHours || 1}-hour volatile CVV window. The requested {vault.targetCvvTtlHours}-hour window remains disabled until Live is configured.</div>}
    {vault?.configured && !vault?.ttlReady && <div className="secure-payment-warning">Card collection is intentionally disabled until VGS confirms the requested {vault.targetCvvTtlHours}-hour volatile CVV setting for this vault.</div>}
    {error && <div className="secure-payment-error">{error}</div>}
    {vault?.collectEnabled && <form onSubmit={submit}>
      {!authorization.recollectionOnly && <>
        <label>Cardholder name<input value={cardholderName} onChange={e => setCardholderName(e.target.value)} autoComplete="cc-name" required /></label>
        <label>Card number<div id="tfs-vgs-pan" className="secure-vgs-field" /></label>
        <div className="secure-payment-row"><label>Expiration<div id="tfs-vgs-exp" className="secure-vgs-field" /></label><label>Security code<div id="tfs-vgs-cvv" className="secure-vgs-field" /></label></div>
        <h2>Billing address</h2>
        <label>Address<input value={billing.line1} onChange={e => setBilling({ ...billing, line1: e.target.value })} autoComplete="billing street-address" /></label>
        <div className="secure-payment-row"><label>City<input value={billing.city} onChange={e => setBilling({ ...billing, city: e.target.value })} autoComplete="billing address-level2" /></label><label>State / Region<input value={billing.region} onChange={e => setBilling({ ...billing, region: e.target.value })} autoComplete="billing address-level1" /></label></div>
        <div className="secure-payment-row"><label>Postal code<input value={billing.postalCode} onChange={e => setBilling({ ...billing, postalCode: e.target.value })} autoComplete="billing postal-code" /></label><label>Country<input value={billing.country} onChange={e => setBilling({ ...billing, country: e.target.value.toUpperCase().slice(0, 2) })} autoComplete="billing country" /></label></div>
        <label>Authorization name<input value={signatureName} onChange={e => setSignatureName(e.target.value)} required /></label>
        <label className="secure-payment-consent"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} /> <span>I authorize FareTransit to use this payment method for the travel arrangement described above, up to the maximum authorized amount. I understand that the final supplier charge may be lower than this amount.</span></label>
      </>}
      {authorization.recollectionOnly && <><div className="secure-payment-existing-card">Existing vaulted card: <strong>{authorization.paymentMethod?.cardBrand ? `${authorization.paymentMethod.cardBrand.toUpperCase()} ` : ''}{authorization.paymentMethod?.last4 ? `•••• ${authorization.paymentMethod.last4}` : 'secure card on file'}</strong></div><label>Security code<div id="tfs-vgs-cvv" className="secure-vgs-field" /></label><p className="secure-payment-note">Only a new CVV is being collected. Your existing vaulted card number remains unchanged.</p></>}
      <button className="secure-payment-submit" disabled={!formReady || submitting}>{submitting ? 'Securing payment method…' : authorization.recollectionOnly ? 'Secure New Security Code' : 'Authorize & Secure Payment Method'}</button>
    </form>}
    <div className="secure-payment-security"><strong>Protected card entry</strong><p>Card number and security code fields are isolated by VGS. FareTransit application receives vault aliases rather than the raw values.</p>{vault?.ttlReady && <p>Current volatile CVV window: up to {vault.effectiveCvvTtlHours || vault.targetCvvTtlHours} hour{Number(vault.effectiveCvvTtlHours || vault.targetCvvTtlHours) === 1 ? '' : 's'}, ending earlier when the related transaction is authorized.</p>}</div>
  </div></div>;
}
