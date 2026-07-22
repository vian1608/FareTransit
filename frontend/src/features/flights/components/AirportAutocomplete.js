import React, { useState, useEffect, useRef } from 'react';
import { airportAPI } from '../../../shared/api/api';
import './AirportAutocomplete.css';

const LOCAL_FALLBACK_AIRPORTS = [
  { code: 'ATL', name: 'Hartsfield-Jackson Atlanta International Airport', city: 'Atlanta', state: 'GA', country: 'United States' },
  { code: 'AUS', name: 'Austin-Bergstrom International Airport', city: 'Austin', state: 'TX', country: 'United States' },
  { code: 'BWI', name: 'Baltimore/Washington International Airport', city: 'Baltimore', state: 'MD', country: 'United States' },
  { code: 'BOS', name: 'Logan International Airport', city: 'Boston', state: 'MA', country: 'United States' },
  { code: 'CLT', name: 'Charlotte Douglas International Airport', city: 'Charlotte', state: 'NC', country: 'United States' },
  { code: 'ORD', name: 'O\'Hare International Airport', city: 'Chicago', state: 'IL', country: 'United States' },
  { code: 'MDW', name: 'Midway International Airport', city: 'Chicago', state: 'IL', country: 'United States' },
  { code: 'CVG', name: 'Cincinnati/Northern Kentucky International Airport', city: 'Cincinnati', state: 'OH', country: 'United States' },
  { code: 'CLE', name: 'Cleveland Hopkins International Airport', city: 'Cleveland', state: 'OH', country: 'United States' },
  { code: 'CMH', name: 'John Glenn Columbus International Airport', city: 'Columbus', state: 'OH', country: 'United States' },
  { code: 'DFW', name: 'Dallas/Fort Worth International Airport', city: 'Dallas/Fort Worth', state: 'TX', country: 'United States' },
  { code: 'DAL', name: 'Dallas Love Field', city: 'Dallas', state: 'TX', country: 'United States' },
  { code: 'DEN', name: 'Denver International Airport', city: 'Denver', state: 'CO', country: 'United States' },
  { code: 'DTW', name: 'Detroit Metro Wayne County Airport', city: 'Detroit', state: 'MI', country: 'United States' },
  { code: 'FLL', name: 'Fort Lauderdale-Hollywood International Airport', city: 'Fort Lauderdale', state: 'FL', country: 'United States' },
  { code: 'RSW', name: 'Southwest Florida International Airport', city: 'Fort Myers', state: 'FL', country: 'United States' },
  { code: 'HNL', name: 'Daniel K. Inouye International Airport', city: 'Honolulu', state: 'HI', country: 'United States' },
  { code: 'IAH', name: 'George Bush Intercontinental Airport', city: 'Houston', state: 'TX', country: 'United States' },
  { code: 'HOU', name: 'William P. Hobby Airport', city: 'Houston', state: 'TX', country: 'United States' },
  { code: 'IND', name: 'Indianapolis International Airport', city: 'Indianapolis', state: 'IN', country: 'United States' },
  { code: 'JAX', name: 'Jacksonville International Airport', city: 'Jacksonville', state: 'FL', country: 'United States' },
  { code: 'MCI', name: 'Kansas City International Airport', city: 'Kansas City', state: 'MO', country: 'United States' },
  { code: 'LAS', name: 'Harry Reid International Airport', city: 'Las Vegas', state: 'NV', country: 'United States' },
  { code: 'LAX', name: 'Los Angeles International Airport', city: 'Los Angeles', state: 'CA', country: 'United States' },
  { code: 'SNA', name: 'John Wayne Airport', city: 'Orange County', state: 'CA', country: 'United States' },
  { code: 'SDF', name: 'Louisville Muhammad Ali International Airport', city: 'Louisville', state: 'KY', country: 'United States' },
  { code: 'MEM', name: 'Memphis International Airport', city: 'Memphis', state: 'TN', country: 'United States' },
  { code: 'MIA', name: 'Miami International Airport', city: 'Miami', state: 'FL', country: 'United States' },
  { code: 'MKE', name: 'Milwaukee Mitchell International Airport', city: 'Milwaukee', state: 'WI', country: 'United States' },
  { code: 'MSP', name: 'Minneapolis-Saint Paul International Airport', city: 'Minneapolis/St. Paul', state: 'MN', country: 'United States' },
  { code: 'BNA', name: 'Nashville International Airport', city: 'Nashville', state: 'TN', country: 'United States' },
  { code: 'MSY', name: 'Louis Armstrong New Orleans International Airport', city: 'New Orleans', state: 'LA', country: 'United States' },
  { code: 'JFK', name: 'John F. Kennedy International Airport', city: 'New York', state: 'NY', country: 'United States' },
  { code: 'LGA', name: 'LaGuardia Airport', city: 'New York', state: 'NY', country: 'United States' },
  { code: 'EWR', name: 'Newark Liberty International Airport', city: 'Newark', state: 'NJ', country: 'United States' },
  { code: 'OAK', name: 'San Francisco Bay Oakland International Airport', city: 'Oakland', state: 'CA', country: 'United States' },
  { code: 'MCO', name: 'Orlando International Airport', city: 'Orlando', state: 'FL', country: 'United States' },
  { code: 'PHL', name: 'Philadelphia International Airport', city: 'Philadelphia', state: 'PA', country: 'United States' },
  { code: 'PHX', name: 'Phoenix Sky Harbor International Airport', city: 'Phoenix', state: 'AZ', country: 'United States' },
  { code: 'PIT', name: 'Pittsburgh International Airport', city: 'Pittsburgh', state: 'PA', country: 'United States' },
  { code: 'PDX', name: 'Portland International Airport', city: 'Portland', state: 'OR', country: 'United States' },
  { code: 'RDU', name: 'Raleigh-Durham International Airport', city: 'Raleigh/Durham', state: 'NC', country: 'United States' },
  { code: 'RIC', name: 'Richmond International Airport', city: 'Richmond', state: 'VA', country: 'United States' },
  { code: 'SMF', name: 'Sacramento International Airport', city: 'Sacramento', state: 'CA', country: 'United States' },
  { code: 'SLC', name: 'Salt Lake City International Airport', city: 'Salt Lake City', state: 'UT', country: 'United States' },
  { code: 'SAN', name: 'San Diego International Airport', city: 'San Diego', state: 'CA', country: 'United States' },
  { code: 'SFO', name: 'San Francisco International Airport', city: 'San Francisco', state: 'CA', country: 'United States' },
  { code: 'SJC', name: 'San Jose Mineta International Airport', city: 'San Jose', state: 'CA', country: 'United States' },
  { code: 'SEA', name: 'Seattle-Tacoma International Airport', city: 'Seattle', state: 'WA', country: 'United States' },
  { code: 'STL', name: 'St. Louis Lambert International Airport', city: 'St. Louis', state: 'MO', country: 'United States' },
  { code: 'TPA', name: 'Tampa International Airport', city: 'Tampa', state: 'FL', country: 'United States' },
  { code: 'DCA', name: 'Ronald Reagan Washington National Airport', city: 'Washington', state: 'DC', country: 'United States' },
  { code: 'IAD', name: 'Washington Dulles International Airport', city: 'Washington', state: 'DC', country: 'United States' },
  { code: 'YYZ', name: 'Toronto Pearson International Airport', city: 'Toronto', state: 'ON', country: 'Canada' },
  { code: 'YVR', name: 'Vancouver International Airport', city: 'Vancouver', state: 'BC', country: 'Canada' },
  { code: 'YUL', name: 'Montréal-Trudeau International Airport', city: 'Montreal', state: 'QC', country: 'Canada' },
  { code: 'YYC', name: 'Calgary International Airport', city: 'Calgary', state: 'AB', country: 'Canada' }
];

