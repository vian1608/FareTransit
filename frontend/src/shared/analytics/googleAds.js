/**
 * Google Ads tracking adapter for callers that use Promise-style completion.
 * The canonical conversion implementation remains synchronous in utils/analytics.js
 * because several lead flows depend on its boolean return value. Checkout imports
 * this adapter, which guarantees a Promise and therefore supports await/.catch safely.
 */
import analytics, {
  GOOGLE_ADS_CONVERSION_ID,
  GOOGLE_ADS_LEAD_DESTINATION,
  trackGoogleAdsLeadConversion as trackGoogleAdsLeadConversionSync,
  trackLeadOnce,
  trackLeadConversion,
} from '../utils/analytics.js';

export { GOOGLE_ADS_CONVERSION_ID, GOOGLE_ADS_LEAD_DESTINATION, trackLeadOnce, trackLeadConversion };

export function trackGoogleAdsLeadConversion(...args) {
  return Promise.resolve().then(() => trackGoogleAdsLeadConversionSync(...args));
}

export default analytics;
