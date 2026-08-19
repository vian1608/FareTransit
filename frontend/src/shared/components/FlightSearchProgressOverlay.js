import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import './FlightSearchProgressOverlay.css';

const MIN_VISIBLE_MS = 1200;
const FINISH_FADE_MS = 520;
const SEARCH_STALL_MS = 30000;

function routeFromSearch(search = '') {
  const params = new URLSearchParams(search);
  return {
    from: (params.get('from') || '').toUpperCase(),
    to: (params.get('to') || '').toUpperCase(),
  };
}

function messageForProgress(progress) {
  if (progress < 18) return 'Preparing your flight search';
  if (progress < 42) return 'Checking live routes and schedules';
  if (progress < 68) return 'Comparing available fares';
  if (progress < 88) return 'Organizing the best flight options';
  if (progress < 100) return 'Finalizing your results';
  return 'Flights ready';
}

export default function FlightSearchProgressOverlay() {
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [takingTooLong, setTakingTooLong] = useState(false);

  const activeRef = useRef(false);
  const startedAtRef = useRef(0);
  const sawLoadingSurfaceRef = useRef(false);
  const finishTimerRef = useRef(null);
  const hideTimerRef = useRef(null);
  const stallTimerRef = useRef(null);

  const route = useMemo(() => routeFromSearch(location.search), [location.search]);
  const isSearchRoute = location.pathname === '/search';

  const clearTimers = useCallback(() => {
    if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
    finishTimerRef.current = null;
    hideTimerRef.current = null;
    stallTimerRef.current = null;
  }, []);

  const armStallTimer = useCallback(() => {
    if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
    stallTimerRef.current = setTimeout(() => {
      if (activeRef.current) setTakingTooLong(true);
    }, SEARCH_STALL_MS);
  }, []);

  const start = useCallback(() => {
    clearTimers();
    activeRef.current = true;
    startedAtRef.current = Date.now();
    sawLoadingSurfaceRef.current = false;
    setFinishing(false);
    setTakingTooLong(false);
    setProgress(0);
    setVisible(true);
    armStallTimer();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => setProgress(4));
    });
  }, [clearTimers, armStallTimer]);

  const finish = useCallback(() => {
    if (!activeRef.current) return;
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
    setTakingTooLong(false);

    const elapsed = Date.now() - startedAtRef.current;
    const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);

    if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
    finishTimerRef.current = setTimeout(() => {
      setProgress(100);
      setFinishing(true);

      hideTimerRef.current = setTimeout(() => {
        activeRef.current = false;
        setVisible(false);
        setFinishing(false);
      }, FINISH_FADE_MS);
    }, remaining);
  }, []);

  const cancel = useCallback(() => {
    clearTimers();
    activeRef.current = false;
    sawLoadingSurfaceRef.current = false;
    setVisible(false);
    setFinishing(false);
    setTakingTooLong(false);
    setProgress(0);
  }, [clearTimers]);

  useEffect(() => {
    if (!isSearchRoute) {
      cancel();
      return;
    }
    start();
  }, [isSearchRoute, location.search, start, cancel]);

  useEffect(() => {
    if (!isSearchRoute || typeof MutationObserver === 'undefined') return undefined;

    const inspect = () => {
      const page = document.querySelector('.search-results-page');
      const loadingSurface = document.querySelector(
        '.search-results-page .skeleton-loader, .search-results-page .skeleton-card'
      );

      if (loadingSurface) {
        sawLoadingSurfaceRef.current = true;
        if (!activeRef.current) start();
        return;
      }

      if (page && sawLoadingSurfaceRef.current && activeRef.current) {
        finish();
      }
    };

    inspect();
    const observer = new MutationObserver(inspect);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [isSearchRoute, start, finish]);

  useEffect(() => {
    if (!visible || finishing || takingTooLong) return undefined;

    const timer = setInterval(() => {
      setProgress(current => {
        if (current >= 94) return current;
        let increment = 0.25;
        if (current < 18) increment = 3.2;
        else if (current < 42) increment = 2.15;
        else if (current < 68) increment = 1.35;
        else if (current < 86) increment = 0.72;
        else increment = 0.34;
        return Math.min(94, Math.round((current + increment) * 10) / 10);
      });
    }, 120);

    return () => clearInterval(timer);
  }, [visible, finishing, takingTooLong]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  if (!visible) return null;

  const roundedProgress = Math.min(100, Math.round(progress));
  const routeLabel = route.from && route.to ? `${route.from} → ${route.to}` : 'Finding your flights';

  const keepWaiting = () => {
    setTakingTooLong(false);
    armStallTimer();
  };

  return (
    <div
      className={`tfs-flight-search-overlay ${finishing ? 'tfs-flight-search-overlay--finishing' : ''}`}
      role={takingTooLong ? 'alert' : 'status'}
      aria-live={takingTooLong ? 'assertive' : 'polite'}
      aria-label={takingTooLong ? 'Flight search is taking longer than expected' : `Flight search ${roundedProgress} percent complete`}
    >
      <div className="tfs-flight-search-glow tfs-flight-search-glow--one" aria-hidden="true" />
      <div className="tfs-flight-search-glow tfs-flight-search-glow--two" aria-hidden="true" />

      <div className={`tfs-flight-search-card ${takingTooLong ? 'tfs-flight-search-card--recovery' : ''}`}>
        <div className="tfs-flight-search-brand">
          <span className="tfs-flight-search-brand__mark" aria-hidden="true">✦</span>
          <span>FareTransit</span>
        </div>

        <div
          className="tfs-flight-search-ring"
          style={{ '--tfs-search-angle': `${progress * 3.6}deg` }}
          aria-hidden="true"
        >
          <div className="tfs-flight-search-ring__inside">
            <strong>{roundedProgress}%</strong>
            <span>{takingTooLong ? 'WAITING' : 'SEARCHING'}</span>
          </div>
        </div>

        <div className="tfs-flight-search-route">
          <span className="tfs-flight-search-route__code">{route.from || 'FROM'}</span>
          <span className="tfs-flight-search-route__line" aria-hidden="true">
            <i style={{ width: `${Math.max(4, progress)}%` }} />
            <b style={{ left: `${Math.min(96, Math.max(4, progress))}%` }}>✈</b>
          </span>
          <span className="tfs-flight-search-route__code">{route.to || 'TO'}</span>
        </div>

        <h2>{takingTooLong ? 'This search is taking longer than expected' : messageForProgress(roundedProgress)}</h2>
        <p className="tfs-flight-search-route-label">{routeLabel}</p>

        <div className="tfs-flight-search-progress" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>

        <div className="tfs-flight-search-steps" aria-hidden="true">
          <span className={progress >= 8 ? 'is-active' : ''}>Routes</span>
          <span className={progress >= 38 ? 'is-active' : ''}>Fares</span>
          <span className={progress >= 68 ? 'is-active' : ''}>Options</span>
          <span className={progress >= 96 ? 'is-active' : ''}>Ready</span>
        </div>

        {takingTooLong ? (
          <div className="tfs-flight-search-recovery">
            <p>The flight provider has not finished responding yet. You are not stuck — choose an option below.</p>
            <div className="tfs-flight-search-recovery__actions">
              <button type="button" className="tfs-flight-search-retry" onClick={() => window.location.reload()}>
                Retry search
              </button>
              <button type="button" className="tfs-flight-search-wait" onClick={keepWaiting}>
                Keep waiting
              </button>
              <button type="button" className="tfs-flight-search-back" onClick={() => { window.location.href = '/'; }}>
                Change search
              </button>
            </div>
          </div>
        ) : (
          <small>We’re checking your search and preparing the results page.</small>
        )}
      </div>
    </div>
  );
}
