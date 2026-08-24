import journeySessionService from './journey-session.service.mjs';
import {
  buildAuthoritativeTripAddonQuote,
  applyAuthoritativeTripAddonPricing,
} from '../addons/trip-addon-pricing.service.mjs';
import flexAddonService from '../addons/flex-addon.service.mjs';
import { sendTripAddonBookingSummaryEmail } from '../addons/trip-addon-booking-email.service.mjs';

/**
 * Links a successful booking to its c_ checkout token and returns an r_ read token.
 * Optional-service prices are rebuilt from the server-side checkout payload. The
 * browser cannot choose its own Flex amount or add baggage to the airfare charge.
 */
export async function completeJourneySessionAfterBooking(req, res, next) {
  const checkoutToken = String(
    req.body?.checkout_session_token
    || req.body?.checkoutSessionToken
    || ''
  ).trim();

  if (!checkoutToken) return next();

  let tripAddons;
  try {
    const checkout = await journeySessionService.getCheckout(checkoutToken);
    tripAddons = buildAuthoritativeTripAddonQuote(checkout?.payload || {});
    await journeySessionService.patchCheckout(checkoutToken, {
      payload: {
        ...(checkout?.payload || {}),
        addons: tripAddons,
        addonQuote: tripAddons,
      },
    });
  } catch (error) {
    const status = Number(error?.status) || 400;
    return res.status(status).json({
      success: false,
      error: {
        code: error?.code || 'CHECKOUT_ADDON_VALIDATION_FAILED',
        message: error?.message || 'Unable to validate optional trip services for this checkout.',
      },
    });
  }

  const durableRequestId = `checkout:${checkoutToken}`;
  req.body = applyAuthoritativeTripAddonPricing({
    ...(req.body || {}),
    checkout_session_token: checkoutToken,
    checkoutSessionToken: checkoutToken,
    idempotency_key: durableRequestId,
    idempotencyKey: durableRequestId,
    client_request_id: durableRequestId,
    clientRequestId: durableRequestId,
  }, tripAddons);

  // Keep the existing baggage booking service path authoritative for request
  // persistence, but normalize the request shape from the checkout token too.
  req.body.baggageRequests = (tripAddons.baggage || []).map((item) => ({
    passengerIndex: item.travelerIndex,
    addonType: 'CHECKED_BAGGAGE',
    journeyDirection: item.direction,
    quantity: item.quantity,
    requestedWeightKg: item.weightKg || 23,
    termsVersion: item.termsVersion || 'BAGGAGE_REQUEST_V1',
  }));

  const originalJson = res.json.bind(res);
  let sent = false;

  res.json = (body) => {
    if (sent) return res;
    const bookingId = body?.data?.booking?.id
      || body?.data?.id
      || body?.data?.booking_id
      || body?.booking?.id
      || body?.id
      || null;

    if (!body?.success || !bookingId) {
      sent = true;
      return originalJson(body);
    }

    Promise.allSettled([
      journeySessionService.completeCheckout(checkoutToken, bookingId),
      flexAddonService.persistForBooking(bookingId, tripAddons),
    ]).then(async (results) => {
      if (sent) return;
      if (results[0]?.status === 'rejected') console.error('[JourneySession] Non-blocking checkout completion warning:', results[0].reason?.message);
      if (results[1]?.status === 'rejected') console.error('[TripAddons] Non-blocking Flex persistence warning:', results[1].reason?.message);
      // Baggage is persisted inside bookingService.create before this response is
      // emitted, so email lookup sees both Flex and baggage records.
      try { await sendTripAddonBookingSummaryEmail(bookingId); }
      catch (error) { console.error('[TripAddons] Non-blocking itemized email warning:', error.message); }

      if (sent) return;
      sent = true;
      const reservationToken = results[0]?.status === 'fulfilled' ? results[0].value?.reservationToken : null;
      const existingData = body?.data && typeof body.data === 'object' ? body.data : {};
      return originalJson({
        ...body,
        data: {
          ...existingData,
          tripAddons,
          flexAssist: tripAddons.flexAssist,
          ...(reservationToken ? { reservationReadToken: reservationToken } : {}),
        },
        tripAddons,
        flexAssist: tripAddons.flexAssist,
        ...(reservationToken ? { reservationReadToken: reservationToken } : {}),
      });
    });

    return res;
  };

  return next();
}

export default completeJourneySessionAfterBooking;
