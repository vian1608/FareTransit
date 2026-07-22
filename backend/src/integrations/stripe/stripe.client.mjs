import axios from 'axios';
import env from '../../config/env.mjs';

export const isStripeMockMode = () => {
  return env.stripeMockMode || !env.stripeSecretKey || env.stripeSecretKey === 'your_stripe_secret_key' || env.stripeSecretKey.includes('placeholder');
};

export const stripeRequest = async (method, path, data = null) => {
  const secretKey = env.stripeSecretKey;
  if (!secretKey) {
    throw new Error('Stripe API secret key is missing');
  }

  const url = `https://api.stripe.com/v1${path}`;
  const headers = {
    Authorization: `Bearer ${secretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded'
  };

  const response = await axios({
    method,
    url,
    headers,
    data: data ? new URLSearchParams(data).toString() : undefined
  });

  return response.data;
};

export default stripeRequest;
