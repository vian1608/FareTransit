/**
 * Google Ads Tracking Utility — re-exports from shared/utils/analytics.js
 * Canonical implementation lives in analytics.js.
 */
export {
  GOOGLE_ADS_CONVERSION_ID,
  GOOGLE_ADS_LEAD_DESTINATION,
  trackGoogleAdsLeadConversion,
  trackLeadOnce,
  trackLeadConversion,
} from '../utils/analytics.js';

export { default } from '../utils/analytics.js';
