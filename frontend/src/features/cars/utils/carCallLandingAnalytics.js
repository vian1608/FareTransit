import { CAR_CALL_TRACKING_KEYS } from '../data/carRentalCallLandingConfig';

export const GA4_MEASUREMENT_ID = 'G-TBWQGCGY6B';

export function readCarLandingAttribution(search = '') {
  const params = new URLSearchParams(search || '');
  return CAR_CALL_TRACKING_KEYS.reduce((acc, key) => {
    const value = params.get(key);
    if (value) acc[key] = value;
    return acc;
  }, {});
}

export function persistCarLandingAttribution(search = '') {
  if (typeof window === 'undefined') return {};
  const current = readCarLandingAttribution(search);
  if (Object.keys(current).length) {
    try {
      window.sessionStorage.setItem('faretransit:car-call-attribution', JSON.stringify(current));
    } catch (_) {
      // Analytics persistence must never block the conversion path.
    }
    return current;
  }

  try {
    const saved = JSON.parse(window.sessionStorage.getItem('faretransit:car-call-attribution') || '{}');
    return saved && typeof saved === 'object' ? saved : {};
  } catch (_) {
    return {};
  }
}

export function sendCarLandingEvent(eventName, parameters = {}) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag('event', eventName, {
    ...parameters,
    send_to: GA4_MEASUREMENT_ID,
  });
}

export function buildCarLandingEventContext({ location, brand }) {
  const attribution = persistCarLandingAttribution(location?.search || '');
  return {
    page_location: typeof window !== 'undefined' ? window.location.href : '',
    page_path: `${location?.pathname || ''}${location?.search || ''}`,
    brand: brand?.key || 'generic',
    ...attribution,
  };
}
