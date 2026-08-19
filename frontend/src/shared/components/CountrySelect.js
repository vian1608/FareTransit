import React from 'react';
import Select from 'react-select';
import { countries } from '../data/locations';

function CountrySelect({ id, value, onChange, placeholder = 'Select Country', required = false, disabled = false }) {
  
  // value is expected to be country code or name. Let's normalize by checking both.
  const selectedOption = countries.find(c => c.code === value || c.name === value) || null;

  const handleChange = (option) => {
    // We pass the full country name back to match existing backend mappings, 
    // but we could pass code if we update the backend. The prompt asks to display full name 
    // and keep consistent identifier. We'll pass the name for compatibility with existing code.
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

  return (
    <Select
      inputId={id}
      options={countries}
      value={selectedOption}
      onChange={handleChange}
      placeholder={placeholder}
      isDisabled={disabled}
      isClearable={false}
      isSearchable={true}
      getOptionLabel={c => c.name}
      getOptionValue={c => c.code}
      styles={customStyles}
      menuPortalTarget={document.body}
    />
  );
}

export default CountrySelect;
