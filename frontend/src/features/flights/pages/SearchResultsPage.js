import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { flightAPI } from '../../../shared/api/api';
import ModifySearchSummaryBar from '../components/ModifySearchSummaryBar';
import ModifySearchModal from '../components/ModifySearchModal';
import FlightResultRow, { normalizeFlight } from '../components/FlightResultRow';
import { normalizeSelectedItinerary, validateItineraryIntegrity } from '../../../shared/utils/itineraryNormalizer';
import { getAirportDisplayName, normalizeIataCode } from '../utils/airportIdentity';
import './SearchResultsPage.css';
import './SearchResultsReadability.css';

function getErrorMessage(error) {
  if (!error) return 'An unexpected error occurred while searching for flights.';
  if (typeof error === 'string') return error;
  if (error.userMessage) return error.userMessage;
  if (error.response?.data?.error?.message) return error.response.data.error.message;
  if (error.response?.data?.message) return error.response.data.message;
  if (error.message) return error.message;
  return 'Unable to process this flight search.';
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return '';
  try {
    const clean = String(dateStr).includes('T') ? dateStr : `${dateStr}T00:00:00`;
    const date = new Date(clean);
    if (Number.isNaN(date.getTime())) return String(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return String(dateStr || '');
  }
}

function durationToMinutes(duration) {
  const text = String(duration || '');
  const hours = Number.parseInt(text.match(/(\d+)\s*h/i)?.[1] || '0', 10);
  const minutes = Number.parseInt(text.match(/(\d+)\s*m/i)?.[1] || '0', 10);
  return (hours * 60) + minutes;
}

function getTimePeriod(time) {
  const hour = Number.parseInt(String(time || '').split(':')[0], 10);
  if (!Number.isFinite(hour)) return 'other';
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}

function parsePassengerCounts(query) {
  const adults = Math.max(1, Number.parseInt(query.get('adults') || '1', 10) || 1);
  const children = Math.max(0, Number.parseInt(query.get('children') || '0', 10) || 0);
  const legacyInfants = Math.max(0, Number.parseInt(query.get('infants') || '0', 10) || 0);
  const hasSplitInfants = query.has('infantsInSeat') || query.has('infantsOnLap');
  const infantsInSeat = hasSplitInfants
    ? Math.max(0, Number.parseInt(query.get('infantsInSeat') || '0', 10) || 0)
    : 0;
  const infantsOnLap = hasSplitInfants
    ? Math.max(0, Number.parseInt(query.get('infantsOnLap') || '0', 10) || 0)
    : legacyInfants;

  return {
    adults,
    children,
    infantsInSeat,
    infantsOnLap,
    // Keep total infants in the legacy field so the existing booking page still
    // creates a traveler record for every infant.
    infants: hasSplitInfants ? infantsInSeat + infantsOnLap : legacyInfants,
  };
}

function normalizeUpdatedPassengerCounts(updated = {}) {
  const adults = Math.max(1, Number.parseInt(updated.adults || 1, 10) || 1);
  const children = Math.max(0, Number.parseInt(updated.children || 0, 10) || 0);
  const infantsInSeat = Math.max(0, Number.parseInt(updated.infantsInSeat || 0, 10) || 0);
  const hasLapValue = updated.infantsOnLap !== undefined && updated.infantsOnLap !== null;
  const infantsOnLap = hasLapValue
    ? Math.max(0, Number.parseInt(updated.infantsOnLap || 0, 10) || 0)
    : Math.max(0, (Number.parseInt(updated.infants || 0, 10) || 0) - infantsInSeat);

  return {
    adults,
    children,
    infantsInSeat,
    infantsOnLap,
    infants: infantsInSeat + infantsOnLap,
  };
}

function parseSearchFromLocation(location) {
  const query = new URLSearchParams(location.search || '');
  const fromCode = normalizeIataCode(query.get('from'));
  const toCode = normalizeIataCode(query.get('to'));
  const departure = query.get('departure') || query.get('departureDate') || '';
  const returnDate = query.get('returnDate') || query.get('return') || '';

  if (!fromCode || !toCode || !departure) {
    return {
      valid: false,
      message: 'This flight-results link is missing a valid origin, destination, or departure date. We did not load an older saved search because that could show the wrong trip.',
    };
  }

  if (fromCode === toCode) {
    return { valid: false, message: 'Origin and destination airports must be different.' };
  }

  const tripTypeRaw = String(query.get('tripType') || (returnDate ? 'roundtrip' : 'oneway')).toLowerCase();
  const tripType = returnDate || tripTypeRaw.includes('round') ? 'roundtrip' : 'oneway';
  const travelClass = query.get('travelClass') || query.get('cabin') || 'economy';
  const currency = query.get('currency') || 'USD';
  const fromDisplay = query.get('fromDisplay') || fromCode;
  const toDisplay = query.get('toDisplay') || toCode;
  const passengerCounts = parsePassengerCounts(query);

  return {
    valid: true,
    params: {
      from: fromDisplay,
      to: toDisplay,
      fromCode,
      toCode,
      fromDisplay,
      toDisplay,
      departure,
      returnDate: returnDate || undefined,
      ...passengerCounts,
      travelClass,
      cabinClass: travelClass,
      currency,
      tripType,
    },
  };
}

function routeMatches(flight, searchParams) {
  const departure = normalizeIataCode(flight?.departure?.airport);
  const arrival = normalizeIataCode(flight?.arrival?.airport);
  if (!departure || !arrival) return false;
  return departure === searchParams.fromCode && arrival === searchParams.toCode;
}

function SearchResultsContent() {
  const location = useLocation();
  const navigate = useNavigate();

  const [flights, setFlights] = useState([]);
  const [searchParams, setSearchParams] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isModifySearchOpen, setIsModifySearchOpen] = useState(false);
  const [expandedFlightId, setExpandedFlightId] = useState(null);

  const [sortBy, setSortBy] = useState('best');
  const [stopFilter, setStopFilter] = useState('all');
  const [airlineFilter, setAirlineFilter] = useState('all');
  const [departureFilter, setDepartureFilter] = useState('all');
  const [maxPrice, setMaxPrice] = useState(0);
  const [priceLimit, setPriceLimit] = useState(0);

  const executeSearch = async (params) => {
    if (!params?.fromCode || !params?.toCode || !params?.departure) return;
    setLoading(true);
    setError('');
    setFlights([]);

    try {
      const response = await flightAPI.search({
        from: params.fromCode,
        to: params.toCode,
        departure: params.departure,
        returnDate: params.returnDate,
        adults: params.adults,
        children: params.children,
        infants: params.infants,
        infantsInSeat: params.infantsInSeat || 0,
        infantsOnLap: params.infantsOnLap || 0,
        travelClass: params.travelClass,
        currency: params.currency,
      });

      const supplierList = Array.isArray(response?.data?.flights) ? response.data.flights : [];
      const normalized = supplierList.map((flight, index) => normalizeFlight(flight, index)).filter(Boolean);
      const matched = normalized.filter((flight) => routeMatches(flight, params));

      if (normalized.length > 0 && matched.length === 0) {
        setError(`The flight provider returned results for a different route instead of ${params.fromCode} → ${params.toCode}. Those results were blocked so you are never shown another customer's or an old route by mistake.`);
        return;
      }

      setFlights(matched);
      const prices = matched.map((flight) => Number(flight.price?.total || 0)).filter((price) => Number.isFinite(price) && price > 0);
      const nextMax = prices.length ? Math.ceil(Math.max(...prices)) : 0;
      setMaxPrice(nextMax);
      setPriceLimit(nextMax);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const parsed = parseSearchFromLocation(location);
    if (!parsed.valid) {
      setSearchParams(null);
      setFlights([]);
      setLoading(false);
      setError(parsed.message);
      return;
    }

    const params = parsed.params;
    setSearchParams(params);
    setExpandedFlightId(null);
    setStopFilter('all');
    setAirlineFilter('all');
    setDepartureFilter('all');
    setSortBy('best');

    // This is the single canonical search state used by departure -> return -> booking.
    // Never leave an older session search behind after a URL/Modify Search change.
    sessionStorage.setItem('searchParams', JSON.stringify(params));
    sessionStorage.setItem('searchType', params.tripType);
    sessionStorage.removeItem('selectedFlight');
    sessionStorage.removeItem('selectedReturnFlight');
    sessionStorage.removeItem('returnFlight');
    sessionStorage.removeItem('bookingDraft');

    executeSearch(params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  const airlines = useMemo(() => [...new Set(flights.map((flight) => flight.airline).filter(Boolean))].sort(), [flights]);

  const filteredFlights = useMemo(() => flights.filter((flight) => {
    if (priceLimit > 0 && Number(flight.price?.total || 0) > priceLimit) return false;
    if (airlineFilter !== 'all' && flight.airline !== airlineFilter) return false;
    if (departureFilter !== 'all' && getTimePeriod(flight.departure?.time) !== departureFilter) return false;
    if (stopFilter === 'nonstop' && flight.stops !== 0) return false;
    if (stopFilter === '1' && flight.stops !== 1) return false;
    if (stopFilter === '2plus' && flight.stops < 2) return false;
    return true;
  }), [flights, priceLimit, airlineFilter, departureFilter, stopFilter]);

  const sortedFlights = useMemo(() => [...filteredFlights].sort((a, b) => {
    if (sortBy === 'cheapest') return Number(a.price?.total || 0) - Number(b.price?.total || 0);
    if (sortBy === 'fastest') return durationToMinutes(a.duration) - durationToMinutes(b.duration);
    if (sortBy === 'earliest') return String(a.departure?.time || '').localeCompare(String(b.departure?.time || ''));
    if (sortBy === 'latest') return String(b.departure?.time || '').localeCompare(String(a.departure?.time || ''));

    const scoreA = Number(a.price?.total || 0) + (durationToMinutes(a.duration) * 1.1) + (Number(a.stops || 0) * 180);
    const scoreB = Number(b.price?.total || 0) + (durationToMinutes(b.duration) * 1.1) + (Number(b.stops || 0) * 180);
    return scoreA - scoreB;
  }), [filteredFlights, sortBy]);

  const resetFilters = () => {
    setStopFilter('all');
    setAirlineFilter('all');
    setDepartureFilter('all');
    setPriceLimit(maxPrice);
  };

  const handleUpdateSearchFromResults = (updated) => {
    const fromCode = normalizeIataCode(updated.from || updated.origin);
    const toCode = normalizeIataCode(updated.to || updated.destination);
    if (!fromCode || !toCode) throw new Error('Please select valid 3-letter origin and destination airport codes.');

    const fromDisplay = getAirportDisplayName(updated.origin) || fromCode;
    const toDisplay = getAirportDisplayName(updated.destination) || toCode;
    const passengerCounts = normalizeUpdatedPassengerCounts(updated);
    const query = new URLSearchParams({
      from: fromCode,
      to: toCode,
      fromDisplay,
      toDisplay,
      departure: updated.departureDate || updated.departure,
      adults: String(passengerCounts.adults),
      children: String(passengerCounts.children),
      infants: String(passengerCounts.infants),
      infantsInSeat: String(passengerCounts.infantsInSeat),
      infantsOnLap: String(passengerCounts.infantsOnLap),
      travelClass: updated.cabinClass || updated.travelClass || 'economy',
      currency: searchParams?.currency || 'USD',
      tripType: updated.tripType === 'round-trip' ? 'roundtrip' : (updated.tripType || 'oneway'),
    });

    const returnDate = updated.returnDate || updated.return || '';
    if (returnDate) query.set('returnDate', returnDate);
    navigate(`/search?${query.toString()}`);
  };

  const handleSelectFlight = (flight) => {
    if (!searchParams) return;
    if (!routeMatches(flight, searchParams)) {
      setError('This flight no longer matches the route you searched. Refresh the results before continuing.');
      return;
    }

    const normalizedItinerary = normalizeSelectedItinerary(flight, searchParams);
    const integrity = validateItineraryIntegrity(normalizedItinerary);
    if (!integrity.valid) {
      setError(integrity.message);
      return;
    }

    sessionStorage.setItem('searchParams', JSON.stringify(searchParams));
    sessionStorage.setItem('searchType', searchParams.tripType);
    sessionStorage.setItem('selectedFlight', JSON.stringify(flight));
    sessionStorage.setItem('selectedItinerary', JSON.stringify(normalizedItinerary));
    sessionStorage.removeItem('returnFlight');

    navigate(searchParams.tripType === 'roundtrip' && searchParams.returnDate ? '/return-flight' : '/booking');
  };

  if (loading) {
    return (
      <div className="search-results-page">
        <div className="tfs-results-shell">
          <div className="tfs-results-loading-head skeleton-loader pulsing" />
          <div className="tfs-results-loading-filter skeleton-loader pulsing" />
          {[1, 2, 3].map((item) => <div key={item} className="flight-card skeleton-card tfs-results-loading-card pulsing" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="search-results-page">
        <div className="tfs-results-shell">
          {searchParams && <ModifySearchSummaryBar searchParams={searchParams} onOpenModifyModal={() => setIsModifySearchOpen(true)} />}
          <div className="search-error-card tfs-search-error" role="alert">
            <div className="tfs-search-error__icon"><i className="fas fa-exclamation-triangle" /></div>
            <h2>Flight Search Needs Attention</h2>
            <p>{error}</p>
            <p className="tfs-search-error__help">Your previous search will not be substituted automatically. Retry this exact route or start a new search.</p>
            <div className="tfs-search-error__actions">
              {searchParams && <button type="button" className="btn-primary" onClick={() => executeSearch(searchParams)}>Retry exact search</button>}
              {searchParams && <button type="button" className="btn-outline-modify" onClick={() => setIsModifySearchOpen(true)}>Modify search</button>}
              <button type="button" className="btn-outline-modify" onClick={() => navigate('/')}>Start new search</button>
            </div>
          </div>
          <ModifySearchModal
            isOpen={isModifySearchOpen}
            onClose={() => setIsModifySearchOpen(false)}
            initialSearch={searchParams || {}}
            onUpdateSearch={handleUpdateSearchFromResults}
            isCheckoutPage={false}
          />
        </div>
      </div>
    );
  }

  const routeLabel = `${searchParams.fromCode} → ${searchParams.toCode}`;
  const datesLabel = searchParams.returnDate
    ? `${formatDateDisplay(searchParams.departure)} – ${formatDateDisplay(searchParams.returnDate)}`
    : formatDateDisplay(searchParams.departure);

  return (
    <div className="search-results-page">
      <div className="tfs-results-shell">
        <ModifySearchSummaryBar searchParams={searchParams} onOpenModifyModal={() => setIsModifySearchOpen(true)} />

        <section className="tfs-results-context" aria-label="Current flight search">
          <div>
            <strong>{routeLabel}</strong>
            <span>{datesLabel}</span>
          </div>
          <span className="tfs-results-count">{sortedFlights.length} flight{sortedFlights.length === 1 ? '' : 's'}</span>
        </section>

        <section className="tfs-filter-strip" aria-label="Flight filters">
          <label>
            <span>Stops</span>
            <select value={stopFilter} onChange={(event) => setStopFilter(event.target.value)}>
              <option value="all">Any stops</option>
              <option value="nonstop">Nonstop</option>
              <option value="1">1 stop</option>
              <option value="2plus">2+ stops</option>
            </select>
          </label>

          <label>
            <span>Airline</span>
            <select value={airlineFilter} onChange={(event) => setAirlineFilter(event.target.value)}>
              <option value="all">All airlines</option>
              {airlines.map((airline) => <option key={airline} value={airline}>{airline}</option>)}
            </select>
          </label>

          <label>
            <span>Departure</span>
            <select value={departureFilter} onChange={(event) => setDepartureFilter(event.target.value)}>
              <option value="all">Any time</option>
              <option value="morning">Morning</option>
              <option value="afternoon">Afternoon</option>
              <option value="evening">Evening</option>
            </select>
          </label>

          {maxPrice > 0 && (
            <label className="tfs-filter-strip__price">
              <span>Max fare <strong>${priceLimit}</strong></span>
              <input type="range" min={Math.min(...flights.map((flight) => Math.floor(Number(flight.price?.total || 0))).filter(Boolean)) || 0} max={maxPrice} value={priceLimit} onChange={(event) => setPriceLimit(Number(event.target.value))} />
            </label>
          )}

          <button type="button" className="tfs-filter-reset" onClick={resetFilters}>Reset filters</button>
        </section>

        <div className="tfs-results-heading-row">
          <div>
            <h2>Departing flights</h2>
            <p>Compare times, duration and connection length before selecting.</p>
          </div>
          <label className="tfs-results-sort">
            <span>Sort by</span>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
              <option value="best">Best flights</option>
              <option value="cheapest">Cheapest</option>
              <option value="fastest">Fastest</option>
              <option value="earliest">Earliest departure</option>
              <option value="latest">Latest departure</option>
            </select>
          </label>
        </div>

        <div className="tfs-flight-list">
          {sortedFlights.length === 0 ? (
            <div className="no-results-card">
              <div className="no-results-icon-circle"><i className="fas fa-filter" /></div>
              <h3>No flights match these filters</h3>
              <p>Reset the filters or modify the route to see more options.</p>
              <button type="button" className="btn-outline-modify" onClick={resetFilters}>Reset filters</button>
            </div>
          ) : sortedFlights.map((flight, index) => (
            <FlightResultRow
              key={flight.id}
              flight={flight}
              index={index}
              travelersCount={searchParams.adults + searchParams.children + searchParams.infants}
              actionLabel="Select flight"
              isExpanded={expandedFlightId === flight.id}
              onToggleExpand={() => setExpandedFlightId((current) => current === flight.id ? null : flight.id)}
              onSelect={handleSelectFlight}
            />
          ))}
        </div>
      </div>

      <ModifySearchModal
        isOpen={isModifySearchOpen}
        onClose={() => setIsModifySearchOpen(false)}
        initialSearch={searchParams || {}}
        onUpdateSearch={handleUpdateSearchFromResults}
        isCheckoutPage={false}
      />
    </div>
  );
}

class SearchResultsErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('FLIGHT_RESULTS_RENDER_ERROR', { message: error?.message, componentStack: info?.componentStack });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="search-results-page">
        <div className="tfs-results-shell">
          <div className="search-error-card tfs-search-error" role="alert">
            <h2>We could not display these flight results</h2>
            <p>The results page encountered an unexpected display error. No replacement route was loaded.</p>
            <div className="tfs-search-error__actions">
              <button type="button" className="btn-primary" onClick={() => window.location.reload()}>Reload page</button>
              <button type="button" className="btn-outline-modify" onClick={() => { window.location.href = '/'; }}>Start new search</button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default function SearchResults() {
  return <SearchResultsErrorBoundary><SearchResultsContent /></SearchResultsErrorBoundary>;
}