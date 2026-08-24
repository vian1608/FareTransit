import supabase from '../../config/supabase.mjs';
import logger from '../../config/logger.mjs';
import bookingRepository from '../bookings/booking.repository.mjs';
import passengerAuthorizationService from '../authorizations/passenger-authorization.service.mjs';
import addonService from './addon.service.mjs';
import flexAddonService from './flex-addon.service.mjs';

async function getTripAddons(bookingId) {
  let booking = await bookingRepository.getById(bookingId);
  if (!booking) return null;
  try { booking = await addonService.attachToBooking(booking); } catch { /* optional */ }
  const flexAssist = await flexAddonService.getForBooking(booking.id).catch(() => null);
  const baggage = (booking.addonRequests || booking.addon_requests || []).map((r) => ({
    requestId: r.id,
    travelerId: r.traveller?.id || null,
    travelerIndex: r.passenger_index,
    direction: r.journey_direction,
    quantity: r.quantity,
    weightKg: r.requested_weight_kg || 23,
    status: r.status || 'REQUESTED',
    termsVersion: r.terms_version || 'BAGGAGE_REQUEST_V1',
    amountDueNow: 0,
    quotedCustomerPrice: r.quote?.customer_price ?? null,
    quoteValidUntil: r.quote?.valid_until ?? null,
    paymentStatus: r.payment_status || null,
    supplierReference: r.fulfillment?.supplier_reference || null,
  }));
  return { version: 'TRIP_ADDONS_V1', currency: booking.currency || 'USD', flexAssist, baggage };
}

function priceBreakdown(booking = {}, addons = {}) {
  const flex = addons?.flexAssist?.selected ? Number(addons.flexAssist.price || 0) : 0;
  const total = Number(booking.customer_price ?? booking.total_amount ?? 0) || 0;
  const ticketField = Number(booking.ticket_component_total);
  const ticket = Number.isFinite(ticketField) && ticketField >= 0 ? ticketField : Math.max(0, total - flex);
  return {
    ticket: Number(ticket.toFixed(2)),
    flexAssist: Number(flex.toFixed(2)),
    baggageDueNow: 0,
    totalAuthorized: Number(total.toFixed(2)),
    currency: String(booking.currency || addons?.currency || 'USD').toUpperCase(),
  };
}

function addonEvidence(addons = {}) {
  return {
    flexSelected: addons?.flexAssist?.selected === true,
    flexTermsVersion: addons?.flexAssist?.selected ? (addons.flexAssist.termsVersion || 'FLEX_V1') : null,
    flexPrice: Number(addons?.flexAssist?.price || 0),
    baggage: (addons?.baggage || []).map((item) => ({
      requestId: item.requestId,
      travelerId: item.travelerId,
      travelerIndex: item.travelerIndex,
      direction: item.direction,
      quantity: item.quantity,
      weightKg: item.weightKg,
      termsVersion: item.termsVersion || 'BAGGAGE_REQUEST_V1',
      amountDueNow: 0,
      status: item.status,
    })),
  };
}

if (!passengerAuthorizationService.__fareTransitTripAddonEvidenceHardening) {
  const originalCreate = passengerAuthorizationService.createAuthorizationToken?.bind(passengerAuthorizationService);
  const originalAccept = passengerAuthorizationService.acceptAuthorization?.bind(passengerAuthorizationService);
  const originalEvidence = passengerAuthorizationService.generateAuditEvidenceExport?.bind(passengerAuthorizationService);

  if (originalCreate) {
    passengerAuthorizationService.createAuthorizationToken = async (...args) => {
      const result = await originalCreate(...args);
      try {
        const bookingId = result?.booking_id || result?.bookingId || (typeof args[0] === 'object' ? args[0]?.id : null);
        if (!bookingId || !result?.token) return result;
        const booking = await bookingRepository.getById(bookingId);
        const addons = await getTripAddons(bookingId);
        if (!addons || (!addons.flexAssist?.selected && !addons.baggage?.length)) return result;
        const { data } = await supabase.from('passenger_authorizations').select('quote_snapshot').eq('token', result.token).maybeSingle();
        const quoteSnapshot = {
          ...(data?.quote_snapshot || result.quote_snapshot || {}),
          tripAddons: addons,
          trip_addons: addons,
          addOnEvidence: addonEvidence(addons),
          priceBreakdown: priceBreakdown(booking, addons),
        };
        await supabase.from('passenger_authorizations').update({ quote_snapshot: quoteSnapshot }).eq('token', result.token);
        return { ...result, quote_snapshot: quoteSnapshot, quoteSnapshot };
      } catch (error) {
        logger.warn(`[TripAddons] FareTransit authorization quote evidence warning: ${error.message}`);
        return result;
      }
    };
  }

  if (originalAccept) {
    passengerAuthorizationService.acceptAuthorization = async (...args) => {
      const result = await originalAccept(...args);
      try {
        const params = args[0] || {};
        const token = typeof params === 'string' ? params : params.token;
        const bookingId = result?.bookingId || result?.booking_id;
        if (!token || !bookingId) return result;
        const booking = await bookingRepository.getById(bookingId);
        const addons = await getTripAddons(bookingId);
        if (!addons || (!addons.flexAssist?.selected && !addons.baggage?.length)) return result;
        const merged = {
          ...(result.authorizationSnapshot || result.authorization_snapshot || {}),
          tripAddons: addons,
          trip_addons: addons,
          add_on_evidence: addonEvidence(addons),
          price_breakdown: priceBreakdown(booking, addons),
          add_on_terms: {
            flex: addons.flexAssist?.selected ? (addons.flexAssist.termsVersion || 'FLEX_V1') : null,
            baggage: [...new Set((addons.baggage || []).map((item) => item.termsVersion || 'BAGGAGE_REQUEST_V1'))],
          },
        };
        await supabase.from('passenger_authorizations').update({ authorization_snapshot: merged }).eq('token', token);
        await supabase.from('authorization_snapshots').update({ snapshot_data: merged }).eq('token', token).catch(() => null);
        return { ...result, authorizationSnapshot: merged, authorization_snapshot: merged };
      } catch (error) {
        logger.warn(`[TripAddons] FareTransit accepted authorization evidence warning: ${error.message}`);
        return result;
      }
    };
  }

  if (originalEvidence) {
    passengerAuthorizationService.generateAuditEvidenceExport = async (...args) => {
      const evidence = await originalEvidence(...args);
      try {
        const bookingId = args[0] || evidence?.booking?.id;
        const booking = await bookingRepository.getById(bookingId);
        const addons = await getTripAddons(bookingId);
        if (!addons) return evidence;
        return {
          ...evidence,
          tripAddons: addons,
          addOnEvidence: {
            ...addonEvidence(addons),
            priceBreakdown: priceBreakdown(booking, addons),
          },
        };
      } catch (error) {
        logger.warn(`[TripAddons] FareTransit audit export add-on evidence warning: ${error.message}`);
        return evidence;
      }
    };
  }

  Object.defineProperty(passengerAuthorizationService, '__fareTransitTripAddonEvidenceHardening', { value: true, enumerable: false });
}

export default passengerAuthorizationService;
