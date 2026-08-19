import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import CarSearchForm from '../components/CarSearchForm';
import CarResultCard from '../components/CarResultCard';
import { carAPI } from '../../../shared/api/api';
import { normalizeError } from '../../../shared/utils/normalizeError';
import './CarSearchResultsPage.css';

const CATEGORY_OPTIONS = ['Small', 'Medium', 'Large', 'Estate', 'SUV', 'Premium', 'Carrier/Van'];
const TRANSMISSION_OPTIONS = ['Automatic', 'Manual'];
const MILEAGE_OPTIONS = ['Unlimited', 'Limited'];
const DEPOT_TYPES = ['In terminal', 'Car rental centre', 'Outside terminal', 'Shuttle bus', 'Meet and greet'];

function futureDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

function buildSearchFromUrl(urlParams) {
  const pickup = urlParams.get('pickup');
  if (!pickup) return null;
  const dropoff = urlParams.get('dropoff') || pickup;
  return {
    pickupLocation: { airport: pickup },
    dropoffLocation: { airport: dropoff },
    pickupText: pickup,
    dropoffText: dropoff,
    pickupDate: urlParams.get('pickupDate') || futureDate(7),
    pickupTime: urlParams.get('pickupTime') || '10:00:00',
    dropoffDate: urlParams.get('dropoffDate') || futureDate(12),
    dropoffTime: urlParams.get('dropoffTime') || '10:00:00',
    driverAge: Number.parseInt(urlParams.get('driverAge') || '30', 10),
    driverCountry: urlParams.get('driverCountry') || 'us',
    currency: urlParams.get('currency') || 'USD'
  };
}

