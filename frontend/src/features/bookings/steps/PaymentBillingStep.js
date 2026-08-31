import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PaymentCardEntry from '../components/PaymentCardEntry';
import '../pages/BookingPageV3Premium.css';

const money = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
};

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
}) {
  const [detectedBrand, setDetectedBrand] = useState('');

  const pricingSummary = useMemo(() => {
    const flightFare = money(baseFare);
    const flexAssist = tripProtection === true ? money(flexAmount) : 0;
    const total = money(flightFare + flexAssist);
    return {
      flightFare,
      flexAssist,
      total: total || money(reservationTotal),
    };
  }, [baseFare, flexAmount, reservationTotal, tripProtection]);

  const brandClass = (name) => detectedBrand === name ? ' is-active' : '';

  return (
    <section className="booking-v3-section booking-v3-step-section booking-v3-step-section--payment booking-v3-payment-section">
      <div className="booking-v3-section-header booking-v3-section-header--simple booking-v3-payment-header">
        <div>
          <p className="booking-v3-eyebrow">4. Payment & Billing</p>
          <h1>Finish your reservation</h1>
          <p className="booking-v3-header-copy">Enter the card and billing details for this reservation, then review the final total before submitting.</p>
        </div>
        <span className="booking-v3-secure-chip"><i className="fas fa-shield-alt" aria-hidden="true" /> Secure checkout</span>
      </div>

      <div className="booking-v3-payment-layout">
        <div className="booking-v3-payment-main">
          <div className="booking-v3-payment-card booking-v3-premium-surface card-payment-container">
            <div className="booking-v3-payment-title-row">
              <div className="booking-v3-payment-title">
                <span className="booking-v3-payment-heading-icon"><i className="far fa-credit-card" aria-hidden="true" /></span>
                <div><h2>Credit or Debit Card</h2><p>Use the card details associated with the billing address below.</p></div>
              </div>
              <div className="booking-v3-card-logos" aria-label="Accepted card brands">
                <span className={`booking-v3-card-logo${brandClass('American Express')}`} title="American Express"><i className="fab fa-cc-amex" /></span>
                <span className={`booking-v3-card-logo${brandClass('Visa')}`} title="Visa"><i className="fab fa-cc-visa" /></span>
                <span className={`booking-v3-card-logo${brandClass('Mastercard')}`} title="Mastercard"><i className="fab fa-cc-mastercard" /></span>
                <span className={`booking-v3-card-logo${brandClass('Discover')}`} title="Discover"><i className="fab fa-cc-discover" /></span>
                <span className={`booking-v3-card-logo${brandClass('JCB')}`} title="JCB"><i className="fab fa-cc-jcb" /></span>
                <span className={`booking-v3-card-logo${brandClass('Diners Club')}`} title="Diners Club"><i className="fab fa-cc-diners-club" /></span>
              </div>
            </div>
            <p className="booking-v3-required-note"><i className="fas fa-lock" aria-hidden="true" /> All card fields are required.</p>

            <PaymentCardEntry
              ref={paymentCardRef}
              nameOnCard={billing.cardholderName}
              onNameChange={(value) => setBilling((previous) => ({ ...previous, cardholderName: value }))}
              onFocus={clearCardErrors}
              onBrandChange={setDetectedBrand}
            />
            {fieldErrors.cardholderName && <p className="booking-v3-field-error">{fieldErrors.cardholderName}</p>}
          </div>

          <div className="booking-v3-billing-card booking-v3-premium-surface">
            <div className="booking-v3-card-heading-row">
              <span className="booking-v3-card-heading-icon"><i className="fas fa-map-marker-alt" aria-hidden="true" /></span>
              <div><h2>Billing Address</h2><p>Enter the address associated with the card.</p></div>
            </div>

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
              <input value={billing.addressLine2} onChange={(event) => setBilling((previous) => ({ ...previous, addressLine2: event.target.value }))} placeholder="Apartment, suite, unit, etc." autoComplete="address-line2" />
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

          <div className="booking-v3-availability-note booking-v3-availability-note--premium"><i className="fas fa-headset" aria-hidden="true" /><div><strong>Human support after you submit</strong><p>Our travel specialist may call you to confirm your itinerary based on availability.</p></div></div>

          <label className="booking-v3-terms booking-v3-terms--premium">
            <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} />
            <span>I agree to the <Link to="/terms" target="_blank">Terms of Service</Link>, <Link to="/privacy-policy" target="_blank">Privacy Policy</Link>, and <Link to="/refund-policy" target="_blank">Refund Policy</Link>. I verify that passenger details match official identification.</span>
          </label>

          <div className="booking-v3-actions booking-v3-actions--end booking-v3-payment-actions">
            <button type="submit" className="booking-v3-primary booking-v3-submit-btn booking-v3-submit-btn--premium" disabled={processing || !termsAccepted}>
              {processing ? (
                <><i className="fas fa-circle-notch fa-spin" /> Processing Reservation…</>
              ) : (
                <><i className="fas fa-lock" aria-hidden="true" /> Complete Secure Booking <span className="booking-v3-submit-price">— ${pricingSummary.total.toFixed(2)} USD</span></>
              )}
            </button>
          </div>
        </div>

        <aside className="booking-v3-order-summary" aria-label="Reservation price summary">
          <div className="booking-v3-order-summary__top">
            <span className="booking-v3-summary-kicker"><i className="fas fa-plane" aria-hidden="true" /> FareTransit reservation</span>
            <h2>Your trip total</h2>
            <p>Review the final amount before completing your reservation.</p>
          </div>

          <div className="booking-v3-order-summary__rows">
            <div><span>Flight fare</span><strong>${pricingSummary.flightFare.toFixed(2)}</strong></div>
            <div><span>FareTransit Flex Assist</span><strong>{tripProtection === true ? `$${pricingSummary.flexAssist.toFixed(2)}` : '$0.00'}</strong></div>
          </div>

          <div className="booking-v3-order-summary__total">
            <span>Reservation total</span>
            <strong>${pricingSummary.total.toFixed(2)} <small>USD</small></strong>
          </div>

          {tripProtection === true && (
            <div className="booking-v3-summary-success"><i className="fas fa-check-circle" aria-hidden="true" /><span>Flex Assist is included in this total.</span></div>
          )}

          <div className="booking-v3-summary-trust">
            <div><i className="fas fa-user-check" aria-hidden="true" /><span><strong>Specialist review</strong><small>Your reservation is reviewed by FareTransit staff.</small></span></div>
            <div><i className="fas fa-receipt" aria-hidden="true" /><span><strong>Clear total</strong><small>The amount shown here is the amount attached to this reservation request.</small></span></div>
          </div>
        </aside>
      </div>
    </section>
  );
}