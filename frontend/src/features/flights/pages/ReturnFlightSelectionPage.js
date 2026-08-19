import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { flightAPI } from '../../../shared/api/api';
import { normalizeError } from '../../../shared/utils/normalizeError';
import FlightResultRow, { normalizeFlight } from '../components/FlightResultRow';
import ModifySearchSummaryBar from '../components/ModifySearchSummaryBar';
import ModifySearchModal from '../components/ModifySearchModal';
import { canonicalSearchAirport, getAirportDisplayName, normalizeIataCode } from '../utils/airportIdentity';
import './SearchResultsPage.css';
import './SearchResultsReadability.css';
import './ReturnFlightReadability.css';

const RETURN_SEARCH_TIMEOUT_MS = 25000;

function matchesRoute(flight, fromCode, toCode) {
  return normalizeIataCode(flight?.departure?.airport) === fromCode && normalizeIataCode(flight?.arrival?.airport) === toCode;
}

function splitInfantCounts(params = {}) {
  const infantsInSeat = Math.max(0, Number.parseInt(params.infantsInSeat || 0, 10) || 0);
  const hasLapValue = params.infantsOnLap !== undefined && params.infantsOnLap !== null;
  const infantsOnLap = hasLapValue
    ? Math.max(0, Number.parseInt(params.infantsOnLap || 0, 10) || 0)
    : Math.max(0, (Number.parseInt(params.infants || 0, 10) || 0) - infantsInSeat);
  return {
    infantsInSeat,
    infantsOnLap,
    infants: infantsInSeat + infantsOnLap,
  };
}

