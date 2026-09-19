import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';

const CARD_NUMBER_DIGITS = 16;
const digitsOnly = (value) => String(value || '').replace(/\D/g, '');

function detectCardBrand(value) {
  const digits = digitsOnly(value);
  if (!digits) return '';

  // Network detection is typing feedback only. FareTransit's checkout accepts
  // a complete 16-digit card number and leaves issuer/processor verification
  // to the payment workflow rather than rejecting a customer on a local checksum.
  if (/^4/.test(digits)) return 'Visa';
  if (/^5/.test(digits)) return 'Mastercard';
  if (/^6/.test(digits)) return 'Discover';

  if (/^3/.test(digits)) {
    if (/^3[47]/.test(digits)) return 'American Express';
    if (/^35/.test(digits) && digits.length >= 2) return 'JCB';
    if (/^3(0[0-5]|[68])/.test(digits) && digits.length >= 2) return 'Diners Club';
    return 'American Express';
  }

  if (/^(2131|1800)/.test(digits)) return 'JCB';
  return digits.length >= 6 ? 'Other' : '';
}

function maxCardDigits() {
  return CARD_NUMBER_DIGITS;
}

function isCompleteCardNumber(value) {
  return digitsOnly(value).length === CARD_NUMBER_DIGITS;
}

function formatCardNumber(value) {
  const digits = digitsOnly(value).slice(0, CARD_NUMBER_DIGITS);
  return digits.replace(/(.{4})/g, '$1 ').trim();
}

function formatExpiry(value) {
  const digits = digitsOnly(value).slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function parseExpiry(value) {
  const match = String(value || '').match(/^(\d{2})\/(\d{2})$/);
  if (!match) return null;
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (month < 1 || month > 12) return null;
  const now = new Date();
  const expiryBoundary = new Date(year, month, 1, 0, 0, 0, 0);
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  if (expiryBoundary <= currentMonth) return null;
  return { month, year };
}

const PaymentCardEntry = forwardRef(function PaymentCardEntry({ nameOnCard, onNameChange, onFocus, onBrandChange }, ref) {
  const [cardNumber, setCardNumber] = useState('');
  const [securityCode, setSecurityCode] = useState('');
  const [expiry, setExpiry] = useState('');
  const [touched, setTouched] = useState(false);

  const brand = useMemo(() => detectCardBrand(cardNumber), [cardNumber]);
  const cardNumberValid = useMemo(() => isCompleteCardNumber(cardNumber), [cardNumber]);
  const expiryParts = useMemo(() => parseExpiry(expiry), [expiry]);
  const valid = useMemo(() => (
    Boolean(String(nameOnCard || '').trim())
    && cardNumberValid
    && Boolean(expiryParts)
    && /^\d{3,4}$/.test(securityCode)
  ), [nameOnCard, cardNumberValid, expiryParts, securityCode]);

  useEffect(() => {
    onBrandChange?.(brand);
  }, [brand, onBrandChange]);

  const getValidationMessage = () => {
    if (!String(nameOnCard || '').trim()) return 'Enter the name shown on the card.';
    const cardDigits = digitsOnly(cardNumber);
    if (cardDigits.length !== CARD_NUMBER_DIGITS) return 'Enter the complete 16-digit card number.';
    if (!/^\d{3,4}$/.test(securityCode)) return 'Enter a valid CID/CVV.';
    if (!expiryParts) return 'Enter a valid future expiration date in MM/YY format.';
    return '';
  };

  useImperativeHandle(ref, () => ({
    isReady: () => true,
    isValid: () => valid,
    getValidationMessage,
    getMaskedMetadata: () => {
      const digits = digitsOnly(cardNumber);
      return {
        cardBrand: brand || 'Other',
        last4: digits.slice(-4),
        expMonth: expiryParts?.month || null,
        expYear: expiryParts?.year || null,
      };
    },
    clear: () => {
      setCardNumber('');
      setSecurityCode('');
      setExpiry('');
      setTouched(false);
    },
  }), [valid, nameOnCard, cardNumber, securityCode, expiryParts, brand]);

  const showError = touched && !valid;

  return (
    <div className="booking-v3-card-entry">
      <label className="booking-v3-floating-field booking-v3-card-number-field">
        <span>Card Number</span>
        <input
          id="cardNumber"
          name="cardNumber"
          type="text"
          inputMode="numeric"
          autoComplete="cc-number"
          value={formatCardNumber(cardNumber)}
          onFocus={onFocus}
          onBlur={() => setTouched(true)}
          onChange={(event) => {
            const digits = digitsOnly(event.target.value);
            setCardNumber(digits.slice(0, CARD_NUMBER_DIGITS));
          }}
          placeholder="Card Number"
          maxLength={19}
          aria-invalid={showError && !cardNumberValid}
          required
        />
        {brand && (
          <span className={`booking-v3-detected-brand booking-v3-detected-brand--${brand.toLowerCase().replace(/\s+/g, '-')}${cardNumberValid ? ' is-valid' : ''}`} aria-live="polite">
            <span className="booking-v3-detected-brand__label">Card network</span>
            <strong>{brand}</strong>
          </span>
        )}
      </label>

      <div className="booking-v3-card-row">
        <label className="booking-v3-floating-field booking-v3-card-name-field">
          <span>Name on Card</span>
          <input
            id="nameOnCard"
            name="nameOnCard"
            type="text"
            autoComplete="cc-name"
            value={nameOnCard}
            onFocus={onFocus}
            onBlur={() => setTouched(true)}
            onChange={(event) => onNameChange?.(event.target.value)}
            placeholder="Name on Card"
            required
          />
        </label>

        <label className="booking-v3-floating-field booking-v3-card-cvv-field">
          <span>CID/CVV</span>
          <input
            id="cvv"
            name="cvv"
            type="password"
            inputMode="numeric"
            autoComplete="cc-csc"
            value={securityCode}
            onFocus={onFocus}
            onBlur={() => setTouched(true)}
            onChange={(event) => setSecurityCode(digitsOnly(event.target.value).slice(0, 4))}
            placeholder="CVV"
            aria-invalid={showError && !/^\d{3,4}$/.test(securityCode)}
            required
          />
          <i className="fas fa-info-circle booking-v3-cvv-info" title="The 3- or 4-digit security code printed on your card." aria-hidden="true" />
        </label>

        <label className="booking-v3-floating-field booking-v3-card-expiry-field">
          <span>Expiration Date</span>
          <input
            id="expDate"
            name="expDate"
            type="text"
            inputMode="numeric"
            autoComplete="cc-exp"
            value={expiry}
            onFocus={onFocus}
            onBlur={() => setTouched(true)}
            onChange={(event) => setExpiry(formatExpiry(event.target.value))}
            placeholder="MM/YY"
            maxLength={5}
            aria-invalid={showError && !expiryParts}
            required
          />
        </label>
      </div>

      {showError && <p className="booking-v3-card-error" role="alert">{getValidationMessage()}</p>}
    </div>
  );
});

export { CARD_NUMBER_DIGITS, detectCardBrand, maxCardDigits, isCompleteCardNumber };
export default PaymentCardEntry;
