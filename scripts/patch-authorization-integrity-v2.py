from pathlib import Path
import re


def read(path):
    return Path(path).read_text()


def write(path, value):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(value)


def replace_once(source, old, new, label):
    if old not in source:
        raise RuntimeError(f"Patch anchor not found: {label}")
    return source.replace(old, new, 1)


def replace_between(source, start, end, replacement, label):
    i = source.find(start)
    if i < 0:
        raise RuntimeError(f"Start anchor not found: {label}")
    j = source.find(end, i)
    if j < 0:
        raise RuntimeError(f"End anchor not found: {label}")
    return source[:i] + replacement + source[j:]


# ---------------------------------------------------------------------------
# 1. Canonical immutable authorization snapshot builder
# ---------------------------------------------------------------------------
snapshot_service = r'''import crypto from 'crypto';
import bookingRepository from '../bookings/booking.repository.mjs';
import { buildCanonicalItinerary, resolveAirlineName, getCarrierLogoUrl } from '../../shared/utils/airline-lookup.mjs';

const money = value => Math.round((Number(value) || 0) * 100) / 100;
const text = value => String(value ?? '').trim();

function inferMerchantCode(split = {}) {
  const explicit = text(split.merchant_code || split.merchantCode).toUpperCase();
  if (explicit) return explicit;
  const match = text(split.merchant_name || split.merchantName).match(/^([A-Z0-9]{2})\s+Airlines?$/i);
  return match ? match[1].toUpperCase() : '';
}

function normalizeSplit(split = {}, currency = 'USD') {
  const code = inferMerchantCode(split);
  const rawName = text(split.merchant_name || split.merchantName || split.name || split.merchant);
  const type = text(split.merchant_type || split.merchantType).toUpperCase()
    || (rawName.toLowerCase() === 'faretransit llc' ? 'FARETRANSIT' : (code ? 'AIRLINE' : 'OTHER'));
  const name = type === 'AIRLINE'
    ? (resolveAirlineName(code, rawName) || rawName || code)
    : (type === 'FARETRANSIT' ? 'FareTransit LLC' : rawName);
  return {
    merchantName: name || 'Merchant',
    merchant_name: name || 'Merchant',
    merchantType: type,
    merchant_type: type,
    merchantCode: code || null,
    merchant_code: code || null,
    amount: money(split.amount),
    currency: text(split.currency || currency || 'USD').toUpperCase()
  };
}

function normalizeSegment(segment = {}) {
  const code = text(segment.carrierCode || segment.carrier_code || segment.marketing_carrier_code).toUpperCase();
  const supplied = text(segment.airlineName || segment.carrier_name || segment.airline_name || segment.airline);
  const airlineName = resolveAirlineName(code, supplied) || supplied || code || 'Airline';
  return {
    id: segment.id || null,
    sequence: Number(segment.sequence || segment.segment_sequence || 1),
    journeyIndex: Number(segment.journeyIndex || segment.journey_index || 1),
    journeyRole: text(segment.journeyRole || segment.journey_role || 'OUTBOUND').toUpperCase(),
    carrierCode: code,
    airlineName,
    airlineLogoUrl: segment.airlineLogoUrl || getCarrierLogoUrl(code),
    flightNumber: text(segment.flightNumber || segment.flight_number),
    originCode: text(segment.originCode || segment.origin_airport || segment.departure_airport).toUpperCase(),
    originName: text(segment.originName || segment.origin_city || segment.originCode || segment.origin_airport),
    destinationCode: text(segment.destinationCode || segment.destination_airport || segment.arrival_airport).toUpperCase(),
    destinationName: text(segment.destinationName || segment.destination_city || segment.destinationCode || segment.destination_airport),
    departureDate: text(segment.departureDate || segment.departure_date),
    departureTime: text(segment.departureTime || segment.departure_time || segment.departure_time_str),
    arrivalDate: text(segment.arrivalDate || segment.arrival_date),
    arrivalTime: text(segment.arrivalTime || segment.arrival_time || segment.arrival_time_str),
    cabinClass: text(segment.cabinClass || segment.cabin || segment.cabin_class || 'Economy'),
    aircraft: text(segment.aircraft || segment.aircraft_type),
    stops: Number(segment.stops ?? segment.stop_count ?? 0)
  };
}

function mapLegacySegment(segment) {
  const s = normalizeSegment(segment);
  return {
    id: s.id,
    sequence: s.sequence,
    journey_index: s.journeyIndex,
    journey_role: s.journeyRole,
    carrier_code: s.carrierCode,
    carrier_name: s.airlineName,
    airline: s.airlineName,
    airlineName: s.airlineName,
    airlineLogoUrl: s.airlineLogoUrl,
    flight_number: s.flightNumber,
    flightNumber: s.flightNumber,
    origin_airport: s.originCode,
    originCode: s.originCode,
    origin_city: s.originName,
    originCity: s.originName,
    destination_airport: s.destinationCode,
    destinationCode: s.destinationCode,
    destination_city: s.destinationName,
    destinationCity: s.destinationName,
    departure_date: s.departureDate,
    departureDate: s.departureDate,
    departure_time: s.departureTime,
    departureTime: s.departureTime,
    arrival_date: s.arrivalDate,
    arrivalDate: s.arrivalDate,
    arrival_time: s.arrivalTime,
    arrivalTime: s.arrivalTime,
    cabin: s.cabinClass,
    cabinClass: s.cabinClass,
    aircraft: s.aircraft,
    stops: s.stops
  };
}

export function authorizationSnapshotHash(snapshot) {
  const stable = { ...snapshot };
  delete stable.createdAt;
  return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

export function authorizationSnapshotToLegacyItinerary(snapshot = {}) {
  const journeys = Array.isArray(snapshot?.itinerary?.journeys) ? snapshot.itinerary.journeys : [];
  const outboundJourney = journeys.find(j => String(j.role).toUpperCase() === 'OUTBOUND') || journeys[0] || null;
  const returnJourney = journeys.find(j => String(j.role).toUpperCase() === 'RETURN') || null;
  const outboundSegments = (outboundJourney?.segments || []).map(mapLegacySegment);
  const returnSegments = (returnJourney?.segments || []).map(mapLegacySegment);
  return {
    tripType: snapshot?.itinerary?.tripType || 'ONE_WAY',
    outboundSegments,
    returnSegments,
    outbound: outboundSegments[0] || null,
    return: returnSegments[0] || null,
    canonical: {
      tripType: snapshot?.itinerary?.tripType || 'ONE_WAY',
      journeys,
      outbound: outboundSegments,
      return: returnSegments
    }
  };
}

export function authorizationSnapshotToBookingLike(snapshot = {}) {
  const journeys = Array.isArray(snapshot?.itinerary?.journeys) ? snapshot.itinerary.journeys : [];
  const segments = journeys.flatMap(journey => (journey.segments || []).map((segment, index) => ({
    ...mapLegacySegment({ ...segment, journeyIndex: journey.journeyIndex, journeyRole: journey.role }),
    booking_id: snapshot.bookingId,
    trip_type: snapshot?.itinerary?.tripType || 'ONE_WAY',
    itinerary_type: snapshot?.itinerary?.tripType || 'ONE_WAY',
    journey_index: Number(journey.journeyIndex || 1),
    journey_role: String(journey.role || 'OUTBOUND').toUpperCase(),
    journey_direction: String(journey.role || 'OUTBOUND').toUpperCase() === 'RETURN' ? 'return' : 'outbound',
    direction: String(journey.role || 'OUTBOUND').toUpperCase() === 'RETURN' ? 'return' : 'outbound',
    segment_sequence: Number(segment.sequence || index + 1)
  })));
  return {
    id: snapshot.bookingId,
    confirmation_code: snapshot.confirmationCode,
    itinerary_type: snapshot?.itinerary?.tripType || 'ONE_WAY',
    itinerary_segments: segments,
    currency: snapshot?.paymentAuthorization?.currency || snapshot?.pricing?.currency || 'USD'
  };
}

export const authorizationSnapshotService = {
  build: async (bookingInput) => {
    const rawId = typeof bookingInput === 'object'
      ? (bookingInput.id || bookingInput.booking_id || bookingInput.confirmation_code)
      : bookingInput;
    const booking = (typeof bookingInput === 'object' && bookingInput?.id && (bookingInput.itinerary_segments || bookingInput.itinerary))
      ? bookingInput
      : await bookingRepository.getCompleteBookingById(rawId);
    if (!booking?.id) throw new Error('BOOKING_NOT_FOUND');

    const canonical = buildCanonicalItinerary(booking);
    if (!canonical?.journeys?.length) throw new Error('AUTHORIZATION_SNAPSHOT_ITINERARY_REQUIRED');

    const currency = text(booking.currency || 'USD').toUpperCase();
    const rawSplits = await bookingRepository.getPaymentSplits(booking.id).catch(() => []);
    const splits = (rawSplits || []).map(s => normalizeSplit(s, currency));
    const splitTotal = money(splits.reduce((sum, s) => sum + money(s.amount), 0));
    const customerTotal = money(booking.customer_price || booking.total_amount || 0);
    const authorizedAmount = money(booking.authorized_amount || splitTotal || customerTotal);
    if (!splits.length) throw new Error('AUTHORIZATION_SNAPSHOT_SPLITS_REQUIRED');
    if (Math.abs(splitTotal - authorizedAmount) > 0.01) {
      throw new Error(`AUTHORIZATION_SNAPSHOT_TOTAL_MISMATCH: Split total ${splitTotal.toFixed(2)} does not match authorized amount ${authorizedAmount.toFixed(2)}.`);
    }

    const paymentMethod = booking.paymentMethod || booking.payment_method || await bookingRepository.getPaymentMethodByBookingId(booking.id).catch(() => null) || {};
    const rawLast4 = text(paymentMethod.card_last4 || paymentMethod.cardLast4).replace(/\D/g, '');
    const last4 = /^\d{4}$/.test(rawLast4) ? rawLast4 : null;
    const travellers = Array.isArray(booking.travellers) ? booking.travellers : (Array.isArray(booking.passengers) ? booking.passengers : []);
    const primaryContact = booking.contacts?.[0] || {};

    const journeys = canonical.journeys.map(journey => ({
      journeyIndex: Number(journey.journeyIndex || 1),
      role: text(journey.role || 'OUTBOUND').toUpperCase(),
      label: journey.label || (canonical.tripType === 'MULTI_CITY' ? `Trip ${journey.journeyIndex}` : journey.role),
      segments: (journey.segments || []).map(normalizeSegment)
    }));

    const snapshot = {
      schemaVersion: 'AUTHORIZATION_SNAPSHOT_V2',
      bookingId: booking.id,
      confirmationCode: booking.confirmation_code || booking.confirmationCode || booking.id,
      bookingRevision: Number(booking.booking_revision || 1),
      createdAt: new Date().toISOString(),
      passenger: {
        name: booking.passenger_name || booking.passengerName || 'Valued Passenger',
        email: booking.email || primaryContact.email || '',
        phone: booking.phone || primaryContact.phone_number || primaryContact.phone || '',
        travellers: travellers.map(t => ({
          title: t.title || null,
          firstName: t.first_name || t.firstName || '',
          middleName: t.middle_name || t.middleName || null,
          lastName: t.last_name || t.lastName || '',
          dateOfBirth: t.date_of_birth || t.dateOfBirth || null,
          gender: t.gender || null,
          nationality: t.nationality || null,
          passportLast4: (() => { const v = text(t.passport_number || t.passportNumber); return v ? v.slice(-4) : null; })()
        }))
      },
      itinerary: {
        tripType: canonical.tripType || 'ONE_WAY',
        journeys
      },
      pricing: {
        customerTotal,
        currency
      },
      paymentAuthorization: {
        authorizedAmount,
        currency,
        splits
      },
      paymentMethod: {
        brand: paymentMethod.card_brand || paymentMethod.cardBrand || 'Card',
        last4,
        label: last4 ? `${paymentMethod.card_brand || paymentMethod.cardBrand || 'Card'} ending in ${last4}` : 'Saved payment method'
      },
      policies: {
        authorizationScope: 'This authorization is valid only for the passenger, itinerary and payment amounts shown in this request.',
        reauthorization: 'Any material change to itinerary, passenger details, payment method or authorized amount requires a new authorization.'
      }
    };
    return snapshot;
  }
};

export default authorizationSnapshotService;
'''
write('backend/src/modules/authorizations/authorization-snapshot.service.mjs', snapshot_service)


