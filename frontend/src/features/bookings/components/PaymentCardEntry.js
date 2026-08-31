import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';

const digitsOnly = (value) => String(value || '').replace(/\D/g, '');

function detectCardBrand(value) {
  const digits = digitsOnly(value);
  if (!digits) return '';

  // Give immediate network feedback while the passenger types, then refine
  // the less-common 3-series networks when enough digits are available.
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

function maxCardDigits(value) {
  const digits = digitsOnly(value);
  // American Express uses 15 digits. All other supported entry is capped at 16.
  return /^3[47]/.test(digits) ? 15 : 16;
}

function passesLuhn(value) {
  const digits = digitsOnly(value);
  if (digits.length < 12 || digits.length > maxCardDigits(digits)) return false;
  let sum = 0;
  let doubleDigit = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
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

function formatCardNumber(value) {
  const digits = digitsOnly(value).slice(0, maxCardDigits(value));
  if (/^3[47]/.test(digits)) {
    const groups = [digits.slice(0, 4), digits.slice(4, 10), digits.slice(10, 15)].filter(Boolean);
    return groups.join(' ');
  }
  return digits.replace(/(.{4})/g, '$1 ').trim();
}

function formatExpiry(value) {
  const digits = digitsOnly(value).slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

const PaymentCardEntry = forwardRef(function PaymentCardEntry({ nameOnCard, onNameChange, onFocus, onBrandChange }, ref) {
  const [cardNumber, setCardNumber] = useState('');
  const [securityCode, setSecurityCode] = useState('');
  const [expiry, setExpiry] = useState('');
  const [touched, setTouched] = useState(false);

  const brand = useMemo(() => detectCardBrand(cardNumber), [cardNumber]);
  const expiryParts = useMemo(() => parseExpiry(expiry), [expiry]);
  const valid = useMemo(() => (
    Boolean(String(nameOnCard || '').trim())
    && passesLuhn(cardNumber)
    && Boolean(expiryParts)
    && /^\d{3,4}$/.test(securityCode)
  ), [nameOnCard, cardNumber, expiryParts, securityCode]);

  useEffect(() => {
    onBrandChange?.(brand);
  }, [brand, onBrandChange]);

  const getValidationMessage = () => {
    if (!String(nameOnCard || '').trim()) return 'Enter the name shown on the card.';
    if (!passesLuhn(cardNumber)) return 'Enter a valid card number.';
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
  const isAmexLength = /^3[47]/.test(cardNumber);

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
            setCardNumber(digits.slice(0, maxCardDigits(digits)));
          }}
          placeholder="Card Number"
          maxLength={isAmexLength ? 17 : 19}
          aria-invalid={showError && !passesLuhn(cardNumber)}
          required
        />
        {brand && (
          <span className={`booking-v3-detected-brand booking-v3-detected-brand--${brand.toLowerCase().replace(/\s+/g, '-')}`} aria-live="polite">
            <span className="booking-v3-detected-brand__label">Card type</span>
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

export { detectCardBrand, maxCardDigits };
export default PaymentCardEntry;