import { getPricedBaggageOptions } from './baggage-pricing.service.mjs';

export async function getBaggageOptions(req, res) {
  try {
    const bookingToken = String(req.body?.bookingToken || req.body?.booking_token || '').trim();
    if (!bookingToken) {
      return res.status(400).json({
        success: false,
        error: { code: 'BOOKING_TOKEN_REQUIRED', message: 'A flight booking token is required to check baggage pricing.' },
      });
    }

    const quote = await getPricedBaggageOptions({
      bookingToken,
      currency: req.body?.currency || 'USD',
    });

    return res.json({ success: true, data: quote });
  } catch (error) {
    const status = Number(error?.status) || 502;
    return res.status(status).json({
      success: false,
      error: {
        code: error?.code || 'BAGGAGE_PRICING_UNAVAILABLE',
        message: error?.message || 'Unable to retrieve baggage pricing for this itinerary.',
      },
    });
  }
}

export default { getBaggageOptions };