function AirportAutocomplete({ label, id, value, onChange, placeholder, excludeCode, required = false }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef(null);
  const debounceTimer = useRef(null);

  // Sync display query with external value (e.g. from parent/sessionStorage)
  useEffect(() => {
    if (value) {
      setQuery(value);
    } else {
      setQuery('');
    }
  }, [value]);

  // Handle click outside to close suggestions
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchLocalFallback = (searchVal) => {
    const q = searchVal.toLowerCase().trim();
    if (!q) return [];
    return LOCAL_FALLBACK_AIRPORTS.filter(airport => 
      airport.code.toLowerCase().includes(q) ||
      airport.name.toLowerCase().includes(q) ||
      airport.city.toLowerCase().includes(q) ||
      airport.country.toLowerCase().includes(q)
    );
  };

  // Fetch suggestions with debounce
  const fetchSuggestions = (searchVal) => {
    const trimmedVal = (searchVal || '').trim();
    if (!trimmedVal || trimmedVal.length < 2) {
      setSuggestions([]);
      setErrorMsg('');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    
    airportAPI.search(trimmedVal)
      .then(response => {
        if (response && response.success) {
          const list = response.data || [];
          const filtered = list.filter(item => item.code !== excludeCode);
          setSuggestions(filtered);
          setErrorMsg('');
        } else {
          // If response not success, trigger catch block
          throw new Error('API returned unsuccessful response');
        }
      })
      .catch(err => {
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to fetch airport suggestions from API:', err);
        }
        
        // Use local fallback
        const localList = searchLocalFallback(trimmedVal);
        const filteredLocal = localList.filter(item => item.code !== excludeCode);
        setSuggestions(filteredLocal);

        // Show a helpful warning/error message without breaking the dropdown
        setErrorMsg('Unable to reach flight servers. Using offline fallback.');
      })
      .finally(() => {
        setLoading(false);
        setActiveIndex(-1);
      });
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    onChange(val, null); // Clear parent object representation until fully selected
    setShowSuggestions(true);

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      fetchSuggestions(val);
    }, 250);
  };

  const handleSelectSuggestion = (suggestion) => {
    const selectedText = `${suggestion.city} (${suggestion.code})`;
    setQuery(selectedText);
    onChange(selectedText, suggestion);
    setShowSuggestions(false);
    setErrorMsg('');
  };

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (!showSuggestions) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setShowSuggestions(true);
      }
      return;
    }

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        setShowSuggestions(false);
        break;
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(prev => (prev + 1) % (suggestions.length || 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(prev => (prev - 1 + (suggestions.length || 1)) % (suggestions.length || 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < suggestions.length) {
          handleSelectSuggestion(suggestions[activeIndex]);
        } else if (suggestions.length > 0) {
          handleSelectSuggestion(suggestions[0]);
        }
        break;
      case 'Tab':
        setShowSuggestions(false);
        break;
      default:
        break;
    }
  };

  // Helper to highlight matching characters
  const highlightMatch = (text, queryText) => {
    if (!text || !queryText) return text;
    const cleanQuery = queryText.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const parts = text.split(new RegExp(`(${cleanQuery})`, 'gi'));
    return parts.map((part, index) => 
      part.toLowerCase() === queryText.toLowerCase() 
        ? <strong key={index} className="autocomplete-highlight">{part}</strong> 
        : part
    );
  };

  const hasSuggestions = suggestions.length > 0;
  const showEmptyMessage = showSuggestions && !loading && query.trim().length >= 2 && !hasSuggestions && !errorMsg;

  return (
    <div className="airport-autocomplete-container" ref={containerRef}>
      <label htmlFor={id} className="autocomplete-label">{label}</label>
      <div className="autocomplete-input-wrapper">
        <i className="fas fa-plane-departure input-icon"></i>
        <input
          type="text"
          id={id}
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowSuggestions(true)}
          placeholder={placeholder}
          required={required}
          autoComplete="off"
          className="autocomplete-input"
        />
        {loading && <i className="fas fa-circle-notch fa-spin input-loading-icon"></i>}
      </div>

      {showSuggestions && (hasSuggestions || showEmptyMessage || errorMsg) && (
        <ul className="autocomplete-suggestions-list" role="listbox">
          {errorMsg && (
            <li className="suggestion-error-banner">
              <i className="fas fa-exclamation-triangle"></i>
              <span>{errorMsg}</span>
            </li>
          )}
          
          {hasSuggestions ? (
            suggestions.map((item, idx) => {
              const isActive = idx === activeIndex;
              return (
                <li 
                  key={item.code} 
                  id={`${id}-suggestion-${idx}`}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => handleSelectSuggestion(item)}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={`suggestion-item ${isActive ? 'active' : ''}`}
                >
                  <div className="suggestion-icon">
                    <i className="fas fa-plane"></i>
                  </div>
                  <div className="suggestion-details">
                    <span className="suggestion-name">{highlightMatch(item.name, query)}</span>
                    <span className="suggestion-location">
                      <strong>{highlightMatch(item.code, query)}</strong> · {highlightMatch(item.city, query)}
                      {item.state ? `, ${highlightMatch(item.state, query)}` : ''} · {highlightMatch(item.country, query)}
                    </span>
                  </div>
                </li>
              );
            })
          ) : (
            showEmptyMessage && (
              <li className="suggestion-empty-item">
                <i className="fas fa-exclamation-circle empty-icon"></i>
                <span>No airports found</span>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}

export default AirportAutocomplete;
