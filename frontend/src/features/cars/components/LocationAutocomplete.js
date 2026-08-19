import React, { useState, useEffect, useRef } from 'react';
import { carAPI } from '../../../shared/api/api';
import './LocationAutocomplete.css';

/**
 * Car Rental Location Autocomplete
 * Supports Airports (3-letter IATA), Cities (Booking.com city ID), and Coordinates.
 */
function LocationAutocomplete({
  label,
  id,
  value,
  onChange,
  placeholder = 'City, airport, or region...',
  required = false,
  disabled = false
}) {
  const [query, setQuery] = useState(typeof value === 'string' ? value : (value?.label || ''));
  // Search term is intentionally separate from the displayed value. This keeps
  // the default JFK value, parent-driven values, and selected suggestions from
  // automatically triggering autocomplete and reopening the dropdown.
  const [searchTerm, setSearchTerm] = useState('');
  const [options, setOptions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (typeof value === 'string') {
      setQuery(value);
    } else if (value && value.label) {
      setQuery(value.label);
    }
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced API search (300ms). Only explicit user typing updates searchTerm,
  // so the prefilled JFK airport no longer opens suggestions on page load.
  useEffect(() => {
    const trimmed = searchTerm.trim();
    if (!trimmed || trimmed.length < 2) {
      setOptions([]);
      setLoading(false);
      return;
    }

    let live = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await carAPI.autocompleteLocations(trimmed);
        if (!live) return;
        if (res && res.success && Array.isArray(res.data)) {
          setOptions(res.data);
          setIsOpen(res.data.length > 0);
        } else {
          setOptions([]);
          setIsOpen(false);
        }
      } catch (err) {
        if (live) {
          setOptions([]);
          setIsOpen(false);
          console.warn('Location autocomplete notice:', err.message);
        }
      } finally {
        if (live) setLoading(false);
      }
    }, 300);

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [searchTerm]);

  const handleSelect = (item) => {
    setQuery(item.label);
    setSearchTerm('');
    setOptions([]);
    setIsOpen(false);

    let structuredObj = null;
    if (item.type === 'airport' || item.code) {
      structuredObj = {
        type: 'airport',
        airport: (item.code || item.airport || '').toUpperCase(),
        label: item.label
      };
    } else if (item.type === 'city' || item.city_id) {
      structuredObj = {
        type: 'city',
        city: parseInt(item.city_id || item.city, 10),
        label: item.label
      };
    } else {
      structuredObj = {
        type: 'airport',
        airport: item.label.substring(0, 3).toUpperCase(),
        label: item.label
      };
    }

    if (onChange) {
      onChange(item.label, structuredObj);
    }
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    setSearchTerm(val);
    setIsOpen(false);

    // If typed value is a 3-letter IATA code, format structured object immediately
    const cleanIata = val.trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(cleanIata)) {
      if (onChange) {
        onChange(val, { type: 'airport', airport: cleanIata, label: `${cleanIata} Airport` });
      }
    } else if (onChange) {
      onChange(val, { type: 'airport', airport: cleanIata.substring(0, 3), label: val });
    }
  };

  const handleFocus = () => {
    // Reopen only suggestions that came from the user's current typed search.
    if (searchTerm.trim().length >= 2 && options.length > 0) {
      setIsOpen(true);
    }
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
        />
        {loading && <i className="fas fa-spinner fa-spin car-location-spinner" />}
      </div>

      {isOpen && options.length > 0 && (
        <ul className="car-location-dropdown">
          {options.map((item, idx) => (
            <li
              key={idx}
              className="car-location-item"
              onClick={() => handleSelect(item)}
            >
              <i className={item.type === 'city' ? 'fas fa-city' : 'fas fa-plane-arrival'} />
              <div className="car-location-item-text">
                <span className="car-location-title">{item.label}</span>
                <span className="car-location-subtitle">
                  {item.type === 'airport' ? `Airport (${item.code})` : 'City Location'}
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
