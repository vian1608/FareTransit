import express from 'express';
import supabase from '../../config/supabase.mjs';
import { requirePermission } from './backoffice.middleware.mjs';
import auditBackOffice from './backoffice.audit.mjs';
import { DEFAULT_CAR_TERMS } from '../reservations/reservation.service.mjs';

const router = express.Router();
const actor = req => req.staff?.email || req.user?.email || req.staff?.id || req.user?.id || 'admin';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requestError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function throwDb(error, context) {
  if (!error) return;
  const wrapped = requestError('DATABASE_ERROR', `${context}: ${error.message}`, 500);
  wrapped.expose = false;
  throw wrapped;
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : value;
}

function nullableText(value) {
  return clean(value) || null;
}

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function currencyCode(value) {
  return String(value || 'USD').trim().toUpperCase().slice(0, 3) || 'USD';
}

function normalizedIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function scalarEqual(left, right) {
  return (left ?? null) === (right ?? null);
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stableJson(value[key]);
    return result;
  }, {});
}

function jsonEqual(left, right) {
  return JSON.stringify(stableJson(left ?? null)) === JSON.stringify(stableJson(right ?? null));
}

function validateHalfHourCarTimes(body) {
  const car = body?.car || {};
  for (const [field, label] of [['pickupAt', 'Pickup time'], ['dropoffAt', 'Drop-off time']]) {
    const value = car[field];
    if (!value) continue;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw requestError('INVALID_RENTAL_TIME', `${label} is invalid.`);
    const minutes = date.getUTCMinutes();
    if (minutes !== 0 && minutes !== 30) throw requestError('INVALID_RENTAL_TIME', `${label} must be on the hour or half hour.`);
  }
}

async function loadReservation(idOrReference) {
  const value = String(idOrReference || '').trim();
  if (!value) throw requestError('RESERVATION_NOT_FOUND', 'Car reservation not found.', 404);
  let query = supabase.from('reservations').select('*');
  query = UUID_RE.test(value) ? query.eq('id', value) : query.eq('booking_reference', value.toUpperCase());
  const { data, error } = await query.maybeSingle();
  throwDb(error, 'Unable to load reservation');
  if (!data) throw requestError('RESERVATION_NOT_FOUND', 'Car reservation not found.', 404);
  if (data.service_type !== 'CAR') throw requestError('WRONG_SERVICE_TYPE', 'This editor only supports car reservations.', 409);
  return data;
}

function normalizeCarField(source, value) {
  if (source === 'driverAge') return value ? Number(value) : null;
  if (source === 'orSimilar') return Boolean(value);
  if (source.endsWith('At')) return normalizedIso(value);
  return nullableText(value);
}

function normalizeDbCarField(source, value) {
  if (source === 'driverAge') return value == null ? null : Number(value);
  if (source === 'orSimilar') return Boolean(value);
  if (source.endsWith('At')) return normalizedIso(value);
  return nullableText(value);
}

function snapshotComparable(items = []) {
  return items.map(item => ({
    imageUrl: item.imageUrl ?? item.image_url ?? '',
    storagePath: item.storagePath ?? item.storage_path ?? null,
    caption: clean(item.caption) || ''
  }));
}

