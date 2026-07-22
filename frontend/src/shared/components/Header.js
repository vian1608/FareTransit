import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Header.css';

function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 40);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onScroll = () => setMenuOpen(false);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [menuOpen]);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const closeMenu = () => setMenuOpen(false);

  const isFlightsActive = location.pathname === '/';
  const isRailActive = location.pathname.startsWith('/amtrak');
  const isContactActive = location.pathname === '/contact';
  const isRailTheme = isRailActive;

  return (
    <header
      className={`header ${isRailTheme ? 'header--rail' : 'header--flights'} ${scrolled ? 'header--scrolled' : ''}`}
    >
      <div className="container header-inner">
        <div className="logo">
          <i
            key={isRailTheme ? 'rail-icon' : 'flight-icon'}
            className={`fas logo-icon ${isRailTheme ? 'fa-train' : 'fa-plane-departure'}`}
            aria-hidden="true"
          />
          <Link to="/" className="logo-link" onClick={closeMenu}>
            <h1>FareTransit</h1>
          </Link>
        </div>

        <button
          type="button"
          className="nav-toggle"
          aria-expanded={menuOpen}
          aria-controls="site-nav"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <i className={menuOpen ? 'fas fa-times' : 'fas fa-bars'} aria-hidden="true" />
        </button>

        <nav
          id="site-nav"
          className={`nav ${menuOpen ? 'nav--open' : ''}`}
          onClick={(e) => {
            if (e.target.closest('a, [href], button')) {
              closeMenu();
            }
          }}
        >
          <div className="nav-main">
            <Link
              to="/"
              className={`header-nav-link ${isFlightsActive ? 'header-nav-link--active' : ''}`}
            >
              Flights
            </Link>
            <Link
              to="/amtrak"
              className={`header-nav-link ${isRailActive ? 'header-nav-link--active' : ''}`}
            >
              Rail (Amtrak)
            </Link>
            <Link
              to="/my-bookings"
              className={`header-nav-link ${location.pathname === '/my-bookings' ? 'header-nav-link--active' : ''}`}
            >
              My Bookings
            </Link>
            <Link
              to="/contact"
              className={`header-nav-link ${isContactActive ? 'header-nav-link--active' : ''}`}
            >
              Contact Us
            </Link>
          </div>

          <div className="header-auth">
            <Link to="/signin" className="header-nav-link header-auth__signin">
              Sign In
            </Link>
          </div>
        </nav>

        {menuOpen && (
          <button
            type="button"
            className="nav-backdrop"
            aria-label="Close menu"
            onClick={closeMenu}
          />
        )}
      </div>
    </header>
  );
}

export default Header;
