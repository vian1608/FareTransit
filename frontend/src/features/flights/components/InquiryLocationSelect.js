import React from 'react';
import Select from 'react-select';

function InquiryLocationSelect({
  id,
  label,
  value,
  onChange,
  groups,
  placeholder = 'Select a location',
  required = false,
}) {
  const selectedOption = React.useMemo(() => {
    if (!value) return null;
    for (const group of groups) {
      const option = group.options.find((opt) => opt.value === value);
      if (option) return option;
    }
    return { label: value, value };
  }, [value, groups]);

  const customStyles = {
    control: (provided, state) => ({
      ...provided,
      minHeight: '48px',
      padding: '0 0.2rem',
      borderRadius: '10px',
      borderColor: state.isFocused ? '#8b1538' : '#cbd5e1',
      boxShadow: state.isFocused ? '0 0 0 3px rgba(139, 21, 56, 0.12)' : 'none',
      '&:hover': {
        borderColor: state.isFocused ? '#8b1538' : '#cbd5e1'
      },
      fontSize: '1rem',
      fontFamily: 'inherit',
    }),
    valueContainer: (provided) => ({
      ...provided,
      padding: '0 8px',
    }),
    input: (provided) => ({
      ...provided,
      margin: '0',
      padding: '0',
    }),
    option: (provided, state) => ({
      ...provided,
      backgroundColor: state.isSelected ? '#8b1538' : state.isFocused ? '#faf5f7' : 'transparent',
      color: state.isSelected ? 'white' : '#334155',
      cursor: 'pointer',
      '&:active': {
        backgroundColor: '#8b1538',
        color: 'white',
      },
    }),
    groupHeading: (provided) => ({
      ...provided,
      color: '#64748b',
      fontWeight: '600',
      textTransform: 'uppercase',
      fontSize: '0.75rem',
      letterSpacing: '0.05em',
    }),
  };

  return (
    <>
      <label htmlFor={id}>{label}</label>
      <Select
        inputId={id}
        value={selectedOption}
        onChange={(option) => onChange(option ? option.value : '')}
        options={groups}
        placeholder={placeholder}
        isClearable
        isSearchable
        required={required}
        styles={customStyles}
        classNamePrefix="react-select"
      />
    </>
  );
}

export default InquiryLocationSelect;