# ---------------------------------------------------------------------------
# 2. Airline identity: prefer the catalog over placeholder "XX Airlines" names
# ---------------------------------------------------------------------------
path = 'backend/src/shared/utils/airline-lookup.mjs'
s = read(path)
old = """export function resolveAirlineName(carrierCode, providedName = '') {
  const code = String(carrierCode || '').trim().toUpperCase();
  if (!genericAirlineName(providedName)) return String(providedName).trim();
  const found = getAirlineName(code);
  if (found) return found;
  return code ? `${code} Airlines` : '';
}"""
new = """export function resolveAirlineName(carrierCode, providedName = '') {
  const code = String(carrierCode || '').trim().toUpperCase();
  const supplied = String(providedName || '').trim();
  const codePlaceholder = code && new RegExp(`^${code}\\\\s+Airlines?$`, 'i').test(supplied);
  const found = getAirlineName(code);
  if (found && (genericAirlineName(supplied) || codePlaceholder)) return found;
  if (!genericAirlineName(supplied) && !codePlaceholder) return supplied;
  if (found) return found;
  return code || '';
}"""
s = replace_once(s, old, new, 'airline resolver')
write(path, s)


# ---------------------------------------------------------------------------
# 3. Booking mutation/revision invalidation
# ---------------------------------------------------------------------------
path = 'backend/src/modules/bookings/booking.repository.mjs'
s = read(path)
s = replace_once(s,
    "import { buildCanonicalItinerary, calculateTripSummary } from '../../shared/utils/airline-lookup.mjs';",
    "import { buildCanonicalItinerary, calculateTripSummary, resolveAirlineName } from '../../shared/utils/airline-lookup.mjs';",
    'booking repo airline import')

revision_method = r'''  bumpAuthorizationRevision: async (bookingIdInput, { reason = 'Authorization-sensitive booking details changed', actor = 'system' } = {}) => {
    const booking = await bookingRepository.findBaseBookingRecord(bookingIdInput);
    if (!booking?.id) return { bookingRevision: 1, reauthorizationRequired: false };
    const realId = booking.id;
    const now = new Date().toISOString();
    const currentRevision = Math.max(1, Number(booking.booking_revision || 1));
    const nextRevision = currentRevision + 1;

    const { data: authRows } = await supabase
      .from('passenger_authorizations')
      .select('id,status,authorization_status,authorization_revision,token')
      .eq('booking_id', realId);
    const rows = Array.isArray(authRows) ? authRows : [];
    const hasPriorAuthorization = rows.length > 0 || Boolean(booking.authorization_token);
    const pendingIds = rows
      .filter(row => ['pending', 'awaiting_authorization', 'awaiting_passenger'].includes(String(row.status || row.authorization_status || '').toLowerCase()))
      .map(row => row.id);

    if (pendingIds.length > 0) {
      const { error: supersedeError } = await supabase
        .from('passenger_authorizations')
        .update({
          status: 'superseded',
          authorization_status: 'SUPERSEDED',
          superseded_at: now,
          reauthorization_requested_at: now,
          reauthorization_reason: reason,
          status_reason: reason,
          updated_at: now
        })
        .in('id', pendingIds);
      if (supersedeError) throw new Error(`AUTHORIZATION_SUPERSEDE_FAILED: ${supersedeError.message}`);
    }

    const bookingFields = {
      booking_revision: nextRevision,
      authorization_token: null,
      authorization_expires_at: null,
      authorization_status: hasPriorAuthorization ? 'REAUTHORIZATION_REQUIRED' : (booking.authorization_status || 'NOT_CREATED'),
      updated_at: now
    };
    const { data, error } = await supabase.from('bookings').update(bookingFields).eq('id', realId).select().maybeSingle();
    if (error) throw new Error(`AUTHORIZATION_REVISION_UPDATE_FAILED: ${error.message}`);

    const merged = { ...booking, ...bookingFields, ...(data || {}) };
    bookingsMemoryStore.set(realId, merged);
    if (merged.confirmation_code) bookingsMemoryStore.set(merged.confirmation_code, merged);

    await bookingRepository.recordAuditLog({
      bookingId: realId,
      action: 'AUTHORIZATION_REVISION_BUMPED',
      oldValue: { bookingRevision: currentRevision, authorizationStatus: booking.authorization_status || null },
      newValue: { bookingRevision: nextRevision, authorizationStatus: bookingFields.authorization_status, reason },
      actor
    }).catch(() => null);

    return { bookingRevision: nextRevision, reauthorizationRequired: hasPriorAuthorization, supersededCount: pendingIds.length };
  },

'''
anchor = "  updateStatus: async (id, updateFields) => {"
if revision_method.strip() not in s:
    s = replace_once(s, anchor, revision_method + anchor, 'revision method insertion')

s = s.replace("  saveItinerarySegments: async (bookingId, segments = []) => {", "  saveItinerarySegments: async (bookingId, segments = [], options = {}) => {")
s = s.replace("carrier_name: seg.carrier_name || seg.airline_name || seg.airline || (code ? `${code} Airlines` : ''),",
              "carrier_name: resolveAirlineName(code, seg.carrier_name || seg.airline_name || seg.airline || '') || code,")

