import React, { useEffect, useMemo, useRef, useState } from 'react';
import { airportAPI } from '../../../shared/api/api';
import { buildAirportSelection, normalizeIataCode } from '../utils/airportIdentity';
import './AirportAutocomplete.css';

export function formatAirportLabel(airport) {
  if (!airport) return '';

  if (typeof airport === 'string') {
    const text = airport.trim();
    const code = normalizeIataCode(text);
    const clean = text.replace(/\s*\([A-Z]{3}\)\s*$/i, '').trim();
    return clean && code ? `${clean} (${code})` : (clean || code || text);
  }

  const code = normalizeIataCode(airport);
  let city = String(airport.city || airport.municipality || airport.name || '').trim();
  if (code) {
    city = city.replace(/\([^)]*\)/g, '').replace(new RegExp(`\\b${code}\\b`, 'gi'), '').trim();
  }

  if (city && code) return `${city} (${code})`;
  return city || code || '';
}

export function isResolvedAirport(value) {
  return Boolean(normalizeIataCode(value)) && value?.unresolved !== true;
}

const LOCAL_FALLBACK_AIRPORTS = [
  { code: 'JFK', name: 'John F. Kennedy International Airport', city: 'New York', state: 'NY', country: 'United States' },
  { code: 'LGA', name: 'LaGuardia Airport', city: 'New York', state: 'NY', country: 'United States' },
  { code: 'EWR', name: 'Newark Liberty International Airport', city: 'Newark', state: 'NJ', country: 'United States' },
  { code: 'GEG', name: 'Spokane International Airport', city: 'Spokane', state: 'WA', country: 'United States' },
  { code: 'TPA', name: 'Tampa International Airport', city: 'Tampa', state: 'FL', country: 'United States' },
  { code: 'LAX', name: 'Los Angeles International Airport', city: 'Los Angeles', state: 'CA', country: 'United States' },
  { code: 'BUR', name: 'Hollywood Burbank Airport', city: 'Los Angeles', state: 'CA', country: 'United States' },
  { code: 'SNA', name: 'John Wayne Airport', city: 'Orange County', state: 'CA', country: 'United States' },
  { code: 'SFO', name: 'San Francisco International Airport', city: 'San Francisco', state: 'CA', country: 'United States' },
  { code: 'SEA', name: 'Seattle-Tacoma International Airport', city: 'Seattle', state: 'WA', country: 'United States' },
  { code: 'ORD', name: "O'Hare International Airport", city: 'Chicago', state: 'IL', country: 'United States' },
  { code: 'MDW', name: 'Chicago Midway International Airport', city: 'Chicago', state: 'IL', country: 'United States' },
  { code: 'ATL', name: 'Hartsfield-Jackson Atlanta International Airport', city: 'Atlanta', state: 'GA', country: 'United States' },
  { code: 'MIA', name: 'Miami International Airport', city: 'Miami', state: 'FL', country: 'United States' },
  { code: 'FLL', name: 'Fort Lauderdale-Hollywood International Airport', city: 'Fort Lauderdale', state: 'FL', country: 'United States' },
  { code: 'MCO', name: 'Orlando International Airport', city: 'Orlando', state: 'FL', country: 'United States' },
  { code: 'DFW', name: 'Dallas/Fort Worth International Airport', city: 'Dallas/Fort Worth', state: 'TX', country: 'United States' },
  { code: 'DAL', name: 'Dallas Love Field', city: 'Dallas', state: 'TX', country: 'United States' },
  { code: 'DEN', name: 'Denver International Airport', city: 'Denver', state: 'CO', country: 'United States' },
  { code: 'BOS', name: 'Logan International Airport', city: 'Boston', state: 'MA', country: 'United States' },
  { code: 'IAD', name: 'Washington Dulles International Airport', city: 'Washington', state: 'DC', country: 'United States' },
  { code: 'DCA', name: 'Ronald Reagan Washington National Airport', city: 'Washington', state: 'DC', country: 'United States' },
  { code: 'BWI', name: 'Baltimore/Washington International Thurgood Marshall Airport', city: 'Baltimore/Washington', state: 'MD', country: 'United States' },
  { code: 'IAH', name: 'George Bush Intercontinental Airport', city: 'Houston', state: 'TX', country: 'United States' },
  { code: 'HOU', name: 'William P. Hobby Airport', city: 'Houston', state: 'TX', country: 'United States' },
  { code: 'LHR', name: 'London Heathrow Airport', city: 'London', country: 'United Kingdom' },
  { code: 'LGW', name: 'London Gatwick Airport', city: 'London', country: 'United Kingdom' },
  { code: 'LCY', name: 'London City Airport', city: 'London', country: 'United Kingdom' },
  { code: 'STN', name: 'London Stansted Airport', city: 'London', country: 'United Kingdom' },
  { code: 'CDG', name: 'Paris Charles de Gaulle Airport', city: 'Paris', country: 'France' },
  { code: 'ORY', name: 'Paris Orly Airport', city: 'Paris', country: 'France' },
  { code: 'FCO', name: 'Leonardo da Vinci–Fiumicino Airport', city: 'Rome', country: 'Italy' },
  { code: 'CIA', name: 'Giovan Battista Pastine International Airport', city: 'Rome', country: 'Italy' },
  { code: 'MXP', name: 'Milan Malpensa Airport', city: 'Milan', country: 'Italy' },
  { code: 'LIN', name: 'Milan Linate Airport', city: 'Milan', country: 'Italy' },
  { code: 'DXB', name: 'Dubai International Airport', city: 'Dubai', country: 'United Arab Emirates' },
  { code: 'HND', name: 'Tokyo Haneda Airport', city: 'Tokyo', country: 'Japan' },
  { code: 'NRT', name: 'Tokyo Narita Airport', city: 'Tokyo', country: 'Japan' },
  { code: 'SYD', name: 'Sydney Kingsford Smith Airport', city: 'Sydney', country: 'Australia' },
];

