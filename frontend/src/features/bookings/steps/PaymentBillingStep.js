import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AddressAutocompleteInput from '../../../shared/components/AddressAutocompleteInput';
import PaymentCardEntry from '../components/PaymentCardEntry';
import '../pages/BookingPageV3Premium.css';
import '../pages/BookingPageV3VisualPolish.css';

const FLEX_OFFER_RATE = 0.085;

const CARD_BRANDS = [
  { name: 'Visa', icon: 'fab fa-cc-visa', label: 'VISA' },
  { name: 'Mastercard', icon: 'fab fa-cc-mastercard', label: 'Mastercard' },
  { name: 'American Express', icon: 'fab fa-cc-amex', label: 'Amex' },
  { name: 'Discover', icon: 'fab fa-cc-discover', label: 'Discover' },
  { name: 'JCB', icon: 'fab fa-cc-jcb', label: 'JCB' },
  { name: 'Diners Club', icon: 'fab fa-cc-diners-club', label: 'Diners' },
];

const money = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
};

const promoPrice = (fare) => {
  const parsed = Number.parseFloat(fare);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * FLEX_OFFER_RATE)) : 0;
};

const normalizeCountry = (value, countries = []) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^(us|usa|united states|united states of america)$/i.test(raw)) return 'United States';
  const exact = countries.find((country) => country.toLowerCase() === raw.toLowerCase());
  return exact || raw;
};

const normalizeUsState = (value, usStates = []) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const match = usStates.find(([code, name]) => (
    code.toLowerCase() === raw.toLowerCase() || name.toLowerCase() === raw.toLowerCase()
  ));
  return match?.[0] || raw;
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
  baseFare,
  reservationTotal,
  termsAccepted,
  setTermsAccepted,
  processing,
}) {
  const [detectedBrand, setDetectedBrand] = useState('');

  const pricingSummary = useMemo(() => {
    const flightFare = money(baseFare);
    const flexAssist = tripProtection === true ? promoPrice(flightFare) : 0;
    const total = money(flightFare + flexAssist);
    return {
      flightFare,
      flexAssist,
      total: total || money(reservationTotal),
    };
  }, [baseFare, reservationTotal, tripProtection]);

  const applyBillingSuggestion = (suggestion = {}) => {
    const country = normalizeCountry(suggestion.country, countries) || billing.country || 'United States';
    const state = country === 'United States'
      ? normalizeUsState(suggestion.state, usStates)
      : String(suggestion.state || '').trim();

    setBilling((previous) => ({
      ...previous,
      addressLine1: String(suggestion.addressLine1 || previous.addressLine1 || '').trim(),
      addressLine2: String(suggestion.addressLine2 || previous.addressLine2 || '').trim(),
      city: String(suggestion.city || '').trim(),
      state,
      postalCode: String(suggestion.postalCode || '').trim(),
      country,
    }));
    clearCardErrors?.();
  };

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
                <div><h2>Add New Credit or Debit Card</h2><p>Use the card details associated with the billing address below.</p></div>
              </div>
              <div className="booking-v3-card-brands" aria-label="Accepted card brands">
                {CARD_BRANDS.map((cardBrand) => {
                  const active = detectedBrand === cardBrand.name;
                  return (
                    <span
                      key={cardBrand.name}
                      className={`booking-v3-card-brand${active ? ' is-active' : ''}`}
                      title={cardBrand.name}
                      aria-label={`${cardBrand.name}${active ? ', detected card type' : ''}`}
                    >
                      <span className="booking-v3-card-brand__logo"><i className={cardBrand.icon} aria-hidden="true" /></span>
                      <span className="booking-v3-card-brand__label">{cardBrand.label}</span>
                      {active && <span className="booking-v3-card-brand__check"><i className="fas fa-check" aria-hidden="true" /></span>}
                    </span>
                  );
                })}
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
              <select
                value={billing.country}
                onChange={(event) => setBilling((previous) => ({
                  ...previous,
                  country: event.target.value,
                  state: event.target.value === 'United States' ? previous.state : '',
                }))}
                autoComplete="country-name"
              >
                {countries.map((country) => <option key={country} value={country}>{country}</option>)}
              </select>
            </label>
            {fieldErrors.country && <p className="booking-v3-field-error">{fieldErrors.country}</p>}

            <div className="booking-v3-floating-field booking-v3-payment-full-field booking-v3-address-autocomplete-field">
              <span>Address Line 1</span>
              <AddressAutocompleteInput
                id="billingAddress"
                value={billing.addressLine1}
                onChange={(value) => setBilling((previous) => ({ ...previous, addressLine1: value }))}
                onSelectSuggestion={applyBillingSuggestion}
                placeholder="Start typing your billing address"
                required
              />
            </div>
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
            <button type="submit" aria-label="Complete Reservation" className="booking-v3-primary booking-v3-submit-btn booking-v3-submit-btn--premium" disabled={processing || !termsAccepted}>
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
            <div><span>FareTransit Flex Assist {tripProtection === true ? '· Offer' : ''}</span><strong>{tripProtection === true ? `$${pricingSummary.flexAssist.toFixed(2)}` : '$0.00'}</strong></div>
          </div>

          <div className="booking-v3-order-summary__total">
            <span>Reservation total</span>
            <strong>${pricingSummary.total.toFixed(2)} <small>USD</small></strong>
          </div>

          {tripProtection === true && (
            <div className="booking-v3-summary-success"><i className="fas fa-check-circle" aria-hidden="true" /><span>Flex Assist promotional price is included in this total.</span></div>
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
