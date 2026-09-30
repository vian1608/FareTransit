import React, { useState, useEffect, useRef } from 'react';
import enterpriseRentalApi from '../enterpriseRentalApi';
import './LocationAutocomplete.css';

function locationLabel(item = {}) {
  const airport = item.airportCode ? ` (${item.airportCode})` : '';
  const cityState = [item.address?.city, item.address?.state].filter(Boolean).join(', ');
  return `${item.name || 'Enterprise location'}${airport}${cityState ? ` — ${cityState}` : ''}`;
}

/**
 * Enterprise rental location autocomplete.
 * The selected Enterprise location ID is retained separately from the label;
 * typed free text never invents a supplier location ID.
 */
function LocationAutocomplete({
  label,
  id,
  value,
  onChange,
  placeholder = 'City, airport, or ZIP code...',
  required = false,
  disabled = false
}) {
  const [query, setQuery] = useState(typeof value === 'string' ? value : (value?.label || ''));
  const [searchTerm, setSearchTerm] = useState('');
  const [options, setOptions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const containerRef = useRef(null);

  useEffect(() => {
    if (typeof value === 'string') setQuery(value);
    else if (value?.label) setQuery(value.label);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const trimmed = searchTerm.trim();
    if (trimmed.length < 3) {
      setOptions([]);
      setLoading(false);
      setNotice('');
      return undefined;
    }

    let live = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      setNotice('');
      try {
        const data = await enterpriseRentalApi.searchLocations(trimmed, 'US');
        if (!live) return;
        const locations = Array.isArray(data?.locations) ? data.locations : [];
        setOptions(locations);
        setIsOpen(locations.length > 0);
        if (locations.length === 0) setNotice('No Enterprise locations found. Try a nearby airport or city.');
      } catch (error) {
        if (live) {
          setOptions([]);
          setIsOpen(false);
          setNotice(error.message || 'Location search is temporarily unavailable.');
        }
      } finally {
        if (live) setLoading(false);
      }
    }, 450);

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [searchTerm]);

  const handleSelect = (item) => {
    const displayLabel = locationLabel(item);
    const structuredObj = {
      type: 'enterprise',
      id: item.id,
      label: displayLabel,
      name: item.name,
      airportCode: item.airportCode || '',
      address: item.address || {},
      phone: item.phone || '',
      afterHoursReturn: Boolean(item.afterHoursReturn)
    };
    setQuery(displayLabel);
    setSearchTerm('');
    setOptions([]);
    setIsOpen(false);
    setNotice('');
    onChange?.(displayLabel, structuredObj);
  };

  const handleInputChange = (event) => {
    const val = event.target.value;
    setQuery(val);
    setSearchTerm(val);
    setIsOpen(false);
    setNotice('');
    // Clear the previously selected supplier ID until the customer explicitly
    // selects a result from the Enterprise list.
    onChange?.(val, null);
  };

  const handleFocus = () => {
    if (searchTerm.trim().length >= 3 && options.length > 0) setIsOpen(true);
  };

  return (
    <div className="car-location-autocomplete" ref={containerRef}>
      {label && (
        <label htmlFor={id} className="car-location-label">
          <i className="fas fa-map-marker-alt" aria-hidden="true" />
          <span>{label}</span>
          {required && <span className="req-star">*</span>}
        </label>
      )}

      <div className="car-location-input-wrapper">
        <input
          id={id}
          type="text"
          className="car-location-input"
          value={query}
          onChange={handleInputChange}
          onFocus={handleFocus}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={isOpen}
        />
        {loading && <i className="fas fa-spinner fa-spin car-location-spinner" aria-label="Searching Enterprise locations" />}
      </div>

      {notice && !isOpen && <div className="car-location-notice" role="status">{notice}</div>}

      {isOpen && options.length > 0 && (
        <ul className="car-location-dropdown" role="listbox">
          {options.map((item) => (
            <li
              key={item.id}
              className="car-location-item"
              onClick={() => handleSelect(item)}
              role="option"
              aria-selected="false"
            >
              <i className={item.type === 'airport' ? 'fas fa-plane-arrival' : 'fas fa-map-marker-alt'} aria-hidden="true" />
              <div className="car-location-item-text">
                <span className="car-location-title">{item.name}{item.airportCode ? ` (${item.airportCode})` : ''}</span>
                <span className="car-location-subtitle">
                  {[item.address?.street, item.address?.city, item.address?.state, item.address?.postal].filter(Boolean).join(', ')}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default LocationAutocomplete;
