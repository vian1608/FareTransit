import React from 'react';
import { Link } from 'react-router-dom';
import './MobileServiceSwitcher.css';

const SERVICES = [
  { key: 'flights', label: 'Flights', to: '/flights', icon: 'fas fa-plane' },
  { key: 'hotels', label: 'Hotels', to: '/hotels', icon: 'fas fa-hotel' },
  { key: 'cars', label: 'Car Rentals', to: '/car-rentals', icon: 'fas fa-car' },
];

function MobileServiceSwitcher({ active }) {
  if (!active || !SERVICES.some((service) => service.key === active)) return null;

  return (
    <nav className="mobile-service-switcher" aria-label="Travel services">
      {SERVICES.map((service) => {
        const isActive = service.key === active;
        return (
          <Link
            key={service.key}
            to={service.to}
            className={`mobile-service-switcher__item${isActive ? ' mobile-service-switcher__item--active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
          >
            <i className={service.icon} aria-hidden="true" />
            <span>{service.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default MobileServiceSwitcher;
