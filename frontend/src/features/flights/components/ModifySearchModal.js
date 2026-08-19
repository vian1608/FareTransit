import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import AirportAutocomplete, { formatAirportLabel } from './AirportAutocomplete';
import TravelDatePicker from './TravelDatePicker';
import './ModifySearchModal.css';

const UPDATE_TIMEOUT_MS = 12000;
const MAX_TRAVELERS = 9;

function extractIataCode(val) {
  if (!val) return '';
  if (typeof val === 'object') return (val.code || val.iata || '').toUpperCase();
  const str = String(val).toUpperCase();
  const match = str.match(/\b([A-Z]{3,4})\b/);
  return match ? match[1] : (str.length === 3 ? str : '');
}

function resolveInfantCounts(search = {}) {
  const legacyTotal = Math.max(0, parseInt(search.infants || 0, 10) || 0);
  const hasSplitCounts = search.infantsInSeat !== undefined || search.infantsOnLap !== undefined;
  const infantsInSeat = hasSplitCounts ? Math.max(0, parseInt(search.infantsInSeat || 0, 10) || 0) : 0;
  const infantsOnLap = hasSplitCounts
    ? Math.max(0, parseInt(search.infantsOnLap || 0, 10) || 0)
    : legacyTotal;
  return { infantsInSeat, infantsOnLap };
}

