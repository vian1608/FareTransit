import React, { useState, useEffect } from 'react';
import Select, { components } from 'react-select';
import { countries } from '../data/locations';
import './InternationalPhoneInput.css';

/* ── Custom Option: "United States  +1" (full name, dial right-aligned) ── */
const CountryOption = (props) => {
  const { data, isFocused, isSelected, innerProps } = props;
  return (
    <div
      {...innerProps}
      className={`phone-country-option ${isFocused ? 'focused' : ''} ${isSelected ? 'selected' : ''}`}
    >
      <span className="phone-country-name">{data.name}</span>
      <span className="phone-country-dial">{data.dialCode}</span>
    </div>
  );
};

/* ── Custom SingleValue: "+1" or "+1 United States" in closed state ── */
const CountrySingleValue = (props) => (
  <components.SingleValue {...props}>
    <span className="phone-selected-value">
      <span className="phone-selected-dial">{props.data.dialCode}</span>
    </span>
  </components.SingleValue>
);

/* ── Filter logic: search by full name OR dialing code ── */
const filterOption = (option, input) => {
  if (!input) return true;
  const q = input.toLowerCase();
  return (
    option.data.name.toLowerCase().includes(q) ||
    option.data.dialCode.includes(q)
  );
};

function InternationalPhoneInput({
  id,
  value,
  onChange,
  label,
  placeholder = 'Phone Number',
  required = false,
  disabled = false,
}) {
  const [selectedCountry, setSelectedCountry] = useState(
    countries.find((c) => c.code === 'US')
  );
  const [localNumber, setLocalNumber] = useState('');

  /* Parse incoming E.164 value */
  useEffect(() => {
    if (value && value.startsWith('+')) {
      const match = [...countries]
        .sort((a, b) => b.dialCode.length - a.dialCode.length)
        .find((c) => value.startsWith(c.dialCode));
      if (match) {
        setSelectedCountry(match);
        setLocalNumber(value.substring(match.dialCode.length).replace(/\D/g, ''));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount only

  const handleCountryChange = (option) => {
    setSelectedCountry(option);
    onChange(option.dialCode + localNumber);
  };

  const handleNumberChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '');
    setLocalNumber(raw);
    onChange(selectedCountry.dialCode + raw);
  };

  /* Human-readable display per country */
  const formatLocalDisplay = (num, code) => {
    if (code === 'US' || code === 'CA') {
      if (num.length > 6) return `(${num.slice(0, 3)}) ${num.slice(3, 6)}-${num.slice(6, 10)}`;
      if (num.length > 3) return `(${num.slice(0, 3)}) ${num.slice(3)}`;
      if (num.length > 0) return `(${num}`;
    }
    return num.replace(/(\d{3,4})(?=\d)/g, '$1 ');
  };

  /* react-select custom styles */
  const selectStyles = {
    control: (base) => ({
      ...base,
      border: 'none',
      boxShadow: 'none',
      background: 'transparent',
      minHeight: '48px',
      cursor: 'pointer',
    }),
    valueContainer: (base) => ({
      ...base,
      padding: '0 6px 0 12px',
    }),
    singleValue: (base) => ({
      ...base,
      margin: 0,
    }),
    input: (base) => ({
      ...base,
      margin: 0,
      padding: 0,
      color: '#0f172a',
    }),
    dropdownIndicator: (base) => ({
      ...base,
      padding: '4px 6px 4px 0',
      color: '#64748b',
    }),
    indicatorSeparator: () => ({ display: 'none' }),
    menu: (base) => ({
      ...base,
      width: '320px',
      borderRadius: '10px',
      boxShadow: '0 10px 25px rgba(15,23,42,0.12)',
      border: '1px solid #e2e8f0',
      overflow: 'hidden',
    }),
    menuList: (base) => ({
      ...base,
      maxHeight: '260px',
    }),
    menuPortal: (base) => ({ ...base, zIndex: 9999 }),
  };

  return (
    <div className={`intl-phone-wrapper ${disabled ? 'disabled' : ''}`}>
      <div className="intl-phone-country">
        <Select
          aria-label="Country calling code"
          options={countries}
          value={selectedCountry}
          onChange={handleCountryChange}
          isDisabled={disabled}
          isSearchable
          filterOption={filterOption}
          getOptionLabel={(c) => c.name}
          getOptionValue={(c) => c.code}
          components={{ Option: CountryOption, SingleValue: CountrySingleValue }}
          styles={selectStyles}
          menuPortalTarget={document.body}
          menuPlacement="auto"
          placeholder="+1"
        />
      </div>
      <div className="intl-phone-divider" />
      <input
        id={id}
        type="tel"
        className="intl-phone-input"
        value={formatLocalDisplay(localNumber, selectedCountry?.code)}
        onChange={handleNumberChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        autoComplete="tel-national"
      />
    </div>
  );
}

export default InternationalPhoneInput;
