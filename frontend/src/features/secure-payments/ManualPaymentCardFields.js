import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';

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
    const error = new Error(body?.error?.message || body?.message || `Request failed (HTTP ${response.status})`);
    error.status = response.status;
    error.code = body?.error?.code;
    throw error;
  }
  return body.data ?? body;
}

const currentYear = new Date().getFullYear();
const BRANDS = ['Visa', 'Mastercard', 'American Express', 'Discover', 'Other'];

const ManualPaymentCardFields = forwardRef(function ManualPaymentCardFields({ onFocus }, ref) {
  const [cardBrand, setCardBrand] = useState('');
  const [last4, setLast4] = useState('');
  const [expMonth, setExpMonth] = useState('');
  const [expYear, setExpYear] = useState('');

  useEffect(() => {
    const section = document.querySelector('.booking-v2-section .booking-v2-secure-heading')?.closest('.booking-v2-section');
    const subheading = section?.querySelector('.booking-v2-secure-heading p');
    const pageHeading = section?.querySelector('.booking-v2-section__header h1');
    const submitButton = section?.querySelector('.booking-v2-primary--checkout');

    if (subheading) subheading.textContent = 'Card information for this reservation';
    if (pageHeading) pageHeading.textContent = 'Card & Billing Details';
    if (submitButton && !submitButton.disabled) submitButton.setAttribute('aria-label', 'Confirm reservation');
  }, []);

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
    clear: () => {
      setCardBrand('');
      setLast4('');
      setExpMonth('');
      setExpYear('');
    },
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
      if (!valid) {
        throw new Error('Please enter the card brand, last four digits, and a valid expiration date.');
      }

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
    <div className="manual-card-fields">
      <div className="booking-form-grid booking-v2-grid-gap">
        <label className="booking-form-field">
          Card Brand <span className="required-mark">*</span>
          <select
            value={cardBrand}
            onChange={(event) => setCardBrand(event.target.value)}
            onFocus={onFocus}
            required
          >
            <option value="">Select card brand</option>
            {BRANDS.map((brand) => <option key={brand} value={brand}>{brand}</option>)}
          </select>
        </label>

        <label className="booking-form-field">
          Card Number (Last 4 Digits) <span className="required-mark">*</span>
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
        </label>
      </div>

      <div className="form-row-two booking-v2-grid-gap">
        <label className="booking-form-field">
          Expiration Month <span className="required-mark">*</span>
          <select value={expMonth} onChange={(event) => setExpMonth(event.target.value)} onFocus={onFocus} required>
            <option value="">MM</option>
            {Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0')).map((month) => (
              <option key={month} value={month}>{month}</option>
            ))}
          </select>
        </label>

        <label className="booking-form-field">
          Expiration Year <span className="required-mark">*</span>
          <select value={expYear} onChange={(event) => setExpYear(event.target.value)} onFocus={onFocus} required>
            <option value="">YYYY</option>
            {Array.from({ length: 16 }, (_, index) => currentYear + index).map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </label>
      </div>

      <p className="manual-card-field-note">
        FareTransit stores the card brand, last four digits and expiration date with the reservation for staff reference.
      </p>
    </div>
  );
});

export default ManualPaymentCardFields;
