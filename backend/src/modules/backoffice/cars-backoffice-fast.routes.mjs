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
  const valueClean = clean(value);
  return valueClean === '' || valueClean === undefined ? null : valueClean;
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
  if (Number.isNaN(date.getTime())) throw requestError('INVALID_RENTAL_TIME', 'Rental date/time is invalid.');
  return date.toISOString();
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

function normalizeCardBrand(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const compact = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  const aliases = {
    visa: 'Visa',
    mastercard: 'Mastercard',
    master: 'Mastercard',
    mc: 'Mastercard',
    amex: 'American Express',
    americanexpress: 'American Express',
    discover: 'Discover',
    diners: 'Diners Club',
    dinersclub: 'Diners Club',
    jcb: 'JCB',
    unionpay: 'UnionPay'
  };
  return aliases[compact] || raw;
}

function validateHalfHour(value, label) {
  if (!value) return;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw requestError('INVALID_RENTAL_TIME', `${label} is invalid.`);
  const minutes = date.getUTCMinutes();
  if (minutes !== 0 && minutes !== 30) throw requestError('INVALID_RENTAL_TIME', `${label} must be on the hour or half hour.`);
}

function validateResultingCarTimes(payloadCar, currentCar = {}) {
  if (!payloadCar || (!Object.prototype.hasOwnProperty.call(payloadCar, 'pickupAt') && !Object.prototype.hasOwnProperty.call(payloadCar, 'dropoffAt'))) return;
  const pickup = Object.prototype.hasOwnProperty.call(payloadCar, 'pickupAt') ? payloadCar.pickupAt : currentCar.pickup_at;
  const dropoff = Object.prototype.hasOwnProperty.call(payloadCar, 'dropoffAt') ? payloadCar.dropoffAt : currentCar.dropoff_at;
  validateHalfHour(pickup, 'Pickup time');
  validateHalfHour(dropoff, 'Drop-off time');
  if (pickup && dropoff) {
    const pickupDate = new Date(pickup);
    const dropoffDate = new Date(dropoff);
    if (dropoffDate.getTime() <= pickupDate.getTime()) {
      throw requestError('INVALID_RENTAL_CHRONOLOGY', 'Drop-off date and time must be after pickup date and time.');
    }
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
  if (source.endsWith('At')) return value ? normalizedIso(value) : null;
  return nullableText(value);
}

function normalizeDbCarField(source, value) {
  if (source === 'driverAge') return value == null ? null : Number(value);
  if (source === 'orSimilar') return Boolean(value);
  if (source.endsWith('At')) return value ? normalizedIso(value) : null;
  return nullableText(value);
}

function snapshotComparable(items = []) {
  return items.map(item => ({
    imageUrl: item.imageUrl ?? item.image_url ?? '',
    storagePath: item.storagePath ?? item.storage_path ?? null,
    caption: clean(item.caption) || ''
  }));
}

async function maybeSingle(query, context) {
  const result = await query.maybeSingle();
  throwDb(result.error, context);
  return result.data || null;
}

router.patch('/bookings/cars/:id', requirePermission('bookings.cars.edit'), async (req, res, next) => {
  try {
    const payload = req.body || {};
    const reservation = await loadReservation(req.params.id);

    const needsCar = Boolean(payload.car || payload.payment || Object.prototype.hasOwnProperty.call(payload, 'terms') || Object.prototype.hasOwnProperty.call(payload, 'customSections') || Object.prototype.hasOwnProperty.call(payload, 'sectionOrder') || Object.prototype.hasOwnProperty.call(payload, 'internalNotes'));
    const needsTraveller = Boolean(payload.customer);
    const needsBilling = Boolean(payload.billing);
    const needsInternal = Boolean(payload.internalFinancials);
    const needsSnapshots = Array.isArray(payload.snapshots);

    const reads = [];
    if (needsCar) reads.push(['car', maybeSingle(supabase.from('car_reservations').select('*').eq('reservation_id', reservation.id), 'Unable to load car details')]);
    if (needsTraveller) reads.push(['traveller', maybeSingle(supabase.from('reservation_travellers').select('*').eq('reservation_id', reservation.id).eq('role', 'PRIMARY_DRIVER'), 'Unable to load renter details')]);
    if (needsBilling) reads.push(['billing', maybeSingle(supabase.from('reservation_billing_details').select('*').eq('reservation_id', reservation.id), 'Unable to load billing details')]);
    if (needsInternal) reads.push(['internal', maybeSingle(supabase.from('reservation_internal_financials').select('*').eq('reservation_id', reservation.id), 'Unable to load internal financials')]);
    if (needsSnapshots) reads.push(['snapshots', (async () => {
      const result = await supabase.from('car_rental_snapshots').select('*').eq('reservation_id', reservation.id).is('authorization_id', null).order('sort_order', { ascending: true });
      throwDb(result.error, 'Unable to load draft snapshots');
      return result.data || [];
    })()]);

    const state = {};
    await Promise.all(reads.map(async ([key, promise]) => { state[key] = await promise; }));
    const currentCar = state.car || {};
    const currentTraveller = state.traveller || null;
    const currentBilling = state.billing || null;
    const currentInternal = state.internal || null;
    const currentSnapshots = state.snapshots || [];

    validateResultingCarTimes(payload.car, currentCar);

    const reservationPatch = {};
    const carPatch = {};
    const travellerPatch = {};
    const billingPatch = {};
    let internalRow = null;
    let snapshotsChanged = false;

    const customer = payload.customer || null;
    if (customer) {
      if ('fullName' in customer) {
        const nextValue = nullableText(customer.fullName);
        if (!scalarEqual(nextValue, nullableText(reservation.customer_name))) reservationPatch.customer_name = nextValue;
        if (!scalarEqual(nextValue, nullableText(currentTraveller?.full_name))) travellerPatch.full_name = nextValue;
      }
      if ('email' in customer) {
        const nextValue = nullableText(customer.email)?.toLowerCase() || null;
        if (nextValue && !/^\S+@\S+\.\S+$/.test(nextValue)) throw requestError('INVALID_CUSTOMER_EMAIL', 'Enter a valid customer email.');
        if (!scalarEqual(nextValue, nullableText(reservation.customer_email)?.toLowerCase() || null)) reservationPatch.customer_email = nextValue;
        if (!scalarEqual(nextValue, nullableText(currentTraveller?.email)?.toLowerCase() || null)) travellerPatch.email = nextValue;
      }
      if ('phone' in customer) {
        const nextValue = nullableText(customer.phone);
        if (!scalarEqual(nextValue, nullableText(reservation.customer_phone))) reservationPatch.customer_phone = nextValue;
        if (!scalarEqual(nextValue, nullableText(currentTraveller?.phone))) travellerPatch.phone = nextValue;
      }
      if ('dateOfBirth' in customer) {
        const nextValue = customer.dateOfBirth || null;
        if (!scalarEqual(nextValue, currentTraveller?.date_of_birth || null)) travellerPatch.date_of_birth = nextValue;
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
        const nextValue = normalizeCarField(source, car[source]);
        const currentValue = normalizeDbCarField(source, currentCar[target]);
        if (!scalarEqual(nextValue, currentValue)) carPatch[target] = nextValue;
      });
    }

    const payment = payload.payment || null;
    if (payment) {
      if ('currency' in payment) {
        const nextValue = currencyCode(payment.currency);
        if (!scalarEqual(nextValue, currencyCode(reservation.currency))) reservationPatch.currency = nextValue;
      }
      if ('totalAmount' in payment) {
        const nextValue = money(payment.totalAmount);
        if (nextValue < 0) throw requestError('INVALID_TOTAL', 'Reservation total cannot be negative.');
        if (nextValue !== money(reservation.total_amount)) reservationPatch.total_amount = nextValue;
      }
      if (!jsonEqual(payment, currentCar.draft_payment_data || {})) carPatch.draft_payment_data = payment;
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'terms')) {
      const nextValue = payload.terms || DEFAULT_CAR_TERMS;
      if (!scalarEqual(nextValue, currentCar.draft_terms || DEFAULT_CAR_TERMS)) carPatch.draft_terms = nextValue;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'customSections')) {
      const nextValue = Array.isArray(payload.customSections) ? payload.customSections : [];
      if (!jsonEqual(nextValue, currentCar.draft_custom_sections || [])) carPatch.draft_custom_sections = nextValue;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'sectionOrder')) {
      const nextValue = Array.isArray(payload.sectionOrder) ? payload.sectionOrder : [];
      if (!jsonEqual(nextValue, currentCar.draft_section_order || [])) carPatch.draft_section_order = nextValue;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'internalNotes')) {
      const nextValue = nullableText(payload.internalNotes);
      if (!scalarEqual(nextValue, nullableText(currentCar.internal_notes))) carPatch.internal_notes = nextValue;
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
        let nextValue;
        if (source === 'cardLast4') nextValue = String(billing[source] || '').replace(/\D/g, '').slice(-4) || null;
        else if (source === 'email') nextValue = nullableText(billing[source])?.toLowerCase() || null;
        else if (source === 'cardBrand') nextValue = normalizeCardBrand(billing[source]);
        else nextValue = nullableText(billing[source]);

        let currentValue;
        if (source === 'cardLast4') currentValue = String(currentBilling?.[target] || '').replace(/\D/g, '').slice(-4) || null;
        else if (source === 'email') currentValue = nullableText(currentBilling?.[target])?.toLowerCase() || null;
        else if (source === 'cardBrand') currentValue = normalizeCardBrand(currentBilling?.[target]);
        else currentValue = nullableText(currentBilling?.[target]);
        if (!scalarEqual(nextValue, currentValue)) billingPatch[target] = nextValue;
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
          updated_at: new Date().toISOString()
        };
      }
    }

    if (needsSnapshots) snapshotsChanged = !jsonEqual(snapshotComparable(payload.snapshots), snapshotComparable(currentSnapshots));

    const reservationChanged = Object.keys(reservationPatch).length > 0;
    const carChanged = Object.keys(carPatch).length > 0;
    const travellerChanged = Object.keys(travellerPatch).length > 0;
    const billingChanged = Object.keys(billingPatch).length > 0;
    const internalChanged = Boolean(internalRow);
    const authorizationRelevantChanged = reservationChanged || carChanged || travellerChanged || billingChanged || snapshotsChanged;
    const hasChanges = authorizationRelevantChanged || internalChanged;

    if (!hasChanges) {
      return res.json({
        success: true,
        data: { reservation },
        meta: { optimizedSave: true, noChanges: true, reads: 1 + reads.length, changedSections: [] }
      });
    }

    let latestAuthorization = null;
    if (authorizationRelevantChanged) {
      const authResult = await supabase
        .from('authorizations')
        .select('*')
        .eq('reservation_id', reservation.id)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();
      throwDb(authResult.error, 'Unable to load latest authorization');
      latestAuthorization = authResult.data || null;
    }

    const shouldSupersede = latestAuthorization && ['SENT', 'VIEWED', 'AUTHORIZED'].includes(latestAuthorization.status);
    const now = new Date().toISOString();
    if (reservationChanged || shouldSupersede) reservationPatch.updated_at = now;
    if (shouldSupersede) {
      reservationPatch.authorization_status = 'SUPERSEDED';
      reservationPatch.reservation_status = 'AUTH_PENDING';
    }
    if (carChanged) carPatch.updated_at = now;
    if (travellerChanged) travellerPatch.updated_at = now;
    if (billingChanged) billingPatch.updated_at = now;

    const resultData = { reservation };
    const writes = [];

    if (Object.keys(reservationPatch).length) {
      writes.push((async () => {
        const result = await supabase.from('reservations').update(reservationPatch).eq('id', reservation.id).select('*').single();
        throwDb(result.error, 'Unable to update reservation');
        resultData.reservation = result.data;
      })());
    }

    if (carChanged) {
      writes.push((async () => {
        const row = { reservation_id: reservation.id, ...carPatch };
        const result = currentCar.id
          ? await supabase.from('car_reservations').update(carPatch).eq('reservation_id', reservation.id).select('*').single()
          : await supabase.from('car_reservations').upsert(row, { onConflict: 'reservation_id' }).select('*').single();
        throwDb(result.error, 'Unable to update car details');
        resultData.car = result.data;
      })());
    }

    if (travellerChanged) {
      writes.push((async () => {
        let result;
        if (currentTraveller?.id) {
          result = await supabase.from('reservation_travellers').update(travellerPatch).eq('id', currentTraveller.id).select('*').single();
        } else {
          result = await supabase.from('reservation_travellers').insert({ reservation_id: reservation.id, role: 'PRIMARY_DRIVER', ...travellerPatch }).select('*').single();
        }
        throwDb(result.error, 'Unable to update renter details');
        resultData.travellers = [result.data];
      })());
    }

    if (billingChanged) {
      writes.push((async () => {
        let result;
        if (currentBilling?.id) result = await supabase.from('reservation_billing_details').update(billingPatch).eq('id', currentBilling.id).select('*').single();
        else result = await supabase.from('reservation_billing_details').insert({ reservation_id: reservation.id, ...billingPatch }).select('*').single();
        throwDb(result.error, 'Unable to update billing details');
        resultData.billing = result.data;
      })());
    }

    if (internalChanged) {
      writes.push((async () => {
        const result = await supabase.from('reservation_internal_financials').upsert(internalRow, { onConflict: 'reservation_id' }).select('*').single();
        throwDb(result.error, 'Unable to update internal financials');
        resultData.internalFinancials = result.data;
      })());
    }

    if (snapshotsChanged) {
      writes.push((async () => {
        const deleteResult = await supabase.from('car_rental_snapshots').delete().eq('reservation_id', reservation.id).is('authorization_id', null);
        throwDb(deleteResult.error, 'Unable to replace draft snapshots');
        const rows = payload.snapshots.filter(item => item?.imageUrl).map((item, index) => ({
          reservation_id: reservation.id,
          image_url: item.imageUrl,
          storage_path: item.storagePath || null,
          caption: nullableText(item.caption),
          sort_order: index
        }));
        if (!rows.length) {
          resultData.snapshots = [];
          return;
        }
        const insertResult = await supabase.from('car_rental_snapshots').insert(rows).select('*');
        throwDb(insertResult.error, 'Unable to save vehicle snapshots');
        resultData.snapshots = insertResult.data || [];
      })());
    }

    if (shouldSupersede) {
      writes.push((async () => {
        const result = await supabase.from('authorizations').update({ status: 'SUPERSEDED', superseded_at: now, updated_at: now }).eq('id', latestAuthorization.id).select('*').single();
        throwDb(result.error, 'Unable to supersede previous authorization');
        resultData.latestAuthorization = result.data;
      })());
    } else if (latestAuthorization) {
      resultData.latestAuthorization = latestAuthorization;
    }

    await Promise.all(writes);

    const changedSections = [
      reservationChanged && 'reservation',
      carChanged && 'car',
      travellerChanged && 'customer',
      billingChanged && 'billing',
      internalChanged && 'internalFinancials',
      snapshotsChanged && 'snapshots',
      shouldSupersede && 'authorization'
    ].filter(Boolean);

    const activityRows = [{
      reservation_id: reservation.id,
      actor_type: 'ADMIN',
      actor_id: actor(req) || null,
      action: 'RESERVATION_DRAFT_UPDATED',
      metadata: { optimizedSave: true, changedSections }
    }];
    if (shouldSupersede) {
      activityRows.unshift({
        reservation_id: reservation.id,
        actor_type: 'ADMIN',
        actor_id: actor(req) || null,
        action: 'AUTHORIZATION_SUPERSEDED',
        metadata: { version: latestAuthorization.version, reason: 'Reservation details changed' }
      });
    }

    const activityPromise = supabase.from('reservation_activity').insert(activityRows).select('*')
      .then(result => {
        if (result.error) console.warn('[reservation-activity]', result.error.message);
        else resultData.activity = result.data || [];
      });
    const auditPromise = auditBackOffice(req, 'car_reservation.updated', 'reservation', reservation.id, {
      bookingReference: reservation.booking_reference,
      optimizedSave: true,
      changedSections
    });
    await Promise.all([activityPromise, auditPromise]);

    res.json({
      success: true,
      data: resultData,
      meta: {
        optimizedSave: true,
        noChanges: false,
        reads: 2 + reads.length,
        changedSections
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
export { router as carsBackofficeFastRouter };