router.patch('/bookings/cars/:id', requirePermission('bookings.cars.edit'), async (req, res, next) => {
  try {
    const payload = req.body || {};
    validateHalfHourCarTimes(payload);
    const reservation = await loadReservation(req.params.id);

    const [carResult, travellersResult, billingResult, snapshotsResult, authResult, activityResult, internalResult] = await Promise.all([
      supabase.from('car_reservations').select('*').eq('reservation_id', reservation.id).maybeSingle(),
      supabase.from('reservation_travellers').select('*').eq('reservation_id', reservation.id).order('created_at', { ascending: true }),
      supabase.from('reservation_billing_details').select('*').eq('reservation_id', reservation.id).maybeSingle(),
      supabase.from('car_rental_snapshots').select('*').eq('reservation_id', reservation.id).order('sort_order', { ascending: true }),
      supabase.from('authorizations').select('*').eq('reservation_id', reservation.id).order('version', { ascending: false }),
      supabase.from('reservation_activity').select('*').eq('reservation_id', reservation.id).order('created_at', { ascending: false }).limit(100),
      supabase.from('reservation_internal_financials').select('*').eq('reservation_id', reservation.id).maybeSingle()
    ]);

    [carResult, travellersResult, billingResult, snapshotsResult, authResult, activityResult, internalResult]
      .forEach(result => throwDb(result.error, 'Unable to load reservation details'));

    const currentCar = carResult.data || {};
    const currentTravellers = travellersResult.data || [];
    const currentBilling = billingResult.data || {};
    const currentSnapshots = snapshotsResult.data || [];
    const currentAuthorizations = authResult.data || [];
    const currentActivity = activityResult.data || [];
    const currentInternal = internalResult.data || null;
    const latestAuthorization = currentAuthorizations[0] || null;
    const primaryDriver = currentTravellers.find(item => item.role === 'PRIMARY_DRIVER') || null;

    let latestTransactions = [];
    if (latestAuthorization?.id) {
      const transactionResult = await supabase
        .from('authorization_transactions')
        .select('*')
        .eq('authorization_id', latestAuthorization.id)
        .order('sequence', { ascending: true });
      throwDb(transactionResult.error, 'Unable to load authorization transactions');
      latestTransactions = transactionResult.data || [];
    }

    const now = new Date().toISOString();
    const reservationPatch = {};
    const carPatch = {};
    const travellerPatch = {};
    const billingPatch = {};
    let internalRow = null;
    let snapshotsChanged = false;

    const customer = payload.customer || null;
    if (customer) {
      if ('fullName' in customer) {
        const next = nullableText(customer.fullName);
        if (!scalarEqual(next, nullableText(reservation.customer_name))) reservationPatch.customer_name = next;
        if (!scalarEqual(next, nullableText(primaryDriver?.full_name))) travellerPatch.full_name = next;
      }
      if ('email' in customer) {
        const next = nullableText(customer.email)?.toLowerCase() || null;
        if (!scalarEqual(next, nullableText(reservation.customer_email)?.toLowerCase() || null)) reservationPatch.customer_email = next;
        if (!scalarEqual(next, nullableText(primaryDriver?.email)?.toLowerCase() || null)) travellerPatch.email = next;
      }
      if ('phone' in customer) {
        const next = nullableText(customer.phone);
        if (!scalarEqual(next, nullableText(reservation.customer_phone))) reservationPatch.customer_phone = next;
        if (!scalarEqual(next, nullableText(primaryDriver?.phone))) travellerPatch.phone = next;
      }
      if ('dateOfBirth' in customer) {
        const next = customer.dateOfBirth || null;
        if (!scalarEqual(next, primaryDriver?.date_of_birth || null)) travellerPatch.date_of_birth = next;
      }
    }

    const car = payload.car || null;
    const carMap = {
      rentalCompanyId: 'rental_company_id',
      rentalCompanyName: 'rental_company_name',
      rentalCompanyLogoUrl: 'rental_company_logo_url',
      vehicleName: 'vehicle_name',
      vehicleCategory: 'vehicle_category',
      vehicleDescription: 'vehicle_description',
      orSimilar: 'or_similar',
      pickupLocation: 'pickup_location',
      pickupAddress: 'pickup_address',
      pickupAt: 'pickup_at',
      dropoffLocation: 'dropoff_location',
      dropoffAddress: 'dropoff_address',
      dropoffAt: 'dropoff_at',
      driverAge: 'driver_age',
      supplierConfirmation: 'supplier_confirmation',
      supplierNotes: 'supplier_notes',
      mileagePolicy: 'mileage_policy',
      fuelPolicy: 'fuel_policy',
      depositTerms: 'deposit_terms',
      cancellationPolicy: 'cancellation_policy'
    };
    if (car) {
      Object.entries(carMap).forEach(([source, target]) => {
        if (!(source in car)) return;
        const next = normalizeCarField(source, car[source]);
        const current = normalizeDbCarField(source, currentCar[target]);
        if (!scalarEqual(next, current)) carPatch[target] = next;
      });
    }

    const payment = payload.payment || null;
    if (payment) {
      if ('currency' in payment) {
        const next = currencyCode(payment.currency);
        if (!scalarEqual(next, currencyCode(reservation.currency))) reservationPatch.currency = next;
      }
      if ('totalAmount' in payment) {
        const next = money(payment.totalAmount);
        if (next !== money(reservation.total_amount)) reservationPatch.total_amount = next;
      }
      if (!jsonEqual(payment, currentCar.draft_payment_data || {})) carPatch.draft_payment_data = payment;
    }

    if ('terms' in payload) {
      const next = payload.terms || DEFAULT_CAR_TERMS;
      if (!scalarEqual(next, currentCar.draft_terms || DEFAULT_CAR_TERMS)) carPatch.draft_terms = next;
    }
    if ('customSections' in payload) {
      const next = Array.isArray(payload.customSections) ? payload.customSections : [];
      if (!jsonEqual(next, currentCar.draft_custom_sections || [])) carPatch.draft_custom_sections = next;
    }
    if ('sectionOrder' in payload) {
      const next = Array.isArray(payload.sectionOrder) ? payload.sectionOrder : [];
      if (!jsonEqual(next, currentCar.draft_section_order || [])) carPatch.draft_section_order = next;
    }
    if ('internalNotes' in payload) {
      const next = nullableText(payload.internalNotes);
      if (!scalarEqual(next, nullableText(currentCar.internal_notes))) carPatch.internal_notes = next;
    }

    const billing = payload.billing || null;
    if (billing) {
      const billingMap = {
        cardholderName: 'cardholder_name',
        email: 'billing_email',
        phone: 'billing_phone',
        addressLine1: 'address_line_1',
        addressLine2: 'address_line_2',
        city: 'city',
        stateProvince: 'state_province',
        postalCode: 'postal_code',
        country: 'country',
        cardBrand: 'card_brand',
        cardLast4: 'card_last4'
      };
      Object.entries(billingMap).forEach(([source, target]) => {
        if (!(source in billing)) return;
        const next = source === 'cardLast4'
          ? (String(billing[source] || '').replace(/\D/g, '').slice(-4) || null)
          : (source === 'email' ? (nullableText(billing[source])?.toLowerCase() || null) : nullableText(billing[source]));
        const current = source === 'email'
          ? (nullableText(currentBilling[target])?.toLowerCase() || null)
          : (source === 'cardLast4' ? (String(currentBilling[target] || '').replace(/\D/g, '').slice(-4) || null) : nullableText(currentBilling[target]));
        if (!scalarEqual(next, current)) billingPatch[target] = next;
      });
    }

    if (payload.internalFinancials) {
      const internal = payload.internalFinancials;
      const supplierCost = internal.supplierCost == null || internal.supplierCost === '' ? null : money(internal.supplierCost);
      const sellingPrice = internal.sellingPrice == null || internal.sellingPrice === ''
        ? money(payment?.totalAmount ?? reservation.total_amount)
        : money(internal.sellingPrice);
      const adminNotes = nullableText(internal.adminNotes);
      const estimatedMargin = supplierCost == null || sellingPrice == null ? null : money(sellingPrice - supplierCost);
      const changed = !currentInternal
        || (currentInternal.supplier_cost == null ? null : money(currentInternal.supplier_cost)) !== supplierCost
        || money(currentInternal.selling_price) !== sellingPrice
        || (currentInternal.estimated_margin == null ? null : money(currentInternal.estimated_margin)) !== estimatedMargin
        || !scalarEqual(nullableText(currentInternal.admin_notes), adminNotes);
      if (changed) {
        internalRow = {
          reservation_id: reservation.id,
          supplier_cost: supplierCost,
          selling_price: sellingPrice,
          estimated_margin: estimatedMargin,
          admin_notes: adminNotes,
          updated_at: now
        };
      }
    }

    if (Array.isArray(payload.snapshots)) {
      snapshotsChanged = !jsonEqual(snapshotComparable(payload.snapshots), snapshotComparable(currentSnapshots));
    }

    const reservationChanged = Object.keys(reservationPatch).length > 0;
    const carChanged = Object.keys(carPatch).length > 0;
    const travellerChanged = Object.keys(travellerPatch).length > 0;
    const billingChanged = Object.keys(billingPatch).length > 0;
    const internalChanged = Boolean(internalRow);
    const authorizationRelevantChanged = reservationChanged || carChanged || travellerChanged || billingChanged || snapshotsChanged;
    const shouldSupersede = authorizationRelevantChanged && latestAuthorization && ['SENT', 'VIEWED', 'AUTHORIZED'].includes(latestAuthorization.status);
    const hasChanges = authorizationRelevantChanged || internalChanged;

    if (!hasChanges) {
      return res.json({
        success: true,
        data: {
          reservation,
          car: currentCar || null,
          travellers: currentTravellers,
          billing: billingResult.data || null,
          snapshots: currentSnapshots,
          authorizations: currentAuthorizations,
          latestAuthorization: latestAuthorization ? { ...latestAuthorization, transactions: latestTransactions } : null,
          activity: currentActivity,
          internalFinancials: currentInternal
        },
        meta: { optimizedSave: true, noChanges: true }
      });
    }

    reservationPatch.updated_at = now;
    if (carChanged) carPatch.updated_at = now;
    if (travellerChanged) travellerPatch.updated_at = now;
    if (billingChanged) billingPatch.updated_at = now;
    if (shouldSupersede) {
      reservationPatch.authorization_status = 'SUPERSEDED';
      reservationPatch.reservation_status = 'AUTH_PENDING';
    }

    let updatedReservation = reservation;
    let updatedCar = currentCar;
    let updatedTravellers = currentTravellers;
    let updatedBilling = billingResult.data || null;
    let updatedInternal = currentInternal;
    let updatedSnapshots = currentSnapshots;
    let updatedLatestAuthorization = latestAuthorization;

    const writes = [];

    writes.push((async () => {
      const { data, error } = await supabase.from('reservations').update(reservationPatch).eq('id', reservation.id).select('*').single();
      throwDb(error, 'Unable to update reservation');
      updatedReservation = data;
    })());

    if (carChanged) {
      writes.push((async () => {
        const { data, error } = await supabase.from('car_reservations').update(carPatch).eq('reservation_id', reservation.id).select('*').maybeSingle();
        throwDb(error, 'Unable to update car details');
        if (data) updatedCar = data;
      })());
    }

    if (travellerChanged) {
      writes.push((async () => {
        const { data, error } = await supabase
          .from('reservation_travellers')
          .update(travellerPatch)
          .eq('reservation_id', reservation.id)
          .eq('role', 'PRIMARY_DRIVER')
          .select('*');
        throwDb(error, 'Unable to update renter details');
        if (data?.length) {
          const byId = new Map(data.map(item => [item.id, item]));
          updatedTravellers = currentTravellers.map(item => byId.get(item.id) || item);
        }
      })());
    }

    if (billingChanged) {
      writes.push((async () => {
        const { data, error } = await supabase
          .from('reservation_billing_details')
          .update(billingPatch)
          .eq('reservation_id', reservation.id)
          .select('*')
          .maybeSingle();
        throwDb(error, 'Unable to update billing details');
        if (data) updatedBilling = data;
      })());
    }

    if (internalChanged) {
      writes.push((async () => {
        const { data, error } = await supabase
          .from('reservation_internal_financials')
          .upsert(internalRow, { onConflict: 'reservation_id' })
          .select('*')
          .single();
        throwDb(error, 'Unable to update internal financials');
        updatedInternal = data;
      })());
    }

    if (snapshotsChanged) {
      writes.push((async () => {
        const { error: deleteError } = await supabase
          .from('car_rental_snapshots')
          .delete()
          .eq('reservation_id', reservation.id)
          .is('authorization_id', null);
        throwDb(deleteError, 'Unable to replace draft snapshots');
        const rows = payload.snapshots.filter(item => item?.imageUrl).map((item, index) => ({
          reservation_id: reservation.id,
          image_url: item.imageUrl,
          storage_path: item.storagePath || null,
          caption: nullableText(item.caption),
          sort_order: index
        }));
        if (!rows.length) {
          updatedSnapshots = currentSnapshots.filter(item => item.authorization_id != null);
          return;
        }
        const { data, error } = await supabase.from('car_rental_snapshots').insert(rows).select('*');
        throwDb(error, 'Unable to save vehicle snapshots');
        updatedSnapshots = [
          ...currentSnapshots.filter(item => item.authorization_id != null),
          ...(data || [])
        ].sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0));
      })());
    }

    if (shouldSupersede) {
      writes.push((async () => {
        const { data, error } = await supabase
          .from('authorizations')
          .update({ status: 'SUPERSEDED', superseded_at: now, updated_at: now })
          .eq('id', latestAuthorization.id)
          .select('*')
          .single();
        throwDb(error, 'Unable to supersede previous authorization');
        updatedLatestAuthorization = data;
      })());
    }

    await Promise.all(writes);

    const activityRows = [];
    if (shouldSupersede) {
      activityRows.push({
        reservation_id: reservation.id,
        actor_type: 'ADMIN',
        actor_id: actor(req) || null,
        action: 'AUTHORIZATION_SUPERSEDED',
        metadata: { version: latestAuthorization.version, reason: 'Reservation details changed' }
      });
    }
    activityRows.push({
      reservation_id: reservation.id,
      actor_type: 'ADMIN',
      actor_id: actor(req) || null,
      action: 'RESERVATION_DRAFT_UPDATED',
      metadata: { optimizedSave: true }
    });

    const { data: insertedActivity, error: activityError } = await supabase.from('reservation_activity').insert(activityRows).select('*');
    if (activityError) console.warn('[reservation-activity]', activityError.message);

    const updatedAuthorizations = currentAuthorizations.map(item =>
      updatedLatestAuthorization?.id === item.id ? updatedLatestAuthorization : item
    );
    const activity = insertedActivity?.length
      ? [...insertedActivity].reverse().concat(currentActivity).slice(0, 100)
      : currentActivity;

    await auditBackOffice(req, 'car_reservation.updated', 'reservation', reservation.id, {
      bookingReference: reservation.booking_reference,
      optimizedSave: true,
      changedSections: [
        reservationChanged && 'reservation',
        carChanged && 'car',
        travellerChanged && 'customer',
        billingChanged && 'billing',
        internalChanged && 'internalFinancials',
        snapshotsChanged && 'snapshots'
      ].filter(Boolean)
    });

    res.json({
      success: true,
      data: {
        reservation: updatedReservation,
        car: updatedCar || null,
        travellers: updatedTravellers,
        billing: updatedBilling,
        snapshots: updatedSnapshots,
        authorizations: updatedAuthorizations,
        latestAuthorization: updatedLatestAuthorization ? { ...updatedLatestAuthorization, transactions: latestTransactions } : null,
        activity,
        internalFinancials: updatedInternal
      },
      meta: { optimizedSave: true, noChanges: false }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
export { router as carsBackofficeFastRouter };
