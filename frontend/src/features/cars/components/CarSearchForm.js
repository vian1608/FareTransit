import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LocationAutocomplete from './LocationAutocomplete';
import CustomSelect from '../../../shared/components/CustomSelect';
import TravelDatePicker from '../../flights/components/TravelDatePicker';
import './CarSearchForm.css';

const TIME_OPTIONS = [
  { value: '06:00:00', label: '06:00 AM' },
  { value: '08:00:00', label: '08:00 AM' },
  { value: '09:00:00', label: '09:00 AM' },
  { value: '10:00:00', label: '10:00 AM' },
  { value: '11:00:00', label: '11:00 AM' },
  { value: '12:00:00', label: '12:00 PM (Noon)' },
  { value: '13:00:00', label: '01:00 PM' },
  { value: '14:00:00', label: '02:00 PM' },
  { value: '15:00:00', label: '03:00 PM' },
  { value: '16:00:00', label: '04:00 PM' },
  { value: '17:00:00', label: '05:00 PM' },
  { value: '18:00:00', label: '06:00 PM' },
  { value: '20:00:00', label: '08:00 PM' },
  { value: '22:00:00', label: '10:00 PM' }
];

const COUNTRY_OPTIONS = [{ value: 'us', label: 'United States' }];
const CURRENCY_OPTIONS = [{ value: 'USD', label: 'USD ($)' }];

function futureDate(daysOffset = 1) {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().split('T')[0];
}

