import React from 'react';

function CitySelect({ id, value, onChange, countryName, stateName, placeholder = 'City', required = false, disabled = false }) {
  // Without a comprehensive global city database, we fall back to a standard text input
  // as per the requirement: "Keep manual city entry available as a fallback"
  
  return (
    <input
      id={id}
      type="text"
      style={{
        width: '100%', minHeight: '48px', border: '1px solid #cbd5e1', borderRadius: '10px',
        padding: '0.65rem 1rem', fontSize: '0.98rem', color: '#0f172a', boxSizing: 'border-box',
        transition: 'all 0.15s ease', outline: 'none'
      }}
      onFocus={(e) => {
        e.target.style.borderColor = '#8b1538';
        e.target.style.boxShadow = '0 0 0 3.5px rgba(139, 21, 56, 0.12)';
      }}
      onBlur={(e) => {
        e.target.style.borderColor = '#cbd5e1';
        e.target.style.boxShadow = 'none';
      }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      autoComplete="address-level2"
    />
  );
}

export default CitySelect;
