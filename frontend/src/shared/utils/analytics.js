/**
 * Safe Analytics utility for SEO landing pages, flight search, and Google Ads conversion tracking.
 * Strictly avoids transmitting any PII (names, emails, phone numbers, passport numbers, card/billing data).
 *
 * Google Ads Conversion:
 *   Conversion ID: AW-18364862445
 *   Lead Destination: AW-18364862445/mIOvCMHyndocEO2fhrVE
 */

export const GOOGLE_ADS_CONVERSION_ID = 'AW-18364862445';
export const GOOGLE_ADS_LEAD_DESTINATION = 'AW-18364862445/mIOvCMHyndocEO2fhrVE';

// In-memory deduplication set (firedConversions) — guards against duplicate triggers in a single session
const firedConversions = new Set();

/**
 * Fires the Google Ads "Submit lead form" conversion.
 * send_to: AW-18364862445/mIOvCMHyndocEO2fhrVE
 * value: 1.0
 * currency: USD
 * transaction_id: <stable unique lead id>
 *
 * Guaranteed safety:
 * - Gracefully handles missing gtag or ad blockers
 * - Deduplicates by leadId (firedConversions Set + sessionStorage)
 * - Zero PII transmitted: no name, email, phone, card data, passport
 */
export function trackGoogleAdsLeadConversion(options = {}, secondaryArg = null) {
  if (typeof window === 'undefined') {
    return false;
  }

  // Support both object arguments { leadId, value, currency } and positional arguments (source, leadId)
  let leadId = null;
  let value = 1.0;
  let currency = 'USD';

  if (typeof options === 'string') {
    leadId = secondaryArg || options;
  } else if (typeof options === 'object' && options !== null) {
    leadId = options.leadId || options.bookingReference || options.id || options.transaction_id || null;
    if (options.value !== undefined) value = options.value;
    if (options.currency) currency = options.currency;
  }

  const normalizedLeadId = leadId ? String(leadId).trim() : null;
  const isDev = process.env.NODE_ENV === 'development';

  // Require stable leadId for real production conversion
  if (!normalizedLeadId) {
    if (isDev) {
      console.warn('[GoogleAds] Conversion blocked: stable leadId is required to prevent invalid tracking.');
    }
    return false;
  }

  // Ensure window.dataLayer and window.gtag are available safely
  window.dataLayer = window.dataLayer || [];

  if (typeof window.gtag !== 'function') {
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };
    if (isDev) {
      console.info('[GoogleAds] gtag unavailable');
    }
  } else if (isDev) {
    console.info('[GoogleAds] tag ready');
  }

  // Deduplication check: in-memory Set + sessionStorage
  const dedupeKey = `lead_${normalizedLeadId}`;
  const sessionStorageKey = `google-ads-lead-${normalizedLeadId}`;

  let alreadyFiredInSession = false;
  try {
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(sessionStorageKey)) {
      alreadyFiredInSession = true;
    }
  } catch (_) {
    // sessionStorage unavailable — ignore
  }

  if (firedConversions.has(dedupeKey) || alreadyFiredInSession) {
    if (isDev) {
      console.info('[GoogleAds] duplicate suppressed', { leadId: normalizedLeadId });
    }
    return false;
  }

  // Mark as fired before dispatching
  firedConversions.add(dedupeKey);
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(sessionStorageKey, 'sent');
    }
  } catch (_) {}

  const numericValue = Number.isFinite(Number(value)) ? Number(value) : 1.0;
  const currencyStr = String(currency || 'USD').toUpperCase();

  if (isDev) {
    console.info('[GoogleAds] lead conversion requested', {
      leadId: normalizedLeadId,
      destination: GOOGLE_ADS_LEAD_DESTINATION,
      value: numericValue,
      currency: currencyStr,
    });
  }

  // Payload containing ZERO PII
  const payload = {
    send_to: GOOGLE_ADS_LEAD_DESTINATION,
    value: numericValue,
    currency: currencyStr,
    transaction_id: normalizedLeadId,
    event_timeout: 2000,
  };

  try {
    window.gtag('event', 'conversion', payload);
    if (isDev) {
      console.info('[GoogleAds] lead conversion sent', {
        leadId: normalizedLeadId,
        destination: GOOGLE_ADS_LEAD_DESTINATION,
        value: numericValue,
        currency: currencyStr,
      });
    }
    return true;
  } catch (err) {
    if (isDev) {
      console.warn('[GoogleAds] Failed to dispatch lead conversion:', err.message);
    }
    return false;
  }
}

export { trackGoogleAdsLeadConversion as trackLeadOnce };

export const trackLeadConversion = (params = {}, secondaryArg = null) => {
  return trackGoogleAdsLeadConversion(params, secondaryArg);
};

export const trackEvent = (eventName, payload = {}) => {
  const safeData = {
    event: eventName,
    page: payload.page || 'unknown',
    timestamp: new Date().toISOString(),
    ...payload,
  };

  if (process.env.NODE_ENV === 'development') {
    console.log('[Analytics Event]:', safeData);
  }

  if (typeof window !== 'undefined') {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(safeData);
  }
};

export const analytics = {
  trackSeoPageView: (pageId) => trackEvent('seo_page_view', { page: pageId }),
  trackFlightSearchStarted: (pageId, criteria = {}) =>
    trackEvent('flight_search_started', {
      page: pageId,
      tripType: criteria.tripType,
      cabinClass: criteria.cabinClass,
      hasReturn: !!criteria.returnDate,
    }),
  trackFlightSearchSubmitted: (pageId, criteria = {}) =>
    trackEvent('flight_search_submitted', {
      page: pageId,
      tripType: criteria.tripType,
      cabinClass: criteria.cabinClass,
      passengersCount: (criteria.adults || 1) + (criteria.children || 0) + (criteria.infants || 0),
      isBookingForSomeoneElse: !!criteria.isBookingForSomeoneElse,
    }),
  trackFlightSearchFailed: (pageId, errorMsg) =>
    trackEvent('flight_search_failed', { page: pageId, error: errorMsg }),
  trackCallCtaClicked: (pageId) => trackEvent('call_cta_clicked', { page: pageId }),
  trackAssistanceRequested: (pageId) => trackEvent('assistance_requested', { page: pageId }),
  trackLeadConversion: (source = 'lead_form', dedupeId = null) => trackLeadConversion(source, dedupeId),
  trackMobileHelpTabSelected: (tabName) =>
    trackEvent('mobile_help_tab_selected', { tab_name: tabName }),
  trackMobileHelpCardViewed: (tabName, cardName, cardIndex) =>
    trackEvent('mobile_help_card_viewed', { tab_name: tabName, card_name: cardName, card_index: cardIndex }),
};

export default analytics;
