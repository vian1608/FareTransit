import dotenv from 'dotenv';
dotenv.config();

// Simple validation helper
function required(key) {
  const value = process.env[key];
  if (!value) {
    console.warn(`⚠️  Environment variable ${key} is missing.`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5001', 10),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  
  // Supabase
  supabaseUrl: required('SUPABASE_URL'),
  supabaseSecretKey: required('SUPABASE_SECRET_KEY'),
  
  // Resend
  resendApiKey: required('RESEND_API_KEY'),
  resendFrom: process.env.RESEND_FROM || 'FareTransit LLC <onboarding@resend.dev>',
  inquiryNotifyEmails: process.env.INQUIRY_NOTIFY_EMAILS || 'support@faretransit.com,viansaini1608@gmail.com',

  // Stripe
  stripeSecretKey: required('STRIPE_SECRET_KEY'),
  stripeMockMode: process.env.STRIPE_MOCK_MODE === 'true',

  // SerpAPI
  serpapiApiKey: required('SERPAPI_API_KEY'),

  // JWT
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key-change-this-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  // Admin
  adminEmail: process.env.ADMIN_EMAIL || 'admin@faretransit.com',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123'
};

export default env;
