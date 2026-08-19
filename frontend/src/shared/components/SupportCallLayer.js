import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import SupportCallCTA from './SupportCallCTA';

function useBrowserPathname() {
  const [pathname, setPathname] = useState(() => (typeof window === 'undefined' ? '/' : window.location.pathname));

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const sync = () => setPathname(window.location.pathname);
    const pushState = window.history.pushState;
    const replaceState = window.history.replaceState;

    const patchedPushState = function patchedPushState(...args) {
      const result = pushState.apply(this, args);
      window.dispatchEvent(new Event('tfs-locationchange'));
      return result;
    };
    const patchedReplaceState = function patchedReplaceState(...args) {
      const result = replaceState.apply(this, args);
      window.dispatchEvent(new Event('tfs-locationchange'));
      return result;
    };

    window.history.pushState = patchedPushState;
    window.history.replaceState = patchedReplaceState;
    window.addEventListener('popstate', sync);
    window.addEventListener('tfs-locationchange', sync);

    return () => {
      if (window.history.pushState === patchedPushState) window.history.pushState = pushState;
      if (window.history.replaceState === patchedReplaceState) window.history.replaceState = replaceState;
      window.removeEventListener('popstate', sync);
      window.removeEventListener('tfs-locationchange', sync);
    };
  }, []);

  return pathname;
}

function productThemeForPath(pathname = '/') {
  if (pathname.startsWith('/hotels')) return 'hotels';
  if (pathname.startsWith('/car-rentals')) return 'cars';
  return 'flights';
}

function isTravelJourneyPath(pathname = '/') {
  if (pathname === '/') return true;

  return [
    '/search',
    '/hotels',
    '/car-rentals',
    '/booking',
    '/return-flight',
    '/payment',
    '/secure-payment',
    '/authorize',
    '/confirmation',
    '/booking-confirmed',
    '/flight-',
    '/routes/',
    '/book/',
    '/changes/',
    '/cancellation/',
    '/travel-assistance',
    '/booking-for-parents',
    '/urgent-travel',
    '/senior-travel',
  ].some((prefix) => pathname.startsWith(prefix));
}

function portalConfigForPath(pathname = '/') {
  if (pathname === '/') {
    return {
      selector: '#inquiry .flights-inquiry-card',
      theme: 'flights',
      mode: 'card',
      className: 'support-call-cta--flight-search-portal',
    };
  }

  if (pathname === '/search') {
    return {
      selector: '.tfs-results-heading-row',
      theme: 'flights',
      mode: 'inline',
      className: 'support-call-cta--results-portal',
      title: 'Want help comparing these flights?',
      subtitle: 'A flight specialist can help by phone',
    };
  }

  if (pathname.startsWith('/return-flight')) {
    return {
      selector: '.tfs-results-heading-row',
      theme: 'flights',
      mode: 'inline',
      className: 'support-call-cta--results-portal',
      title: 'Want help choosing your return flight?',
      subtitle: 'A flight specialist can help by phone',
    };
  }

  if (pathname.startsWith('/booking')) {
    return {
      selector: '.booking-hero-premium__inner',
      theme: 'flights',
      mode: 'inline',
      className: 'support-call-cta--journey-portal',
      title: 'Need help completing this reservation?',
      subtitle: 'Talk to a flight specialist before you continue',
    };
  }

  if (pathname.startsWith('/payment/')) {
    return {
      selector: '.consulting-payment-header',
      theme: 'flights',
      mode: 'inline',
      className: 'support-call-cta--journey-portal',
      title: 'Questions before paying?',
      subtitle: 'Talk to a travel specialist',
    };
  }

  if (pathname === '/hotels/results') {
    return {
      selector: '.hotel-results-header',
      theme: 'hotels',
      mode: 'inline',
      className: 'support-call-cta--results-portal',
      title: 'Want help choosing a hotel?',
      subtitle: 'A hotel specialist can help by phone',
    };
  }

  if (pathname === '/car-rentals/results') {
    return {
      selector: '.car-controls-bar',
      theme: 'cars',
      mode: 'inline',
      className: 'support-call-cta--results-portal',
      title: 'Want help comparing these rentals?',
      subtitle: 'A rental specialist can help by phone',
    };
  }

  return null;
}

function usePortalTarget(selector, pathname) {
  const [target, setTarget] = useState(null);

  useEffect(() => {
    setTarget(null);
    if (!selector || typeof document === 'undefined') return undefined;

    let current = null;
    const locate = () => {
      const next = document.querySelector(selector);
      if (next !== current) {
        current = next;
        setTarget(next || null);
      }
    };

    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [selector, pathname]);

  return target;
}

function useSecurePaymentTheme(pathname) {
  const [theme, setTheme] = useState('flights');

  useEffect(() => {
    if (!pathname.startsWith('/secure-payment') || typeof document === 'undefined') {
      setTheme(productThemeForPath(pathname));
      return undefined;
    }

    const locate = () => {
      if (document.querySelector('.secure-payment-page--hotels')) setTheme('hotels');
      else if (document.querySelector('.secure-payment-page--cars')) setTheme('cars');
      else setTheme('flights');
    };

    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [pathname]);

  return theme;
}

export default function SupportCallLayer() {
  const pathname = useBrowserPathname();
  const routeTheme = productThemeForPath(pathname);
  const securePaymentTheme = useSecurePaymentTheme(pathname);
  const theme = pathname.startsWith('/secure-payment') ? securePaymentTheme : routeTheme;
  const showSticky = isTravelJourneyPath(pathname);
  const portalConfig = useMemo(() => portalConfigForPath(pathname), [pathname]);
  const portalTarget = usePortalTarget(portalConfig?.selector, pathname);

  if (!showSticky && !portalTarget) return null;

  return (
    <>
      {portalTarget && portalConfig && createPortal(
        <SupportCallCTA
          theme={portalConfig.theme}
          mode={portalConfig.mode}
          title={portalConfig.title}
          subtitle={portalConfig.subtitle}
          className={portalConfig.className}
        />,
        portalTarget,
      )}

      {showSticky && (
        <SupportCallCTA
          theme={theme}
          mode="sticky"
          title="Need help booking?"
          subtitle="Talk to a real travel specialist"
          className="support-call-sticky"
        />
      )}
    </>
  );
}