# Invalidate only after a durable itinerary write.
s = replace_once(s,
"""          await bookingRepository._persistToFlightsTable(bookingId, validRows);
          return;""",
"""          await bookingRepository._persistToFlightsTable(bookingId, validRows);
          if (!options.skipAuthorizationRevision) {
            await bookingRepository.bumpAuthorizationRevision(bookingId, { reason: options.reason || 'Flight itinerary changed', actor: options.actor || 'admin' });
          }
          return;""",
'itinerary normalized revision')
s = replace_once(s,
"""      await bookingRepository._persistToFlightsTable(bookingId, rows);
    } catch (e) {""",
"""      await bookingRepository._persistToFlightsTable(bookingId, rows);
      if (!options.skipAuthorizationRevision) {
        await bookingRepository.bumpAuthorizationRevision(bookingId, { reason: options.reason || 'Flight itinerary changed', actor: options.actor || 'admin' });
      }
    } catch (e) {""",
'itinerary fallback revision')

s = s.replace("  savePaymentSplits: async (bookingIdInput, splits = []) => {", "  savePaymentSplits: async (bookingIdInput, splits = [], options = {}) => {")
s = replace_once(s,
"""      const formatted = (splits || []).map((s, index) => ({
        booking_id: realId,
        merchant_name: s.merchant_name || s.merchantName || 'Merchant',
        amount: parseFloat(s.amount || 0),
        currency: (s.currency || booking?.currency || 'USD').toUpperCase(),
        display_order: index + 1
      }));""",
"""      const formatted = (splits || []).map((s, index) => {
        const merchantCode = String(s.merchant_code || s.merchantCode || '').trim().toUpperCase() || null;
        const rawName = String(s.merchant_name || s.merchantName || 'Merchant').trim();
        const merchantType = String(s.merchant_type || s.merchantType || (rawName.toLowerCase() === 'faretransit llc' ? 'FARETRANSIT' : (merchantCode ? 'AIRLINE' : 'OTHER'))).toUpperCase();
        const merchantName = merchantType === 'AIRLINE' ? (resolveAirlineName(merchantCode, rawName) || rawName) : (merchantType === 'FARETRANSIT' ? 'FareTransit LLC' : rawName);
        return {
          booking_id: realId,
          merchant_name: merchantName,
          merchant_type: merchantType,
          merchant_code: merchantCode,
          amount: parseFloat(s.amount || 0),
          currency: (s.currency || booking?.currency || 'USD').toUpperCase(),
          display_order: index + 1
        };
      });""",
'payment split structured format')

# Ensure payment_authorization_splits receives supported structured columns now that migration exists.
s = replace_once(s,
"""      await mirrorBookingPaymentSplits(realId, splits, booking?.currency || 'USD');
      return formatted;""",
"""      await mirrorBookingPaymentSplits(realId, formatted, booking?.currency || 'USD');
      if (!options.skipAuthorizationRevision) {
        await bookingRepository.bumpAuthorizationRevision(realId, { reason: options.reason || 'Payment authorization split changed', actor: options.actor || 'admin' });
      }
      return formatted;""",
'payment split revision')

# Billing/card reference changes invalidate a previously issued authorization.
s = replace_once(s,
"""    paymentMethodsMemoryStore.set(bookingId, finalRecord);
    logger.info(`[BillingUpdate] Updated billing details for booking ${bookingId}`);
    return finalRecord;""",
"""    paymentMethodsMemoryStore.set(bookingId, finalRecord);
    await bookingRepository.bumpAuthorizationRevision(bookingId, { reason: 'Saved payment method or billing reference changed', actor: 'admin' });
    logger.info(`[BillingUpdate] Updated billing details for booking ${bookingId}`);
    return finalRecord;""",
'billing revision')

# saveAllBookingChanges: prevent duplicate revisions during component writes and bump once.
s = s.replace("await bookingRepository.savePaymentSplits(realId, payload.paymentSplits);",
              "await bookingRepository.savePaymentSplits(realId, payload.paymentSplits, { skipAuthorizationRevision: true });")
s = s.replace("await bookingRepository.saveItinerarySegments(realId, validSegs);",
              "await bookingRepository.saveItinerarySegments(realId, validSegs, { skipAuthorizationRevision: true });")
s = replace_once(s,
"""      // Record Audit Event with detailed changes list
      const changedKeys = Object.keys(bookingUpdateFields).filter(k => k !== 'updated_at');""",
"""      const authorizationSensitiveChange =
        (Array.isArray(payload.paymentSplits) && payload.paymentSplits.length > 0) ||
        (Array.isArray(payload.itinerarySegments) && payload.itinerarySegments.length > 0) ||
        payload.customerTotal !== undefined || payload.authorizedAmount !== undefined || payload.currency !== undefined;
      if (authorizationSensitiveChange) {
        await bookingRepository.bumpAuthorizationRevision(realId, {
          reason: payload.auditReason || 'Authorization-sensitive booking details changed in Admin Dashboard',
          actor: adminId
        });
      }

      // Record Audit Event with detailed changes list
      const changedKeys = Object.keys(bookingUpdateFields).filter(k => k !== 'updated_at');""",
'save all revision')

# Remove old behavior that edited/reissued the same authorization after a payment change.
start = "      let newStatus = booking.status;\n      let newAuthStatus = booking.authorization_status || 'PENDING';"
end = "      const updatePayload = {"
replacement = """      // Authorization requests are immutable. Payment/split changes never patch an
      // existing passenger authorization. The successful mutation is followed by
      // a revision bump which supersedes any pending request.
      const newStatus = booking.status;
      const newAuthStatus = booking.authorization_status || 'PENDING';

"""
s = replace_between(s, start, end, replacement, 'remove mutable payment authorization logic')

start = "      // ── Patch pending passenger_authorizations record ────────────────────"
end = "      // Record audit logs"
s = replace_between(s, start, end, "", 'remove authorization patch/email block')

# Structured fields for the transaction payment path.
s = replace_once(s,
"""        return {
          booking_id: realId,
          merchant_name: mName,
          amount: Math.round(rawAmt * 100) / 100,
          currency: curr
        };""",
"""        const merchantCode = String(s.merchantCode || s.merchant_code || '').trim().toUpperCase() || null;
        const merchantType = String(s.merchantType || s.merchant_type || (mName.toLowerCase() === 'faretransit llc' ? 'FARETRANSIT' : (merchantCode ? 'AIRLINE' : 'OTHER'))).toUpperCase();
        const merchantName = merchantType === 'AIRLINE' ? (resolveAirlineName(merchantCode, mName) || mName) : (merchantType === 'FARETRANSIT' ? 'FareTransit LLC' : mName);
        return {
          booking_id: realId,
          merchant_name: merchantName,
          merchant_type: merchantType,
          merchant_code: merchantCode,
          amount: Math.round(rawAmt * 100) / 100,
          currency: curr
        };""",
'transaction split structured fields')

# Invalidate only after every payment read-after-write check has passed.
s = replace_once(s,
"""      logger.info(`[Transaction] Commit successful for booking ${realId}. Splits total: $${calculatedTotal.toFixed(2)}`);
      await mirrorBookingPaymentSplits(realId, splitsInput, booking.currency || 'USD');""",
"""      logger.info(`[Transaction] Commit successful for booking ${realId}. Splits total: $${calculatedTotal.toFixed(2)}`);
      await mirrorBookingPaymentSplits(realId, formattedSplits, booking.currency || 'USD');
      await bookingRepository.bumpAuthorizationRevision(realId, {
        reason: reason || 'Payment authorization amount or merchant split changed',
        actor: adminId
      });""",
'payment transaction revision')

# Price changes invalidate authorization after the pricing write succeeds.
s = replace_once(s,
"""    const updated = await bookingRepository.getById(base.id);
    return updated || { ...base, ...updateFields };
  },

  recordPaymentEvent:""",
"""    const totalChanged = Math.abs(Number(base.customer_price || base.total_amount || 0) - Number(customerTotal || 0)) > 0.001;
    const currencyChanged = String(base.currency || 'USD').toUpperCase() !== String(currency || 'USD').toUpperCase();
    if (totalChanged || currencyChanged) {
      await bookingRepository.bumpAuthorizationRevision(base.id, { reason: reason || 'Customer price or authorization currency changed', actor: adminId });
    }

    const updated = await bookingRepository.getById(base.id);
    return updated || { ...base, ...updateFields };
  },

  recordPaymentEvent:""",
'pricing revision')

# Expose canonical booking revision in admin detail.
s = s.replace("revision: enriched.authorization_revision || 1", "revision: enriched.booking_revision || enriched.authorization_revision || 1")
write(path, s)


