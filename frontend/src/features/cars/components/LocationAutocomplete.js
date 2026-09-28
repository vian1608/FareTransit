import React, { useState, useEffect, useRef } from 'react';
import { carRentalApi } from '../carRentalApi';
import './LocationAutocomplete.css';

/**
 * Enterprise rental-location autocomplete powered server-side through Parse.
 * A location must be selected from the suggestions because search_vehicles
 * requires Enterprise's internal location ID.
 */
function LocationAutocomplete({
  label,
  id,
  value,
  onChange,
  placeholder = 'City, airport code, or address...',
  required = false,
  disabled = false,
  countryCode = 'US'
}) {
  const [query, setQuery] = useState(typeof value === 'string' ? value : (value?.label || ''));
  const [searchTerm, setSearchTerm] = useState('');
  const [options, setOptions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);
  const requestSequence = useRef(0);

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

  // Parse charges per successful call. Require three characters and debounce
  // deliberate typing so we do not burn credits on every keystroke.
  useEffect(() => {
    const trimmed = searchTerm.trim();
    if (trimmed.length < 3) {
      setOptions([]);
      setLoading(false);
      setIsOpen(false);
      return undefined;
    }

    const sequence = ++requestSequence.current;
    let live = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await carRentalApi.autocompleteLocations(trimmed, countryCode);
        if (!live || sequence !== requestSequence.current) return;
        const items = response?.success && Array.isArray(response.data) ? response.data : [];
        setOptions(items);
        setIsOpen(items.length > 0);
      } catch (error) {
        if (live && sequence === requestSequence.current) {
          setOptions([]);
          setIsOpen(false);
        }
      } finally {
        if (live && sequence === requestSequence.current) setLoading(false);
      }
    }, 450);

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [searchTerm, countryCode]);

  const handleSelect = (item) => {
    const labelValue = item.label || item.name || '';
    setQuery(labelValue);
    setSearchTerm('');
    setOptions([]);
    setIsOpen(false);

    if (onChange) {
      onChange(labelValue, {
        id: String(item.id),
        provider: item.provider || 'parse-enterprise',
        supplier: item.supplier || 'Enterprise',
        type: item.type || 'branch',
        code: item.code || null,
        airport: item.airport || item.code || null,
        airportCode: item.airportCode || item.code || null,
        label: labelValue,
        name: item.name || labelValue,
        address: item.address || '',
        city: item.city || '',
        state: item.state || '',
        country: item.country || '',
        phone: item.phone || null,
        afterHoursReturn: Boolean(item.afterHoursReturn)
      });
    }
  };

  const handleInputChange = (event) => {
    const valueText = event.target.value;
    setQuery(valueText);
    setSearchTerm(valueText);
    setIsOpen(false);
    // Typed text alone is not a valid Enterprise branch selection.
    if (onChange) onChange(valueText, null);
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
          onFocus={() => options.length > 0 && setIsOpen(true)}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={isOpen}
        />
        {loading && <i className="fas fa-spinner fa-spin car-location-spinner" aria-label="Searching locations" />}
      </div>

      {searchTerm.trim().length > 0 && searchTerm.trim().length < 3 && (
        <div className="car-location-hint">Type at least 3 characters to search Enterprise locations.</div>
      )}

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
                <span className="car-location-title">{item.label || item.name}</span>
                <span className="car-location-subtitle">
                  {item.type === 'airport' && item.code ? `Airport (${item.code})` : 'Enterprise location'}
                  {item.address ? ` • ${item.address}` : ''}
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