function CarSearchForm({ initialValues = {}, compact = false }) {
  const navigate = useNavigate();
  const [sameDropoff, setSameDropoff] = useState(initialValues.sameDropoff !== false);
  const [pickupText, setPickupText] = useState(initialValues.pickupText || '');
  const [pickupLocationObj, setPickupLocationObj] = useState(initialValues.pickupLocationObj || null);
  const [dropoffText, setDropoffText] = useState(initialValues.dropoffText || '');
  const [dropoffLocationObj, setDropoffLocationObj] = useState(initialValues.dropoffLocationObj || null);
  const [pickupDate, setPickupDate] = useState(initialValues.pickupDate || futureDate(7));
  const [pickupTime, setPickupTime] = useState(initialValues.pickupTime || '12:00:00');
  const [dropoffDate, setDropoffDate] = useState(initialValues.dropoffDate || futureDate(10));
  const [dropoffTime, setDropoffTime] = useState(initialValues.dropoffTime || '12:00:00');
  const [driverAge, setDriverAge] = useState(initialValues.driverAge || 25);
  const [driverCountry, setDriverCountry] = useState('us');
  const [currency, setCurrency] = useState('USD');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    setErrorMsg('');

    if (!pickupLocationObj?.id) {
      setErrorMsg('Please choose a pickup location from the Enterprise location list.');
      return;
    }
    const selectedDropoff = sameDropoff ? pickupLocationObj : dropoffLocationObj;
    if (!selectedDropoff?.id) {
      setErrorMsg('Please choose a return location from the Enterprise location list.');
      return;
    }

    const ageNum = Number.parseInt(driverAge, 10);
    if (!Number.isInteger(ageNum) || ageNum < 18 || ageNum > 99) {
      setErrorMsg('Driver age must be between 18 and 99 years.');
      return;
    }
    const pickupDt = new Date(`${pickupDate}T${pickupTime}`);
    const dropoffDt = new Date(`${dropoffDate}T${dropoffTime}`);
    if (Number.isNaN(pickupDt.getTime()) || Number.isNaN(dropoffDt.getTime()) || dropoffDt <= pickupDt) {
      setErrorMsg('Return date/time must be after pickup date/time.');
      return;
    }

    const query = new URLSearchParams({
      pickupId: pickupLocationObj.id,
      dropoffId: selectedDropoff.id,
      pickup: pickupLocationObj.airportCode || pickupLocationObj.name || pickupText,
      dropoff: selectedDropoff.airportCode || selectedDropoff.name || (sameDropoff ? pickupText : dropoffText),
      pickupLabel: pickupText,
      dropoffLabel: sameDropoff ? pickupText : dropoffText,
      pickupDate,
      pickupTime,
      dropoffDate,
      dropoffTime,
      driverAge: String(ageNum),
      driverCountry,
      currency
    });
    navigate(`/car-rentals/results?${query.toString()}`);
  };

  return (
    <form className={`car-search-form ${compact ? 'car-search-form--compact' : ''}`} onSubmit={handleSubmit}>
      {errorMsg && (
        <div className="car-search-error-banner" role="alert">
          <i className="fas fa-exclamation-circle" aria-hidden="true" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="car-search-meta-bar">
        <div className="car-meta-item">
          <label htmlFor="driver-age-input" className="car-meta-label"><i className="fas fa-id-card" aria-hidden="true" /><span>Driver Age</span></label>
          <input id="driver-age-input" type="number" className="car-age-input" min="18" max="99" value={driverAge} onChange={(e) => setDriverAge(e.target.value)} required />
        </div>
        <div className="car-meta-item">
          <label className="car-meta-label"><i className="fas fa-globe" aria-hidden="true" /><span>Country</span></label>
          <CustomSelect id="driver-country-select" value={driverCountry} onChange={setDriverCountry} options={COUNTRY_OPTIONS} />
        </div>
        <div className="car-meta-item">
          <label className="car-meta-label"><i className="fas fa-dollar-sign" aria-hidden="true" /><span>Currency</span></label>
          <CustomSelect id="car-currency-select" value={currency} onChange={setCurrency} options={CURRENCY_OPTIONS} />
        </div>
        <div className="car-same-dropoff-toggle">
          <label className="car-checkbox-label"><input type="checkbox" checked={sameDropoff} onChange={(e) => setSameDropoff(e.target.checked)} /><span>Return car to same location</span></label>
        </div>
      </div>

      <div className="car-search-row car-locations-row">
        <div className="car-search-field">
          <LocationAutocomplete label="Pickup Location" id="pickup-location-input" value={pickupText} onChange={(text, obj) => { setPickupText(text); setPickupLocationObj(obj); }} placeholder="Airport, city, or ZIP code..." required />
        </div>
        {!sameDropoff && (
          <div className="car-search-field">
            <LocationAutocomplete label="Return Location" id="dropoff-location-input" value={dropoffText} onChange={(text, obj) => { setDropoffText(text); setDropoffLocationObj(obj); }} placeholder="Airport, city, or ZIP code..." required />
          </div>
        )}
      </div>

      <div className="car-search-row car-dates-row">
        <div className="car-search-field car-datetime-group">
          <TravelDatePicker id="car-pickup-date" label="Pickup Date" value={pickupDate} onChange={setPickupDate} minDate={new Date().toISOString().split('T')[0]} theme="cars" required />
          <div className="car-time-picker"><label className="car-meta-label">Time</label><CustomSelect id="car-pickup-time" value={pickupTime} onChange={setPickupTime} options={TIME_OPTIONS} /></div>
        </div>
        <div className="car-search-field car-datetime-group">
          <TravelDatePicker id="car-dropoff-date" label="Return Date" value={dropoffDate} onChange={setDropoffDate} minDate={pickupDate || new Date().toISOString().split('T')[0]} theme="cars" required />
          <div className="car-time-picker"><label className="car-meta-label">Time</label><CustomSelect id="car-dropoff-time" value={dropoffTime} onChange={setDropoffTime} options={TIME_OPTIONS} /></div>
        </div>
      </div>

      <div className="car-search-submit-wrapper">
        <button type="submit" className="car-search-submit-btn"><i className="fas fa-car" aria-hidden="true" /><span>Search Enterprise Cars</span></button>
      </div>
    </form>
  );
}

export default CarSearchForm;