# ---------------------------------------------------------------------------
# 4. Mutation gateway: contact and authorization amount changes invalidate auth
# ---------------------------------------------------------------------------
path = 'backend/src/modules/bookings/booking-mutation.service.mjs'
s = read(path)
s = replace_once(s,
"""  updateContact: (reference, contact = {}, context = {}) => execute(reference, {
    expectedVersion: context.expectedVersion,
    mutate: (booking) => persistPrimaryContact(booking.id, contact, booking),
  }),""",
"""  updateContact: (reference, contact = {}, context = {}) => execute(reference, {
    expectedVersion: context.expectedVersion,
    mutate: async (booking) => {
      await persistPrimaryContact(booking.id, contact, booking);
      await bookingRepository.bumpAuthorizationRevision(booking.id, { reason: context.reason || 'Passenger contact details changed', actor: context.adminId || 'admin' });
    },
  }),""",
'contact revision')
s = replace_once(s,
"""      await bookingRepository.updateBookingStatus(booking.id, update);
    },
  }),

  updatePaymentSplits:""",
"""      await bookingRepository.updateBookingStatus(booking.id, update);
      await bookingRepository.bumpAuthorizationRevision(booking.id, { reason: context.reason || 'Passenger authorization amount or currency changed', actor: context.adminId || 'admin' });
    },
  }),

  updatePaymentSplits:""",
'authorization settings revision')
write(path, s)


# ---------------------------------------------------------------------------
# 5. Passenger editor uses the same revision invalidation path
# ---------------------------------------------------------------------------
path = 'backend/src/modules/admin/admin.passenger.controller.mjs'
s = read(path)
old = """      let reauthorizationRequired = false;
      if (identityChanged && AUTHORIZED_STATES.has(currentState)) {
        updateFields.status = 'REAUTHORIZATION_REQUIRED';
        updateFields.authorization_status = 'REAUTHORIZATION_REQUIRED';
        updateFields.authorization_token = null;
        updateFields.authorization_expires_at = null;
        reauthorizationRequired = true;
      }

      const { error: bookingUpdateError } = await supabase.from('bookings').update(updateFields).eq('id', booking.id);
      if (bookingUpdateError) throw new Error(`Unable to synchronize booking passenger summary: ${bookingUpdateError.message}`);"""
new = """      const { error: bookingUpdateError } = await supabase.from('bookings').update(updateFields).eq('id', booking.id);
      if (bookingUpdateError) throw new Error(`Unable to synchronize booking passenger summary: ${bookingUpdateError.message}`);

      const contactChanged = String(contact.email || '') !== String(booking.email || '') || String(contact.phone || '') !== String(booking.phone || '');
      let reauthorizationRequired = false;
      if (identityChanged || contactChanged) {
        const revisionResult = await bookingRepository.bumpAuthorizationRevision(booking.id, {
          reason: identityChanged ? 'Passenger identity details changed' : 'Passenger contact details changed',
          actor: req.user?.email || req.user?.id || 'admin'
        });
        reauthorizationRequired = revisionResult.reauthorizationRequired;
      }"""
s = replace_once(s, old, new, 'passenger invalidation')
write(path, s)


# ---------------------------------------------------------------------------
# 6. Passenger authorization service: DB-backed immutable tokens/snapshots
# ---------------------------------------------------------------------------
path = 'backend/src/modules/authorizations/passenger-authorization.service.mjs'
s = read(path)
s = replace_once(s,
"import { resolveAirlineName, buildCanonicalItinerary } from '../../shared/utils/airline-lookup.mjs';",
"import { resolveAirlineName, buildCanonicalItinerary } from '../../shared/utils/airline-lookup.mjs';\nimport authorizationSnapshotService, { authorizationSnapshotHash, authorizationSnapshotToLegacyItinerary } from './authorization-snapshot.service.mjs';",
'auth snapshot import')

create_method = r'''  createAuthorizationToken: async (bookingInput, vaultData = {}) => {
    const snapshot = await authorizationSnapshotService.build(bookingInput);
    const bookingId = snapshot.bookingId;
    const revision = Number(snapshot.bookingRevision || 1);
    const snapshotHash = authorizationSnapshotHash(snapshot);
    const now = new Date();

    const { data: existingRows } = await supabase
      .from('passenger_authorizations')
      .select('*')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false });

    const rows = Array.isArray(existingRows) ? existingRows : [];
    const reusable = rows.find(row =>
      String(row.status || '').toLowerCase() === 'pending' &&
      Number(row.authorization_revision || 1) === revision &&
      row.request_snapshot_hash === snapshotHash &&
      new Date(row.expires_at || row.authorization_expires_at || 0).getTime() > Date.now() + 60000
    );
    if (reusable) {
      await bookingRepository.updateStatus(bookingId, {
        authorization_token: reusable.token,
        authorization_expires_at: reusable.expires_at || reusable.authorization_expires_at,
        authorization_status: 'AWAITING_PASSENGER'
      });
      return {
        ...reusable,
        token: reusable.token,
        snapshot: reusable.request_snapshot || snapshot,
        request_snapshot: reusable.request_snapshot || snapshot,
        expiresAt: reusable.expires_at || reusable.authorization_expires_at,
        authorizationUrl: `https://www.faretransit.com/authorize/${reusable.token}`
      };
    }

    const stalePending = rows.filter(row => String(row.status || '').toLowerCase() === 'pending');
    if (stalePending.length) {
      await supabase.from('passenger_authorizations').update({
        status: 'superseded',
        authorization_status: 'SUPERSEDED',
        superseded_at: now.toISOString(),
        status_reason: 'A newer authorization request was issued.',
        updated_at: now.toISOString()
      }).in('id', stalePending.map(row => row.id));
    }

    const token = `fta_${crypto.randomBytes(24).toString('base64url')}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const legacyItinerary = authorizationSnapshotToLegacyItinerary(snapshot);
    const splits = snapshot.paymentAuthorization.splits || [];
    const quoteSnapshot = {
      amount: Number(snapshot.paymentAuthorization.authorizedAmount || 0).toFixed(2),
      currency: snapshot.paymentAuthorization.currency,
      splits: splits.map(split => ({
        merchant_name: split.merchantName,
        merchant_type: split.merchantType,
        merchant_code: split.merchantCode,
        amount: Number(split.amount || 0).toFixed(2),
        currency: split.currency
      })),
      createdAt: snapshot.createdAt
    };

    const cardBrand = vaultData.cardBrand || vaultData.brand || snapshot.paymentMethod?.brand || null;
    const rawLast4 = String(vaultData.cardLast4 || vaultData.last4 || snapshot.paymentMethod?.last4 || '').replace(/\D/g, '');
    const cardLast4 = /^\d{4}$/.test(rawLast4) ? rawLast4 : null;

    const authRecord = {
      booking_id: bookingId,
      confirmation_code: snapshot.confirmationCode,
      token,
      authorization_token: token,
      status: 'pending',
      authorization_status: 'AWAITING_AUTHORIZATION',
      authorization_revision: revision,
      request_snapshot: snapshot,
      request_snapshot_hash: snapshotHash,
      authorized_amount: Number(snapshot.paymentAuthorization.authorizedAmount || 0),
      booking_amount: Number(snapshot.pricing.customerTotal || snapshot.paymentAuthorization.authorizedAmount || 0),
      currency: snapshot.paymentAuthorization.currency,
      card_brand: cardBrand,
      payment_card_brand: cardBrand,
      card_last4: cardLast4,
      payment_card_last4: cardLast4,
      payment_method_label: snapshot.paymentMethod?.label || null,
      quote_snapshot: quoteSnapshot,
      itinerary_snapshot: legacyItinerary,
      policies_snapshot: snapshot.policies,
      authorization_text_version: 'v2.0',
      expires_at: expiresAt,
      authorization_expires_at: expiresAt,
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    };

    const { data, error } = await supabase.from('passenger_authorizations').insert(authRecord).select().single();
    if (error) {
      if (process.env.NODE_ENV === 'test') memoryAuthStore.set(token, authRecord);
      else throw new Error(`AUTHORIZATION_PERSISTENCE_FAILED: ${error.message}`);
    } else {
      memoryAuthStore.set(token, data);
    }

    await bookingRepository.updateStatus(bookingId, {
      authorization_token: token,
      authorization_expires_at: expiresAt,
      authorization_status: 'AWAITING_PASSENGER'
    });

    return {
      ...(data || authRecord),
      token,
      snapshot,
      request_snapshot: snapshot,
      expiresAt,
      expires_at: expiresAt,
      authorizationUrl: `https://www.faretransit.com/authorize/${token}`
    };
  },

'''
s = replace_between(s, "  createAuthorizationToken: async", "  /**\n   * Send branded authorization email", create_method, 'create immutable authorization')

