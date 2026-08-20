import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config(); // Fallback

// Simple validation helper
function required(key) {
  const value = process.env[key];
  if (!value) {
    console.warn(`⚠️  Environment variable ${key} is missing.`);
  }
  return value;
}

function isProductionDeployment() {
  const vercelEnv = (process.env.VERCEL_ENV || '').toLowerCase();
  if (vercelEnv) return vercelEnv === 'production';
  return (process.env.NODE_ENV || 'development').toLowerCase() === 'production';
}

export const env = {
  get nodeEnv() { return process.env.NODE_ENV || 'development'; },
  get port() { return parseInt(process.env.PORT || '5001', 10); },
  get frontendUrl() { return process.env.FRONTEND_URL || 'http://localhost:3000'; },
  
  // Supabase
  get supabaseUrl() { return process.env.SUPABASE_URL || ''; },
  get supabaseSecretKey() { return process.env.SUPABASE_SECRET_KEY || ''; },
  
  // Resend
  get resendApiKey() { return process.env.RESEND_API_KEY || ''; },
  get resendFrom() { return process.env.RESEND_FROM || 'FareTransit <support@faretransit.com>'; },
  get inquiryNotifyEmails() { return process.env.INQUIRY_NOTIFY_EMAILS || 'support@faretransit.com,viansaini1608@gmail.com'; },
  get adminBookingNotificationEmail() { return process.env.ADMIN_BOOKING_NOTIFICATION_EMAIL || 'viansaini1608@gmail.com'; },
  get adminBookingNotificationsEnabled() { return process.env.ADMIN_BOOKING_NOTIFICATIONS_ENABLED !== 'false'; },

  // Stripe
  get stripeSecretKey() { return process.env.STRIPE_SECRET_KEY || ''; },
  get stripePublishableKey() { return process.env.STRIPE_PUBLISHABLE_KEY || ''; },
  get stripeMockMode() { return process.env.STRIPE_MOCK_MODE === 'true'; },

  // Whop Flight Checkout Integration (disabled unless explicitly enabled)
  get whopApiKey() { return process.env.WHOP_API_KEY || ''; },
  get whopCompanyId() { return process.env.WHOP_COMPANY_ID || ''; },
  get whopWebhookSecret() { return process.env.WHOP_WEBHOOK_SECRET || ''; },
  get whopEnv() { return process.env.WHOP_ENV || 'sandbox'; },
  get whopFlightCheckoutEnabled() { return process.env.WHOP_FLIGHT_CHECKOUT_ENABLED === 'true'; },

  // SerpAPI
  get serpapiApiKey() { return process.env.SERPAPI_API_KEY || ''; },

  // JWT
  get jwtSecret() {
    const val = process.env.JWT_SECRET;
    if (isProductionDeployment() && (!val || val === 'your-secret-key-change-this-in-production')) {
      throw new Error('FATAL_CONFIG_ERROR: JWT_SECRET environment variable is missing or insecure in production');
    }
    return val || 'your-secret-key-change-this-in-production';
  },
  get jwtExpiresIn() { return process.env.JWT_EXPIRES_IN || '7d'; },

  // Admin
  get adminEmail() { return process.env.ADMIN_EMAIL || 'admin@faretransit.com'; },
  get adminPassword() {
    const val = process.env.ADMIN_PASSWORD;
    if (isProductionDeployment() && (!val || val === 'admin123')) {
      throw new Error('FATAL_CONFIG_ERROR: ADMIN_PASSWORD environment variable is missing or insecure in production');
    }
    return val || 'admin123';
  },

  // PayPal
  get paypalClientId() { return process.env.PAYPAL_CLIENT_ID || ''; },
  get paypalClientSecret() { return process.env.PAYPAL_CLIENT_SECRET || ''; },
  get paypalEnv() { return process.env.PAYPAL_ENV || 'sandbox'; },
  get paypalWebhookId() { return process.env.PAYPAL_WEBHOOK_ID || ''; },

  // Google Analytics 4
  get ga4PropertyId() { return process.env.GA4_PROPERTY_ID || '456789123'; },
  get ga4ClientEmail() { return process.env.GA4_CLIENT_EMAIL || 'fare-transit-analytics@fare-transit.iam.gserviceaccount.com'; },
  get ga4PrivateKey() { return process.env.GA4_PRIVATE_KEY || (process.env.GA4_CREDENTIALS_JSON ? JSON.parse(process.env.GA4_CREDENTIALS_JSON).private_key : '') },

  // Business Support Contact
  get supportPhoneDisplay() { return process.env.BUSINESS_SUPPORT_PHONE_DISPLAY || '+1 (213) 965-9727'; },
  get supportPhoneInternational() { return process.env.BUSINESS_SUPPORT_PHONE_INTL || '+1 (213) 965-9727'; },
  get supportPhoneHref() { return process.env.BUSINESS_SUPPORT_PHONE_HREF || 'tel:+12139659727'; },
  get supportPhoneSchema() { return process.env.BUSINESS_SUPPORT_PHONE_SCHEMA || '+1-213-965-9727'; },

  // Booking.com Demand API v3.1
  get bookingDemandApiBaseUrl() { 
    return process.env.BOOKING_DEMAND_API_BASE_URL || 
      (process.env.BOOKING_DEMAND_API_ENVIRONMENT === 'production' 
        ? 'https://demandapi.booking.com/3.1' 
        : 'https://demandapi-sandbox.booking.com/3.1'); 
  },
  get bookingDemandApiToken() { return process.env.BOOKING_DEMAND_API_TOKEN || ''; },
  get bookingAffiliateId() { return process.env.BOOKING_AFFILIATE_ID || ''; },
  get bookingDemandApiEnv() { return process.env.BOOKING_DEMAND_API_ENVIRONMENT || 'sandbox'; },
  get carRentalsApiEnabled() { return process.env.CAR_RENTALS_API_ENABLED !== 'false'; }
};

export default env;
