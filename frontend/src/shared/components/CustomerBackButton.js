import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import './CustomerBackButton.css';

const FALLBACK_BY_PATH = [
  [/^\/return-flight/, '/search'],
  [/^\/booking(?:\/|$)/, '/search'],
  [/^\/payment/, '/booking'],
  [/^\/authorize\//, '/my-bookings'],
  [/^\/confirmation\//, '/my-bookings'],
  [/^\/booking-confirmed/, '/my-bookings'],
  [/^\/hotels\/results/, '/hotels'],
  [/^\/car-rentals\/(search|results)/, '/car-rentals'],
  [/^\/signin/, '/'],
  [/^\/signup/, '/signin'],
];

function fallbackFor(pathname) {
  const match = FALLBACK_BY_PATH.find(([pattern]) => pattern.test(pathname));
  return match?.[1] || '/';
}

export default function CustomerBackButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname || '/';
  const isBookingPage = /^\/booking(?:\/|$)/.test(pathname);
  const [bookingTarget, setBookingTarget] = useState(null);

  useEffect(() => {
    if (!isBookingPage) {
      setBookingTarget(null);
      return undefined;
    }

    let ownedSlot = null;
    const locateTarget = () => {
      const panel = document.querySelector('.booking-itinerary-top-panel__inner');
      if (!panel) {
        setBookingTarget(null);
        return;
      }
      let slot = panel.querySelector(':scope > .tfs-booking-back-slot');
      if (!slot) {
        slot = document.createElement('div');
        slot.className = 'tfs-booking-back-slot';
        slot.setAttribute('data-tfs-booking-back-slot', 'true');
        panel.insertBefore(slot, panel.firstChild);
        ownedSlot = slot;
      }
      setBookingTarget(slot);
    };

    locateTarget();
    const observer = new MutationObserver(locateTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (ownedSlot?.isConnected) ownedSlot.remove();
    };
  }, [isBookingPage]);

  const isPrimaryLandingPage = pathname === '/'
    || pathname === '/hotels'
    || pathname === '/car-rentals'
    || pathname.startsWith('/senior-travel');

  if (isPrimaryLandingPage || pathname.startsWith('/admin')) return null;

  const handleBack = () => {
    if (isBookingPage) {
      const continueWithRouteBack = window.dispatchEvent(new CustomEvent('faretransit-booking-back', { cancelable: true }));
      if (!continueWithRouteBack) return;
    }

    if (pathname === '/search') {
      navigate('/');
      return;
    }

    const browserHasAppHistory = Number(window.history.state?.idx || 0) > 0;
    if (browserHasAppHistory) {
      navigate(-1);
      return;
    }
    navigate(fallbackFor(pathname));
  };

  const button = (
    <div className={`tfs-customer-back-wrap${isBookingPage ? ' tfs-customer-back-wrap--booking' : ''}`} aria-label="Page navigation">
      <button type="button" className="tfs-customer-back" onClick={handleBack} aria-label="Go back" title="Go back">
        <span className="tfs-customer-back__glyph" aria-hidden="true">‹</span>
      </button>
    </div>
  );

  return isBookingPage ? (bookingTarget ? createPortal(button, bookingTarget) : null) : button;
}
