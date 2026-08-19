import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import './CustomerRouteLoadingOverlay.css';

const MIN_VISIBLE_MS = 700;
const STALL_MS = 15000;
const LOADING_SELECTOR = [
  '.skeleton-loader',
  '.skeleton-card',
  '[aria-busy="true"]',
  '.loading-spinner',
  '.page-loading',
  '.results-loading',
].join(',');

function transitionCopy(pathname) {
  if (pathname === '/return-flight') {
    return { icon: 'fa-plane-arrival', title: 'Preparing return flight options', detail: 'Keeping your selected departure flight while we load the return step.' };
  }
  if (pathname === '/booking') {
    return { icon: 'fa-passport', title: 'Preparing traveler details', detail: 'Loading your selected itinerary and reservation form.' };
  }
  if (pathname === '/payment' || pathname === '/pay') {
    return { icon: 'fa-lock', title: 'Preparing secure checkout', detail: 'Opening the payment step securely.' };
  }
  if (pathname === '/my-bookings') {
    return { icon: 'fa-receipt', title: 'Opening booking lookup', detail: 'Preparing your reservation lookup tools.' };
  }
  if (pathname.startsWith('/authorize/')) {
    return { icon: 'fa-shield-alt', title: 'Opening secure authorization', detail: 'Loading the reservation details you need to review.' };
  }
  if (pathname.startsWith('/booking-confirmed') || pathname === '/confirmation/success') {
    return { icon: 'fa-check-circle', title: 'Loading reservation confirmation', detail: 'Retrieving the latest saved booking details.' };
  }
  if (pathname === '/confirmation/one-way' || pathname === '/confirmation/round-trip') {
    return { icon: 'fa-file-alt', title: 'Preparing reservation summary', detail: 'Loading your trip summary.' };
  }
  if (pathname === '/car-rentals/search' || pathname === '/car-rentals/results') {
    return { icon: 'fa-car', title: 'Loading rental car options', detail: 'Preparing available vehicles and rates.' };
  }
  if (pathname === '/signin' || pathname === '/signup') {
    return { icon: 'fa-user', title: 'Opening your account page', detail: 'Preparing the secure account form.' };
  }
  return null;
}

export default function CustomerRouteLoadingOverlay() {
  const location = useLocation();
  const copy = useMemo(() => transitionCopy(location.pathname || '/'), [location.pathname]);
  const [visible, setVisible] = useState(false);
  const [stalled, setStalled] = useState(false);
  const startedAtRef = useRef(0);

  useEffect(() => {
    if (!copy) {
      setVisible(false);
      setStalled(false);
      return undefined;
    }

    setVisible(true);
    setStalled(false);
    startedAtRef.current = Date.now();

    let hideTimer = null;
    const stallTimer = window.setTimeout(() => setStalled(true), STALL_MS);

    const tryHide = () => {
      const elapsed = Date.now() - startedAtRef.current;
      const hasLoadingSurface = Boolean(document.querySelector(LOADING_SELECTOR));
      if (hasLoadingSurface || elapsed < MIN_VISIBLE_MS) return;
      if (hideTimer) window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => setVisible(false), 80);
    };

    const observer = typeof MutationObserver !== 'undefined'
      ? new MutationObserver(tryHide)
      : null;
    observer?.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-busy'] });

    const minimumTimer = window.setTimeout(tryHide, MIN_VISIBLE_MS);
    const safetyPoll = window.setInterval(tryHide, 350);

    return () => {
      observer?.disconnect();
      window.clearTimeout(minimumTimer);
      window.clearTimeout(stallTimer);
      window.clearInterval(safetyPoll);
      if (hideTimer) window.clearTimeout(hideTimer);
    };
  }, [location.key, location.pathname, copy]);

  if (!copy || !visible) return null;

  return (
    <div className="tfs-route-waiter" role={stalled ? 'alert' : 'status'} aria-live={stalled ? 'assertive' : 'polite'}>
      <div className="tfs-route-waiter__card">
        <div className="tfs-route-waiter__icon"><i className={`fas ${stalled ? 'fa-exclamation-triangle' : copy.icon}`} /></div>
        <div className="tfs-route-waiter__copy">
          <strong>{stalled ? 'This page is taking longer than expected' : copy.title}</strong>
          <span>{stalled ? 'You are not stuck. You can retry this page or return to the previous page.' : copy.detail}</span>
          <div className="tfs-route-waiter__progress" aria-hidden="true"><i /></div>
          {stalled && (
            <div className="tfs-route-waiter__actions">
              <button type="button" onClick={() => window.location.reload()}>Retry page</button>
              <button type="button" className="secondary" onClick={() => window.history.back()}>Go back</button>
            </div>
          )}
        </div>
        {!stalled && <div className="tfs-route-waiter__dots" aria-hidden="true"><i /><i /><i /></div>}
      </div>
    </div>
  );
}
