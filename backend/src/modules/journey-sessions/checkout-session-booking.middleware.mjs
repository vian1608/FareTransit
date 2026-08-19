import journeySessionService from './journey-session.service.mjs';

/**
 * Links a successful booking to its c_ checkout token and returns an r_ read token.
 * The c_ token is also the stable booking idempotency identity, so duplicate tabs
 * cannot create two reservations from the same checkout URL.
 *
 * The booking remains successful even if journey-link finalization has a transient
 * problem; the legacy confirmation-code route remains a safe fallback.
 */
export function completeJourneySessionAfterBooking(req, res, next) {
  const checkoutToken = String(
    req.body?.checkout_session_token
    || req.body?.checkoutSessionToken
    || ''
  ).trim();

  if (!checkoutToken) return next();

  // Override random per-tab browser keys with one durable checkout identity.
  // The bookings table has unique persistent idempotency indexes from migration 033.
  const durableRequestId = `checkout:${checkoutToken}`;
  req.body = {
    ...(req.body || {}),
    checkout_session_token: checkoutToken,
    checkoutSessionToken: checkoutToken,
    idempotency_key: durableRequestId,
    idempotencyKey: durableRequestId,
    client_request_id: durableRequestId,
    clientRequestId: durableRequestId,
  };

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

    journeySessionService.completeCheckout(checkoutToken, bookingId)
      .then(({ reservationToken }) => {
        if (sent) return;
        sent = true;
        const existingData = body?.data && typeof body.data === 'object' ? body.data : {};
        originalJson({
          ...body,
          data: {
            ...existingData,
            reservationReadToken: reservationToken,
          },
          reservationReadToken: reservationToken,
        });
      })
      .catch((error) => {
        console.error('[JourneySession] Non-blocking checkout completion warning:', error.message);
        if (sent) return;
        sent = true;
        originalJson(body);
      });

    return res;
  };

  return next();
}

export default completeJourneySessionAfterBooking;