get_method = r'''  getAuthorizationByToken: async (token) => {
    logger.info(`[Auth Lookup] Immutable token lookup: ${String(token || '').substring(0, 16)}...`);
    let authRecord = memoryAuthStore.get(token) || null;
    if (!authRecord) {
      const { data, error } = await supabase.from('passenger_authorizations').select('*').eq('token', token).maybeSingle();
      if (error) logger.warn(`[Auth Lookup] DB lookup warning: ${error.message}`);
      authRecord = data || null;
    }
    if (!authRecord) throw new Error('AUTHORIZATION_NOT_FOUND');

    const status = String(authRecord.status || authRecord.authorization_status || '').toLowerCase();
    if (status === 'superseded' || status === 'reauthorization_required') throw new Error('AUTHORIZATION_SUPERSEDED');
    if (status === 'revoked') throw new Error('AUTHORIZATION_REVOKED');
    if (status === 'declined') throw new Error('AUTHORIZATION_DECLINED');

    const expiry = new Date(authRecord.expires_at || authRecord.authorization_expires_at || 0).getTime();
    if (Number.isFinite(expiry) && expiry > 0 && expiry < Date.now() && !['accepted', 'authorized'].includes(status)) {
      await supabase.from('passenger_authorizations').update({ status: 'expired', authorization_status: 'EXPIRED', updated_at: new Date().toISOString() }).eq('id', authRecord.id).catch(() => null);
      throw new Error('AUTHORIZATION_EXPIRED');
    }

    const booking = await bookingRepository.getById(authRecord.booking_id);
    if (!booking) throw new Error('BOOKING_NOT_FOUND');
    const authRevision = Number(authRecord.authorization_revision || 1);
    const bookingRevision = Number(booking.booking_revision || 1);
    if (authRevision !== bookingRevision) {
      if (!['accepted', 'authorized'].includes(status)) {
        await supabase.from('passenger_authorizations').update({
          status: 'superseded', authorization_status: 'SUPERSEDED', superseded_at: new Date().toISOString(),
          status_reason: `Booking revision advanced from ${authRevision} to ${bookingRevision}.`, updated_at: new Date().toISOString()
        }).eq('id', authRecord.id).catch(() => null);
      }
      throw new Error('AUTHORIZATION_SUPERSEDED');
    }

    const snapshot = authRecord.request_snapshot || null;
    const legacyItinerary = snapshot ? authorizationSnapshotToLegacyItinerary(snapshot) : (authRecord.itinerary_snapshot || {});
    const quote = authRecord.quote_snapshot || {};
    const paymentSplits = snapshot?.paymentAuthorization?.splits || quote.splits || [];
    const rawLast4 = String(snapshot?.paymentMethod?.last4 || authRecord.card_last4 || authRecord.payment_card_last4 || '').replace(/\D/g, '');
    const last4 = /^\d{4}$/.test(rawLast4) ? rawLast4 : null;

    return {
      bookingId: authRecord.booking_id,
      confirmationCode: snapshot?.confirmationCode || booking.confirmation_code,
      passengerName: snapshot?.passenger?.name || booking.passenger_name || 'Valued Passenger',
      customerEmail: snapshot?.passenger?.email || booking.email || null,
      authorizedAmount: Number(snapshot?.paymentAuthorization?.authorizedAmount ?? authRecord.authorized_amount ?? quote.amount ?? 0).toFixed(2),
      currency: snapshot?.paymentAuthorization?.currency || authRecord.currency || booking.currency || 'USD',
      cardBrand: snapshot?.paymentMethod?.brand || authRecord.card_brand || authRecord.payment_card_brand || null,
      cardLast4: last4,
      status: ['accepted', 'authorized'].includes(status) ? 'ACCEPTED' : 'PENDING',
      authorizationStatus: authRecord.authorization_status || (status === 'accepted' ? 'AUTHORIZED' : 'AWAITING_AUTHORIZATION'),
      expiresAt: authRecord.expires_at || authRecord.authorization_expires_at,
      bookingRevision,
      authorizationRevision: authRevision,
      canAuthorize: !['accepted', 'authorized'].includes(status),
      snapshot,
      itinerarySnapshot: legacyItinerary,
      paymentSplits: paymentSplits.map(split => ({
        merchant_name: split.merchant_name || split.merchantName || 'Merchant',
        merchantName: split.merchantName || split.merchant_name || 'Merchant',
        merchant_code: split.merchant_code || split.merchantCode || null,
        merchant_type: split.merchant_type || split.merchantType || null,
        amount: Number(split.amount || 0).toFixed(2),
        currency: split.currency || authRecord.currency || 'USD'
      }))
    };
  },

'''
s = replace_between(s, "  getAuthorizationByToken: async", "  /**\n   * Accept passenger authorization", get_method, 'token lookup immutable')

