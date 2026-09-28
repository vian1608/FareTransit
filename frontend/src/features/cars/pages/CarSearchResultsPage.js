import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import CarSearchForm from '../components/CarSearchForm';
import CarResultCard from '../components/CarResultCard';
import { carRentalApi, carApiErrorMessage } from '../carRentalApi';
import './CarSearchResultsPage.css';

function futureDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

function buildSearchFromUrl(urlParams) {
  const pickupId = urlParams.get('pickupId');
  if (!pickupId) return null;
  const pickupLabel = urlParams.get('pickupLabel') || urlParams.get('pickup') || 'Enterprise location';
  const pickupCode = urlParams.get('pickup') || '';
  const pickupLocationObj = {
    id: pickupId,
    provider: 'parse-enterprise',
    supplier: 'Enterprise',
    type: urlParams.get('pickupType') || 'branch',
    code: /^[A-Z]{3}$/.test(pickupCode) ? pickupCode : null,
    airportCode: /^[A-Z]{3}$/.test(pickupCode) ? pickupCode : null,
    label: pickupLabel,
    name: pickupLabel,
    address: urlParams.get('pickupAddress') || ''
  };

  return {
    pickupLocation: pickupLocationObj,
    dropoffLocation: pickupLocationObj,
    pickupLocationObj,
    pickupText: pickupLabel,
    dropoffText: pickupLabel,
    sameDropoff: true,
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
  const [showEditSearch, setShowEditSearch] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedTransmissions, setSelectedTransmissions] = useState([]);
  const [sortBy, setSortBy] = useState('price_asc');

  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    let parsed = buildSearchFromUrl(urlParams);
    if (!parsed) {
      try {
        const saved = sessionStorage.getItem('carSearchParams');
        parsed = saved ? JSON.parse(saved) : null;
      } catch {
        parsed = null;
      }
    }
    setSearchParams(parsed);
    setSelectedCategories([]);
    setSelectedTransmissions([]);
    if (!parsed) {
      setLoading(false);
      setResults([]);
    }
  }, [location.search]);

  const fetchCarResults = useCallback(async (paramsObj) => {
    if (!paramsObj?.pickupLocation?.id) return;
    const sequence = ++requestSequence.current;
    setLoading(true);
    setErrorMsg('');
    setRequestId('');

    try {
      const response = await carRentalApi.search(paramsObj);
      if (sequence !== requestSequence.current) return;
      const data = response?.data || {};
      setResults(Array.isArray(data.results) ? data.results : []);
    } catch (error) {
      if (sequence !== requestSequence.current) return;
      setErrorMsg(carApiErrorMessage(error, 'Car-rental search is temporarily unavailable. Please try again shortly.'));
      setRequestId(error?.response?.data?.error?.requestId || '');
      setResults([]);
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (searchParams?.pickupLocation?.id) fetchCarResults(searchParams);
  }, [searchParams, fetchCarResults]);

  const categories = useMemo(() => (
    [...new Set(results.map((item) => item.vehicle?.category).filter(Boolean))].sort()
  ), [results]);
  const transmissions = useMemo(() => (
    [...new Set(results.map((item) => item.vehicle?.transmission).filter(Boolean))].sort()
  ), [results]);

  const visibleResults = useMemo(() => {
    const filtered = results.filter((item) => {
      if (selectedCategories.length && !selectedCategories.includes(item.vehicle?.category)) return false;
      if (selectedTransmissions.length && !selectedTransmissions.includes(item.vehicle?.transmission)) return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      const aPrice = Number(a.pricing?.rental_total);
      const bPrice = Number(b.pricing?.rental_total);
      if (!Number.isFinite(aPrice)) return 1;
      if (!Number.isFinite(bPrice)) return -1;
      return sortBy === 'price_desc' ? bPrice - aPrice : aPrice - bPrice;
    });
  }, [results, selectedCategories, selectedTransmissions, sortBy]);

  const toggle = (setter, value) => setter((current) => (
    current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
  ));

  const resetFilters = () => {
    setSelectedCategories([]);
    setSelectedTransmissions([]);
    setSortBy('price_asc');
  };

  return (
    <div className="car-results-page">
      <Helmet>
        <title>Live Car Rental Search | FareTransit</title>
        <meta name="description" content="Search live Enterprise rental-car availability and send your reservation request directly to FareTransit." />
      </Helmet>

      <section className="car-results-summary-bar">
        <div className="container car-summary-inner">
          <div className="car-summary-info">
            <div className="summary-title-line">
              <i className="fas fa-car" aria-hidden="true" />
              <h2>Rental Cars at {searchParams?.pickupText || 'your selected location'}</h2>
            </div>
            <p className="summary-dates-sub">
              {searchParams?.pickupDate || '—'} ({searchParams?.pickupTime?.substring(0, 5) || '—'}) — {searchParams?.dropoffDate || '—'} ({searchParams?.dropoffTime?.substring(0, 5) || '—'})
              {' '}• Driver age: {searchParams?.driverAge || 30} • {searchParams?.currency || 'USD'}
            </p>
          </div>
          <button type="button" className="edit-search-toggle-btn" onClick={() => setShowEditSearch((open) => !open)}>
            <i className="fas fa-edit" aria-hidden="true" />
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
            <h3><i className="fas fa-sliders-h" aria-hidden="true" /> Filter Cars</h3>
            <button type="button" className="reset-filters-btn" onClick={resetFilters}>Reset All</button>
          </div>

          {categories.length > 0 && (
            <div className="filter-group">
              <h4>Vehicle Category</h4>
              {categories.map((category) => (
                <label key={category} className="filter-checkbox-label">
                  <input type="checkbox" checked={selectedCategories.includes(category)} onChange={() => toggle(setSelectedCategories, category)} />
                  <span>{category}</span>
                </label>
              ))}
            </div>
          )}

          {transmissions.length > 0 && (
            <div className="filter-group">
              <h4>Transmission</h4>
              {transmissions.map((transmission) => (
                <label key={transmission} className="filter-checkbox-label">
                  <input type="checkbox" checked={selectedTransmissions.includes(transmission)} onChange={() => toggle(setSelectedTransmissions, transmission)} />
                  <span>{transmission}</span>
                </label>
              ))}
            </div>
          )}

          <div className="filter-group">
            <h4>How booking works</h4>
            <p style={{ fontSize: '0.86rem', lineHeight: 1.55, color: '#5b6575' }}>
              Choose a live option, send your details to FareTransit, and our reservation team confirms final supplier availability before the booking becomes confirmed.
            </p>
          </div>
        </aside>

        <main className="car-results-main">
          <div className="car-controls-bar">
            <span className="results-count-text">Showing <strong>{visibleResults.length}</strong> live Enterprise option{visibleResults.length === 1 ? '' : 's'}</span>
            <div className="sort-select-wrapper">
              <label htmlFor="car-sort-select">Sort by:</label>
              <select id="car-sort-select" className="car-sort-select" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
              </select>
            </div>
          </div>

          {loading && (
            <div className="car-loading-state" aria-live="polite">
              <i className="fas fa-spinner fa-spin car-loading-icon" aria-hidden="true" />
              <h3>Searching live Enterprise inventory...</h3>
              <p>Checking current vehicles and estimated rates for your dates.</p>
            </div>
          )}

          {!loading && errorMsg && (
            <div className="car-error-state" role="alert">
              <i className="fas fa-exclamation-triangle" aria-hidden="true" />
              <h3>Search unavailable</h3>
              <p>{errorMsg}</p>
              {requestId && <span className="error-req-id">Reference ID: {requestId}</span>}
              <button type="button" className="retry-search-btn" onClick={() => searchParams && fetchCarResults(searchParams)}>Try Again</button>
            </div>
          )}

          {!loading && !errorMsg && !searchParams && (
            <div className="car-empty-state">
              <i className="fas fa-search" aria-hidden="true" />
              <h3>Start a car-rental search</h3>
              <p>Choose an Enterprise pickup location and rental dates to see live options.</p>
              <button type="button" className="reset-filters-btn-large" onClick={() => setShowEditSearch(true)}>Enter Search Details</button>
            </div>
          )}

          {!loading && !errorMsg && searchParams && visibleResults.length === 0 && (
            <div className="car-empty-state">
              <i className="fas fa-car-side" aria-hidden="true" />
              <h3>No matching rental cars found</h3>
              <p>Try different dates, pickup time, vehicle filters, or another Enterprise location.</p>
              {(selectedCategories.length > 0 || selectedTransmissions.length > 0) && (
                <button type="button" className="reset-filters-btn-large" onClick={resetFilters}>Clear Filters</button>
              )}
            </div>
          )}

          {!loading && !errorMsg && visibleResults.length > 0 && (
            <div className="car-cards-list">
              {visibleResults.map((carItem, index) => (
                <CarResultCard key={carItem.id || carItem.vehicle_code || index} result={carItem} searchParams={searchParams} />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default CarSearchResultsPage;
