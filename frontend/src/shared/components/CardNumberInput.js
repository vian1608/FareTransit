import React, { useState, useEffect } from 'react';
import './CardNumberInput.css';

function CardNumberInput({ id, value, onChange, onBrandChange, placeholder = 'Card Number', required = false, disabled = false }) {
  const [brand, setBrand] = useState('unknown');

  const detectBrand = (num) => {
    if (/^3[47]/.test(num)) return 'amex';
    if (/^4/.test(num)) return 'visa';
    if (/^5[1-5]/.test(num) || /^222[1-9]/.test(num) || /^2[3-6]/.test(num) || /^27[01]/.test(num) || /^2720/.test(num)) return 'mastercard';
    if (/^6011/.test(num) || /^65/.test(num) || /^64[4-9]/.test(num)) return 'discover';
    return 'unknown';
  };

  const formatCardNumber = (num, cardBrand) => {
    let clean = num.replace(/\D/g, '');
    if (cardBrand === 'amex') {
      clean = clean.slice(0, 15);
      const match = clean.match(/^(\d{0,4})(\d{0,6})(\d{0,5})$/);
      if (match) {
        return [match[1], match[2], match[3]].filter(x => x).join(' ');
      }
    } else {
      clean = clean.slice(0, 16);
      const match = clean.match(/^(\d{0,4})(\d{0,4})(\d{0,4})(\d{0,4})$/);
      if (match) {
        return [match[1], match[2], match[3], match[4]].filter(x => x).join(' ');
      }
    }
    return clean;
  };

  useEffect(() => {
    const rawNum = value.replace(/\D/g, '');
    const currentBrand = detectBrand(rawNum);
    if (currentBrand !== brand) {
      setBrand(currentBrand);
      if (onBrandChange) onBrandChange(currentBrand);
    }
  }, [value, brand, onBrandChange]);

  const handleChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '');
    const currentBrand = detectBrand(raw);
    const formatted = formatCardNumber(raw, currentBrand);
    onChange(formatted);
  };

  const getBrandIcon = () => {
    switch(brand) {
      case 'amex': return 'fab fa-cc-amex brand-icon amex';
      case 'visa': return 'fab fa-cc-visa brand-icon visa';
      case 'mastercard': return 'fab fa-cc-mastercard brand-icon mastercard';
      case 'discover': return 'fab fa-cc-discover brand-icon discover';
      default: return 'fas fa-credit-card brand-icon neutral';
    }
  };

  return (
    <div className="card-input-wrapper">
      <input
        id={id}
        type="text"
        value={value}
        onChange={handleChange}
        className="card-brand-input"
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        inputMode="numeric"
        autoComplete="cc-number"
      />
      <i className={getBrandIcon()}></i>
    </div>
  );
}

export default CardNumberInput;