function CarSearchResultsPage() {
  const location = useLocation();
  const requestSequence = useRef(0);

  const [searchParams, setSearchParams] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [requestId, setRequestId] = useState('');
  const [results, setResults] = useState([]);
  const [enrichment, setEnrichment] = useState({});
  const [nextPageToken, setNextPageToken] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showEditSearch, setShowEditSearch] = useState(false);

  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedTransmissions, setSelectedTransmissions] = useState([]);
  const [selectedMileages, setSelectedMileages] = useState([]);
  const [selectedDepotTypes, setSelectedDepotTypes] = useState([]);
  const [airConOnly, setAirConOnly] = useState(false);
  const [sortBy, setSortBy] = useState('price_asc');

  const fetchCarResults = useCallback(async (paramsObj, { append = false, pageToken = null } = {}) => {
    if (!paramsObj) return;
    const sequence = ++requestSequence.current;

    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setErrorMsg('');
      setRequestId('');
    }

    try {
      const apiPayload = {
        ...paramsObj,
        filters: {
          ...(selectedCategories.length > 0 && { vehicle_category: selectedCategories }),
          ...(selectedTransmissions.length > 0 && { transmission: selectedTransmissions }),
          ...(selectedMileages.length > 0 && { mileage: selectedMileages }),
          ...(selectedDepotTypes.length > 0 && { depot_type: selectedDepotTypes }),
          ...(airConOnly && { air_conditioning: true })
        },
        sort: {
          by: sortBy === 'rating' ? 'review_score' : 'price',
          direction: sortBy === 'price_desc' ? 'descending' : 'ascending'
        },
        ...(append && pageToken ? { next_page: pageToken } : {})
      };

      const response = await carAPI.search(apiPayload);
      if (sequence !== requestSequence.current) return;

      const data = response?.data || response || {};
      const fetchedResults = Array.isArray(data.results) ? data.results : [];
      const fetchedEnrichment = data.enrichment || {};

      setResults((previous) => append ? [...previous, ...fetchedResults] : fetchedResults);
      setEnrichment((previous) => ({
        carsById: { ...(append ? previous.carsById || {} : {}), ...(fetchedEnrichment.carsById || {}) },
        suppliersById: { ...(append ? previous.suppliersById || {} : {}), ...(fetchedEnrichment.suppliersById || {}) },
        depotsById: { ...(append ? previous.depotsById || {} : {}), ...(fetchedEnrichment.depotsById || {}) },
        depotScoresById: { ...(append ? previous.depotScoresById || {} : {}), ...(fetchedEnrichment.depotScoresById || {}) }
      }));
      setNextPageToken(data.metadata?.next_page || null);
    } catch (err) {
      if (sequence !== requestSequence.current) return;
      setErrorMsg(normalizeError(err, 'Car-rental search is temporarily unavailable. Please try again shortly.'));
      setRequestId(err?.response?.data?.error?.requestId || '');
    } finally {
      if (sequence === requestSequence.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [selectedCategories, selectedTransmissions, selectedMileages, selectedDepotTypes, airConOnly, sortBy]);

  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const fromUrl = buildSearchFromUrl(urlParams);
    let parsed = fromUrl;

    if (!parsed) {
      try {
        const saved = sessionStorage.getItem('carSearchParams');
        parsed = saved ? JSON.parse(saved) : null;
      } catch {
        parsed = null;
      }
    }

    setSearchParams(parsed);
    if (!parsed) {
      setLoading(false);
      setResults([]);
      setErrorMsg('');
    }
  }, [location.search]);

  useEffect(() => {
    if (searchParams) {
      fetchCarResults(searchParams);
    }
  }, [searchParams, fetchCarResults]);

  const handleResetFilters = () => {
    setSelectedCategories([]);
    setSelectedTransmissions([]);
    setSelectedMileages([]);
    setSelectedDepotTypes([]);
    setAirConOnly(false);
    setSortBy('price_asc');
  };

  const toggleListValue = (setter, value) => {
    setter((previous) => previous.includes(value) ? previous.filter((item) => item !== value) : [...previous, value]);
  };

  const handleLoadMore = () => {
    if (!searchParams || !nextPageToken || loadingMore) return;
    fetchCarResults(searchParams, { append: true, pageToken: nextPageToken });
  };

  return (
    <div className="car-results-page">
      <Helmet>
        <title>Car Rental Search Results | FareTransit</title>
        <meta name="description" content="Compare car rental options, suppliers, pickup locations, and policies through FareTransit." />
      </Helmet>

      <section className="car-results-summary-bar">
        <div className="container car-summary-inner">
          <div className="car-summary-info">
            <div className="summary-title-line">
              <i className="fas fa-car" aria-hidden="true" />
              <h2>Car Rentals in {searchParams?.pickupText || 'Airport Location'}</h2>
            </div>
            <p className="summary-dates-sub">
              {searchParams?.pickupDate || '—'} ({searchParams?.pickupTime?.substring(0, 5) || '—'}) — {searchParams?.dropoffDate || '—'} ({searchParams?.dropoffTime?.substring(0, 5) || '—'})
              {' '}• Driver Age: {searchParams?.driverAge || 30} • Currency: {searchParams?.currency || 'USD'}
            </p>
          </div>

          <button type="button" className="edit-search-toggle-btn" onClick={() => setShowEditSearch((open) => !open)}>
            <i className="fas fa-edit" />
            <span>{showEditSearch ? 'Close Search' : 'Modify Search'}</span>
          </button>
        </div>
      </section>

      {showEditSearch && (
        <section className="car-edit-search-drawer">
          <div className="container"><CarSearchForm initialValues={searchParams || {}} compact /></div>
        </section>
      )}

      <div className="container car-results-container">
        <aside className="car-filter-sidebar">
          <div className="filter-header">
            <h3><i className="fas fa-sliders-h" /> Filter Cars</h3>
            <button type="button" className="reset-filters-btn" onClick={handleResetFilters}>Reset All</button>
          </div>

          <div className="filter-group">
            <h4>Vehicle Category</h4>
            {CATEGORY_OPTIONS.map((category) => (
              <label key={category} className="filter-checkbox-label">
                <input type="checkbox" checked={selectedCategories.includes(category)} onChange={() => toggleListValue(setSelectedCategories, category)} />
                <span>{category}</span>
              </label>
            ))}
          </div>

          <div className="filter-group">
            <h4>Transmission</h4>
            {TRANSMISSION_OPTIONS.map((transmission) => (
              <label key={transmission} className="filter-checkbox-label">
                <input type="checkbox" checked={selectedTransmissions.includes(transmission)} onChange={() => toggleListValue(setSelectedTransmissions, transmission)} />
                <span>{transmission}</span>
              </label>
            ))}
          </div>

          <div className="filter-group">
            <h4>Mileage</h4>
            {MILEAGE_OPTIONS.map((mileage) => (
              <label key={mileage} className="filter-checkbox-label">
                <input type="checkbox" checked={selectedMileages.includes(mileage)} onChange={() => toggleListValue(setSelectedMileages, mileage)} />
                <span>{mileage} Mileage</span>
              </label>
            ))}
          </div>

          <div className="filter-group">
            <h4>Pickup Location Type</h4>
            {DEPOT_TYPES.map((depotType) => (
              <label key={depotType} className="filter-checkbox-label">
                <input type="checkbox" checked={selectedDepotTypes.includes(depotType)} onChange={() => toggleListValue(setSelectedDepotTypes, depotType)} />
                <span>{depotType}</span>
              </label>
            ))}
          </div>

          <div className="filter-group">
            <h4>Features</h4>
            <label className="filter-checkbox-label">
              <input type="checkbox" checked={airConOnly} onChange={(event) => setAirConOnly(event.target.checked)} />
              <span>Air Conditioning Only</span>
            </label>
          </div>
        </aside>

        <main className="car-results-main">
          <div className="car-controls-bar">
            <span className="results-count-text">Showing <strong>{results.length}</strong> rental car options</span>
            <div className="sort-select-wrapper">
              <label htmlFor="car-sort-select">Sort by:</label>
              <select id="car-sort-select" className="car-sort-select" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
                <option value="rating">Review Score</option>
              </select>
            </div>
          </div>

          {loading && (
            <div className="car-loading-state" aria-live="polite">
              <i className="fas fa-spinner fa-spin car-loading-icon" />
              <h3>Searching available rental cars...</h3>
              <p>Fetching current inventory from Booking.com</p>
            </div>
          )}

          {!loading && errorMsg && (
            <div className="car-error-state" role="alert">
              <i className="fas fa-exclamation-triangle" />
              <h3>Search Unavailable</h3>
              <p>{errorMsg}</p>
              {requestId && <span className="error-req-id">Reference ID: {requestId}</span>}
              <button type="button" className="retry-search-btn" onClick={() => searchParams && fetchCarResults(searchParams)}>Try Again</button>
            </div>
          )}

          {!loading && !errorMsg && !searchParams && (
            <div className="car-empty-state">
              <i className="fas fa-search" />
              <h3>Start a car-rental search</h3>
              <p>Choose pickup and drop-off details above to compare rental options.</p>
              <button type="button" className="reset-filters-btn-large" onClick={() => setShowEditSearch(true)}>Enter Search Details</button>
            </div>
          )}

          {!loading && !errorMsg && searchParams && results.length === 0 && (
            <div className="car-empty-state">
              <i className="fas fa-car-side" />
              <h3>No rental cars found for these dates and locations</h3>
              <p>Try changing your pickup time, dates, location, or driver age requirement.</p>
              <button type="button" className="reset-filters-btn-large" onClick={handleResetFilters}>Clear Filters</button>
            </div>
          )}

          {!loading && !errorMsg && results.length > 0 && (
            <div className="car-cards-list">
              {results.map((carItem, index) => (
                <CarResultCard key={carItem.car_id || carItem.id || index} result={carItem} enrichment={enrichment} />
              ))}

              {nextPageToken && (
                <div className="load-more-wrapper">
                  <button type="button" className="load-more-btn" onClick={handleLoadMore} disabled={loadingMore}>
                    {loadingMore ? <><i className="fas fa-spinner fa-spin" /> Loading More...</> : 'Load More Cars'}
                  </button>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default CarSearchResultsPage;
