import React, { useEffect, useMemo, useState } from 'react';
import InternationalPhoneInput from '../../../shared/components/InternationalPhoneInput';
import EmailInput from '../../../shared/components/EmailInput';
import api from '../../../shared/api/api';
import '../pages/BookingPageV3Professional.css';

const clampBaggageCount = (value, max = 6) => Math.max(0, Math.min(max, Number.parseInt(value, 10) || 0));

const readSessionJson = (key) => {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const money = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
};

function buildBaggageSelection(count, quote) {
  const items = Array.isArray(quote?.items) ? quote.items.slice(0, count) : [];
  return {
    source: quote?.source || 'GOOGLE_FLIGHTS',
    currency: quote?.currency || 'USD',
    markupRate: Number(quote?.markupRate || 0),
    scope: items[0]?.scope || null,
    items,
    sourceTotal: money(items.reduce((sum, item) => sum + Number(item.sourcePrice || 0), 0)),
    customerTotal: money(items.reduce((sum, item) => sum + Number(item.customerPrice || 0), 0)),
    quotedAt: new Date().toISOString(),
  };
}

export default function ContactAssistanceStep({
  primaryContact,
  setPrimaryContact,
  contactSameAsTraveller,
  setContactSameAsTraveller,
  specialRequests,
  setSpecialRequests,
  onContinue,
}) {
  const [baggageQuote, setBaggageQuote] = useState(null);
  const [baggageLoading, setBaggageLoading] = useState(false);
  const pricedItems = Array.isArray(baggageQuote?.items) ? baggageQuote.items : [];
  const maxPricedBags = Math.min(6, pricedItems.length);
  const baggageCount = clampBaggageCount(
    specialRequests.additionalBaggageCount
    ?? specialRequests.baggageCount
    ?? 0,
    maxPricedBags || 6
  );

  useEffect(() => {
    let cancelled = false;
    const selectedFlight = readSessionJson('selectedFlight');
    const returnFlight = readSessionJson('returnFlight') || readSessionJson('selectedReturnFlight');
    const bookingToken = String(
      returnFlight?.bookingToken
      || returnFlight?.booking_token
      || selectedFlight?.bookingToken
      || selectedFlight?.booking_token
      || ''
    ).trim();

    if (!bookingToken) {
      setBaggageQuote({ available: false, items: [] });
      return () => { cancelled = true; };
    }

    setBaggageLoading(true);
    api.post('/flights/baggage-options', { bookingToken, currency: 'USD' }, { timeout: 25000 })
      .then((response) => {
        if (cancelled) return;
        const quote = response?.data?.data || response?.data || { available: false, items: [] };
        setBaggageQuote(quote);
        const maximum = Math.min(6, Array.isArray(quote?.items) ? quote.items.length : 0);
        setSpecialRequests((previous) => {
          const previousCount = Number.parseInt(previous.additionalBaggageCount ?? previous.baggageCount ?? 0, 10) || 0;
          const nextCount = clampBaggageCount(previousCount, maximum);
          return {
            ...previous,
            additionalBaggageCount: nextCount,
            additionalBaggageQuote: nextCount > 0 ? buildBaggageSelection(nextCount, quote) : null,
          };
        });
      })
      .catch(() => {
        if (!cancelled) setBaggageQuote({ available: false, items: [] });
      })
      .finally(() => {
        if (!cancelled) setBaggageLoading(false);
      });

    return () => { cancelled = true; };
  }, [setSpecialRequests]);

  const baggagePricing = useMemo(
    () => buildBaggageSelection(baggageCount, baggageQuote || {}),
    [baggageCount, baggageQuote]
  );

  const setBaggageCount = nextValue => {
    const nextCount = clampBaggageCount(nextValue, maxPricedBags);
    const nextQuote = nextCount > 0 ? buildBaggageSelection(nextCount, baggageQuote || {}) : null;
    setSpecialRequests(previous => ({
      ...previous,
      additionalBaggageCount: nextCount,
      additionalBaggageQuote: nextQuote,
    }));
  };

  const hasSpecialRequest = Boolean(
    specialRequests.wheelchair
    || specialRequests.mealPreference !== 'none'
    || specialRequests.seatingPreference !== 'none'
    || specialRequests.notes.trim()
    || baggageCount > 0
  );

  return (
    <section className="booking-v3-section booking-v3-step-section booking-v3-step-section--contact">
      <div className="booking-v3-section-header booking-v3-section-header--simple">
        <div>
          <p className="booking-v3-eyebrow">2. Contact & Assistance</p>
          <h1>Stay connected throughout your trip</h1>
          <p className="booking-v3-header-copy">Add the best contact details for itinerary updates and tell our travel specialists about any assistance you may need.</p>
        </div>
      </div>

      <div className="booking-v3-subcard booking-v3-subcard--contact">
        <div className="booking-v3-card-heading-row">
          <span className="booking-v3-card-heading-icon"><i className="far fa-address-card" aria-hidden="true" /></span>
          <div><h2>Primary Contact Details</h2><p>We’ll use these details for reservation updates and follow-up.</p></div>
        </div>
        <label className="booking-v3-toggle-row booking-v3-contact-copy-toggle">
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
          <div className="booking-v3-card-heading-row">
            <span className="booking-v3-card-heading-icon"><i className="fas fa-hands-helping" aria-hidden="true" /></span>
            <div>
              <h2>Special Requests & Preferences</h2>
              <p>Tell us about any assistance or preferences our travel specialist should review with your reservation.</p>
            </div>
          </div>
          {hasSpecialRequest && <span className="booking-v3-request-badge"><i className="fas fa-check" aria-hidden="true" /> Special request added</span>}
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

        {baggageLoading && (
          <div className="booking-v3-baggage-loading"><i className="fas fa-circle-notch fa-spin" aria-hidden="true" /> Checking airline baggage prices…</div>
        )}

        {!baggageLoading && baggageQuote?.available && maxPricedBags > 0 && (
          <div className="booking-v3-baggage-request booking-v3-baggage-request--priced" aria-label="Additional baggage request">
            <div className="booking-v3-baggage-request__top">
              <div className="booking-v3-baggage-request__copy">
                <span className="booking-v3-baggage-request__icon"><i className="fas fa-suitcase-rolling" aria-hidden="true" /></span>
                <div>
                  <strong>Add checked baggage</strong>
                  <p>Only baggage options with an airline-provided price are shown.</p>
                </div>
              </div>

              <div className="booking-v3-baggage-counter" role="group" aria-label="Additional checked bags">
                <button type="button" aria-label="Remove one bag" onClick={() => setBaggageCount(baggageCount - 1)} disabled={baggageCount === 0}>−</button>
                <span className="booking-v3-baggage-counter__value" aria-live="polite"><strong>{baggageCount}</strong><small>{baggageCount === 1 ? 'bag' : 'bags'}</small></span>
                <button type="button" aria-label="Add one bag" onClick={() => setBaggageCount(baggageCount + 1)} disabled={baggageCount >= maxPricedBags}>+</button>
              </div>
            </div>

            <div className="booking-v3-baggage-price-list">
              {pricedItems.map((item, index) => (
                <div key={`${item.bagNumber}-${item.scope || 'trip'}`} className={index < baggageCount ? 'is-selected' : ''}>
                  <span>{item.label}{item.scope === 'ROUND_TRIP' ? ' · round trip' : ''}</span>
                  <strong>${money(item.customerPrice).toFixed(2)} {item.currency || baggageQuote.currency || 'USD'}</strong>
                </div>
              ))}
            </div>

            {baggageCount > 0 && (
              <div className="booking-v3-baggage-quote-total">
                <span>FareTransit baggage quote</span>
                <strong>${baggagePricing.customerTotal.toFixed(2)} {baggagePricing.currency}</strong>
              </div>
            )}

            <p className="booking-v3-baggage-notice"><i className="fas fa-info-circle" aria-hidden="true" /><span><strong>You do not pay this baggage amount during the reservation.</strong> The quoted FareTransit baggage price is based on airline-provided baggage pricing and includes FareTransit handling. A travel specialist will confirm baggage availability and the final applicable amount after booking, then you can pay for the approved baggage.</span></p>
          </div>
        )}

        <label className="booking-v3-toggle-row booking-v3-grid-gap booking-v3-wheelchair-row">
          <input type="checkbox" checked={specialRequests.wheelchair} onChange={(event) => setSpecialRequests((previous) => ({ ...previous, wheelchair: event.target.checked }))} />
          <span><strong>Request Wheelchair Assistance</strong><small>We will flag this prominently for the travel specialist handling the booking.</small></span>
        </label>
        <label className="booking-v3-field booking-v3-grid-gap">Additional Airline / Assistance Requests
          <textarea rows={4} value={specialRequests.notes} onChange={(event) => setSpecialRequests((previous) => ({ ...previous, notes: event.target.value }))} placeholder="Special assistance, seating, mobility, medical-device coordination, or other requests" />
        </label>
      </div>

      <div className="booking-v3-actions booking-v3-actions--end">
        <button type="button" className="booking-v3-primary" onClick={onContinue}>Continue to Trip Protection <span aria-hidden="true">→</span></button>
      </div>
    </section>
  );
}
