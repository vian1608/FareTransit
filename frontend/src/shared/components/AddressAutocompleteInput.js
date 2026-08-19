import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import './AddressAutocompleteInput.css';

const API_BASE = process.env.REACT_APP_API_URL || '/api';

function normalizePhotonFeatures(features = [], query = '') {
  return features.map((feat) => {
    const props = feat.properties || {};
    const house = props.housenumber || '';
    const street = props.street || props.name || '';
    const line1 = [house, street].filter(Boolean).join(' ') || props.name || query;
    const city = props.city || props.town || props.village || props.county || '';
    const state = props.state || props.state_code || '';
    const postalCode = props.postcode || '';
    const country = props.country || '';
    const formatted = [line1, city, state, postalCode, country].filter(Boolean).join(', ');
    return { addressLine1: line1, addressLine2: '', city, state, postalCode, country, formatted };
  });
}

function AddressAutocompleteInput({
  id = 'billingAddress',
  value = '',
  onChange,
  onSelectSuggestion,
  placeholder = 'Start typing an address…',
  required = false,
  disabled = false,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [manualMode, setManualMode] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const containerRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const requestSequenceRef = useRef(0);
  const abortRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (abortRef.current) abortRef.current.abort();
  }, []);

  const fetchSuggestions = useCallback(async (query) => {
    const trimmed = String(query || '').trim();
    if (trimmed.length < 3 || manualMode) {
      setSuggestions([]);
      setIsOpen(false);
      setLoading(false);
      return;
    }

    const sequence = ++requestSequenceRef.current;
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = typeof AbortController !== 'undefined' ? new AbortController() : null;

    setLoading(true);
    setErrorMsg('');

    try {
      const res = await axios.get(`${API_BASE}/address-autocomplete`, {
        params: { q: trimmed },
        timeout: 4500,
        signal: abortRef.current?.signal,
      });

      if (sequence !== requestSequenceRef.current) return;
      const next = res.data?.success && Array.isArray(res.data.suggestions)
        ? res.data.suggestions.slice(0, 6)
        : [];
      setSuggestions(next);
      setIsOpen(next.length > 0);
      setActiveIdx(-1);
    } catch (err) {
      if (sequence !== requestSequenceRef.current || err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return;

      // Last-resort public geocoder keeps typing assistance available when the proxy is temporarily unavailable.
      try {
        const fallbackRes = await axios.get('https://photon.komoot.io/api/', {
          params: { q: trimmed, limit: 6, lang: 'en' },
          timeout: 4000,
          signal: abortRef.current?.signal,
        });
        if (sequence !== requestSequenceRef.current) return;
        const mapped = normalizePhotonFeatures(fallbackRes.data?.features || [], trimmed);
        setSuggestions(mapped);
        setIsOpen(mapped.length > 0);
        setActiveIdx(-1);
      } catch (fallbackErr) {
        if (sequence !== requestSequenceRef.current || fallbackErr?.code === 'ERR_CANCELED' || fallbackErr?.name === 'CanceledError') return;
        setSuggestions([]);
        setIsOpen(false);
        setErrorMsg('Address suggestions are temporarily unavailable. You can still enter the address manually.');
      }
    } finally {
      if (sequence === requestSequenceRef.current) setLoading(false);
    }
  }, [manualMode]);

  const handleInputChange = (event) => {
    const nextValue = event.target.value;
    onChange(nextValue);
    setErrorMsg('');

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    if (nextValue.trim().length >= 3 && !manualMode) {
      debounceTimerRef.current = setTimeout(() => fetchSuggestions(nextValue), 260);
    } else {
      requestSequenceRef.current += 1;
      if (abortRef.current) abortRef.current.abort();
      setSuggestions([]);
      setIsOpen(false);
      setLoading(false);
    }
  };

  const handleSelect = (item) => {
    if (onSelectSuggestion) onSelectSuggestion(item);
    else onChange(item.addressLine1);
    setIsOpen(false);
    setSuggestions([]);
    setActiveIdx(-1);
    setErrorMsg('');
  };

  const handleKeyDown = (event) => {
    if (!isOpen || suggestions.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIdx(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIdx(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (event.key === 'Enter' && activeIdx >= 0 && activeIdx < suggestions.length) {
      event.preventDefault();
      handleSelect(suggestions[activeIdx]);
    } else if (event.key === 'Escape') {
      setIsOpen(false);
      setActiveIdx(-1);
    }
  };

  const toggleManualMode = () => {
    setManualMode(prev => !prev);
    requestSequenceRef.current += 1;
    if (abortRef.current) abortRef.current.abort();
    setIsOpen(false);
    setSuggestions([]);
    setLoading(false);
    setErrorMsg('');
  };

  return (
    <div className={`address-autocomplete-container ${isOpen ? 'address-autocomplete-container--open' : ''}`} ref={containerRef}>
      <div className="address-input-wrapper">
        <input
          type="text"
          id={id}
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0 && !manualMode) setIsOpen(true);
          }}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          autoComplete="off"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-busy={loading}
          aria-controls={`${id}-suggestions`}
          aria-activedescendant={activeIdx >= 0 ? `${id}-opt-${activeIdx}` : undefined}
          className="address-autocomplete-input"
        />
        <span className={`address-input-icon ${loading ? 'address-input-icon--loading' : ''}`} aria-hidden="true">
          <i className={loading ? 'fas fa-circle-notch fa-spin' : 'fas fa-location-dot'}></i>
        </span>
      </div>

      <div className="address-autocomplete-controls">
        <span className="address-autocomplete-hint">{manualMode ? 'Manual address entry' : 'Suggestions appear after 3 characters'}</span>
        <button type="button" onClick={toggleManualMode} className="btn-manual-toggle" aria-pressed={manualMode}>
          <i className={manualMode ? 'fas fa-wand-magic-sparkles' : 'fas fa-pen'}></i>
          {manualMode ? 'Use suggestions' : 'Manual entry'}
        </button>
      </div>

      {errorMsg && <p className="address-fallback-warning" role="alert"><i className="fas fa-circle-info"></i> {errorMsg}</p>}

      {isOpen && suggestions.length > 0 && (
        <ul id={`${id}-suggestions`} className="address-suggestions-dropdown" role="listbox" aria-label="Address suggestions">
          {suggestions.map((item, idx) => (
            <li
              key={`${item.formatted}-${idx}`}
              id={`${id}-opt-${idx}`}
              role="option"
              aria-selected={activeIdx === idx}
              className={`suggestion-item ${activeIdx === idx ? 'suggestion-item--active' : ''}`}
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setActiveIdx(idx)}
            >
              <span className="suggestion-icon" aria-hidden="true"><i className="fas fa-location-dot"></i></span>
              <span className="suggestion-text-block">
                <span className="suggestion-line1">{item.addressLine1}</span>
                <span className="suggestion-details">{item.formatted}</span>
              </span>
              <span className="suggestion-use" aria-hidden="true">↵</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default AddressAutocompleteInput;
