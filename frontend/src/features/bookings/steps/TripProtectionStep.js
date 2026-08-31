import React from 'react';

const FLEX_REGULAR_RATE = 0.11;
const FLEX_OFFER_RATE = 0.085;

const promoPrice = (fare, rate) => {
  const amount = Number.parseFloat(fare);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * rate)) : 0;
};

export default function TripProtectionStep({
  origin,
  destination,
  finalDestination,
  hasReturn,
  tripProtection,
  baseFare,
  syncPending,
  syncWarning,
  onSelect,
  onContinue,
}) {
  const regularFlexAmount = promoPrice(baseFare, FLEX_REGULAR_RATE);
  const offerFlexAmount = promoPrice(baseFare, FLEX_OFFER_RATE);
  const savings = Math.max(0, regularFlexAmount - offerFlexAmount);

  return (
    <section className="booking-v3-section booking-v3-step-section booking-v3-step-section--protection booking-v3-protection-section">
      <div className="booking-v3-section-header booking-v3-section-header--simple">
        <div>
          <p className="booking-v3-eyebrow">3. Trip Protection & Baggage Fees</p>
          <h1>Extra help when travel plans change</h1>
          <p className="booking-v3-header-copy">Choose whether you want FareTransit Flex Assist added to your reservation before moving to payment.</p>
        </div>
      </div>

      <div className="booking-v3-protection-route-chip">
        <i className="fas fa-route" aria-hidden="true" />
        <span>{origin} → {destination}{hasReturn ? ` → ${finalDestination}` : ''}</span>
      </div>

      <p className="booking-v3-required-choice"><b>* Required:</b> Select Yes or No to continue</p>

      <button
        type="button"
        role="radio"
        aria-checked={tripProtection === true}
        className={`booking-v3-protection-card${tripProtection === true ? ' is-selected' : ''}`}
        onClick={() => onSelect(true)}
      >
        <span className="booking-v3-radio" aria-hidden="true"><span /></span>
        <div className="booking-v3-protection-content">
          <div className="booking-v3-protection-choice-row">
            <div>
              <span className="booking-v3-option-label">Add Flex Assist</span>
              <strong>Yes, add FareTransit Flex Assist</strong>
              <div className="booking-v3-flex-promo-price" aria-label={`Regular price $${regularFlexAmount.toFixed(2)}, offer price $${offerFlexAmount.toFixed(2)}`}>
                <del>${regularFlexAmount.toFixed(2)}</del>
                <span className="booking-v3-flex-promo-price__offer">${offerFlexAmount.toFixed(2)}</span>
                <span className="booking-v3-flex-promo-price__label">Offer price</span>
                {savings > 0 && <span className="booking-v3-flex-promo-price__saving">Save ${savings.toFixed(2)}</span>}
              </div>
            </div>
            <span className="booking-v3-recommended"><i className="fas fa-star" aria-hidden="true" /> HIGHLY RECOMMENDED</span>
          </div>
          <div className="booking-v3-benefits">
            <div><i className="fas fa-exchange-alt" /><span><b>Changes made easier</b><small>Get help reviewing flight-change and rebooking options when plans change.</small></span></div>
            <div><i className="far fa-clock" /><span><b>Delay & rebooking support</b><small>A FareTransit specialist can help you navigate available alternatives.</small></span></div>
            <div><i className="fas fa-suitcase" /><span><b>Baggage assistance</b><small>Get help coordinating baggage requests and airline support.</small></span></div>
            <div><i className="fas fa-headset" /><span><b>Anytime help</b><small>FareTransit travel specialists are available to assist with your reservation.</small></span></div>
          </div>
        </div>
      </button>

      <button
        type="button"
        role="radio"
        aria-checked={tripProtection === false}
        className={`booking-v3-protection-no${tripProtection === false ? ' is-selected' : ''}`}
        onClick={() => onSelect(false)}
      >
        <span className="booking-v3-radio" aria-hidden="true"><span /></span>
        <div><span className="booking-v3-option-label">Continue without Flex Assist</span><strong>No, do not add Flex Assist to my ${Number(baseFare).toFixed(2)} trip.</strong></div>
      </button>

      {syncPending && <p className="booking-v3-sync-note"><i className="fas fa-circle-notch fa-spin" aria-hidden="true" /> Saving your selection in the background…</p>}
      {syncWarning && <p className="booking-v3-sync-warning" role="status"><i className="fas fa-cloud" aria-hidden="true" /> {syncWarning}</p>}

      <p className="booking-v3-flex-disclaimer">Flex Assist is a FareTransit agency service, not travel insurance or an airline flexible fare. Airline fare differences, penalties, taxes, availability and fare rules may still apply.</p>

      <div className="booking-v3-actions booking-v3-actions--end">
        <button type="button" className="booking-v3-primary" onClick={onContinue} disabled={typeof tripProtection !== 'boolean'}>Continue to Payment <span aria-hidden="true">→</span></button>
      </div>
    </section>
  );
}
