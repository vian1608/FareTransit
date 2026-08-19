import React, { useState } from 'react';
import { carAPI } from '../../../shared/api/api';
import './CarResultCard.css';

function CarResultCard({ result, enrichment = {} }) {
  const [redirecting, setRedirecting] = useState(false);
  const [dealError, setDealError] = useState('');

  const carId = result.car_id || result.id;
  const supplierId = result.supplier_id || result.supplier;
  const pickupDepotId = result.pickup_depot_id || result.pickupDepotId;

  const carInfo = enrichment.carsById?.[carId] || result.vehicle || {};
  const supplierInfo = enrichment.suppliersById?.[supplierId] || result.supplier || {};
  const depotInfo = enrichment.depotsById?.[pickupDepotId] || result.depot || {};
  const depotScoreInfo = enrichment.depotScoresById?.[pickupDepotId] || {};

  const makeModel = carInfo.make && carInfo.model
    ? `${carInfo.make} ${carInfo.model}`
    : (carInfo.name || result.vehicle_name || 'Compact Rental Car');
  const category = carInfo.category || result.category || 'Compact';
  const isOrSimilar = carInfo.or_similar !== false;
  const imageUrl = carInfo.image_url || carInfo.imageUrl || result.image_url || 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=600&q=80';

  const seats = carInfo.seats || result.seats || 5;
  const doors = carInfo.doors || result.doors || 4;
  const transmission = carInfo.transmission || result.transmission || 'Automatic';
  const hasAirCon = carInfo.air_conditioning !== false;
  const largeBags = carInfo.baggage?.large_bags || result.large_bags || 1;

  const supplierName = supplierInfo.name || supplierInfo.supplier_name || result.supplier_name || 'Rental Supplier';
  const supplierLogo = supplierInfo.logo_url || supplierInfo.logoUrl || result.supplier_logo || '';
  const reviewScore = depotScoreInfo.score || supplierInfo.rating || result.review_score || 8.6;
  const depotName = depotInfo.name || result.depot_name || 'Airport Terminal Counter';
  const pickupMethod = depotInfo.pickup_method || depotInfo.type || result.pickup_method || 'In terminal';

  const policies = result.policies || {};
  const freeCancellation = policies.cancellation?.free_cancellation !== false;
  const cancelDetail = policies.cancellation?.cancel_until || 'up to 48h before pickup';
  const mileageType = policies.mileage?.type || 'Unlimited';
  const fuelPolicy = policies.fuel?.policy || 'Return same';
  const depositAmt = policies.deposit?.amount ? `${result.pricing?.currency || 'USD'} $${policies.deposit.amount}` : '$200';
  const paymentTiming = policies.payment_timing || 'Pay now';

  const pricing = result.pricing || {};
  const currencySymbol = pricing.currency === 'EUR' ? '€' : (pricing.currency === 'GBP' ? '£' : '$');
  const rentalTotal = pricing.rental_total ? Number(pricing.rental_total).toFixed(2) : (pricing.display_price || '189.50');
  const extraCharges = Array.isArray(pricing.extra_charges) ? pricing.extra_charges : [];
  const webUrl = result.url?.web || result.web_url || result.booking_url || '';

  const getSafeDealUrl = () => {
    if (!webUrl) return null;
    try {
      const parsed = new URL(webUrl);
      return parsed.protocol === 'https:' ? parsed.href : null;
    } catch {
      return null;
    }
  };

  const handleViewDeal = () => {
    setDealError('');
    const safeUrl = getSafeDealUrl();
    if (!safeUrl) {
      setDealError('Deal details are temporarily unavailable for this vehicle. Please choose another option or retry your search.');
      setRedirecting(false);
      return;
    }

    setRedirecting(true);

    // Analytics must never block the customer from reaching the provider.
    void carAPI.recordClick({
      car_id: carId,
      supplier_id: supplierId,
      pickup_depot_id: pickupDepotId,
      currency: pricing.currency || 'USD',
      displayed_total: rentalTotal,
      booking_url: safeUrl
    }).catch(() => {});

    try {
      window.location.assign(safeUrl);
    } catch {
      setRedirecting(false);
      setDealError('We could not open the rental provider. Please try again.');
    }
  };

  return (
    <div className="car-result-card">
      <div className="car-card-main">
        <div className="car-card-media">
          <img src={imageUrl} alt={makeModel} className="car-card-img" loading="lazy" />
          <span className="car-category-badge">{category}</span>
        </div>

        <div className="car-card-content">
          <div className="car-card-header">
            <div>
              <h3 className="car-title">
                {makeModel} {isOrSimilar && <span className="car-similar-tag">or similar</span>}
              </h3>
              <div className="car-supplier-info">
                {supplierLogo ? (
                  <img src={supplierLogo} alt={supplierName} className="supplier-logo" />
                ) : (
                  <span className="supplier-name-tag">{supplierName}</span>
                )}
                <span className="car-depot-location"><i className="fas fa-map-marker-alt" /> {depotName} ({pickupMethod})</span>
              </div>
            </div>

            {reviewScore && (
              <div className="car-rating-box">
                <span className="rating-score">{reviewScore}</span>
                <span className="rating-label">Very Good</span>
              </div>
            )}
          </div>

          <div className="car-specs-grid">
            <span className="car-spec-item" title="Category"><i className="fas fa-car-side" /> {category}</span>
            <span className="car-spec-item" title="Transmission"><i className="fas fa-cog" /> {transmission}</span>
            <span className="car-spec-item" title="Passengers"><i className="fas fa-user" /> {seats} Seats</span>
            <span className="car-spec-item" title="Doors"><i className="fas fa-door-closed" /> {doors} Doors</span>
            <span className="car-spec-item" title="Baggage"><i className="fas fa-suitcase" /> {largeBags} Bag(s)</span>
            {hasAirCon && <span className="car-spec-item" title="Air Conditioning"><i className="fas fa-snowflake" /> Air Con</span>}
          </div>

          <div className="car-policies-list">
            {freeCancellation && <span className="policy-badge policy-badge--green"><i className="fas fa-check-circle" /> Free Cancellation ({cancelDetail})</span>}
            <span className="policy-badge"><i className="fas fa-road" /> {mileageType} Mileage</span>
            <span className="policy-badge"><i className="fas fa-gas-pump" /> Fuel: {fuelPolicy}</span>
            <span className="policy-badge"><i className="fas fa-shield-alt" /> Refundable Deposit ({depositAmt})</span>
            <span className="policy-badge"><i className="fas fa-credit-card" /> {paymentTiming}</span>
          </div>
        </div>

        <div className="car-card-pricing">
          <div className="price-breakdown">
            <span className="price-label">Rental Total</span>
            <div className="price-amount">
              <span className="currency-sym">{currencySymbol}</span>
              <span className="total-num">{rentalTotal}</span>
            </div>

            {extraCharges.length > 0 && (
              <div className="extra-charges-notice">
                {extraCharges.map((charge, idx) => (
                  <div key={`${charge.type || 'charge'}-${idx}`} className="extra-charge-line">
                    <span>{charge.type}:</span>
                    <span>{charge.included ? 'Included' : `+${currencySymbol}${charge.amount}`}</span>
                  </div>
                ))}
              </div>
            )}

            <span className="price-guarantee-note">Price &amp; availability provided by Booking.com</span>
          </div>

          <div className="car-cta-wrapper">
            <p className="redirect-notice-text">You’ll continue securely on Booking.com to review and complete your rental.</p>
            {dealError && <p role="alert" style={{ color: '#991b1b', fontSize: '0.82rem', margin: '0 0 0.5rem' }}>{dealError}</p>}
            <button
              type="button"
              className={`car-deal-btn ${redirecting ? 'car-deal-btn--loading' : ''}`}
              onClick={handleViewDeal}
              disabled={redirecting || !webUrl}
            >
              <span>{redirecting ? 'Opening Deal...' : 'View Deal'}</span>
              <i className="fas fa-external-link-alt" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div className="car-card-disclosure">
        <i className="fas fa-info-circle" aria-hidden="true" />
        <span>FareTransit provides car-rental search assistance. Inventory, prices, policies, and reservations are provided by Booking.com and participating rental suppliers. We may earn a commission from eligible reservations.</span>
      </div>
    </div>
  );
}

export default CarResultCard;
