import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import CarSearchForm from '../components/CarSearchForm';
import EnterpriseCarResultCard from '../components/EnterpriseCarResultCard';
import enterpriseRentalApi from '../enterpriseRentalApi';
import './CarSearchResultsPage.css';

function futureDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

function buildSearchFromUrl(urlParams) {
  const pickupId = String(urlParams.get('pickupId') || '').trim();
  if (!pickupId) return null;
  const dropoffId = String(urlParams.get('dropoffId') || pickupId).trim();
  const pickupCode = urlParams.get('pickup') || '';
  const dropoffCode = urlParams.get('dropoff') || pickupCode;
  const pickupText = urlParams.get('pickupLabel') || pickupCode;
  const dropoffText = urlParams.get('dropoffLabel') || dropoffCode;
  return {
    pickupId,
    dropoffId,
    pickupText,
    dropoffText,
    pickupLocationObj: { type: 'enterprise', id: pickupId, airportCode: pickupCode, name: pickupText, label: pickupText },
    dropoffLocationObj: { type: 'enterprise', id: dropoffId, airportCode: dropoffCode, name: dropoffText, label: dropoffText },
    sameDropoff: pickupId === dropoffId,
    pickupDate: urlParams.get('pickupDate') || futureDate(7),
    pickupTime: urlParams.get('pickupTime') || '12:00:00',
    dropoffDate: urlParams.get('dropoffDate') || futureDate(10),
    dropoffTime: urlParams.get('dropoffTime') || '12:00:00',
    driverAge: Number.parseInt(urlParams.get('driverAge') || '25', 10),
    driverCountry: 'us',
    currency: 'USD'
  };
}

function toApiSearch(params) {
  return {
    location_id: params.pickupId,
    return_location_id: params.dropoffId || params.pickupId,
    pickup_date: params.pickupDate,
    pickup_time: String(params.pickupTime || '12:00').slice(0, 5),
    return_date: params.dropoffDate,
    return_time: String(params.dropoffTime || '12:00').slice(0, 5),
    renter_age: params.driverAge || 25,
    currency: 'USD',
    country_code: 'US'
  };
}

