import React from 'react';
import ItineraryCard from '../components/ItineraryCard';
import DateOfBirthPicker from '../../../shared/components/DateOfBirthPicker';
import TravelDatePicker from '../../flights/components/TravelDatePicker';
import CountrySelect from '../../../shared/components/CountrySelect';
import { safeUpper } from '../../../shared/utils/itineraryNormalizer';

export default function PassengerDetailsStep({
  flight,
  returnFlight,
  pricing,
  passengers,
  passengerErrors,
  suffixOptions,
  loyaltyPrograms,
  onPassengerChange,
  onModifySearch,
  onContinue,
}) {
  const perTraveller = (Number(pricing.total || 0) / Math.max(1, passengers.length)).toFixed(2);

  return (
    <>
      <section className="booking-v3-section booking-v3-itinerary-section">
        <div className="booking-v3-section-header">
          <div>
            <p className="booking-v3-eyebrow"><i className="fas fa-map-marked-alt" /> Your Selected Itinerary</p>
            <h1>Review your flight</h1>
          </div>
          <button type="button" className="booking-v3-secondary" onClick={onModifySearch}>
            <i className="fas fa-pen" aria-hidden="true" /> Modify Search
          </button>
        </div>

        <div className="booking-v3-fare-card">
          <div><span>Today's Fare</span><strong>${pricing.total} <small>USD</small></strong></div>
          <p>Per traveler <b>${perTraveller}</b> × {passengers.length} traveler{passengers.length === 1 ? '' : 's'} = <b>${pricing.total} total</b></p>
        </div>

        <div className={`booking-itinerary-top-grid ${returnFlight ? 'booking-itinerary-top-grid--roundtrip' : 'booking-itinerary-top-grid--single'}`}>
          <ItineraryCard flight={flight} label="Outbound Flight" labelColor="#1e3a5f" isTrain={Boolean(flight?.isTrain)} />
          {returnFlight && <ItineraryCard flight={returnFlight} label="Return Flight" labelColor="#8b1538" isTrain={Boolean(returnFlight?.isTrain)} />}
        </div>
      </section>

      <section className="booking-v3-section booking-v3-step-section booking-v3-step-section--travellers" id="travellers">
        <div className="booking-v3-section-header booking-v3-section-header--simple">
          <div>
            <p className="booking-v3-eyebrow">1. Passenger Details</p>
            <h1>Passenger Details</h1>
          </div>
        </div>
        <p className="booking-v3-section-intro">
          {passengers.length} traveler{passengers.length === 1 ? '' : 's'}. Please make sure each full name is entered exactly as it appears on the traveler’s government-issued identification.
        </p>

        <div className="booking-v3-passenger-list">
          {passengers.map((passenger, index) => (
            <div key={index} data-passenger-index={index} className={`passenger-card-block booking-v3-passenger${passengerErrors[index]?.length ? ' tfs-passenger-card-error' : ''}`}>
              <div className="booking-v3-passenger-title">
                <div><strong>Passenger {index + 1}</strong><span>{safeUpper(passenger.role || 'adult')}</span></div>
                <small>All required fields are marked *</small>
              </div>

              <div className="booking-v3-name-grid">
                <label className="booking-v3-field booking-v3-title-field">Title *
                  <select value={passenger.title} onChange={(event) => onPassengerChange(index, 'title', event.target.value)}>
                    <option value="">Select</option><option value="Mr">Mr.</option><option value="Mrs">Mrs.</option><option value="Ms">Ms.</option><option value="Miss">Miss</option><option value="Master">Master</option><option value="Dr">Dr.</option>
                  </select>
                </label>
                <label className="booking-v3-field">First Name *<input value={passenger.firstName} onChange={(event) => onPassengerChange(index, 'firstName', event.target.value)} placeholder="First Name" /></label>
                <label className="booking-v3-field">Middle Name<input value={passenger.middleName} onChange={(event) => onPassengerChange(index, 'middleName', event.target.value)} placeholder="Middle Name" /></label>
                <label className="booking-v3-field">Last Name *<input value={passenger.lastName} onChange={(event) => onPassengerChange(index, 'lastName', event.target.value)} placeholder="Last Name" /></label>
                <label className="booking-v3-field booking-v3-suffix-field">Suffix
                  <select value={passenger.suffix} onChange={(event) => onPassengerChange(index, 'suffix', event.target.value)}>
                    {suffixOptions.map((suffix) => <option key={suffix || 'none'} value={suffix}>{suffix || '--'}</option>)}
                  </select>
                </label>
              </div>

              <div className="booking-v3-two-grid booking-v3-grid-gap">
                <label className="booking-v3-field">Loyalty Program (optional)
                  <select value={passenger.loyaltyProgram} onChange={(event) => onPassengerChange(index, 'loyaltyProgram', event.target.value)}>
                    {loyaltyPrograms.map((program) => <option key={program || 'none'} value={program}>{program || 'Select loyalty program'}</option>)}
                  </select>
                </label>
                <label className="booking-v3-field">Frequent Flyer Number (optional)
                  <input value={passenger.frequentFlyerNumber} onChange={(event) => onPassengerChange(index, 'frequentFlyerNumber', event.target.value)} placeholder="Frequent Flyer #" autoComplete="off" />
                </label>
              </div>

              <div className="booking-v3-two-grid booking-v3-grid-gap">
                <div className="booking-v3-field"><label>Date of Birth *</label><DateOfBirthPicker id={`dob-pass-${index}`} value={passenger.dateOfBirth} onChange={(value) => onPassengerChange(index, 'dateOfBirth', value)} /></div>
                <label className="booking-v3-field">Gender *
                  <select value={passenger.gender} onChange={(event) => onPassengerChange(index, 'gender', event.target.value)}><option value="">Select Gender</option><option value="male">Male</option><option value="female">Female</option></select>
                </label>
              </div>

              <div className="booking-v3-three-grid booking-v3-grid-gap">
                <div className="booking-v3-field"><label>Nationality</label><CountrySelect id={`nat-pass-${index}`} value={passenger.nationality} onChange={(value) => onPassengerChange(index, 'nationality', value)} /></div>
                <label className="booking-v3-field">Passport Number<input value={passenger.passportNumber} onChange={(event) => onPassengerChange(index, 'passportNumber', event.target.value)} placeholder="Passport Number" /></label>
                <div className="booking-v3-field"><label>Passport Expiry</label><TravelDatePicker id={`passport-exp-${index}`} value={passenger.passportExpiry} onChange={(value) => onPassengerChange(index, 'passportExpiry', value)} placeholder="YYYY-MM-DD" /></div>
              </div>

              <div className="booking-v3-secure-flight-info">
                <h3>Secure Flight Info <i className="fas fa-info-circle" aria-hidden="true" /></h3>
                <div className="booking-v3-two-grid">
                  <label className="booking-v3-field">Known Traveler # (optional)<input value={passenger.knownTravelerNumber} onChange={(event) => onPassengerChange(index, 'knownTravelerNumber', event.target.value)} placeholder="Known Traveler #" autoComplete="off" /></label>
                  <label className="booking-v3-field">Redress # (optional)<input value={passenger.redressNumber} onChange={(event) => onPassengerChange(index, 'redressNumber', event.target.value)} placeholder="Redress #" autoComplete="off" /></label>
                </div>
              </div>

              {passengerErrors[index]?.length > 0 && <p className="booking-v3-inline-error">Please check: {passengerErrors[index].join(', ')}</p>}
            </div>
          ))}
        </div>

        <div className="booking-v3-actions booking-v3-actions--end">
          <button type="button" className="booking-v3-primary" onClick={onContinue}>Continue to Contact & Assistance <span aria-hidden="true">→</span></button>
        </div>
      </section>
    </>
  );
}