accept_method = r'''  acceptAuthorization: async (params = {}) => {
    const token = typeof params === 'string' ? params : params.token;
    const acceptedCheckboxText = typeof params === 'object'
      ? (params.acceptedCheckboxText || params.consentText || 'I confirm the reservation details shown above and authorize the listed payment amount.')
      : 'I confirm the reservation details shown above and authorize the listed payment amount.';
    const clientIp = typeof params === 'object' ? (params.clientIp || params.ipAddress || null) : null;
    const userAgent = typeof params === 'object' ? (params.userAgent || 'Browser Client') : 'Browser Client';

    let authRecord = memoryAuthStore.get(token) || null;
    if (!authRecord) {
      const { data } = await supabase.from('passenger_authorizations').select('*').eq('token', token).maybeSingle();
      authRecord = data || null;
    }
    if (!authRecord) throw new Error('AUTHORIZATION_NOT_FOUND');

    const state = String(authRecord.status || authRecord.authorization_status || '').toLowerCase();
    if (['accepted', 'authorized'].includes(state) || authRecord.consumed_at) throw new Error('AUTHORIZATION_ALREADY_ACCEPTED');
    if (state === 'superseded' || state === 'reauthorization_required') throw new Error('AUTHORIZATION_SUPERSEDED');
    if (state === 'revoked') throw new Error('AUTHORIZATION_REVOKED');
    if (state === 'declined') throw new Error('AUTHORIZATION_DECLINED');
    if (state !== 'pending' && state !== 'awaiting_authorization') throw new Error(`AUTHORIZATION_ALREADY_${state.toUpperCase()}`);
    if (new Date(authRecord.expires_at || authRecord.authorization_expires_at || 0).getTime() < Date.now()) throw new Error('AUTHORIZATION_EXPIRED');

    const booking = await bookingRepository.getById(authRecord.booking_id);
    if (!booking) throw new Error('BOOKING_NOT_FOUND');
    const authRevision = Number(authRecord.authorization_revision || 1);
    const bookingRevision = Number(booking.booking_revision || 1);
    if (authRevision !== bookingRevision) {
      await supabase.from('passenger_authorizations').update({
        status: 'superseded', authorization_status: 'SUPERSEDED', superseded_at: new Date().toISOString(),
        status_reason: `Booking revision advanced from ${authRevision} to ${bookingRevision}.`, updated_at: new Date().toISOString()
      }).eq('id', authRecord.id).catch(() => null);
      throw new Error('AUTHORIZATION_SUPERSEDED');
    }

    // New authorizations MUST carry the immutable request snapshot. Legacy rows
    // may use only their already-frozen quote/itinerary data; live itinerary data
    // is intentionally never substituted here.
    const requestSnapshot = authRecord.request_snapshot || {
      schemaVersion: 'AUTHORIZATION_SNAPSHOT_LEGACY',
      bookingId: authRecord.booking_id,
      confirmationCode: authRecord.confirmation_code || booking.confirmation_code,
      bookingRevision: authRevision,
      passenger: { name: booking.passenger_name || 'Valued Passenger', email: booking.email || null, travellers: [] },
      itinerary: authRecord.itinerary_snapshot?.canonical || { tripType: booking.itinerary_type || 'ONE_WAY', journeys: [] },
      pricing: { customerTotal: Number(authRecord.booking_amount || authRecord.authorized_amount || 0), currency: authRecord.currency || booking.currency || 'USD' },
      paymentAuthorization: { authorizedAmount: Number(authRecord.authorized_amount || 0), currency: authRecord.currency || booking.currency || 'USD', splits: authRecord.quote_snapshot?.splits || [] },
      paymentMethod: { brand: authRecord.card_brand || 'Card', last4: authRecord.card_last4 || null },
      policies: authRecord.policies_snapshot || {}
    };

    const textHash = hashText(acceptedCheckboxText);
    const consumedAt = new Date().toISOString();
    const legacyItinerary = authorizationSnapshotToLegacyItinerary(requestSnapshot);
    const paymentSplits = (requestSnapshot.paymentAuthorization?.splits || authRecord.quote_snapshot?.splits || []).map(split => ({
      merchant_name: split.merchant_name || split.merchantName || 'Merchant',
      merchant_type: split.merchant_type || split.merchantType || null,
      merchant_code: split.merchant_code || split.merchantCode || null,
      amount: Number(split.amount || 0).toFixed(2),
      currency: split.currency || requestSnapshot.paymentAuthorization?.currency || 'USD'
    }));

    const authorizationSnapshot = {
      ...requestSnapshot,
      booking_id: requestSnapshot.bookingId,
      confirmation_code: requestSnapshot.confirmationCode,
      booking_revision: authRevision,
      request_snapshot_hash: authRecord.request_snapshot_hash || authorizationSnapshotHash(requestSnapshot),
      passenger_name: requestSnapshot.passenger?.name || 'Valued Passenger',
      customer_email: requestSnapshot.passenger?.email || null,
      passengers: requestSnapshot.passenger?.travellers || [],
      itinerary_snapshot: legacyItinerary,
      payment_splits: paymentSplits,
      authorized_amount: Number(requestSnapshot.paymentAuthorization?.authorizedAmount || authRecord.authorized_amount || 0),
      currency: requestSnapshot.paymentAuthorization?.currency || authRecord.currency || 'USD',
      consent_text: acceptedCheckboxText,
      consent_version: 'v2.0',
      consent_hash: textHash,
      authorization_status: 'AUTHORIZED',
      accepted_at: consumedAt,
      timestamp: consumedAt,
      client_ip: clientIp || null,
      user_agent: userAgent || null
    };

    const paUpdateFields = {
      status: 'accepted',
      authorization_status: 'AUTHORIZED',
      consumed_at: consumedAt,
      authorized_at: consumedAt,
      ip_address: clientIp || null,
      authorized_ip: clientIp || null,
      user_agent: userAgent || null,
      authorized_user_agent: userAgent || null,
      authorization_text_version: 'v2.0',
      authorization_text_hash: textHash,
      authorization_snapshot: authorizationSnapshot,
      updated_at: consumedAt
    };
    const { error: paError } = await supabase.from('passenger_authorizations').update(paUpdateFields).eq('id', authRecord.id);
    if (paError && process.env.NODE_ENV !== 'test') throw new Error(`AUTHORIZATION_ACCEPT_PERSISTENCE_FAILED: ${paError.message}`);

    await bookingRepository.saveAuthorizationSnapshot({
      booking_id: authRecord.booking_id,
      confirmation_code: authorizationSnapshot.confirmation_code,
      passenger_name: authorizationSnapshot.passenger_name,
      customer_email: authorizationSnapshot.customer_email,
      token,
      snapshot_data: authorizationSnapshot,
      itinerary_snapshot: legacyItinerary,
      authorized_amount: authorizationSnapshot.authorized_amount,
      currency: authorizationSnapshot.currency,
      payment_splits: paymentSplits,
      consent_text: acceptedCheckboxText,
      consent_version: 'v2.0',
      consent_hash: textHash,
      client_ip: clientIp || null,
      user_agent: userAgent || null,
      accepted_at: consumedAt,
      booking_revision: authRevision,
      request_snapshot_hash: authorizationSnapshot.request_snapshot_hash,
      created_at: consumedAt
    });

    memoryAuthStore.set(token, { ...authRecord, ...paUpdateFields });
    await bookingRepository.updateStatus(authRecord.booking_id, {
      status: 'AUTHORIZED',
      authorization_status: 'AUTHORIZED',
      authorized_at: consumedAt
    });
    await bookingRepository.recordAuditLog({
      bookingId: authRecord.booking_id,
      action: 'AUTHORIZATION_COMPLETED',
      oldValue: { authorization_status: authRecord.status || 'PENDING', bookingRevision: authRevision },
      newValue: { authorization_status: 'AUTHORIZED', bookingRevision: authRevision, requestSnapshotHash: authorizationSnapshot.request_snapshot_hash },
      actor: 'customer',
      ipAddress: clientIp || null
    });

    return {
      success: true,
      bookingId: authRecord.booking_id,
      status: 'AUTHORIZED',
      authorizedAmount: authorizationSnapshot.authorized_amount,
      currency: authorizationSnapshot.currency,
      acceptedAt: consumedAt,
      authorizationSnapshot
    };
  },

'''
s = replace_between(s, "  acceptAuthorization: async", "  /**\n   * Fetch Audit Evidence by Booking ID", accept_method, 'accept immutable authorization')
s = s.replace('THE FINAL SEAT', 'FareTransit')
write(path, s)


# ---------------------------------------------------------------------------
# 7. Resend authorization email renders the SAME immutable snapshot as the link
# ---------------------------------------------------------------------------
path = 'backend/src/integrations/resend/resend.service.mjs'
s = read(path)
s = replace_once(s,
"import passengerAuthorizationService from '../../modules/authorizations/passenger-authorization.service.mjs';",
"import passengerAuthorizationService from '../../modules/authorizations/passenger-authorization.service.mjs';\nimport authorizationSnapshotService from '../../modules/authorizations/authorization-snapshot.service.mjs';",
'resend snapshot import')

send_auth = r'''export const sendPassengerAuthorizationEmail = async (bookingIdInput) => {
  let bookingId = bookingIdInput;
  let customerEmail = null;
  try {
    const booking = await bookingRepository.getCompleteBookingById(bookingIdInput);
    if (!booking) return { success: false, error: 'Booking not found' };
    bookingId = booking.id;

    const authResult = await passengerAuthorizationService.createAuthorizationToken(booking);
    const snapshot = authResult.snapshot || authResult.request_snapshot;
    if (!snapshot) throw new Error('AUTHORIZATION_SNAPSHOT_MISSING');

    customerEmail = snapshot.passenger?.email || booking.email || booking.contacts?.[0]?.email;
    if (!customerEmail || !customerEmail.includes('@')) return { success: false, error: 'This booking does not have a valid passenger email address.' };

    const splits = snapshot.paymentAuthorization?.splits || [];
    if (!splits.length) return { success: false, error: 'EMAIL_PROTECTION_BLOCKED: No saved payment split breakdown exists for this booking.' };
    const amount = Number(snapshot.paymentAuthorization.authorizedAmount || 0).toFixed(2);
    const currency = String(snapshot.paymentAuthorization.currency || 'USD').toUpperCase();
    const confirmationCode = snapshot.confirmationCode;
    const passengerName = snapshot.passenger?.name || 'Valued Passenger';
    const passengerFirstName = passengerName.split(' ')[0] || 'Passenger';
    const authUrl = `https://www.faretransit.com/authorize/${authResult.token}`;
    const itineraryHtml = renderFlightItineraryHtml(authorizationSnapshotService.toBookingLike ? authorizationSnapshotService.toBookingLike(snapshot) : snapshot);

    const splitsHtml = `
      <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;padding:14px;margin:16px 0;">
        <div style="font-size:11px;font-weight:800;text-transform:uppercase;color:#8b1236;letter-spacing:.8px;margin-bottom:8px;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">Payment Authorization Breakdown</div>
        <table role="presentation" width="100%" style="border-collapse:collapse;margin-bottom:8px;">
          ${splits.map(s => `<tr><td style="font-size:13px;color:#475569;padding:6px 0;">${s.merchantName || s.merchant_name || 'Merchant'}</td><td style="font-size:13px;font-weight:700;color:#1e293b;text-align:right;padding:6px 0;">$${Number(s.amount || 0).toFixed(2)} ${(s.currency || currency).toUpperCase()}</td></tr>`).join('')}
        </table>
        <table role="presentation" width="100%" style="border-collapse:collapse;border-top:2px solid #8b1236;margin-top:4px;"><tr><td style="font-size:12px;font-weight:800;color:#1e293b;text-transform:uppercase;padding:8px 0;">Total Authorized Amount:</td><td style="font-size:15px;font-weight:900;color:#8b1236;text-align:right;padding:8px 0;">$${amount} ${currency}</td></tr></table>
      </div>`;

    const subject = `Action Required — Authorize Booking ${confirmationCode}`;
    const textBody = `FareTransit — ACTION REQUIRED: AUTHORIZE FLIGHT RESERVATION\n\nDear ${passengerFirstName},\n\nPlease review and authorize reservation ${confirmationCode} for $${amount} ${currency}.\n\n${splits.map(s => `${s.merchantName || s.merchant_name}: $${Number(s.amount || 0).toFixed(2)} ${(s.currency || currency).toUpperCase()}`).join('\n')}\n\nSecure authorization link:\n${authUrl}\n\nThis link expires in 24 hours. If the itinerary, passenger details or total changes, this request is automatically superseded and a new authorization is required.\n\nSupport: ${env.supportPhoneDisplay} | support@faretransit.com`;

    const htmlBody = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#fff;box-shadow:0 8px 24px rgba(79,16,43,.12);">
      <div style="background:#8b1236;padding:24px 18px;text-align:center;color:#fff;"><div style="font-size:24px;font-weight:900;">✈ FareTransit</div><div style="color:#f8dfe8;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin-top:4px;">Passenger Reservation Authorization Request</div></div>
      <div style="padding:24px;color:#334155;"><h2 style="color:#8b1236;margin-top:0;font-size:18px;">Action Required: Authorize Reservation</h2><p>Dear <strong>${passengerFirstName}</strong>,</p><p>Please review and confirm the reservation details below for <strong>${confirmationCode}</strong>. Total authorized charge: <strong>$${amount} ${currency}</strong>.</p><div style="margin:20px 0;">${itineraryHtml}</div>${splitsHtml}<div style="text-align:center;margin:28px 0;"><a href="${authUrl}" style="background:#8b1236;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:800;font-size:15px;display:inline-block;">Review &amp; Authorize Booking →</a></div><p style="font-size:12px;color:#64748b;line-height:1.4;text-align:center;">This secure link is tied to booking revision ${snapshot.bookingRevision}. Any material booking change automatically invalidates it.</p></div>
      <div style="background:#fbf8f9;padding:16px;text-align:center;font-size:11px;color:#64748b;border-top:1px solid #e2e8f0;">FareTransit LLC • support@faretransit.com • ${env.supportPhoneDisplay}</div></div>`;

    const result = await sendViaResend({ recipients: [customerEmail], subject, textBody, htmlBody, replyTo: 'support@faretransit.com' });
    const emailId = result?.messageId || result?.id || null;
    if (!emailId) throw new Error(env.resendApiKey ? 'EMAIL_PROVIDER_ID_MISSING' : 'EMAIL_PROVIDER_NOT_CONFIGURED');

    const sentAt = new Date().toISOString();
    const expiresAt = authResult.expiresAt || authResult.expires_at;
    await bookingRepository.saveEmailActivity(bookingId, {
      template_type: 'AUTHORIZATION_EMAIL', status: 'SENT', provider_message_id: emailId,
      recipient: customerEmail, sent_at: sentAt, expires_at: expiresAt
    });
    await bookingRepository.updateBookingStatus(bookingId, {
      status: 'AWAITING_AUTHORIZATION',
      authorization_status: 'AWAITING_PASSENGER',
      authorization_email_status: 'SENT', authorization_email_id: emailId,
      authorization_email_sent_at: sentAt, authorization_email_recipient: customerEmail,
      authorization_email_error: null, authorization_expires_at: expiresAt,
      authorization_token: authResult.token
    });
    return { success: true, emailId, providerMessageId: emailId, authUrl, bookingRevision: snapshot.bookingRevision };
  } catch (err) {
    const errorMsg = err.message || 'Authorization email dispatch failed';
    logger.error(`[Email Log] bookingId=${bookingId} emailType=authorization result=failed error=${errorMsg}`);
    await bookingRepository.saveEmailActivity(bookingId, { template_type: 'AUTHORIZATION_EMAIL', status: 'FAILED', recipient: customerEmail, error: errorMsg }).catch(() => null);
    await bookingRepository.updateBookingStatus(bookingId, { authorization_email_status: 'FAILED', authorization_email_error: errorMsg }).catch(() => null);
    return { success: false, error: errorMsg };
  }
};

'''
s = replace_between(s, "export const sendPassengerAuthorizationEmail = async", "export const sendPaymentFailedEmail", send_auth, 'resend immutable auth email')
s = s.replace('THE FINAL SEAT', 'FareTransit')
write(path, s)