function scoreAirportMatch(airport, queryStr) {
  const q = String(queryStr || '').trim().toLowerCase();
  if (!q) return 0;
  const code = normalizeIataCode(airport);
  if (!code) return 0;

  const city = String(airport.city || airport.municipality || '').toLowerCase();
  const name = String(airport.name || '').toLowerCase();
  const state = String(airport.state || '').toLowerCase();
  const country = String(airport.country || '').toLowerCase();
  const qUpper = q.toUpperCase();

  if (code === qUpper) return 12000;
  if (code.startsWith(qUpper)) return 9500;
  if (city === q) return 8000;
  if (city.startsWith(q)) return 6500;
  if (city.includes(q)) return 5200;
  if (name === q) return 4700;
  if (name.startsWith(q)) return 4000;
  if (name.includes(q)) return 3000;
  if (state.includes(q)) return 1000;
  if (country.includes(q)) return 700;
  return 0;
}

function rankAirportSuggestions(airports, queryStr) {
  return (Array.isArray(airports) ? airports : [])
    .filter((airport) => normalizeIataCode(airport))
    .map((airport) => ({ airport, score: scoreAirportMatch(airport, queryStr) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || normalizeIataCode(a.airport).localeCompare(normalizeIataCode(b.airport)))
    .map(({ airport }) => airport);
}

export function groupAirportSuggestionsByCity(airports = []) {
  const groups = new Map();
  airports.forEach((airport) => {
    const code = normalizeIataCode(airport);
    if (!code) return;
    const city = String(airport.city || airport.municipality || airport.name || code).trim();
    const country = String(airport.country || '').trim();
    const state = String(airport.state || '').trim();
    const key = `${city.toLowerCase()}|${state.toLowerCase()}|${country.toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, { city, state, country, airports: [] });
    groups.get(key).airports.push({ ...airport, code });
  });
  return [...groups.values()];
}

function AirportAutocomplete({ label, id, value, onChange, placeholder, excludeCode, required = false }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef(null);
  const debounceTimer = useRef(null);
  const requestSerial = useRef(0);

  useEffect(() => {
    setQuery(value ? formatAirportLabel(value) : '');
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) setShowSuggestions(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    requestSerial.current += 1;
  }, []);

  // The homepage used to keep an old IATA validation warning visible even after
  // both airport fields had been corrected. Keep that message in sync with the
  // actual resolved field state without suppressing any other form error.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const form = containerRef.current?.closest('form');
      if (!form) return;
      const airportFields = [...form.querySelectorAll('.airport-autocomplete-container[data-airport-resolved]')];
      if (airportFields.length < 2) return;
      const allResolved = airportFields.every((field) => field.dataset.airportResolved === 'true');
      form.querySelectorAll('.inquiry-form__message--error').forEach((node) => {
        if (/valid 3-letter IATA airport codes/i.test(node.textContent || '')) {
          node.hidden = allResolved;
        }
      });
    });
    return () => cancelAnimationFrame(frame);
  });

  const excluded = normalizeIataCode(excludeCode);
  const groupedSuggestions = useMemo(() => groupAirportSuggestionsByCity(suggestions), [suggestions]);
  const flatSelectableSuggestions = useMemo(
    () => groupedSuggestions.flatMap((group) => group.airports),
    [groupedSuggestions]
  );

  const fetchSuggestions = async (searchVal) => {
    const trimmed = String(searchVal || '').trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setErrorMsg('');
      return;
    }

    const serial = ++requestSerial.current;
    setLoading(true);
    setErrorMsg('');

    try {
      const response = await airportAPI.search(trimmed);
      if (serial !== requestSerial.current) return;

      const apiList = response?.success && Array.isArray(response.data) ? response.data : [];
      const validApiList = apiList.filter((item) => normalizeIataCode(item) && normalizeIataCode(item) !== excluded);
      const localList = LOCAL_FALLBACK_AIRPORTS.filter((item) => normalizeIataCode(item) !== excluded);
      const merged = new Map();

      [...localList, ...validApiList].forEach((item) => {
        const code = normalizeIataCode(item);
        if (!code) return;
        const existing = merged.get(code) || {};
        merged.set(code, { ...existing, ...item, code });
      });

      const ranked = rankAirportSuggestions([...merged.values()], trimmed).slice(0, 12);
      setSuggestions(ranked);
      if (ranked.length === 0 && !normalizeIataCode(trimmed)) {
        setErrorMsg('No matching airport found. Try a city, airport name, or exact 3-letter airport code.');
      }
    } catch {
      if (serial !== requestSerial.current) return;
      const ranked = rankAirportSuggestions(LOCAL_FALLBACK_AIRPORTS, trimmed)
        .filter((item) => normalizeIataCode(item) !== excluded)
        .slice(0, 12);
      setSuggestions(ranked);
      if (ranked.length === 0 && !normalizeIataCode(trimmed)) {
        setErrorMsg('Airport suggestions are temporarily unavailable. Try an exact 3-letter airport code.');
      }
    } finally {
      if (serial === requestSerial.current) {
        setLoading(false);
        setActiveIndex(-1);
      }
    }
  };

  const emitSelection = (selection) => {
    if (typeof onChange === 'function') onChange(selection, selection);
  };

  const handleInputChange = (event) => {
    const val = event.target.value;
    setQuery(val);
    setShowSuggestions(true);
    setErrorMsg('');

    const exactLocal = LOCAL_FALLBACK_AIRPORTS.find((airport) => normalizeIataCode(airport) === val.trim().toUpperCase());
    const nextSelection = buildAirportSelection(val, exactLocal || null);
    emitSelection(nextSelection);

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => fetchSuggestions(val), 220);
  };

  const handleSelectSuggestion = (suggestion) => {
    const code = normalizeIataCode(suggestion);
    if (!code) return;
    const canonical = {
      ...suggestion,
      code,
      city: suggestion.city || suggestion.municipality || suggestion.name || code,
      name: suggestion.name || suggestion.city || suggestion.municipality || code,
      unresolved: false,
    };
    setQuery(formatAirportLabel(canonical));
    emitSelection(canonical);
    setSuggestions([]);
    setShowSuggestions(false);
    setErrorMsg('');
    setActiveIndex(-1);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      setShowSuggestions(false);
      return;
    }

    if (!showSuggestions) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % Math.max(flatSelectableSuggestions.length, 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + Math.max(flatSelectableSuggestions.length, 1)) % Math.max(flatSelectableSuggestions.length, 1));
    } else if (event.key === 'Enter' && flatSelectableSuggestions.length > 0) {
      event.preventDefault();
      handleSelectSuggestion(flatSelectableSuggestions[activeIndex >= 0 ? activeIndex : 0]);
    }
  };

  let selectableIndex = -1;

  return (
    <div
      className="airport-autocomplete-container"
      ref={containerRef}
      data-airport-resolved={isResolvedAirport(value) ? 'true' : 'false'}
    >
      {label && <label htmlFor={id} className="autocomplete-label">{label}</label>}
      <div className="autocomplete-input-wrapper">
        <i className="fas fa-plane-departure input-icon" aria-hidden="true" />
        <input
          type="text"
          id={id}
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            setShowSuggestions(true);
            if (query.trim().length >= 2) fetchSuggestions(query);
          }}
          placeholder={placeholder || 'City, airport name, or code'}
          required={required}
          autoComplete="off"
          className="autocomplete-input"
          aria-autocomplete="list"
          aria-expanded={showSuggestions}
          aria-describedby={`${id}-search-help`}
        />
        {loading && <i className="fas fa-circle-notch fa-spin input-loading-icon" />}
      </div>
      <span id={`${id}-search-help`} className="airport-search-help">Search by city, airport name, or 3-letter code</span>

      {showSuggestions && (groupedSuggestions.length > 0 || errorMsg) && (
        <div className="autocomplete-suggestions-list" role="listbox" aria-label="Airport suggestions">
          {errorMsg && (
            <div className="suggestion-error-banner" role="status">
              <i className="fas fa-exclamation-triangle" /> <span>{errorMsg}</span>
            </div>
          )}

          {groupedSuggestions.map((group) => (
            <section className="airport-suggestion-group" key={`${group.city}-${group.state}-${group.country}`}>
              <div className="airport-suggestion-city" aria-hidden="true">
                <span className="airport-suggestion-city__icon"><i className="fas fa-map-marker-alt" /></span>
                <span>
                  <strong>{group.city}</strong>
                  <small>{[group.state, group.country].filter(Boolean).join(', ')}</small>
                </span>
              </div>
              <div className="airport-suggestion-airports">
                {group.airports.map((item) => {
                  selectableIndex += 1;
                  const index = selectableIndex;
                  const code = normalizeIataCode(item);
                  return (
                    <button
                      key={code}
                      type="button"
                      role="option"
                      aria-selected={index === activeIndex}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => handleSelectSuggestion(item)}
                      className={`suggestion-item ${index === activeIndex ? 'active' : ''}`}
                    >
                      <div className="suggestion-icon"><i className="fas fa-plane" /></div>
                      <div className="suggestion-details">
                        <span className="suggestion-name">{item.name || group.city}</span>
                        <span className="suggestion-location">
                          <strong>{code}</strong>{item.state ? ` · ${item.state}` : ''}{item.country ? ` · ${item.country}` : ''}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export default AirportAutocomplete;
