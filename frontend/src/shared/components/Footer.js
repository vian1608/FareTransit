import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_HREF } from '../constants/supportContact';
import './Footer.css';
import './FooterLayoutOverrides.css';

function FooterSection({ title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`footer-section footer-section--collapsible${open ? ' footer-section--open' : ''}`}>
      <button
        className="footer-section__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>{title}</span>
        <i className={`fas fa-chevron-${open ? 'up' : 'down'}`} aria-hidden="true" />
      </button>
      <div className="footer-section__body">{children}</div>
    </div>
  );
}

function Footer() {
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');
  const isHotelRoute = location.pathname.startsWith('/hotels');
  const isCarRoute = location.pathname.startsWith('/car-rentals');

  return (
    <footer className={`footer${isAdminRoute ? ' footer--admin' : ''}${isHotelRoute ? ' footer--hotels' : ''}${isCarRoute ? ' footer--cars' : ''}`}>
      <div className="container">
        <div className="footer-content">
          <div className="footer-section footer-brand">
            <h3>FareTransit LLC</h3>
            <p>FareTransit provides travel-search and reservation assistance for travelers who value clear information and real human support.</p>
          </div>

          <FooterSection title="Company">
            <ul>
              <li><Link to="/">Flight Search</Link></li>
              <li><Link to="/hotels">Hotels</Link></li>
              <li><Link to="/car-rentals">Car Rentals</Link></li>
              <li><Link to="/my-bookings">My Bookings</Link></li>
              <li><Link to="/contact">Contact Information</Link></li>
            </ul>
          </FooterSection>

          <FooterSection title="Travel Help">
            <ul>
              <li><Link to="/travel-assistance">Flight Booking Assistance</Link></li>
              <li><Link to="/booking-for-parents">Booking Flights for Parents</Link></li>
              <li><Link to="/urgent-travel">Urgent Travel Assistance</Link></li>
              <li><Link to="/senior-travel/flight-deals">Senior Flight Assistance</Link></li>
            </ul>
          </FooterSection>

          <FooterSection title="Popular Routes">
            <ul>
              <li><Link to="/flight-nyc-to-mia">New York to Miami Flights</Link></li>
              <li><Link to="/flight-lax-to-jfk">Los Angeles to New York Flights</Link></li>
              <li><Link to="/routes/flight-nyc-to-lon">New York to London Flights</Link></li>
              <li><Link to="/routes/flight-lax-to-tokyo">Los Angeles to Tokyo Flights</Link></li>
              <li><Link to="/train-nyc-to-dc">New York to Washington Train</Link></li>
              <li><Link to="/train-boston-to-nyc">Boston to New York Train</Link></li>
            </ul>
          </FooterSection>

          <FooterSection title="Legal">
            <ul>
              <li><Link to="/terms">Terms &amp; Conditions</Link></li>
              <li><Link to="/privacy-policy">Privacy Policy</Link></li>
              <li><Link to="/refund-policy">Refund Policy</Link></li>
            </ul>
          </FooterSection>

          <FooterSection title="Contact">
            <ul>
              <li><a href="mailto:support@faretransit.com">support@faretransit.com</a></li>
              <li><a href={SUPPORT_PHONE_HREF}>{SUPPORT_PHONE_DISPLAY}</a></li>
              <li>1309 Coffeen Avenue STE 1200, Sheridan, WY 82801</li>
            </ul>
          </FooterSection>
        </div>

        <div className="footer-bottom">
          <p>&copy; 2026 FareTransit LLC. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