# Make snapshot helper method available on default service object import.
path = 'backend/src/modules/authorizations/authorization-snapshot.service.mjs'
s = read(path)
s = s.replace("export const authorizationSnapshotService = {\n  build:", "export const authorizationSnapshotService = {\n  toBookingLike: authorizationSnapshotToBookingLike,\n  toLegacyItinerary: authorizationSnapshotToLegacyItinerary,\n  build:")
write(path, s)


# ---------------------------------------------------------------------------
# 8. Preview/other authorization-facing branding
# ---------------------------------------------------------------------------
path = 'backend/src/modules/emails/email-renderer.service.mjs'
s = read(path).replace('THE FINAL SEAT', 'FareTransit')
write(path, s)

for template_path in [
    'backend/src/integrations/resend/templates/passenger-authorization-request.html',
    'backend/src/integrations/resend/templates/booking-confirmation.html'
]:
    p = Path(template_path)
    if p.exists():
        write(template_path, read(template_path).replace('THE FINAL SEAT', 'FareTransit').replace('The Final Seat', 'FareTransit'))

path = 'backend/src/modules/authorizations/authorization-pdf.service.mjs'
s = read(path)
if "airline-lookup.mjs" not in s:
    s = s.replace("import crypto from 'crypto';", "import crypto from 'crypto';\nimport { resolveAirlineName } from '../../shared/utils/airline-lookup.mjs';")
s = s.replace("const ca  = seg.carrier_name || seg.airline || seg.airlineName || (cc ? cc + ' Airlines' : 'Airline');",
              "const ca  = resolveAirlineName(cc, seg.carrier_name || seg.airline || seg.airlineName || '') || cc || 'Airline';")
s = s.replace('THE FINAL SEAT', 'FareTransit').replace('The Final Seat', 'FareTransit')
write(path, s)


# ---------------------------------------------------------------------------
# 9. Public controller distinguishes lifecycle states
# ---------------------------------------------------------------------------
path = 'backend/src/modules/authorizations/passenger-authorization.controller.mjs'
s = read(path)
s = replace_once(s,
"""      if (error.message === 'AUTHORIZATION_INVALIDATED_PRICE_CHANGE' || error.message === 'AUTHORIZATION_SUPERSEDED') {
        return res.status(409).json({
          success: false,
          error: { code: 'INVALIDATED', message: 'The booking details or fare changed. A new authorization is required.' }
        });
      }
      logger.error""",
"""      if (error.message === 'AUTHORIZATION_INVALIDATED_PRICE_CHANGE' || error.message === 'AUTHORIZATION_SUPERSEDED') {
        return res.status(409).json({ success: false, error: { code: 'AUTHORIZATION_SUPERSEDED', message: 'The reservation changed after this authorization was issued. Please use the latest authorization email.' } });
      }
      if (error.message === 'AUTHORIZATION_REVOKED') {
        return res.status(410).json({ success: false, error: { code: 'AUTHORIZATION_REVOKED', message: 'This authorization request was revoked. Contact FareTransit for a new request.' } });
      }
      if (error.message === 'AUTHORIZATION_DECLINED') {
        return res.status(409).json({ success: false, error: { code: 'AUTHORIZATION_DECLINED', message: 'This authorization request has already been declined.' } });
      }
      logger.error""",
'controller lifecycle errors')
write(path, s)


# ---------------------------------------------------------------------------
# 10. Public page: lifecycle-specific errors and canonical journeys
# ---------------------------------------------------------------------------
path = 'frontend/src/features/authorizations/pages/PassengerAuthorizationPage.js'
s = read(path)
s = replace_once(s, "  const [error, setError] = useState(null);", "  const [error, setError] = useState(null);\n  const [errorCode, setErrorCode] = useState(null);", 'frontend error state')
s = replace_once(s,
"""        if (!res.ok || !data.success) {
          throw new Error(data.error?.message || 'Failed to load authorization request.');
        }

        setAuthData(data.authorization);
      } catch (err) {
        setError(err.message);""",
"""        if (!res.ok || !data.success) {
          const requestError = new Error(data.error?.message || 'Failed to load authorization request.');
          requestError.code = data.error?.code || 'AUTHORIZATION_LOAD_FAILED';
          throw requestError;
        }

        setErrorCode(null);
        setAuthData(data.authorization);
      } catch (err) {
        setErrorCode(err.code || 'AUTHORIZATION_LOAD_FAILED');
        setError(err.message);""",
'frontend capture error code')

