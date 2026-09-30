import React, { useState } from 'react';
import './CarResultCard.css';

function currencySymbol(currency) {
  if (currency === 'EUR') return '€';
  if (currency === 'GBP') return '£';
  if (currency === 'CAD') return 'C$';
  return '$';
}

export default function EnterpriseCarResultCard({ vehicle, onSelect }) {
  const [continuing, setContinuing] = useState(false);
  const [error, setError] = useState('');
  const symbol = currencySymbol(vehicle.currency);

  const handleContinue = async () => {
    if (continuing) return;
    setContinuing(true);
    setError('');
    try {
      await onSelect?.(vehicle);
    } catch (err) {
      setError(err.message || 'Unable to continue with this vehicle. Please try again.');
      setContinuing(false);
    }
  };

  return (
    <article className="car-result-card">
      <div className="car-card-main">
        <div className="car-card-media">
          {vehicle.imageUrl ? <img src={vehicle.imageUrl} alt={`${vehicle.name} rental car`} className="car-card-img" loading="lazy" /> : <div className="car-card-img car-card-img--placeholder"><i className="fas fa-car-side" /></div>}
          <span className="car-category-badge">{vehicle.subCategory || vehicle.name}</span>
        </div>

        <div className="car-card-content">
          <div className="car-card-header">
            <div>
              <h3 className="car-title">{vehicle.name} <span className="car-similar-tag">{vehicle.makeModel ? `${vehicle.makeModel} or similar` : 'or similar'}</span></h3>
              <div className="car-supplier-info"><span className="supplier-name-tag">Enterprise</span></div>
            </div>
          </div>

          <div className="car-specs-grid">
            {vehicle.category && <span className="car-spec-item"><i className="fas fa-car-side" /> {vehicle.category}</span>}
            {vehicle.transmission && <span className="car-spec-item"><i className="fas fa-cog" /> {vehicle.transmission}</span>}
            {vehicle.passengers > 0 && <span className="car-spec-item"><i className="fas fa-user" /> {vehicle.passengers} passengers</span>}
            {vehicle.luggageCapacity > 0 && <span className="car-spec-item"><i className="fas fa-suitcase" /> {vehicle.luggageCapacity} bags</span>}
            {vehicle.fuelType && <span className="car-spec-item"><i className="fas fa-gas-pump" /> {vehicle.fuelType}</span>}
            {vehicle.fuelEfficiencyMpg && <span className="car-spec-item"><i className="fas fa-leaf" /> {vehicle.fuelEfficiencyMpg} MPG</span>}
          </div>

          {vehicle.features?.length > 0 && (
            <div className="car-policies-list">
              {vehicle.features.slice(0, 5).map((feature) => <span key={feature} className="policy-badge"><i className="fas fa-check-circle" /> {feature}</span>)}
            </div>
          )}
        </div>

        <div className="car-card-pricing">
          <div className="price-breakdown">
            <span className="price-label">Rental Total</span>
            <div className="price-amount"><span className="currency-sym">{symbol}</span><span className="total-num">{Number(vehicle.totalPrice || 0).toFixed(2)}</span></div>
            {vehicle.dailyRate > 0 && <span className="price-guarantee-note">{symbol}{Number(vehicle.dailyRate).toFixed(2)} per day</span>}
            <span className="price-guarantee-note">Current Enterprise availability</span>
          </div>

          <div className="car-cta-wrapper">
            <p className="redirect-notice-text">Continue securely on FareTransit. Your rate is rechecked before checkout.</p>
            {error && <p role="alert" style={{ color: '#991b1b', fontSize: '0.82rem', margin: '0 0 0.5rem' }}>{error}</p>}
            <button type="button" className={`car-deal-btn ${continuing ? 'car-deal-btn--loading' : ''}`} onClick={handleContinue} disabled={continuing}>
              <span>{continuing ? 'Checking Rate...' : 'Continue to Checkout'}</span>
              <i className="fas fa-arrow-right" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div className="car-card-disclosure">
        <i className="fas fa-info-circle" aria-hidden="true" />
        <span>Vehicle examples are representative of a class and not guaranteed to be a specific make/model. FareTransit independently assists with the reservation and is not affiliated with Enterprise Rent-A-Car.</span>
      </div>
    </article>
  );
}
