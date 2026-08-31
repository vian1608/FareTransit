import journeySessionService from './journey-session.service.mjs';

/**
 * Reconcile the final browser Flex Assist choice into the authoritative checkout
 * session immediately before add-on pricing runs. This prevents a delayed
 * non-sensitive draft autosave from replacing the customer's last Yes/No choice.
 */
export default async function syncTripAddonRequestToCheckout(req, res, next) {
  try {
    const token = req.body?.checkout_session_token || req.body?.checkoutSessionToken || null;
    const selected = req.body?.tripAddons?.flexAssist?.selected;
    if (!token || typeof selected !== 'boolean') return next();

    const checkout = await journeySessionService.getCheckout(token);
    const payload = checkout?.payload || {};
    const nextPayload = {
      ...payload,
      addons: {
        ...(payload.addons || {}),
        flexAssist: {
          ...(payload.addons?.flexAssist || {}),
          selected,
        },
      },
    };

    await journeySessionService.patchCheckout(token, { payload: nextPayload });
    return next();
  } catch (error) {
    return next(error);
  }
}