old_error_block = r'''  if (error || !authData) {
    return (
      <div className="auth-page-container">
        <Helmet><title>Authorization Request Error | FareTransit</title></Helmet>
        <div className="auth-card-shell">
          <div className="auth-error-banner">
            <i className="fas fa-exclamation-triangle fa-2x" style={{ color: '#991b1b', marginBottom: '0.75rem' }}></i>
            <h2 style={{ color: '#991b1b', margin: '0 0 0.5rem', fontSize: '1.4rem' }}>Authorization Request Issue</h2>
            <p style={{ color: '#7f1d1d', margin: 0, fontSize: '0.98rem', lineHeight: '1.5' }}>
              {error || 'The requested authorization link is invalid or expired.'}
            </p>
          </div>
          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <Link to="/contact" className="auth-btn-secondary">
              Contact 24/7 Support Desk
            </Link>
          </div>
        </div>
      </div>
    );
  }
'''
new_error_block = r'''  if (error || !authData) {
    const lifecycle = {
      AUTHORIZATION_SUPERSEDED: { title: 'Authorization Updated', message: 'This reservation changed after this authorization request was issued. Please use the newest authorization email from FareTransit.' },
      INVALIDATED: { title: 'Authorization Updated', message: 'This reservation changed after this authorization request was issued. Please use the newest authorization email from FareTransit.' },
      EXPIRED: { title: 'Authorization Link Expired', message: 'This secure authorization link has expired. Contact FareTransit to receive a new authorization request.' },
      NOT_FOUND: { title: 'Authorization Link Invalid', message: 'This authorization link is invalid or is no longer available. Contact FareTransit if you need a new request.' },
      AUTHORIZATION_REVOKED: { title: 'Authorization Revoked', message: 'This authorization request was revoked and can no longer be used. Contact FareTransit for assistance.' },
      AUTHORIZATION_DECLINED: { title: 'Authorization Already Declined', message: 'This authorization request has already been declined.' }
    }[errorCode] || { title: 'Authorization Request Issue', message: error || 'We could not load this authorization request.' };
    return (
      <div className="auth-page-container">
        <Helmet><title>{lifecycle.title} | FareTransit</title></Helmet>
        <div className="auth-card-shell">
          <div className="auth-error-banner">
            <i className="fas fa-exclamation-triangle fa-2x" style={{ color: '#991b1b', marginBottom: '0.75rem' }}></i>
            <h2 style={{ color: '#991b1b', margin: '0 0 0.5rem', fontSize: '1.4rem' }}>{lifecycle.title}</h2>
            <p style={{ color: '#7f1d1d', margin: 0, fontSize: '0.98rem', lineHeight: '1.5' }}>{lifecycle.message}</p>
          </div>
          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}><Link to="/contact" className="auth-btn-secondary">Contact 24/7 Support Desk</Link></div>
        </div>
      </div>
    );
  }
'''
s = replace_once(s, old_error_block, new_error_block, 'frontend lifecycle error UI')

# Already-accepted link is read-only, not another actionable form.
accepted_block = r'''  const alreadyAccepted = ['ACCEPTED', 'AUTHORIZED'].includes(String(authData?.status || authData?.authorizationStatus || '').toUpperCase()) && authData?.canAuthorize === false;
  if (alreadyAccepted) {
    return (
      <div className="auth-page-container">
        <Helmet><title>Reservation Already Authorized | FareTransit</title></Helmet>
        <div className="auth-card-shell" style={{ textAlign: 'center', padding: '2.5rem 2rem' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#dcfce7', color: '#166534', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem', fontSize: '2rem' }}>✓</div>
          <h2 style={{ color: '#7f0d2f', fontSize: '1.65rem', margin: '0 0 0.65rem' }}>Reservation Already Authorized</h2>
          <p style={{ color: '#5f4a53', lineHeight: '1.6' }}>This exact reservation revision has already been authorized. No further action is required.</p>
          <Link to={`/my-bookings?code=${authData.confirmationCode}`} className="auth-primary-btn" style={{ display: 'inline-block', width: 'auto', padding: '0.85rem 2rem', marginTop: '1rem' }}>View My Booking →</Link>
        </div>
      </div>
    );
  }

'''
s = replace_once(s, "  if (authorizedSuccess) {", accepted_block + "  if (authorizedSuccess) {", 'frontend accepted state')

# Prefer immutable V2 journeys when available; retains legacy renderer for old snapshots.
journey_insert = r'''              const snapshotJourneys = authData.snapshot?.itinerary?.journeys || authData.itinerarySnapshot?.canonical?.journeys || [];
              if (snapshotJourneys.length > 0) {
                return <>{snapshotJourneys.map((journey, journeyIdx) => {
                  const segs = journey.segments || [];
                  const connectionCount = Math.max(0, segs.length - 1);
                  const label = authData.snapshot?.itinerary?.tripType === 'MULTI_CITY'
                    ? `Trip ${journey.journeyIndex || journeyIdx + 1}`
                    : (journey.role === 'RETURN' ? 'Return Journey' : (authData.snapshot?.itinerary?.tripType === 'ONE_WAY' ? 'One Way Journey' : 'Outbound Journey'));
                  return <div className="auth-flight-card" style={{ marginTop: journeyIdx ? '0.85rem' : 0 }} key={`journey-${journeyIdx}`}>
                    <div className="auth-flight-tag">{label} ({connectionCount ? `${connectionCount} Connection Stop${connectionCount > 1 ? 's' : ''}` : 'Nonstop'})</div>
                    {segs.map((seg, idx) => <div key={`seg-${journeyIdx}-${idx}`} style={{ marginTop: idx > 0 ? '0.75rem' : 0, paddingTop: idx > 0 ? '0.75rem' : 0, borderTop: idx > 0 ? '1px dashed #cbd5e1' : 'none' }}>
                      <div className="auth-flight-airline">Flight #{idx + 1}: {seg.airlineName || seg.carrierCode || 'Airline'} {seg.carrierCode || ''} {seg.flightNumber || ''}</div>
                      <div className="auth-flight-route">{seg.originName || seg.originCode} ({seg.originCode}) → {seg.destinationName || seg.destinationCode} ({seg.destinationCode})</div>
                      <div className="auth-flight-details"><span><strong>Departure:</strong> {seg.departureDate} {seg.departureTime}</span><span><strong>Cabin:</strong> {seg.cabinClass || 'Economy'}</span></div>
                    </div>)}
                  </div>;
                })}</>;
              }

'''
s = replace_once(s, "              const outboundList = authData.itinerarySnapshot?.outboundSegments", journey_insert + "              const outboundList = authData.itinerarySnapshot?.outboundSegments", 'frontend canonical journeys')
write(path, s)


# ---------------------------------------------------------------------------
# 11. Repository migration artifact + architecture test
# ---------------------------------------------------------------------------
migration = r'''-- Authorization Integrity V2
alter table public.bookings add column if not exists booking_revision integer not null default 1;
alter table public.passenger_authorizations add column if not exists request_snapshot jsonb;
alter table public.passenger_authorizations add column if not exists request_snapshot_hash varchar(64);
alter table public.passenger_authorizations add column if not exists superseded_at timestamptz;
alter table public.passenger_authorizations add column if not exists revoked_at timestamptz;
alter table public.passenger_authorizations add column if not exists declined_at timestamptz;
alter table public.passenger_authorizations add column if not exists status_reason text;
alter table public.authorization_snapshots add column if not exists booking_revision integer;
alter table public.authorization_snapshots add column if not exists request_snapshot_hash varchar(64);
alter table public.payment_authorization_splits add column if not exists merchant_type varchar(24);
alter table public.payment_authorization_splits add column if not exists merchant_code varchar(8);
alter table public.booking_payment_splits add column if not exists merchant_type varchar(24);
alter table public.booking_payment_splits add column if not exists merchant_code varchar(8);
create index if not exists idx_passenger_authorizations_booking_revision on public.passenger_authorizations (booking_id, authorization_revision, created_at desc);
create index if not exists idx_passenger_authorizations_status on public.passenger_authorizations (booking_id, status, created_at desc);
'''
write('backend/migrations/129_authorization_integrity_v2.sql', migration)

test = r'''import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const auth = fs.readFileSync('backend/src/modules/authorizations/passenger-authorization.service.mjs', 'utf8');
const snap = fs.readFileSync('backend/src/modules/authorizations/authorization-snapshot.service.mjs', 'utf8');
const repo = fs.readFileSync('backend/src/modules/bookings/booking.repository.mjs', 'utf8');
const email = fs.readFileSync('backend/src/integrations/resend/resend.service.mjs', 'utf8');
const page = fs.readFileSync('frontend/src/features/authorizations/pages/PassengerAuthorizationPage.js', 'utf8');
const airline = fs.readFileSync('backend/src/shared/utils/airline-lookup.mjs', 'utf8');

test('authorization integrity v2 invariants', () => {
  assert.match(snap, /AUTHORIZATION_SNAPSHOT_V2/);
  assert.match(snap, /bookingRevision/);
  assert.match(auth, /request_snapshot_hash/);
  assert.match(auth, /AUTHORIZATION_SUPERSEDED/);
  assert.doesNotMatch(auth, /Fallback 2: Stateless Token Resolution/);
  assert.match(repo, /bumpAuthorizationRevision/);
  assert.match(repo, /status: 'superseded'/);
  assert.doesNotMatch(repo, /Could not create reauthorization request/);
  assert.match(email, /authResult\.snapshot/);
  assert.match(email, /booking revision/);
  assert.doesNotMatch(email, /THE FINAL SEAT/);
  assert.match(page, /Authorization Updated/);
  assert.match(page, /snapshotJourneys/);
  assert.match(airline, /codePlaceholder/);
});
'''
write('backend/tests/authorization_integrity_v2.test.mjs', test)

print('Authorization Integrity V2 patch applied successfully.')
