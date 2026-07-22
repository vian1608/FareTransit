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
        to="/amtrak"
        className={`service-nav__item ${active === 'rail' ? 'service-nav__item--active' : ''}`}
      >
        <i className="fas fa-train" aria-hidden="true" />
        <span>Rail (Amtrak)</span>
      </Link>
    </nav>
  );
}

export default ServiceNav;
