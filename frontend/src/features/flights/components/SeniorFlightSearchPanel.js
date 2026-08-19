import React, { useState } from 'react';
import AirportAutocomplete from './AirportAutocomplete';
import './SeniorFlightSearchPanel.css';

const getLocalDateString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const extractAirportCode = (value, airport) => {
  const directCode = airport?.code || airport?.id;
  if (directCode && /^[A-Z]{3}$/i.test(String(directCode))) {
    return String(directCode).toUpperCase();
  }

  const text = String(value || '').trim();
  const parenthesized = text.match(/\(([A-Z]{3})\)/i);
  if (parenthesized) return parenthesized[1].toUpperCase();
  if (/^[A-Z]{3}$/i.test(text)) return text.toUpperCase();
  return '';
};

export default function SeniorFlightSearchPanel() {
  const today = getLocalDateString();
  const [isSearching, setIsSearching] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchData, setSearchData] = useState({
    from: '',
    fromAirport: null,
    to: '',
    toAirport: null,
    departure: '',
    returnDate: '',
    tripType: 'roundtrip',
    adults: 1,
    travelClass: 'economy',
    currency: 'USD',
  });

  const change = (field, value) => {
    setSearchData((prev) => ({ ...prev, [field]: value }));
    setErrorMessage('');
  };

  const handleSearch = (event) => {
    event.preventDefault();
    if (isSearching) return;

    const fromCode = extractAirportCode(searchData.from, searchData.fromAirport);
    const toCode = extractAirportCode(searchData.to, searchData.toAirport);

    if (!fromCode || !toCode) {
      setErrorMessage('Please select both airports from the suggestions.');
      return;
    }
    if (fromCode === toCode) {
      setErrorMessage('Origin and destination airports must be different.');
      return;
    }
    if (!searchData.departure) {
      setErrorMessage('Please select a departure date.');
      return;
    }
    if (searchData.departure < today) {
      setErrorMessage('Departure date cannot be in the past.');
      return;
    }
    if (searchData.tripType === 'roundtrip' && !searchData.returnDate) {
      setErrorMessage('Please select a return date.');
      return;
    }
    if (searchData.tripType === 'roundtrip' && searchData.returnDate < searchData.departure) {
      setErrorMessage('Return date cannot be before departure date.');
      return;
    }

    setIsSearching(true);

    try {
      const fromDisplay = String(searchData.from || fromCode).trim();
      const toDisplay = String(searchData.to || toCode).trim();

      const params = new URLSearchParams({
        from: fromCode,
        to: toCode,
        fromDisplay,
        toDisplay,
        departure: searchData.departure,
        tripType: searchData.tripType,
        adults: String(searchData.adults),
        children: '0',
        infants: '0',
        infantsInSeat: '0',
        infantsOnLap: '0',
        travelClass: searchData.travelClass,
        currency: searchData.currency,
      });

      if (searchData.tripType === 'roundtrip') {
        params.set('returnDate', searchData.returnDate);
      }

      const payload = {
        ...searchData,
        from: fromDisplay,
        to: toDisplay,
        fromCode,
        toCode,
        fromDisplay,
        toDisplay,
        children: 0,
        infants: 0,
        infantsInSeat: 0,
        infantsOnLap: 0,
      };

      sessionStorage.setItem('searchParams', JSON.stringify(payload));
      sessionStorage.setItem('searchType', searchData.tripType);
      sessionStorage.removeItem('selectedFlight');
      sessionStorage.removeItem('selectedReturnFlight');
      sessionStorage.removeItem('returnFlight');

      if (typeof window !== 'undefined' && window.gtag) {
        window.gtag('event', 'senior_flight_search', {
          origin: fromCode,
          destination: toCode,
          trip_type: searchData.tripType,
        });
      }

      // Use a direct browser navigation here instead of relying on component/router
      // state. This makes the landing-page search reliable even after ad redirects,
      // client-side transitions, or portal mounting.
      window.location.assign(`/search?${params.toString()}`);
    } catch (error) {
      console.error('[Senior Flight Search Error]', error);
      setErrorMessage('We could not open flight results. Please try again.');
      setIsSearching(false);
    }
  };

  return (
    <div className="senior-search-card" id="senior-flight-search-form">
      <div className="senior-search-heading">
        <div>
          <span className="senior-search-kicker">Find your flight</span>
          <h2>Search Flights</h2>
          <p>Choose your airports and dates to view available flight options.</p>
        </div>
      </div>

      <form onSubmit={handleSearch} className="senior-search-form" noValidate>
        <div className="senior-search-options">
          <label>
            <span>Trip</span>
            <select
              value={searchData.tripType}
              onChange={(e) => {
                change('tripType', e.target.value);
                if (e.target.value === 'oneway') change('returnDate', '');
              }}
            >
              <option value="roundtrip">Round Trip</option>
              <option value="oneway">One Way</option>
            </select>
          </label>

          <label>
            <span>Cabin</span>
            <select value={searchData.travelClass} onChange={(e) => change('travelClass', e.target.value)}>
              <option value="economy">Economy</option>
              <option value="premium">Premium Economy</option>
              <option value="business">Business Class</option>
              <option value="first">First Class</option>
            </select>
          </label>

          <label>
            <span>Travelers</span>
            <select value={searchData.adults} onChange={(e) => change('adults', Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6].map((count) => (
                <option key={count} value={count}>{count} Traveler{count > 1 ? 's' : ''}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Currency</span>
            <select value={searchData.currency} onChange={(e) => change('currency', e.target.value)}>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="CAD">CAD (C$)</option>
            </select>
          </label>
        </div>

        <div className="senior-search-route-row">
          <div className="senior-search-field senior-search-airport-field">
            <AirportAutocomplete
              label="Origin Airport"
              id="senior-search-origin"
              value={searchData.from}
              excludeCode={searchData.toAirport?.code}
              onChange={(value, item) => {
                setSearchData((prev) => ({ ...prev, from: value, fromAirport: item || null }));
                setErrorMessage('');
              }}
              placeholder="City or airport, e.g. JFK"
              required
            />
          </div>

          <div className="senior-search-field senior-search-airport-field">
            <AirportAutocomplete
              label="Destination Airport"
              id="senior-search-destination"
              value={searchData.to}
              excludeCode={searchData.fromAirport?.code}
              onChange={(value, item) => {
                setSearchData((prev) => ({ ...prev, to: value, toAirport: item || null }));
                setErrorMessage('');
              }}
              placeholder="City or airport, e.g. LAX"
              required
            />
          </div>

          <label className="senior-search-field">
            <span>Departure Date</span>
            <input
              type="date"
              value={searchData.departure}
              min={today}
              onChange={(e) => change('departure', e.target.value)}
              required
            />
          </label>

          <label className={`senior-search-field ${searchData.tripType === 'oneway' ? 'is-disabled' : ''}`}>
            <span>Return Date</span>
            <input
              type="date"
              value={searchData.returnDate}
              min={searchData.departure || today}
              onChange={(e) => change('returnDate', e.target.value)}
              disabled={searchData.tripType === 'oneway'}
              required={searchData.tripType === 'roundtrip'}
            />
          </label>
        </div>

        {errorMessage && (
          <div className="senior-search-error" role="alert">
            <i className="fas fa-exclamation-circle" aria-hidden="true"></i>
            {errorMessage}
          </div>
        )}

        <div className="senior-search-action-row">
          <p>
            Prefer help? You can still request personal booking assistance below.
          </p>
          <button type="submit" disabled={isSearching}>
            {isSearching ? (
              <><i className="fas fa-circle-notch fa-spin" aria-hidden="true"></i> Opening Results...</>
            ) : (
              <><i className="fas fa-search" aria-hidden="true"></i> Search Flights</>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