function ReturnFlightSelection() {
  const navigate = useNavigate();
  const [flights, setFlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchParams, setSearchParams] = useState(null);
  const [departureToken, setDepartureToken] = useState('');
  const [isModifySearchOpen, setIsModifySearchOpen] = useState(false);
  const [expandedFlightId, setExpandedFlightId] = useState(null);

  const fromCode = canonicalSearchAirport(searchParams, 'from');
  const toCode = canonicalSearchAirport(searchParams, 'to');
  const returnFromCode = toCode;
  const returnToCode = fromCode;

  const searchReturnFlights = useCallback(async (params, expectedFrom, expectedTo) => {
    setLoading(true);
    setError('');
    setFlights([]);
    let timeoutId;

    try {
      const response = await Promise.race([
        flightAPI.search(params),
        new Promise((_, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error('The return-flight search is taking longer than expected.')),
            RETURN_SEARCH_TIMEOUT_MS,
          );
        }),
      ]);

      const list = Array.isArray(response?.data?.flights) ? response.data.flights : [];
      const normalized = list.map((flight, index) => normalizeFlight(flight, index)).filter(Boolean);
      const matched = normalized.filter((flight) => matchesRoute(flight, expectedFrom, expectedTo));

      if (normalized.length > 0 && matched.length === 0) {
        throw new Error(`The flight provider returned a different route instead of ${expectedFrom} → ${expectedTo}. Those results were blocked.`);
      }

      setFlights(matched);
    } catch (err) {
      setFlights([]);
      setError(normalizeError(err, 'Unable to load return flights right now. Please retry or modify your search.'));
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let outboundFlight = null;
    let params = {};

    try {
      outboundFlight = JSON.parse(sessionStorage.getItem('selectedFlight') || 'null');
      params = JSON.parse(sessionStorage.getItem('searchParams') || '{}');
    } catch {
      outboundFlight = null;
      params = {};
    }

    const outboundFrom = canonicalSearchAirport(params, 'from');
    const outboundTo = canonicalSearchAirport(params, 'to');
    const infantCounts = splitInfantCounts(params);
    const canonicalParams = {
      ...params,
      ...infantCounts,
      fromCode: outboundFrom,
      toCode: outboundTo,
      returnDate: params.returnDate,
    };
    setSearchParams(canonicalParams);

    if (!outboundFlight || !canonicalParams.returnDate || !outboundFrom || !outboundTo) {
      setLoading(false);
      setError('We could not verify your selected departure flight and return-search details. Go back to departure flights and select the outbound flight again.');
      return;
    }

    if (!matchesRoute(outboundFlight, outboundFrom, outboundTo)) {
      setLoading(false);
      setError(`Your saved departure flight does not match the current ${outboundFrom} → ${outboundTo} search. We stopped here rather than loading the wrong trip.`);
      return;
    }

    const token = String(outboundFlight.departureToken || outboundFlight.departure_token || '').trim();
    if (!token) {
      setLoading(false);
      setError('This departure selection does not contain the supplier round-trip token needed to price the return correctly. Go back and select the outbound flight again so we do not combine unrelated one-way fares.');
      return;
    }

    setDepartureToken(token);
    sessionStorage.setItem('searchParams', JSON.stringify(canonicalParams));

    // Continue the SAME Google Flights round-trip quote. Do not run an unrelated
    // one-way return search: that would add a second fare to a price that already
    // represents the complete round trip.
    searchReturnFlights({
      from: outboundFrom,
      to: outboundTo,
      departure: canonicalParams.departure,
      returnDate: canonicalParams.returnDate,
      departureToken: token,
      adults: canonicalParams.adults || 1,
      children: canonicalParams.children || 0,
      infants: canonicalParams.infants || 0,
      infantsInSeat: canonicalParams.infantsInSeat || 0,
      infantsOnLap: canonicalParams.infantsOnLap || 0,
      travelClass: canonicalParams.travelClass || canonicalParams.cabinClass || 'economy',
      currency: canonicalParams.currency || 'USD',
    }, outboundTo, outboundFrom);
  }, [searchReturnFlights]);

  const handleSelectReturnFlight = (flight) => {
    if (!returnFromCode || !returnToCode || !matchesRoute(flight, returnFromCode, returnToCode)) {
      setError('This return flight no longer matches your trip. Retry the return search before continuing.');
      return;
    }

    sessionStorage.setItem('returnFlight', JSON.stringify(flight));
    sessionStorage.setItem('selectedReturnFlight', JSON.stringify(flight));
    navigate('/booking');
  };

  const buildDepartureSearchUrl = (params = searchParams || {}) => {
    const departureFrom = canonicalSearchAirport(params, 'from');
    const departureTo = canonicalSearchAirport(params, 'to');
    if (!departureFrom || !departureTo || !params.departure) return '/';
    const infantCounts = splitInfantCounts(params);

    const query = new URLSearchParams({
      from: departureFrom,
      to: departureTo,
      fromDisplay: params.fromDisplay || getAirportDisplayName(params.from) || departureFrom,
      toDisplay: params.toDisplay || getAirportDisplayName(params.to) || departureTo,
      departure: params.departure,
      adults: String(params.adults || 1),
      children: String(params.children || 0),
      infants: String(infantCounts.infants),
      infantsInSeat: String(infantCounts.infantsInSeat),
      infantsOnLap: String(infantCounts.infantsOnLap),
      travelClass: params.travelClass || params.cabinClass || 'economy',
      currency: params.currency || 'USD',
      tripType: 'roundtrip',
    });
    if (params.returnDate) query.set('returnDate', params.returnDate);
    return `/search?${query.toString()}`;
  };

  const handleBackToDepartureFlights = () => {
    sessionStorage.removeItem('selectedFlight');
    sessionStorage.removeItem('selectedReturnFlight');
    sessionStorage.removeItem('returnFlight');
    sessionStorage.removeItem('bookingDraft');
    navigate(buildDepartureSearchUrl());
  };

  const handleUpdateSearchFromReturn = (updated) => {
    const updatedFrom = normalizeIataCode(updated.from || updated.origin);
    const updatedTo = normalizeIataCode(updated.to || updated.destination);
    if (!updatedFrom || !updatedTo) throw new Error('Please select valid 3-letter origin and destination airport codes.');
    const infantCounts = splitInfantCounts(updated);

    const query = new URLSearchParams({
      from: updatedFrom,
      to: updatedTo,
      fromDisplay: getAirportDisplayName(updated.origin) || updatedFrom,
      toDisplay: getAirportDisplayName(updated.destination) || updatedTo,
      departure: updated.departureDate || updated.departure,
      adults: String(updated.adults || 1),
      children: String(updated.children || 0),
      infants: String(infantCounts.infants),
      infantsInSeat: String(infantCounts.infantsInSeat),
      infantsOnLap: String(infantCounts.infantsOnLap),
      travelClass: updated.cabinClass || 'economy',
      currency: searchParams?.currency || 'USD',
      tripType: updated.tripType === 'one-way' ? 'oneway' : 'roundtrip',
    });
    if (updated.returnDate || updated.return) query.set('returnDate', updated.returnDate || updated.return);

    sessionStorage.removeItem('selectedFlight');
    sessionStorage.removeItem('selectedReturnFlight');
    sessionStorage.removeItem('returnFlight');
    sessionStorage.removeItem('bookingDraft');
    navigate(`/search?${query.toString()}`);
  };

  const retryReturnSearch = () => {
    if (!searchParams?.departure || !searchParams?.returnDate || !fromCode || !toCode || !departureToken) return;
    searchReturnFlights({
      from: fromCode,
      to: toCode,
      departure: searchParams.departure,
      returnDate: searchParams.returnDate,
      departureToken,
      adults: searchParams.adults || 1,
      children: searchParams.children || 0,
      infants: searchParams.infants || 0,
      infantsInSeat: searchParams.infantsInSeat || 0,
      infantsOnLap: searchParams.infantsOnLap || 0,
      travelClass: searchParams.travelClass || 'economy',
      currency: searchParams.currency || 'USD',
    }, returnFromCode, returnToCode);
  };

  const normalizedFlights = useMemo(
    () => flights.map((flight, index) => normalizeFlight(flight, index)).filter(Boolean),
    [flights],
  );

  if (loading) {
    return (
      <div className="search-results-page">
        <div className="tfs-results-shell">
          <button type="button" className="btn-outline-modify" onClick={handleBackToDepartureFlights} style={{ marginBottom: 16 }}>
            <i className="fas fa-arrow-left" style={{ marginRight: 8 }} /> Back to departure flights
          </button>
          <div className="tfs-return-loading-copy" role="status" aria-live="polite">
            <i className="fas fa-circle-notch fa-spin" />
            <div>
              <strong>Finding return flight options</strong>
              <span>{returnFromCode && returnToCode ? `${returnFromCode} → ${returnToCode}` : 'Preparing your return search'} · checking fares and connections</span>
            </div>
          </div>
          {[1, 2, 3].map((item) => <div key={item} className="flight-card skeleton-card tfs-results-loading-card pulsing" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="search-results-page">
      <div className="tfs-results-shell">
        <div className="tfs-return-navigation">
          <button type="button" className="btn-outline-modify" onClick={handleBackToDepartureFlights}>
            <i className="fas fa-arrow-left" style={{ marginRight: 8 }} /> Back to departure flights
          </button>
          <span>Change your outbound flight without restarting the trip.</span>
        </div>

        <ModifySearchSummaryBar searchParams={searchParams || {}} onOpenModifyModal={() => setIsModifySearchOpen(true)} />

        <div className="tfs-results-heading-row tfs-return-heading">
          <div>
            <h2>Select return flight</h2>
            <p>{returnFromCode && returnToCode ? `${returnFromCode} → ${returnToCode}` : 'Return journey'} · compare connection length before selecting.</p>
          </div>
        </div>

        {error ? (
          <div className="search-error-card tfs-search-error" role="alert">
            <div className="tfs-search-error__icon"><i className="fas fa-exclamation-triangle" /></div>
            <h3>Return Flight Search Failed</h3>
            <p>{error}</p>
            <p className="tfs-search-error__help">You are not stuck. Retry this exact return route, change the search, or go back and choose another departure flight.</p>
            <div className="tfs-search-error__actions">
              {searchParams?.returnDate && departureToken && <button type="button" className="btn-primary" onClick={retryReturnSearch}>Retry Search</button>}
              <button type="button" className="btn-outline-modify" onClick={handleBackToDepartureFlights}>Back to departure flights</button>
              <button type="button" className="btn-outline-modify" onClick={() => setIsModifySearchOpen(true)}>Modify search</button>
            </div>
          </div>
        ) : (
          <div className="tfs-flight-list">
            {normalizedFlights.length === 0 ? (
              <div className="no-results-card">
                <div className="no-results-icon-circle"><i className="fas fa-plane-arrival" /></div>
                <h3>No return flights found</h3>
                <p>No return flights matched this exact route and date. Try different criteria or another outbound flight.</p>
                <div className="tfs-search-error__actions">
                  <button type="button" className="btn-outline-modify" onClick={handleBackToDepartureFlights}>Back to departure flights</button>
                  <button type="button" className="btn-outline-modify" onClick={() => setIsModifySearchOpen(true)}>Modify search</button>
                </div>
              </div>
            ) : normalizedFlights.map((flight, index) => (
              <FlightResultRow
                key={flight.id}
                flight={flight}
                index={index}
                isExpanded={expandedFlightId === flight.id}
                onToggleExpand={() => setExpandedFlightId((current) => current === flight.id ? null : flight.id)}
                onSelect={handleSelectReturnFlight}
                actionLabel="Select return"
                travelersCount={(searchParams?.adults || 1) + (searchParams?.children || 0) + (searchParams?.infants || 0)}
              />
            ))}
          </div>
        )}
      </div>

      <ModifySearchModal
        isOpen={isModifySearchOpen}
        onClose={() => setIsModifySearchOpen(false)}
        initialSearch={searchParams || {}}
        onUpdateSearch={handleUpdateSearchFromReturn}
        isCheckoutPage={false}
      />
    </div>
  );
}

export default ReturnFlightSelection;