export default function CarSearchResultsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const requestSequence = useRef(0);
  const [searchParams, setSearchParams] = useState(null);
  const [searchMeta, setSearchMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [results, setResults] = useState([]);
  const [showEditSearch, setShowEditSearch] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedTransmissions, setSelectedTransmissions] = useState([]);
  const [sortBy, setSortBy] = useState('price_asc');

  useEffect(() => {
    const parsed = buildSearchFromUrl(new URLSearchParams(location.search));
    setSearchParams(parsed);
    setSelectedCategories([]);
    setSelectedTransmissions([]);
    if (!parsed) {
      setLoading(false);
      setResults([]);
    }
  }, [location.search]);

  const fetchCarResults = useCallback(async (paramsObj) => {
    if (!paramsObj) return;
    const sequence = ++requestSequence.current;
    setLoading(true);
    setErrorMsg('');
    try {
      const data = await enterpriseRentalApi.searchVehicles(toApiSearch(paramsObj));
      if (sequence !== requestSequence.current) return;
      setResults(Array.isArray(data?.vehicles) ? data.vehicles : []);
      setSearchMeta(data || null);
    } catch (error) {
      if (sequence !== requestSequence.current) return;
      setErrorMsg(error.message || 'Enterprise vehicle search is temporarily unavailable. Please try again.');
      setResults([]);
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (searchParams) fetchCarResults(searchParams);
  }, [searchParams, fetchCarResults]);

  const categoryOptions = useMemo(() => [...new Set(results.map((item) => item.category || item.name).filter(Boolean))].sort(), [results]);
  const transmissionOptions = useMemo(() => [...new Set(results.map((item) => item.transmission).filter(Boolean))].sort(), [results]);

  const visibleResults = useMemo(() => {
    let list = results.filter((item) => {
      const category = item.category || item.name;
      if (selectedCategories.length && !selectedCategories.includes(category)) return false;
      if (selectedTransmissions.length && !selectedTransmissions.includes(item.transmission)) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sortBy === 'price_desc') return Number(b.totalPrice || 0) - Number(a.totalPrice || 0);
      if (sortBy === 'daily_asc') return Number(a.dailyRate || 0) - Number(b.dailyRate || 0);
      return Number(a.totalPrice || 0) - Number(b.totalPrice || 0);
    });
    return list;
  }, [results, selectedCategories, selectedTransmissions, sortBy]);

  const toggle = (setter, value) => setter((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);

  const handleSelect = async (vehicle) => {
    const quote = await enterpriseRentalApi.createQuote(vehicle.vehicleCode, toApiSearch(searchParams));
    navigate(`/car-rentals/checkout/${encodeURIComponent(quote.quoteToken)}`);
  };

  const pickupName = searchMeta?.pickupLocation?.name || searchParams?.pickupText || 'Enterprise location';

  return (
    <div className="car-results-page">
      <Helmet>
        <title>Enterprise Car Rental Results | FareTransit</title>
        <meta name="description" content="Search current Enterprise vehicle classes and continue to secure checkout with FareTransit reservation assistance." />
      </Helmet>

      <section className="car-results-summary-bar">
        <div className="container car-summary-inner">
          <div className="car-summary-info">
            <div className="summary-title-line"><i className="fas fa-car" aria-hidden="true" /><h2>Enterprise rentals at {pickupName}</h2></div>
            <p className="summary-dates-sub">
              {searchParams?.pickupDate || '—'} ({searchParams?.pickupTime?.slice(0, 5) || '—'}) — {searchParams?.dropoffDate || '—'} ({searchParams?.dropoffTime?.slice(0, 5) || '—'})
              {' '}• Driver age {searchParams?.driverAge || 25} • USD
            </p>
          </div>
          <button type="button" className="edit-search-toggle-btn" onClick={() => setShowEditSearch((open) => !open)}><i className="fas fa-edit" /><span>{showEditSearch ? 'Close Search' : 'Modify Search'}</span></button>
        </div>
      </section>

      {showEditSearch && <section className="car-edit-search-drawer"><div className="container"><CarSearchForm initialValues={searchParams || {}} compact /></div></section>}

      <div className="container car-results-container">
        <aside className="car-filter-sidebar">
          <div className="filter-header"><h3><i className="fas fa-sliders-h" /> Filter Cars</h3><button type="button" className="reset-filters-btn" onClick={() => { setSelectedCategories([]); setSelectedTransmissions([]); setSortBy('price_asc'); }}>Reset All</button></div>
          {categoryOptions.length > 0 && <div className="filter-group"><h4>Vehicle Category</h4>{categoryOptions.map((category) => <label key={category} className="filter-checkbox-label"><input type="checkbox" checked={selectedCategories.includes(category)} onChange={() => toggle(setSelectedCategories, category)} /><span>{category}</span></label>)}</div>}
          {transmissionOptions.length > 0 && <div className="filter-group"><h4>Transmission</h4>{transmissionOptions.map((transmission) => <label key={transmission} className="filter-checkbox-label"><input type="checkbox" checked={selectedTransmissions.includes(transmission)} onChange={() => toggle(setSelectedTransmissions, transmission)} /><span>{transmission}</span></label>)}</div>}
          <div className="filter-group"><p style={{ fontSize: '0.82rem', lineHeight: 1.5 }}>Filters are applied locally, so changing them does not trigger another supplier search.</p></div>
        </aside>

        <main className="car-results-main">
          <div className="car-controls-bar">
            <span className="results-count-text">Showing <strong>{visibleResults.length}</strong> of {results.length} available vehicle classes</span>
            <div className="sort-select-wrapper"><label htmlFor="car-sort-select">Sort by:</label><select id="car-sort-select" className="car-sort-select" value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="price_asc">Total: Low to High</option><option value="price_desc">Total: High to Low</option><option value="daily_asc">Daily Rate: Low to High</option></select></div>
          </div>

          {loading && <div className="car-loading-state" aria-live="polite"><i className="fas fa-spinner fa-spin car-loading-icon" /><h3>Checking Enterprise availability...</h3><p>Loading current vehicle classes and rates</p></div>}

          {!loading && errorMsg && <div className="car-error-state" role="alert"><i className="fas fa-exclamation-triangle" /><h3>Search Unavailable</h3><p>{errorMsg}</p><button type="button" className="retry-search-btn" onClick={() => searchParams && fetchCarResults(searchParams)}>Try Again</button></div>}

          {!loading && !errorMsg && searchParams && results.length === 0 && <div className="car-empty-state"><i className="fas fa-car-side" /><h3>No Enterprise vehicle classes found</h3><p>Try changing your dates, time, driver age, or location.</p><button type="button" className="reset-filters-btn-large" onClick={() => setShowEditSearch(true)}>Modify Search</button></div>}

          {!loading && !errorMsg && visibleResults.length > 0 && <div className="car-cards-list">{visibleResults.map((vehicle) => <EnterpriseCarResultCard key={vehicle.vehicleCode || `${vehicle.name}-${vehicle.totalPrice}`} vehicle={vehicle} onSelect={handleSelect} />)}</div>}
        </main>
      </div>
    </div>
  );
}
