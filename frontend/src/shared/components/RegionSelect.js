import React from 'react';
import Select from 'react-select';
import { countries, regions } from '../data/locations';

function RegionSelect({ id, value, onChange, countryName, placeholder = 'State / Province', required = false, disabled = false }) {
  
  // Find the country code from the name
  const countryCode = countries.find(c => c.name === countryName)?.code;
  
  // Get available regions for this country
  const availableRegions = countryCode && regions[countryCode] ? regions[countryCode] : [];

  const handleChange = (option) => {
    onChange(option ? option.name : '');
  };

  const customStyles = {
    control: (base, state) => ({
      ...base,
      minHeight: '48px',
      borderRadius: '10px',
      borderColor: state.isFocused ? '#8b1538' : '#cbd5e1',
      boxShadow: state.isFocused ? '0 0 0 3.5px rgba(139, 21, 56, 0.12)' : 'none',
      '&:hover': {
        borderColor: state.isFocused ? '#8b1538' : '#cbd5e1'
      }
    }),
    valueContainer: (base) => ({
      ...base,
      padding: '0 1rem',
    }),
    singleValue: (base) => ({
      ...base,
      color: '#0f172a',
      fontSize: '0.98rem',
    }),
    input: (base) => ({
      ...base,
      margin: 0,
      padding: 0,
      color: '#0f172a',
    }),
    placeholder: (base) => ({
      ...base,
      color: '#94a3b8',
      fontSize: '0.98rem',
    }),
    menuPortal: base => ({ ...base, zIndex: 9999 })
  };

  // If there are no predefined regions for this country, fallback to text input
  if (availableRegions.length === 0) {
    return (
      <input
        id={id}
        type="text"
        className="booking-input-fallback" // We'll add this class globally or inline styles
        style={{
          width: '100%', minHeight: '48px', border: '1px solid #cbd5e1', borderRadius: '10px',
          padding: '0.65rem 1rem', fontSize: '0.98rem', color: '#0f172a', boxSizing: 'border-box'
        }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
      />
    );
  }

  const selectedOption = availableRegions.find(r => r.name === value || r.code === value) || null;

  return (
    <Select
      inputId={id}
      options={availableRegions}
      value={selectedOption}
      onChange={handleChange}
      placeholder={placeholder}
      isDisabled={disabled}
      isClearable={false}
      isSearchable={true}
      getOptionLabel={r => r.name}
      getOptionValue={r => r.code}
      styles={customStyles}
      menuPortalTarget={document.body}
    />
  );
}

export default RegionSelect;
