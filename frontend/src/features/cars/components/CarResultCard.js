import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import './CarResultCard.css';

function money(value, currency = 'USD') {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function CarResultCard({ result, searchParams }) {
  const navigate = useNavigate();
  const vehicle = result?.vehicle || {};
  const pricing = result?.pricing || {};
  const supplier = result?.supplier || {};
  const currency = pricing.currency || searchParams?.currency || 'USD';
  const total = money(pricing.rental_total, currency);
  const daily = money(pricing.daily_rate, currency);
  const quoteToken = result?.quote_token || '';
  const canReserve = Boolean(quoteToken && total);

  const vehicleName = vehicle.make_model || vehicle.name || vehicle.category || 'Rental car';
  const category = vehicle.category || null;
  const supplierName = supplier.name || 'Enterprise';
  const pickupName = result?.pickup_location?.name || result?.pickup_location?.label || searchParams?.pickupText || '';

  const specs = useMemo(() => [
    vehicle.transmission ? { icon: 'fas fa-cog', text: vehicle.transmission } : null,
    Number.isFinite(Number(vehicle.seats)) ? { icon: 'fas fa-user', text: `${vehicle.seats} seats` } : null,
    Number.isFinite(Number(vehicle.luggage_capacity)) ? { icon: 'fas fa-suitcase', text: `${vehicle.luggage_capacity} bag${Number(vehicle.luggage_capacity) === 1 ? '' : 's'}` } : null,
    Number.isFinite(Number(vehicle.doors)) ? { icon: 'fas fa-door-closed', text: `${vehicle.doors} doors` } : null,
    vehicle.air_conditioning === true ? { icon: 'fas fa-snowflake', text: 'Air conditioning' } : null
  ].filter(Boolean), [vehicle]);

  const handleReserve = () => {
    if (!canReserve) return;
    const selection = {
      result,
      searchParams,
      savedAt: new Date().toISOString()
    };
    try {
      sessionStorage.setItem('carSelectedQuote', JSON.stringify(selection));
      sessionStorage.removeItem('carBookingClientRequestId');
    } catch {
      // Checkout can still fail safely with a clear message if browser storage is disabled.
    }
    navigate('/car-rentals/checkout');
  };

  return (
    <article className="car-result-card">
      <div className="car-card-main">
        <div className="car-card-media car-card-media--placeholder" aria-hidden="true">
          <i className="fas fa-car-side car-card-placeholder-icon" />
          {category && <span className="car-category-badge">{category}</span>}
        </div>

        <div className="car-card-content">
          <div className="car-card-header">
            <div>
              <h3 className="car-title">
                {vehicleName}
                {vehicle.or_similar !== false && <span className="car-similar-tag">or similar</span>}
              </h3>
              <div className="car-supplier-info">
                <span className="supplier-name-tag">{supplierName}</span>
                {pickupName && (
                  <span className="car-depot-location">
                    <i className="fas fa-map-marker-alt" aria-hidden="true" /> {pickupName}
                  </span>
                )}
              </div>
            </div>
          </div>

          {specs.length > 0 && (
            <div className="car-specs-grid">
              {specs.map((spec) => (
                <span className="car-spec-item" key={`${spec.icon}-${spec.text}`}>
                  <i className={spec.icon} aria-hidden="true" /> {spec.text}
                </span>
              ))}
            </div>
          )}

          <div className="car-policies-list">
            <span className="policy-badge"><i className="fas fa-check-circle" aria-hidden="true" /> Live availability result</span>
            <span className="policy-badge"><i className="fas fa-user-shield" aria-hidden="true" /> FareTransit assisted reservation</span>
          </div>
        </div>

        <div className="car-card-pricing">
          <div className="price-breakdown">
            <span className="price-label">Estimated rental total</span>
            <div className="price-amount">
              <span className="total-num">{total || 'Price unavailable'}</span>
            </div>
            {daily && <span className="car-daily-rate">{daily} estimated per day</span>}
            <span className="price-guarantee-note">Final price and supplier terms are confirmed before the reservation is finalized.</span>
          </div>

          <div className="car-cta-wrapper">
            <p className="redirect-notice-text">Stay on FareTransit to send your reservation request.</p>
            <button
              type="button"
              className="car-deal-btn"
              onClick={handleReserve}
              disabled={!canReserve}
            >
              <span>{canReserve ? 'Reserve with FareTransit' : 'Quote unavailable'}</span>
              <i className="fas fa-arrow-right" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div className="car-card-disclosure">
        <i className="fas fa-info-circle" aria-hidden="true" />
        <span>
          FareTransit displays live Enterprise.com inventory data through its inventory connection. Selecting this option sends a reservation request to FareTransit; it does not create or confirm an Enterprise reservation. Availability, taxes or fees, final price, and supplier terms are verified before confirmation.
        </span>
      </div>
    </article>
  );
}

export default CarResultCard;
