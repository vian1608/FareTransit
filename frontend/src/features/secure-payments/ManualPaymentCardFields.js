import React, { forwardRef, useImperativeHandle, useMemo, useState } from 'react';

const apiBase = () => (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? (process.env.REACT_APP_API_URL || 'http://localhost:5001/api')
  : '/api';

async function jsonRequest(path, options = {}) {
  const response = await fetch(`${apiBase()}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    const error = new Error(body?.error?.message || `Request failed (HTTP ${response.status})`);
    error.status = response.status;
    error.code = body?.error?.code;
    throw error;
  }
  return body.data;
}

const currentYear = new Date().getFullYear();
const BRANDS = ['Visa', 'Mastercard', 'American Express', 'Discover', 'Other'];

const ManualPaymentCardFields = forwardRef(function ManualPaymentCardFields({ onFocus }, ref) {
  const [cardBrand, setCardBrand] = useState('');
  const [last4, setLast4] = useState('');
  const [expMonth, setExpMonth] = useState('');
  const [expYear, setExpYear] = useState('');

  const valid = useMemo(() => {
    const month = Number(expMonth);
    const year = Number(expYear);
    return Boolean(cardBrand)
      && /^\d{4}$/.test(last4)
      && month >= 1 && month <= 12
      && year >= currentYear && year <= currentYear + 30;
  }, [cardBrand, last4, expMonth, expYear]);

  const getMaskedMetadata = () => ({
    cardBrand,
    last4,
    expMonth: Number(expMonth) || null,
    expYear: Number(expYear) || null,
  });

  useImperativeHandle(ref, () => ({
    isReady: () => true,
    isValid: () => valid,
    getMaskedMetadata,
    secureBooking: async ({
      bookingId,
      bookingCode,
      customerEmail,
      customerName,
      customerPhone,
      authorizedAmount,
      currency = 'USD',
      purpose,
      idempotencyKey,
      cardholderName,
      billingAddress,
    }) => {
      if (!valid) throw new Error('Please enter the card brand, last four digits, and a valid expiration date.');
      const masked = getMaskedMetadata();
      const attached = await jsonRequest('/secure-payments/checkout/attach', {
        method: 'POST',
        body: JSON.stringify({
          bookingId,
          bookingCode,
          customerEmail,
          customerName,
          customerPhone,
          authorizedAmount,
          currency,
          purpose,
          idempotencyKey,
          cardholderName,
          billingAddress,
          ...masked,
        }),
      });
      return { ...attached, ...masked };
    },
  }), [valid, cardBrand, last4, expMonth, expYear]);

  return (
    <>
      <div className="booking-form-field" style={{ marginTop: '0.85rem' }}>
        <label>Card Brand <span style={{ color: '#dc2626' }}>*</span></label>
        <select value={cardBrand} onChange={(event) => setCardBrand(event.target.value)} onFocus={onFocus} required>
          <option value="">Select card brand</option>
          {BRANDS.map((brand) => <option key={brand} value={brand}>{brand}</option>)}
        </select>
      </div>

      <div className="form-row-two">
        <div className="booking-form-field">
          <label>Last 4 Digits <span style={{ color: '#dc2626' }}>*</span></label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength="4"
            value={last4}
            onFocus={onFocus}
            onChange={(event) => setLast4(event.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="1234"
            required
          />
        </div>
        <div className="booking-form-field">
          <label>Expiration <span style={{ color: '#dc2626' }}>*</span></label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            <input type="number" min="1" max="12" value={expMonth} onFocus={onFocus} onChange={(event) => setExpMonth(event.target.value)} placeholder="MM" required />
            <input type="number" min={currentYear} max={currentYear + 30} value={expYear} onFocus={onFocus} onChange={(event) => setExpYear(event.target.value)} placeholder="YYYY" required />
          </div>
        </div>
      </div>

      <div style={{ marginTop: '0.8rem', color: '#64748b', fontSize: '0.82rem', lineHeight: 1.5 }}>
        FareTransit records only masked payment metadata for manual recordkeeping. Do not enter a full card number or security code here.
      </div>
    </>
  );
});

export default ManualPaymentCardFields;
