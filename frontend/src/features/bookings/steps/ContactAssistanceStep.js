import React from 'react';
import InternationalPhoneInput from '../../../shared/components/InternationalPhoneInput';
import EmailInput from '../../../shared/components/EmailInput';

export default function ContactAssistanceStep({
  primaryContact,
  setPrimaryContact,
  contactSameAsTraveller,
  setContactSameAsTraveller,
  specialRequests,
  setSpecialRequests,
  onBack,
  onContinue,
}) {
  return (
    <section className="booking-v3-section booking-v3-step-section booking-v3-step-section--contact">
      <div className="booking-v3-section-header booking-v3-section-header--simple">
        <div><p className="booking-v3-eyebrow">2. Contact & Assistance</p><h1>How should we contact you?</h1></div>
      </div>

      <div className="booking-v3-subcard">
        <h2>Primary Contact Details</h2>
        <label className="booking-v3-toggle-row">
          <input type="checkbox" checked={contactSameAsTraveller} onChange={(event) => setContactSameAsTraveller(event.target.checked)} />
          <span>Use Passenger #1 as primary contact</span>
        </label>
        <div className="booking-v3-two-grid booking-v3-grid-gap">
          <label className="booking-v3-field">Contact First Name *<input value={primaryContact.firstName} onChange={(event) => setPrimaryContact((previous) => ({ ...previous, firstName: event.target.value }))} /></label>
          <label className="booking-v3-field">Contact Last Name *<input value={primaryContact.lastName} onChange={(event) => setPrimaryContact((previous) => ({ ...previous, lastName: event.target.value }))} /></label>
        </div>
        <div className="booking-v3-two-grid booking-v3-grid-gap">
          <div className="booking-v3-field"><label>Email Address (For E-Ticket) *</label><EmailInput id="contact-email" value={primaryContact.email} onChange={(value) => setPrimaryContact((previous) => ({ ...previous, email: value }))} required /></div>
          <div className="booking-v3-field"><label>Phone Number (For Flight Updates) *</label><InternationalPhoneInput id="contact-phone" value={primaryContact.phone} onChange={(value) => setPrimaryContact((previous) => ({ ...previous, phone: value }))} required /></div>
        </div>
      </div>

      <div className="booking-v3-subcard booking-v3-assistance-card">
        <div className="booking-v3-assistance-heading">
          <div>
            <h2>Special Requests & Preferences</h2>
            <p>Tell us about any assistance or preferences our travel specialist should review with your reservation.</p>
          </div>
          {(specialRequests.wheelchair || specialRequests.mealPreference !== 'none' || specialRequests.seatingPreference !== 'none' || specialRequests.notes.trim()) && (
            <span className="booking-v3-request-badge">Special request added</span>
          )}
        </div>
        <div className="booking-v3-two-grid booking-v3-grid-gap">
          <label className="booking-v3-field">Meal Preference
            <select value={specialRequests.mealPreference} onChange={(event) => setSpecialRequests((previous) => ({ ...previous, mealPreference: event.target.value }))}>
              <option value="none">Standard Airline Meal</option><option value="vegetarian">Vegetarian / Vegan</option><option value="kosher">Kosher</option><option value="halal">Halal</option><option value="child">Child Meal</option>
            </select>
          </label>
          <label className="booking-v3-field">Seat Preference
            <select value={specialRequests.seatingPreference} onChange={(event) => setSpecialRequests((previous) => ({ ...previous, seatingPreference: event.target.value }))}>
              <option value="none">No Preference</option><option value="aisle">Aisle Seat</option><option value="window">Window Seat</option><option value="extra_legroom">Extra Legroom (if available)</option>
            </select>
          </label>
        </div>
        <label className="booking-v3-toggle-row booking-v3-grid-gap booking-v3-wheelchair-row">
          <input type="checkbox" checked={specialRequests.wheelchair} onChange={(event) => setSpecialRequests((previous) => ({ ...previous, wheelchair: event.target.checked }))} />
          <span><strong>Request Wheelchair Assistance</strong><small>We will flag this prominently for the travel specialist handling the booking.</small></span>
        </label>
        <label className="booking-v3-field booking-v3-grid-gap">Additional Airline / Assistance Requests
          <textarea rows={4} value={specialRequests.notes} onChange={(event) => setSpecialRequests((previous) => ({ ...previous, notes: event.target.value }))} placeholder="Special assistance, seating, mobility, medical-device coordination, or other requests" />
        </label>
      </div>

      <div className="booking-v3-actions">
        <button type="button" className="booking-v3-icon-back" aria-label="Previous step" onClick={onBack}>‹</button>
        <button type="button" className="booking-v3-primary" onClick={onContinue}>Continue to Trip Protection <span aria-hidden="true">→</span></button>
      </div>
    </section>
  );
}