function ModifySearchModal({
  isOpen,
  onClose,
  initialSearch = {},
  onUpdateSearch,
  isCheckoutPage = false
}) {
  const resolveOriginVal = (search) => {
    const rawVal = search.origin || search.from || search.departure_airport || search.selectedFlight?.departure?.airport || '';
    const code = extractIataCode(rawVal);
    if (typeof search.origin === 'object' && search.origin && search.origin.code) {
      const cleanCity = formatAirportLabel(search.origin).replace(/\s*\([A-Z]{3,4}\)/i, '').trim();
      return {
        code: (search.origin.code).toUpperCase(),
        city: cleanCity || search.origin.code,
        name: search.origin.name || cleanCity || search.origin.code
      };
    }
    if (code) {
      const cleanCity = formatAirportLabel(rawVal).replace(/\s*\([A-Z]{3,4}\)/i, '').trim();
      return { code, city: cleanCity || code, name: cleanCity || code };
    }
    return '';
  };

  const resolveDestVal = (search) => {
    const rawVal = search.destination || search.to || search.arrival_airport || search.selectedFlight?.arrival?.airport || '';
    const code = extractIataCode(rawVal);
    if (typeof search.destination === 'object' && search.destination && search.destination.code) {
      const cleanCity = formatAirportLabel(search.destination).replace(/\s*\([A-Z]{3,4}\)/i, '').trim();
      return {
        code: (search.destination.code).toUpperCase(),
        city: cleanCity || search.destination.code,
        name: search.destination.name || cleanCity || search.destination.code
      };
    }
    if (code) {
      const cleanCity = formatAirportLabel(rawVal).replace(/\s*\([A-Z]{3,4}\)/i, '').trim();
      return { code, city: cleanCity || code, name: cleanCity || code };
    }
    return '';
  };

  const getUrlDateParam = (key) => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get(key) || '';
    } catch {
      return '';
    }
  };

  const resolveDepartureDate = (search) => {
    return search.departureDate || search.departure || getUrlDateParam('departureDate') || getUrlDateParam('departure') || '';
  };

  const resolveReturnDate = (search) => {
    return search.returnDate || search.return || getUrlDateParam('returnDate') || getUrlDateParam('return') || '';
  };

  const initialDepDate = resolveDepartureDate(initialSearch);
  const initialRetDate = resolveReturnDate(initialSearch);
  const initialInfants = resolveInfantCounts(initialSearch);

  const [tripType, setTripType] = useState(initialSearch.tripType || (initialRetDate ? 'round-trip' : 'one-way'));
  const [origin, setOrigin] = useState(resolveOriginVal(initialSearch));
  const [destination, setDestination] = useState(resolveDestVal(initialSearch));
  const [departureDate, setDepartureDate] = useState(initialDepDate);
  const [returnDate, setReturnDate] = useState(initialRetDate);
  const [adults, setAdults] = useState(parseInt(initialSearch.adults || 1, 10));
  const [children, setChildren] = useState(parseInt(initialSearch.children || 0, 10));
  const [infantsInSeat, setInfantsInSeat] = useState(initialInfants.infantsInSeat);
  const [infantsOnLap, setInfantsOnLap] = useState(initialInfants.infantsOnLap);
  const [cabinClass, setCabinClass] = useState(initialSearch.cabinClass || initialSearch.cabin || 'Economy');

  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCheckoutWarning, setShowCheckoutWarning] = useState(false);

  const dialogRef = useRef(null);

  const closeModal = () => {
    setIsSubmitting(false);
    setShowCheckoutWarning(false);
    if (onClose) onClose();
  };

  const totalTravelers = adults + children + infantsInSeat + infantsOnLap;

  const decrementAdults = () => {
    const nextAdults = Math.max(1, adults - 1);
    setAdults(nextAdults);
    if (infantsOnLap > nextAdults) setInfantsOnLap(nextAdults);
  };

  // Prevent background body scrolling when modal is open. The modal itself is
  // portalled to document.body so page transforms can never trap the backdrop.
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Sync state when modal opens or initialSearch changes.
  useEffect(() => {
    if (isOpen) {
      const depD = resolveDepartureDate(initialSearch);
      const retD = resolveReturnDate(initialSearch);
      const infantCounts = resolveInfantCounts(initialSearch);
      const isRound = (initialSearch.tripType === 'round-trip') || (initialSearch.tripType === 'roundtrip') || !!retD;
      setTripType(isRound ? 'round-trip' : 'one-way');
      setOrigin(resolveOriginVal(initialSearch));
      setDestination(resolveDestVal(initialSearch));
      setDepartureDate(depD);
      setReturnDate(retD);
      setAdults(parseInt(initialSearch.adults || 1, 10));
      setChildren(parseInt(initialSearch.children || 0, 10));
      setInfantsInSeat(infantCounts.infantsInSeat);
      setInfantsOnLap(infantCounts.infantsOnLap);
      setCabinClass(initialSearch.cabinClass || initialSearch.travelClass || initialSearch.cabin || 'Economy');
      setFormError('');
      setIsSubmitting(false);
      setShowCheckoutWarning(false);
    }
  }, [isOpen, initialSearch]);

  // Handle ESC key press.
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) closeModal();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  // closeModal intentionally uses current props/state and is safe for this listener.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSwapAirports = () => {
    const temp = origin;
    setOrigin(destination);
    setDestination(temp);
  };

  const validateSearchForm = () => {
    setFormError('');
    if (!origin) {
      setFormError('Please select a valid origin airport.');
      return false;
    }
    if (!destination) {
      setFormError('Please select a valid destination airport.');
      return false;
    }

    const oCode = extractIataCode(origin);
    const dCode = extractIataCode(destination);

    if (oCode && dCode && oCode === dCode) {
      setFormError('Origin and destination airports cannot be the same.');
      return false;
    }
    if (!departureDate) {
      setFormError('Please select a departure date.');
      return false;
    }
    if (tripType === 'round-trip' && !returnDate) {
      setFormError('Please select a return date for round trip.');
      return false;
    }
    if (tripType === 'round-trip' && departureDate && returnDate && returnDate < departureDate) {
      setFormError('Return date must be on or after the departure date.');
      return false;
    }
    if (adults < 1) {
      setFormError('At least 1 adult passenger is required.');
      return false;
    }
    if (infantsOnLap > adults) {
      setFormError('Infants on lap cannot exceed the number of adult passengers.');
      return false;
    }
    if (totalTravelers > MAX_TRAVELERS) {
      setFormError(`A maximum of ${MAX_TRAVELERS} travelers can be searched at once.`);
      return false;
    }
    return true;
  };

  const handleFormSubmit = (e) => {
    if (e) e.preventDefault();
    if (isSubmitting || !validateSearchForm()) return;

    if (isCheckoutPage && !showCheckoutWarning) {
      setShowCheckoutWarning(true);
      return;
    }

    proceedWithUpdate();
  };

  const proceedWithUpdate = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setFormError('');

    const updatedParams = {
      from: extractIataCode(origin) || (typeof origin === 'object' ? origin.code : origin),
      to: extractIataCode(destination) || (typeof destination === 'object' ? destination.code : destination),
      origin,
      destination,
      departureDate,
      departure: departureDate,
      returnDate: tripType === 'round-trip' ? returnDate : '',
      return: tripType === 'round-trip' ? returnDate : '',
      tripType,
      adults,
      children,
      // `infants` remains the total for backwards-compatible booking forms.
      infants: infantsInSeat + infantsOnLap,
      infantsInSeat,
      infantsOnLap,
      cabinClass,
      cabin: cabinClass
    };

    let timerId;
    try {
      if (!onUpdateSearch) throw new Error('Search update is not available on this page.');

      await Promise.race([
        Promise.resolve().then(() => onUpdateSearch(updatedParams)),
        new Promise((_, reject) => {
          timerId = setTimeout(() => reject(new Error('The search update is taking longer than expected.')), UPDATE_TIMEOUT_MS);
        })
      ]);

      if (timerId) clearTimeout(timerId);
      closeModal();
    } catch (error) {
      if (timerId) clearTimeout(timerId);
      setIsSubmitting(false);
      setFormError(`${error?.message || 'We could not update your search.'} Please try again, or close this window and continue with your current search.`);
    }
  };

  const modal = (
    <div className="modify-search-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
      <div className="modify-search-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="modify-search-title">
        <div className="modify-search-dialog__header">
          <h2 id="modify-search-title">
            <i className="fas fa-edit"></i> Modify Flight Search
          </h2>
          <button type="button" className="close-btn" onClick={closeModal} aria-label="Close modal">
            &times;
          </button>
        </div>

        <div className="modify-search-dialog__body">
          {showCheckoutWarning ? (
            <div className="checkout-warning-box">
              <div className="warning-icon"><i className="fas fa-exclamation-triangle"></i></div>
              <h3>Change Your Search?</h3>
              <p>Changing your search will remove the currently selected flights and reset checkout details. Continue?</p>
              {formError && (
                <div className="modify-search-error" role="alert">
                  <i className="fas fa-exclamation-circle"></i> {formError}
                </div>
              )}
              <div className="warning-actions">
                <button type="button" className="btn-warn btn-warn--continue" onClick={proceedWithUpdate} disabled={isSubmitting}>
                  {isSubmitting ? 'Updating Search...' : 'Continue & Update Search'}
                </button>
                <button type="button" className="btn-warn btn-warn--stay" onClick={() => { setShowCheckoutWarning(false); setIsSubmitting(false); }}>
                  Stay on This Page
                </button>
              </div>
            </div>
          ) : (
            <form id="modify-search-form" onSubmit={handleFormSubmit} className="modify-search-form">
              {formError && (
                <div className="modify-search-error" role="alert">
                  <i className="fas fa-exclamation-circle"></i> {formError}
                </div>
              )}

              <div className="form-group-trip-type">
                <label className="radio-label">
                  <input type="radio" name="modalTripType" value="round-trip" checked={tripType === 'round-trip'} onChange={() => setTripType('round-trip')} />
                  <span>Round Trip</span>
                </label>
                <label className="radio-label">
                  <input type="radio" name="modalTripType" value="one-way" checked={tripType === 'one-way'} onChange={() => setTripType('one-way')} />
                  <span>One Way</span>
                </label>
              </div>

              <div className="modify-search-route">
                <div className="form-col">
                  <AirportAutocomplete label="From" id="modal-origin-airport" value={origin} onChange={(obj) => setOrigin(obj)} placeholder="City or Airport Code" />
                </div>

                <button type="button" className="swap-airports-button" onClick={handleSwapAirports} title="Swap Origin and Destination Airports" aria-label="Swap Origin and Destination Airports">
                  <i className="fas fa-exchange-alt"></i>
                </button>

                <div className="form-col">
                  <AirportAutocomplete label="To" id="modal-destination-airport" value={destination} onChange={(obj) => setDestination(obj)} placeholder="City or Airport Code" />
                </div>
              </div>

              <div className="form-row-dates" style={{ marginTop: '1.25rem' }}>
                <div className="form-col">
                  <label className="form-label-title">Departure Date</label>
                  <TravelDatePicker
                    value={departureDate}
                    onChange={(newDate) => {
                      setDepartureDate(newDate);
                      if (newDate && returnDate && newDate > returnDate) setReturnDate(newDate);
                    }}
                    placeholder="MM/DD/YYYY"
                    minDate={new Date().toISOString().split('T')[0]}
                  />
                </div>

                {tripType === 'round-trip' && (
                  <div className="form-col">
                    <label className="form-label-title">Return Date</label>
                    <TravelDatePicker value={returnDate} onChange={setReturnDate} placeholder="MM/DD/YYYY" minDate={departureDate || new Date().toISOString().split('T')[0]} />
                  </div>
                )}
              </div>

              <div className="form-row-passengers" style={{ marginTop: '1.25rem' }}>
                <div className="form-col">
                  <label className="form-label-title">Adults (12+)</label>
                  <div className="counter-controls">
                    <button type="button" onClick={decrementAdults} disabled={adults <= 1}>-</button>
                    <span>{adults}</span>
                    <button type="button" onClick={() => setAdults(Math.min(9, adults + 1))} disabled={totalTravelers >= MAX_TRAVELERS}>+</button>
                  </div>
                </div>

                <div className="form-col">
                  <label className="form-label-title">Children (2-11)</label>
                  <div className="counter-controls">
                    <button type="button" onClick={() => setChildren(Math.max(0, children - 1))} disabled={children <= 0}>-</button>
                    <span>{children}</span>
                    <button type="button" onClick={() => setChildren(Math.min(8, children + 1))} disabled={totalTravelers >= MAX_TRAVELERS}>+</button>
                  </div>
                </div>

                <div className="form-col">
                  <label className="form-label-title">Infants in seat (&lt;2)</label>
                  <div className="counter-controls">
                    <button type="button" onClick={() => setInfantsInSeat(Math.max(0, infantsInSeat - 1))} disabled={infantsInSeat <= 0}>-</button>
                    <span>{infantsInSeat}</span>
                    <button type="button" onClick={() => setInfantsInSeat(infantsInSeat + 1)} disabled={totalTravelers >= MAX_TRAVELERS}>+</button>
                  </div>
                </div>

                <div className="form-col">
                  <label className="form-label-title">Infants on lap (&lt;2)</label>
                  <div className="counter-controls">
                    <button type="button" onClick={() => setInfantsOnLap(Math.max(0, infantsOnLap - 1))} disabled={infantsOnLap <= 0}>-</button>
                    <span>{infantsOnLap}</span>
                    <button type="button" onClick={() => setInfantsOnLap(infantsOnLap + 1)} disabled={infantsOnLap >= adults || totalTravelers >= MAX_TRAVELERS}>+</button>
                  </div>
                </div>

                <div className="form-col">
                  <label className="form-label-title">Cabin Class</label>
                  <select value={cabinClass} onChange={(e) => setCabinClass(e.target.value)} className="cabin-select">
                    <option value="Economy">Economy</option>
                    <option value="Premium Economy">Premium Economy</option>
                    <option value="Business">Business</option>
                    <option value="First">First Class</option>
                  </select>
                </div>
              </div>
            </form>
          )}
        </div>

        <div className="modify-search-dialog__footer">
          <button type="button" className="btn-cancel-search" onClick={closeModal}>Cancel</button>
          <button type="button" className="btn-update-search" onClick={handleFormSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <><i className="fas fa-circle-notch fa-spin"></i> Updating...</>
            ) : (
              <><i className="fas fa-search"></i> Update Search</>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

export default ModifySearchModal;