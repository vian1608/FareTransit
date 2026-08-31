import React from 'react';
import { Link } from 'react-router-dom';
import PaymentCardEntry from '../components/PaymentCardEntry';

export default function PaymentBillingStep({
  paymentCardRef,
  billing,
  setBilling,
  fieldErrors,
  clearCardErrors,
  countries,
  usStates,
  tripProtection,
  flexAmount,
  baseFare,
  reservationTotal,
  termsAccepted,
  setTermsAccepted,
  processing,
  onBack,
}) {
  return (
    <section className="booking-v3-section booking-v3-step-section booking-v3-step-section--payment booking-v3-payment-section">
      <div className="booking-v3-section-header booking-v3-section-header--simple">
        <div><p className="booking-v3-eyebrow">4. Payment & Billing</p><h1>Payment & Billing</h1></div>
      </div>

      <div className="booking-v3-payment-card card-payment-container">
        <div className="booking-v3-payment-title-row">
          <div className="booking-v3-payment-title"><span className="booking-v3-payment-radio"><span /></span><h2>Add New Credit or Debit Card</h2></div>
          <div className="booking-v3-card-logos" aria-label="Accepted card brands">
            <i className="fab fa-cc-amex" title="American Express" /><i className="fab fa-cc-visa" title="Visa" /><i className="fab fa-cc-mastercard" title="Mastercard" /><i className="fab fa-cc-discover" title="Discover" /><i className="fab fa-cc-jcb" title="JCB" /><i className="fab fa-cc-diners-club" title="Diners Club" /><span>UATP</span>
          </div>
        </div>
        <p className="booking-v3-required-note">All fields are required unless noted</p>

        <PaymentCardEntry
          ref={paymentCardRef}
          nameOnCard={billing.cardholderName}
          onNameChange={(value) => setBilling((previous) => ({ ...previous, cardholderName: value }))}
          onFocus={clearCardErrors}
        />
        {fieldErrors.cardholderName && <p className="booking-v3-field-error">{fieldErrors.cardholderName}</p>}

        <label className="booking-v3-floating-field booking-v3-payment-full-field">
          <span>Country</span>
          <select value={billing.country} onChange={(event) => setBilling((previous) => ({ ...previous, country: event.target.value, state: event.target.value === 'United States' ? previous.state : '' }))}>
            {countries.map((country) => <option key={country} value={country}>{country}</option>)}
          </select>
        </label>
        {fieldErrors.country && <p className="booking-v3-field-error">{fieldErrors.country}</p>}

        <label className="booking-v3-floating-field booking-v3-payment-full-field">
          <span>Address Line 1</span>
          <input id="billingAddress" value={billing.addressLine1} onChange={(event) => setBilling((previous) => ({ ...previous, addressLine1: event.target.value }))} placeholder="Address Line 1" autoComplete="address-line1" />
        </label>
        {fieldErrors.addressLine1 && <p className="booking-v3-field-error">{fieldErrors.addressLine1}</p>}

        <label className="booking-v3-floating-field booking-v3-payment-full-field">
          <span>Address Line 2 (optional)</span>
          <input value={billing.addressLine2} onChange={(event) => setBilling((previous) => ({ ...previous, addressLine2: event.target.value }))} placeholder="Address Line 2" autoComplete="address-line2" />
        </label>

        <div className="booking-v3-address-row">
          <label className="booking-v3-floating-field">
            <span>City</span>
            <input value={billing.city} onChange={(event) => setBilling((previous) => ({ ...previous, city: event.target.value }))} placeholder="City" autoComplete="address-level2" />
          </label>
          <label className="booking-v3-floating-field">
            <span>State/Province</span>
            {billing.country === 'United States' ? (
              <select value={billing.state} onChange={(event) => setBilling((previous) => ({ ...previous, state: event.target.value }))} autoComplete="address-level1">
                <option value="">State/Province</option>
                {usStates.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
              </select>
            ) : (
              <input value={billing.state} onChange={(event) => setBilling((previous) => ({ ...previous, state: event.target.value }))} placeholder="State/Province" autoComplete="address-level1" />
            )}
          </label>
          <label className="booking-v3-floating-field">
            <span>Postal Code</span>
            <input value={billing.postalCode} onChange={(event) => setBilling((previous) => ({ ...previous, postalCode: event.target.value }))} placeholder="Postal Code" autoComplete="postal-code" />
          </label>
        </div>
        {(fieldErrors.city || fieldErrors.state || fieldErrors.postalCode) && <p className="booking-v3-field-error">{fieldErrors.city || fieldErrors.state || fieldErrors.postalCode}</p>}
      </div>

      <div className="booking-v3-price-breakdown price-breakdown-section">
        <div className="price-row"><span>Flight fare</span><strong>${Number(baseFare).toFixed(2)}</strong></div>
        <div className="price-row"><span>FareTransit Flex Assist</span><strong>{tripProtection ? `$${flexAmount.toFixed(2)}` : '$0.00'}</strong></div>
        <div className="price-row price-row--total"><span>Reservation total</span><strong className="price-total-amount booking-itinerary-pricing-summary__discounted">${reservationTotal.toFixed(2)} USD</strong></div>
      </div>

      <div className="booking-v3-availability-note"><i className="fas fa-headset" aria-hidden="true" /><p>Our travel specialist may call you to confirm your itinerary based on availability.</p></div>

      <label className="booking-v3-terms">
        <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} />
        <span>I agree to the <Link to="/terms" target="_blank">Terms of Service</Link>, <Link to="/privacy-policy" target="_blank">Privacy Policy</Link>, and <Link to="/refund-policy" target="_blank">Refund Policy</Link>. I verify that passenger details match official identification.</span>
      </label>

      <div className="booking-v3-actions">
        <button type="button" className="booking-v3-icon-back" aria-label="Previous step" onClick={onBack}>‹</button>
        <button type="submit" className="amtrak-btn amtrak-btn--cta amtrak-btn--full booking-v3-primary booking-v3-submit-btn" disabled={processing || !termsAccepted}>
          {processing ? <><i className="fas fa-circle-notch fa-spin" /> Processing Reservation…</> : <span>Complete Reservation</span>}
        </button>
      </div>
    </section>
  );
}
