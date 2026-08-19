import React from 'react';
import { Link } from 'react-router-dom';
import './ServiceNav.css';

function ServiceNav({ active }) {
  return (
    <nav className="service-nav" aria-label="Travel logistics sections">
      <Link
        to="/"
        className={`service-nav__item ${active === 'flights' ? 'service-nav__item--active' : ''}`}
      >
        <i className="fas fa-plane" aria-hidden="true" />
        <span>Flights</span>
      </Link>
      <Link
        to="/hotels"
        className={`service-nav__item ${active === 'hotels' ? 'service-nav__item--active' : ''}`}
      >
        <i className="fas fa-hotel" aria-hidden="true" />
        <span>Hotels</span>
      </Link>
      <Link
        to="/car-rentals"
        className={`service-nav__item ${active === 'cars' ? 'service-nav__item--active' : ''}`}
      >
        <i className="fas fa-car" aria-hidden="true" />
        <span>Car Rentals</span>
      </Link>
    </nav>
  );
}

export default ServiceNav;
