import crypto from 'crypto';
import supabase from '../../config/supabase.mjs';

const BOOKING_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DEFAULT_SECTION_ORDER = [
  'rental_details',
  'vehicle_snapshots',
  'renter_details',
  'billing_details',
  'payment_summary',
  'custom_sections',
  'terms'
];

export const DEFAULT_CAR_TERMS = `1. Once the rental reservation has been confirmed, the reservation is non-refundable except where applicable law or the rental company's written terms expressly provide otherwise.
2. Any requested change, modification, extension, cancellation, upgrade, additional driver, pickup or drop-off change is subject to the rental company's policies, availability, rate differences, penalties, taxes and other applicable charges.
3. The customer authorizes the total amount shown in this authorization and acknowledges that the amount may be divided among multiple transactions and merchant names exactly as disclosed in the Payment Authorization section.
4. Amounts designated “Pay at Counter” are collected directly by the rental provider at pickup. Amounts designated “Pay Now” may be processed by the merchant identified in the authorization.
5. Security deposits, incidental holds, tolls, fuel, fines, damage charges, optional products and other supplier-imposed charges may be separate from the amounts shown here when imposed or disclosed by the rental provider.
6. The renter must satisfy the rental company's age, identification, driver's-license, payment-card, deposit and eligibility requirements at pickup.
7. Vehicle make/model is not guaranteed when the authorization states “or similar”; final vehicle assignment remains subject to supplier availability.
8. FareTransit assists in arranging the reservation and is not the operator of the rental vehicle.
9. The customer agrees to contact FareTransit promptly regarding any recognized billing or reservation concern before initiating a payment dispute where reasonably possible. A payment dispute does not by itself cancel a valid reservation or eliminate payment obligations for services properly authorized and provided.
10. By pressing “I AUTHORIZE TO PAY”, the customer confirms that they have reviewed and accepted these Terms & Conditions, recognize the disclosed merchant names and amounts, and are the cardholder or an authorized user of the payment method identified in the authorization.`;

function serviceError(code, message, status = 400, details = null) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.details = details;
  return error;
}

function throwDb(error, context) {
  if (!error) return;
  throw serviceError('DATABASE_ERROR', `${context}: ${error.message}`, 500, error);
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : value;
}

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function currencyCode(value) {
  return String(value || 'USD').trim().toUpperCase().slice(0, 3) || 'USD';
}

function normalizeCollectionMethod(value) {
  const normalized = String(value || '').trim().toUpperCase().replaceAll(' ', '_');
  return normalized === 'PAY_AT_COUNTER' ? 'PAY_AT_COUNTER' : 'PAY_NOW';
}

function randomBookingReference() {
  let suffix = '';
  for (let i = 0; i < 5; i += 1) {
    suffix += BOOKING_ALPHABET[crypto.randomInt(0, BOOKING_ALPHABET.length)];
  }
  return `C${suffix}`;
}

export function buildFinalAcknowledgement({ bookingReference, totalAmount, currency = 'USD', transactions = [], cardLast4 = '' }) {
  const last4 = String(cardLast4 || '').replace(/\D/g, '').slice(-4) || '----';
  const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode(currency) });
  const payNow = transactions.filter(item => normalizeCollectionMethod(item.collectionMethod || item.collection_method) === 'PAY_NOW');
  const counter = transactions.filter(item => normalizeCollectionMethod(item.collectionMethod || item.collection_method) === 'PAY_AT_COUNTER');

  const joinParts = parts => {
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0];
    if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
    return `${parts.slice(0, -1).join(', ')}, and ${parts.at(-1)}`;
  };

  const nowParts = payNow.map(item => `${formatter.format(money(item.amount))} under the merchant name “${clean(item.merchantName || item.merchant_name)}”`);
  const counterParts = counter.map(item => `${formatter.format(money(item.amount))} payable at the counter to “${clean(item.merchantName || item.merchant_name)}”`);

  const sentences = [
    `I agree to all Terms & Conditions associated with Booking ${bookingReference}.`,
    `I acknowledge the total authorized reservation amount of ${formatter.format(money(totalAmount))}.`
  ];

  if (nowParts.length) {
    sentences.push(`I authorize my payment card ending in ${last4} to be charged ${joinParts(nowParts)}.`);
  }
  if (counterParts.length) {
    sentences.push(`I further acknowledge ${joinParts(counterParts)} according to the stated collection method.`);
  }
  sentences.push('I recognize and authorize the disclosed amounts and merchant names as part of this reservation.');
  return sentences.join(' ');
}

async function logActivity(reservationId, action, actorType = 'SYSTEM', actorId = null, metadata = {}) {
  const { error } = await supabase.from('reservation_activity').insert({
    reservation_id: reservationId,
    actor_type: actorType,
    actor_id: actorId || null,
    action,
    metadata
  });
  if (error) console.warn('[reservation-activity]', error.message);
}

async function reservationByReference(reference) {
  const value = String(reference || '').trim().toUpperCase();
  const { data, error } = await supabase.from('reservations').select('*').eq('booking_reference', value).maybeSingle();
  throwDb(error, 'Unable to load reservation');
  if (!data) throw serviceError('RESERVATION_NOT_FOUND', `Reservation ${value} was not found.`, 404);
  return data;
}

async function latestAuthorization(reservationId) {
  const { data, error } = await supabase
    .from('authorizations')
    .select('*')
    .eq('reservation_id', reservationId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  throwDb(error, 'Unable to load authorization');
  return data || null;
}

async function transactionsForAuthorization(authorizationId) {
  if (!authorizationId) return [];
  const { data, error } = await supabase
    .from('authorization_transactions')
    .select('*')
    .eq('authorization_id', authorizationId)
    .order('sequence', { ascending: true });
  throwDb(error, 'Unable to load authorization transactions');
  return data || [];
}

async function replaceTransactions(authorizationId, transactions = [], currency = 'USD') {
  const { error: deleteError } = await supabase.from('authorization_transactions').delete().eq('authorization_id', authorizationId);
  throwDb(deleteError, 'Unable to replace authorization transactions');
  if (!transactions.length) return [];
  const rows = transactions.map((item, index) => ({
    authorization_id: authorizationId,
    sequence: index + 1,
    amount: money(item.amount),
    currency: currencyCode(item.currency || currency),
    merchant_name: clean(item.merchantName || item.merchant_name),
    merchant_logo_url: clean(item.merchantLogoUrl || item.merchant_logo_url) || null,
    collection_method: normalizeCollectionMethod(item.collectionMethod || item.collection_method),
    description: clean(item.description) || null
  }));
  const { data, error } = await supabase.from('authorization_transactions').insert(rows).select('*');
  throwDb(error, 'Unable to save authorization transactions');
  return data || [];
}

function validateReadyToSend({ reservation, car, traveller, billing, authorization, transactions }) {
  const missing = [];
  if (!car?.rental_company_name) missing.push('rental company');
  if (!car?.vehicle_name && !car?.vehicle_category) missing.push('vehicle/category');
  if (!car?.pickup_location) missing.push('pickup location');
  if (!car?.dropoff_location) missing.push('drop-off location');
  if (!car?.pickup_at) missing.push('pickup date/time');
  if (!car?.dropoff_at) missing.push('drop-off date/time');
  if (!traveller?.full_name) missing.push('renter name');
  if (!traveller?.date_of_birth) missing.push('renter date of birth');
  if (!traveller?.email && !reservation?.customer_email) missing.push('renter email');
  if (!billing?.cardholder_name) missing.push('cardholder name');
  if (!billing?.card_last4) missing.push('card last four');
  if (!billing?.address_line_1) missing.push('billing address');
  if (!authorization?.terms_snapshot?.text) missing.push('terms and conditions');
  if (money(authorization?.total_amount) <= 0) missing.push('total authorized amount');
  if (!transactions.length) missing.push('at least one transaction');
  transactions.forEach((item, index) => {
    if (money(item.amount) <= 0) missing.push(`transaction ${index + 1} amount`);
    if (!clean(item.merchant_name)) missing.push(`transaction ${index + 1} merchant`);
  });
  const splitTotal = Math.round(transactions.reduce((sum, item) => sum + money(item.amount), 0) * 100) / 100;
  if (Math.abs(splitTotal - money(authorization?.total_amount)) > 0.009) {
    throw serviceError('AUTHORIZATION_TOTAL_MISMATCH', `Transaction total ${splitTotal.toFixed(2)} must equal authorization total ${money(authorization?.total_amount).toFixed(2)}.`, 409);
  }
  if (missing.length) throw serviceError('AUTHORIZATION_INCOMPLETE', `Complete the following before sending: ${missing.join(', ')}.`, 409, { missing });
}

async function loadBundle(reservation) {
  const [carResult, travellersResult, billingResult, snapshotsResult, authResult, activityResult, internalResult] = await Promise.all([
    supabase.from('car_reservations').select('*').eq('reservation_id', reservation.id).maybeSingle(),
    supabase.from('reservation_travellers').select('*').eq('reservation_id', reservation.id).order('created_at', { ascending: true }),
    supabase.from('reservation_billing_details').select('*').eq('reservation_id', reservation.id).maybeSingle(),
    supabase.from('car_rental_snapshots').select('*').eq('reservation_id', reservation.id).order('sort_order', { ascending: true }),
    supabase.from('authorizations').select('*').eq('reservation_id', reservation.id).order('version', { ascending: false }),
    supabase.from('reservation_activity').select('*').eq('reservation_id', reservation.id).order('created_at', { ascending: false }).limit(100),
    supabase.from('reservation_internal_financials').select('*').eq('reservation_id', reservation.id).maybeSingle()
  ]);
  [carResult, travellersResult, billingResult, snapshotsResult, authResult, activityResult, internalResult].forEach(result => throwDb(result.error, 'Unable to load reservation details'));
  const authorizations = authResult.data || [];
  const latest = authorizations[0] || null;
  const transactions = latest ? await transactionsForAuthorization(latest.id) : [];
  return {
    reservation,
    car: carResult.data || null,
    travellers: travellersResult.data || [],
    billing: billingResult.data || null,
    snapshots: snapshotsResult.data || [],
    authorizations,
    latestAuthorization: latest ? { ...latest, transactions } : null,
    activity: activityResult.data || [],
    internalFinancials: internalResult.data || null
  };
}

export async function listReservations(filters = {}) {
  let query = supabase.from('reservations').select('*', { count: 'exact' }).order('created_at', { ascending: false });
  if (filters.serviceType && String(filters.serviceType).toUpperCase() !== 'ALL') query = query.eq('service_type', String(filters.serviceType).toUpperCase());
  if (filters.status) query = query.eq('reservation_status', String(filters.status).toUpperCase());
  if (filters.authorizationStatus) query = query.eq('authorization_status', String(filters.authorizationStatus).toUpperCase());
  if (filters.q) {
    const term = String(filters.q).trim().replaceAll(',', ' ');
    query = query.or(`booking_reference.ilike.%${term}%,customer_name.ilike.%${term}%,customer_email.ilike.%${term}%,customer_phone.ilike.%${term}%`);
  }
  const page = Math.max(1, Number(filters.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize || 50)));
  query = query.range((page - 1) * pageSize, page * pageSize - 1);
  const { data, error, count } = await query;
  throwDb(error, 'Unable to list reservations');
  return { reservations: data || [], total: count || 0, page, pageSize };
}

export async function listAuthorizations(filters = {}) {
  let query = supabase
    .from('authorizations')
    .select('*, reservations!inner(booking_reference,customer_name,customer_email,reservation_status)', { count: 'exact' })
    .order('created_at', { ascending: false });
  if (filters.status) query = query.eq('status', String(filters.status).toUpperCase());
  if (filters.serviceType && String(filters.serviceType).toUpperCase() !== 'ALL') query = query.eq('service_type', String(filters.serviceType).toUpperCase());
  const { data, error, count } = await query.limit(Math.min(100, Math.max(1, Number(filters.limit || 100))));
  throwDb(error, 'Unable to list authorizations');
  return { authorizations: data || [], total: count || 0 };
}

export async function getReservation(reference) {
  return loadBundle(await reservationByReference(reference));
}

export async function listRentalCompanies() {
  const { data, error } = await supabase.from('car_rental_companies').select('*').eq('active', true).order('display_name');
  throwDb(error, 'Unable to list rental companies');
  return data || [];
}

async function insertReservationWithReference(actorId = null) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const bookingReference = randomBookingReference();
    const { data, error } = await supabase.from('reservations').insert({
      booking_reference: bookingReference,
      service_type: 'CAR',
      reservation_status: 'DRAFT',
      authorization_status: 'NONE',
      currency: 'USD',
      total_amount: 0,
      created_by: actorId || null
    }).select('*').single();
    if (!error) return data;
    if (error.code !== '23505') throwDb(error, 'Unable to create reservation');
  }
  throw serviceError('BOOKING_REFERENCE_EXHAUSTED', 'Could not generate a unique car booking ID. Please retry.', 503);
}

export async function createCarReservation(payload = {}, actorId = null) {
  const reservation = await insertReservationWithReference(actorId);
  const customer = payload.customer || {};
  const car = payload.car || {};
  const billing = payload.billing || {};
  const internal = payload.internalFinancials || {};
  const draftPayment = payload.payment || {};

  const updates = {
    customer_name: clean(customer.fullName) || null,
    customer_email: clean(customer.email)?.toLowerCase() || null,
    customer_phone: clean(customer.phone) || null,
    currency: currencyCode(draftPayment.currency || 'USD'),
    total_amount: money(draftPayment.totalAmount || 0),
    updated_at: new Date().toISOString()
  };
  const { data: updatedReservation, error: reservationError } = await supabase.from('reservations').update(updates).eq('id', reservation.id).select('*').single();
  throwDb(reservationError, 'Unable to initialize reservation');

  const { error: carError } = await supabase.from('car_reservations').insert({
    reservation_id: reservation.id,
    rental_company_id: car.rentalCompanyId || null,
    rental_company_name: clean(car.rentalCompanyName) || null,
    rental_company_logo_url: clean(car.rentalCompanyLogoUrl) || null,
    vehicle_name: clean(car.vehicleName) || null,
    vehicle_category: clean(car.vehicleCategory) || null,
    vehicle_description: clean(car.vehicleDescription) || null,
    or_similar: car.orSimilar !== false,
    pickup_location: clean(car.pickupLocation) || null,
    pickup_address: clean(car.pickupAddress) || null,
    pickup_at: car.pickupAt || null,
    dropoff_location: clean(car.dropoffLocation) || null,
    dropoff_address: clean(car.dropoffAddress) || null,
    dropoff_at: car.dropoffAt || null,
    driver_age: car.driverAge ? Number(car.driverAge) : null,
    mileage_policy: clean(car.mileagePolicy) || null,
    fuel_policy: clean(car.fuelPolicy) || null,
    deposit_terms: clean(car.depositTerms) || null,
    cancellation_policy: clean(car.cancellationPolicy) || null,
    draft_payment_data: draftPayment || {},
    draft_terms: payload.terms || DEFAULT_CAR_TERMS,
    draft_custom_sections: Array.isArray(payload.customSections) ? payload.customSections : [],
    draft_section_order: Array.isArray(payload.sectionOrder) && payload.sectionOrder.length ? payload.sectionOrder : DEFAULT_SECTION_ORDER,
    internal_notes: clean(payload.internalNotes) || null
  });
  throwDb(carError, 'Unable to create car reservation details');

  const { error: travellerError } = await supabase.from('reservation_travellers').insert({
    reservation_id: reservation.id,
    role: 'PRIMARY_DRIVER',
    full_name: clean(customer.fullName) || null,
    date_of_birth: customer.dateOfBirth || null,
    email: clean(customer.email)?.toLowerCase() || null,
    phone: clean(customer.phone) || null
  });
  throwDb(travellerError, 'Unable to create renter details');

  const { error: billingError } = await supabase.from('reservation_billing_details').insert({
    reservation_id: reservation.id,
    cardholder_name: clean(billing.cardholderName) || null,
    billing_email: clean(billing.email)?.toLowerCase() || clean(customer.email)?.toLowerCase() || null,
    billing_phone: clean(billing.phone) || clean(customer.phone) || null,
    address_line_1: clean(billing.addressLine1) || null,
    address_line_2: clean(billing.addressLine2) || null,
    city: clean(billing.city) || null,
    state_province: clean(billing.stateProvince) || null,
    postal_code: clean(billing.postalCode) || null,
    country: clean(billing.country) || null,
    card_brand: clean(billing.cardBrand) || null,
    card_last4: String(billing.cardLast4 || '').replace(/\D/g, '').slice(-4) || null
  });
  throwDb(billingError, 'Unable to create billing details');

  if (internal.supplierCost != null || internal.sellingPrice != null || internal.adminNotes) {
    const supplierCost = internal.supplierCost == null ? null : money(internal.supplierCost);
    const sellingPrice = internal.sellingPrice == null ? money(draftPayment.totalAmount) : money(internal.sellingPrice);
    const { error: internalError } = await supabase.from('reservation_internal_financials').insert({
      reservation_id: reservation.id,
      supplier_cost: supplierCost,
      selling_price: sellingPrice,
      estimated_margin: supplierCost == null || sellingPrice == null ? null : money(sellingPrice - supplierCost),
      admin_notes: clean(internal.adminNotes) || null
    });
    throwDb(internalError, 'Unable to save internal reservation financials');
  }

  await logActivity(reservation.id, 'RESERVATION_CREATED', 'ADMIN', actorId, { bookingReference: reservation.booking_reference, serviceType: 'CAR' });
  return loadBundle(updatedReservation);
}

async function supersedeIfLocked(reservation, actorId, reason = 'Reservation details changed') {
  const latest = await latestAuthorization(reservation.id);
  if (!latest || !['SENT', 'VIEWED', 'AUTHORIZED'].includes(latest.status)) return;
  const now = new Date().toISOString();
  const { error } = await supabase.from('authorizations').update({ status: 'SUPERSEDED', superseded_at: now, updated_at: now }).eq('id', latest.id);
  throwDb(error, 'Unable to supersede previous authorization');
  const { error: reservationError } = await supabase.from('reservations').update({ authorization_status: 'SUPERSEDED', reservation_status: 'AUTH_PENDING', updated_at: now }).eq('id', reservation.id);
  throwDb(reservationError, 'Unable to update reservation authorization status');
  await logActivity(reservation.id, 'AUTHORIZATION_SUPERSEDED', 'ADMIN', actorId, { version: latest.version, reason });
}

export async function updateCarReservation(reference, payload = {}, actorId = null) {
  const reservation = await reservationByReference(reference);
  if (reservation.service_type !== 'CAR') throw serviceError('WRONG_SERVICE_TYPE', 'This editor only supports car reservations.', 409);

  if (payload.car || payload.customer || payload.billing || payload.payment || payload.terms || payload.customSections || payload.sectionOrder) {
    await supersedeIfLocked(reservation, actorId);
  }

  const customer = payload.customer || {};
  const car = payload.car || {};
  const billing = payload.billing || {};
  const payment = payload.payment || {};
  const now = new Date().toISOString();

  const reservationPatch = { updated_at: now };
  if ('fullName' in customer) reservationPatch.customer_name = clean(customer.fullName) || null;
  if ('email' in customer) reservationPatch.customer_email = clean(customer.email)?.toLowerCase() || null;
  if ('phone' in customer) reservationPatch.customer_phone = clean(customer.phone) || null;
  if ('currency' in payment) reservationPatch.currency = currencyCode(payment.currency);
  if ('totalAmount' in payment) reservationPatch.total_amount = money(payment.totalAmount);
  const { error: reservationError } = await supabase.from('reservations').update(reservationPatch).eq('id', reservation.id);
  throwDb(reservationError, 'Unable to update reservation');

  const carPatch = { updated_at: now };
  const carMap = {
    rentalCompanyId: 'rental_company_id', rentalCompanyName: 'rental_company_name', rentalCompanyLogoUrl: 'rental_company_logo_url',
    vehicleName: 'vehicle_name', vehicleCategory: 'vehicle_category', vehicleDescription: 'vehicle_description', orSimilar: 'or_similar',
    pickupLocation: 'pickup_location', pickupAddress: 'pickup_address', pickupAt: 'pickup_at',
    dropoffLocation: 'dropoff_location', dropoffAddress: 'dropoff_address', dropoffAt: 'dropoff_at', driverAge: 'driver_age',
    supplierConfirmation: 'supplier_confirmation', supplierNotes: 'supplier_notes', mileagePolicy: 'mileage_policy', fuelPolicy: 'fuel_policy',
    depositTerms: 'deposit_terms', cancellationPolicy: 'cancellation_policy'
  };
  Object.entries(carMap).forEach(([source, target]) => {
    if (!(source in car)) return;
    let value = car[source];
    if (['driverAge'].includes(source)) value = value ? Number(value) : null;
    else if (source !== 'orSimilar' && !source.endsWith('At')) value = clean(value) || null;
    carPatch[target] = value;
  });
  if (payload.payment) carPatch.draft_payment_data = payment;
  if ('terms' in payload) carPatch.draft_terms = payload.terms || DEFAULT_CAR_TERMS;
  if ('customSections' in payload) carPatch.draft_custom_sections = Array.isArray(payload.customSections) ? payload.customSections : [];
  if ('sectionOrder' in payload) carPatch.draft_section_order = Array.isArray(payload.sectionOrder) ? payload.sectionOrder : DEFAULT_SECTION_ORDER;
  if ('internalNotes' in payload) carPatch.internal_notes = clean(payload.internalNotes) || null;
  const { error: carError } = await supabase.from('car_reservations').update(carPatch).eq('reservation_id', reservation.id);
  throwDb(carError, 'Unable to update car details');

  if (payload.customer) {
    const travellerPatch = { updated_at: now };
    if ('fullName' in customer) travellerPatch.full_name = clean(customer.fullName) || null;
    if ('dateOfBirth' in customer) travellerPatch.date_of_birth = customer.dateOfBirth || null;
    if ('email' in customer) travellerPatch.email = clean(customer.email)?.toLowerCase() || null;
    if ('phone' in customer) travellerPatch.phone = clean(customer.phone) || null;
    const { error } = await supabase.from('reservation_travellers').update(travellerPatch).eq('reservation_id', reservation.id).eq('role', 'PRIMARY_DRIVER');
    throwDb(error, 'Unable to update renter details');
  }

  if (payload.billing) {
    const billingPatch = { updated_at: now };
    const billingMap = {
      cardholderName: 'cardholder_name', email: 'billing_email', phone: 'billing_phone', addressLine1: 'address_line_1', addressLine2: 'address_line_2',
      city: 'city', stateProvince: 'state_province', postalCode: 'postal_code', country: 'country', cardBrand: 'card_brand', cardLast4: 'card_last4'
    };
    Object.entries(billingMap).forEach(([source, target]) => {
      if (!(source in billing)) return;
      billingPatch[target] = source === 'cardLast4' ? (String(billing[source] || '').replace(/\D/g, '').slice(-4) || null) : (clean(billing[source]) || null);
    });
    const { error } = await supabase.from('reservation_billing_details').update(billingPatch).eq('reservation_id', reservation.id);
    throwDb(error, 'Unable to update billing details');
  }

  if (payload.internalFinancials) {
    const internal = payload.internalFinancials;
    const supplierCost = internal.supplierCost == null || internal.supplierCost === '' ? null : money(internal.supplierCost);
    const sellingPrice = internal.sellingPrice == null || internal.sellingPrice === '' ? money(payment.totalAmount || reservation.total_amount) : money(internal.sellingPrice);
    const row = {
      reservation_id: reservation.id,
      supplier_cost: supplierCost,
      selling_price: sellingPrice,
      estimated_margin: supplierCost == null || sellingPrice == null ? null : money(sellingPrice - supplierCost),
      admin_notes: clean(internal.adminNotes) || null,
      updated_at: now
    };
    const { error } = await supabase.from('reservation_internal_financials').upsert(row, { onConflict: 'reservation_id' });
    throwDb(error, 'Unable to update internal financials');
  }

  if (Array.isArray(payload.snapshots)) {
    const { error: deleteError } = await supabase.from('car_rental_snapshots').delete().eq('reservation_id', reservation.id).is('authorization_id', null);
    throwDb(deleteError, 'Unable to replace draft snapshots');
    const snapshotRows = payload.snapshots.filter(item => item?.imageUrl).map((item, index) => ({
      reservation_id: reservation.id,
      image_url: item.imageUrl,
      storage_path: item.storagePath || null,
      caption: clean(item.caption) || null,
      sort_order: index
    }));
    if (snapshotRows.length) {
      const { error } = await supabase.from('car_rental_snapshots').insert(snapshotRows);
      throwDb(error, 'Unable to save vehicle snapshots');
    }
  }

  await logActivity(reservation.id, 'RESERVATION_DRAFT_UPDATED', 'ADMIN', actorId);
  return getReservation(reference);
}

export async function saveAuthorizationDraft(reference, payload = {}, actorId = null) {
  const bundle = await getReservation(reference);
  const { reservation, car, travellers, billing, snapshots } = bundle;
  if (reservation.service_type !== 'CAR') throw serviceError('WRONG_SERVICE_TYPE', 'Car authorization is only available for car reservations.', 409);
  const traveller = travellers.find(item => item.role === 'PRIMARY_DRIVER') || travellers[0] || {};
  const payment = payload.payment || car?.draft_payment_data || {};
  const totalAmount = money(payment.totalAmount ?? reservation.total_amount);
  const currency = currencyCode(payment.currency || reservation.currency);
  const termsText = payload.terms || car?.draft_terms || DEFAULT_CAR_TERMS;
  const customSections = Array.isArray(payload.customSections) ? payload.customSections : (car?.draft_custom_sections || []);
  const sectionOrder = Array.isArray(payload.sectionOrder) && payload.sectionOrder.length ? payload.sectionOrder : (car?.draft_section_order?.length ? car.draft_section_order : DEFAULT_SECTION_ORDER);
  const transactionInput = Array.isArray(payment.transactions) ? payment.transactions : [];
  const acknowledgement = buildFinalAcknowledgement({
    bookingReference: reservation.booking_reference,
    totalAmount,
    currency,
    transactions: transactionInput,
    cardLast4: billing?.card_last4
  });

  let authorization = bundle.latestAuthorization;
  if (!authorization || authorization.status !== 'DRAFT') {
    const nextVersion = authorization ? Number(authorization.version || 0) + 1 : 1;
    const { data, error } = await supabase.from('authorizations').insert({
      reservation_id: reservation.id,
      service_type: 'CAR',
      version: nextVersion,
      status: 'DRAFT',
      total_amount: totalAmount,
      currency,
      customer_snapshot: {
        fullName: traveller.full_name || reservation.customer_name || '',
        dateOfBirth: traveller.date_of_birth || null,
        email: traveller.email || reservation.customer_email || '',
        phone: traveller.phone || reservation.customer_phone || ''
      },
      billing_snapshot: billing || {},
      service_snapshot: { car, snapshots },
      payment_snapshot: { totalAmount, currency },
      terms_snapshot: { text: termsText, version: `car-v${nextVersion}` },
      custom_sections: customSections,
      section_order: sectionOrder,
      final_acknowledgement: acknowledgement,
      created_by: actorId || null
    }).select('*').single();
    throwDb(error, 'Unable to create authorization draft');
    authorization = data;
  } else {
    const { data, error } = await supabase.from('authorizations').update({
      total_amount: totalAmount,
      currency,
      customer_snapshot: {
        fullName: traveller.full_name || reservation.customer_name || '',
        dateOfBirth: traveller.date_of_birth || null,
        email: traveller.email || reservation.customer_email || '',
        phone: traveller.phone || reservation.customer_phone || ''
      },
      billing_snapshot: billing || {},
      service_snapshot: { car, snapshots },
      payment_snapshot: { totalAmount, currency },
      terms_snapshot: { text: termsText, version: `car-v${authorization.version}` },
      custom_sections: customSections,
      section_order: sectionOrder,
      final_acknowledgement: acknowledgement,
      updated_at: new Date().toISOString()
    }).eq('id', authorization.id).select('*').single();
    throwDb(error, 'Unable to update authorization draft');
    authorization = data;
  }

  const transactions = await replaceTransactions(authorization.id, transactionInput, currency);
  const { error: reservationError } = await supabase.from('reservations').update({
    authorization_status: 'DRAFT',
    reservation_status: 'AUTH_PENDING',
    total_amount: totalAmount,
    currency,
    updated_at: new Date().toISOString()
  }).eq('id', reservation.id);
  throwDb(reservationError, 'Unable to update reservation authorization state');

  await logActivity(reservation.id, 'AUTHORIZATION_DRAFT_SAVED', 'ADMIN', actorId, { version: authorization.version });
  return { ...authorization, transactions };
}

export async function prepareAuthorizationForSend(reference, actorId = null) {
  const bundle = await getReservation(reference);
  const authorization = bundle.latestAuthorization;
  if (!authorization || authorization.status !== 'DRAFT') throw serviceError('AUTHORIZATION_DRAFT_REQUIRED', 'Create or revise an authorization draft before sending.', 409);
  const transactions = authorization.transactions || await transactionsForAuthorization(authorization.id);
  const traveller = bundle.travellers.find(item => item.role === 'PRIMARY_DRIVER') || bundle.travellers[0] || {};
  validateReadyToSend({ reservation: bundle.reservation, car: bundle.car, traveller, billing: bundle.billing, authorization, transactions });
  const recipient = clean(traveller.email || bundle.reservation.customer_email)?.toLowerCase();
  if (!recipient) throw serviceError('CUSTOMER_EMAIL_REQUIRED', 'Customer email is required to send the authorization.', 409);
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase.from('authorizations').update({
    authorization_token: token,
    expires_at: expiresAt,
    sent_to_email: recipient,
    sent_from_email: 'support@faretransit.com',
    updated_at: now.toISOString()
  }).eq('id', authorization.id).select('*').single();
  throwDb(error, 'Unable to prepare authorization for sending');
  return { bundle, authorization: { ...data, transactions }, recipient, token, expiresAt, actorId };
}

export async function markAuthorizationSent(reference, authorizationId, actorId = null) {
  const reservation = await reservationByReference(reference);
  const now = new Date().toISOString();
  const { data, error } = await supabase.from('authorizations').update({ status: 'SENT', sent_at: now, updated_at: now }).eq('id', authorizationId).eq('status', 'DRAFT').select('*').single();
  throwDb(error, 'Unable to mark authorization as sent');
  const { error: reservationError } = await supabase.from('reservations').update({ authorization_status: 'SENT', reservation_status: 'AUTH_PENDING', updated_at: now }).eq('id', reservation.id);
  throwDb(reservationError, 'Unable to update reservation after sending authorization');
  await logActivity(reservation.id, 'AUTHORIZATION_SENT', 'ADMIN', actorId, { authorizationId, version: data.version, to: data.sent_to_email, from: data.sent_from_email });
  return data;
}

export async function resetAuthorizationSendPreparation(authorizationId) {
  const { error } = await supabase.from('authorizations').update({
    authorization_token: null,
    expires_at: null,
    sent_to_email: null,
    sent_from_email: null,
    updated_at: new Date().toISOString()
  }).eq('id', authorizationId).eq('status', 'DRAFT');
  if (error) console.warn('[authorization-send-reset]', error.message);
}

export async function createAuthorizationRevision(reference, actorId = null) {
  const bundle = await getReservation(reference);
  const latest = bundle.latestAuthorization;
  if (!latest) return saveAuthorizationDraft(reference, {}, actorId);
  if (latest.status === 'DRAFT') return latest;
  const now = new Date().toISOString();
  if (['SENT', 'VIEWED', 'AUTHORIZED'].includes(latest.status)) {
    const { error } = await supabase.from('authorizations').update({ status: 'SUPERSEDED', superseded_at: now, updated_at: now }).eq('id', latest.id);
    throwDb(error, 'Unable to supersede authorization');
  }
  const transactionInput = (latest.transactions || []).map(item => ({
    amount: item.amount,
    currency: item.currency,
    merchantName: item.merchant_name,
    merchantLogoUrl: item.merchant_logo_url,
    collectionMethod: item.collection_method,
    description: item.description
  }));
  const { data, error } = await supabase.from('authorizations').insert({
    reservation_id: bundle.reservation.id,
    service_type: 'CAR',
    version: Number(latest.version) + 1,
    status: 'DRAFT',
    total_amount: latest.total_amount,
    currency: latest.currency,
    customer_snapshot: latest.customer_snapshot,
    billing_snapshot: latest.billing_snapshot,
    service_snapshot: latest.service_snapshot,
    payment_snapshot: latest.payment_snapshot,
    terms_snapshot: latest.terms_snapshot,
    custom_sections: latest.custom_sections,
    section_order: latest.section_order,
    final_acknowledgement: latest.final_acknowledgement,
    created_by: actorId || null
  }).select('*').single();
  throwDb(error, 'Unable to create authorization revision');
  const transactions = await replaceTransactions(data.id, transactionInput, data.currency);
  const { error: reservationError } = await supabase.from('reservations').update({ authorization_status: 'DRAFT', reservation_status: 'AUTH_PENDING', updated_at: now }).eq('id', bundle.reservation.id);
  throwDb(reservationError, 'Unable to update reservation for revision');
  await logActivity(bundle.reservation.id, 'AUTHORIZATION_REVISION_CREATED', 'ADMIN', actorId, { version: data.version, supersedes: latest.version });
  return { ...data, transactions };
}

export async function getPublicAuthorization(token, { markViewed = true } = {}) {
  const value = String(token || '').trim();
  const { data: authorization, error } = await supabase.from('authorizations').select('*').eq('authorization_token', value).maybeSingle();
  throwDb(error, 'Unable to load authorization');
  if (!authorization || ['DRAFT', 'SUPERSEDED', 'DECLINED'].includes(authorization.status)) throw serviceError('AUTHORIZATION_NOT_AVAILABLE', 'This authorization is not available.', 404);
  if (authorization.expires_at && new Date(authorization.expires_at).getTime() < Date.now() && !['AUTHORIZED'].includes(authorization.status)) {
    await supabase.from('authorizations').update({ status: 'EXPIRED', updated_at: new Date().toISOString() }).eq('id', authorization.id);
    await supabase.from('reservations').update({ authorization_status: 'EXPIRED', updated_at: new Date().toISOString() }).eq('id', authorization.reservation_id);
    throw serviceError('AUTHORIZATION_EXPIRED', 'This authorization link has expired. Please contact FareTransit for a new authorization.', 410);
  }
  const { data: reservation, error: reservationError } = await supabase.from('reservations').select('id,booking_reference,service_type,reservation_status,customer_name,customer_email,currency,total_amount').eq('id', authorization.reservation_id).single();
  throwDb(reservationError, 'Unable to load authorization reservation');
  const transactions = await transactionsForAuthorization(authorization.id);
  if (markViewed && authorization.status === 'SENT') {
    const now = new Date().toISOString();
    await supabase.from('authorizations').update({ status: 'VIEWED', viewed_at: now, updated_at: now }).eq('id', authorization.id).eq('status', 'SENT');
    await supabase.from('reservations').update({ authorization_status: 'VIEWED', updated_at: now }).eq('id', reservation.id);
    authorization.status = 'VIEWED';
    authorization.viewed_at = now;
    await logActivity(reservation.id, 'AUTHORIZATION_VIEWED', 'CUSTOMER', reservation.customer_email || null, { version: authorization.version });
  }
  return { reservation, authorization: { ...authorization, transactions } };
}

export async function acceptPublicAuthorization(token, client = {}) {
  const bundle = await getPublicAuthorization(token, { markViewed: false });
  const { reservation, authorization } = bundle;
  if (authorization.status === 'AUTHORIZED') return bundle;
  if (!['SENT', 'VIEWED'].includes(authorization.status)) throw serviceError('AUTHORIZATION_NOT_ACCEPTABLE', `Authorization cannot be accepted while status is ${authorization.status}.`, 409);
  if (authorization.expires_at && new Date(authorization.expires_at).getTime() < Date.now()) throw serviceError('AUTHORIZATION_EXPIRED', 'This authorization has expired.', 410);
  const now = new Date().toISOString();
  const evidence = {
    bookingReference: reservation.booking_reference,
    authorizationId: authorization.id,
    version: authorization.version,
    customer: authorization.customer_snapshot,
    billing: authorization.billing_snapshot,
    service: authorization.service_snapshot,
    payment: { ...authorization.payment_snapshot, transactions: authorization.transactions },
    terms: authorization.terms_snapshot,
    customSections: authorization.custom_sections,
    acknowledgement: authorization.final_acknowledgement,
    actionLabel: 'I AUTHORIZE TO PAY',
    authorizedAt: now,
    ipAddress: client.ip || null,
    userAgent: client.userAgent || null
  };
  const { data, error } = await supabase.from('authorizations').update({
    status: 'AUTHORIZED',
    authorized_at: now,
    authorized_ip: client.ip || null,
    authorized_user_agent: client.userAgent || null,
    evidence_payload: evidence,
    updated_at: now
  }).eq('id', authorization.id).in('status', ['SENT', 'VIEWED']).select('*').single();
  throwDb(error, 'Unable to authorize reservation');
  const { error: reservationError } = await supabase.from('reservations').update({ authorization_status: 'AUTHORIZED', reservation_status: 'READY_TO_BOOK', updated_at: now }).eq('id', reservation.id);
  throwDb(reservationError, 'Unable to update reservation after authorization');
  await logActivity(reservation.id, 'AUTHORIZATION_ACCEPTED', 'CUSTOMER', reservation.customer_email || null, { version: authorization.version, ipAddress: client.ip || null });
  return { reservation: { ...reservation, authorization_status: 'AUTHORIZED', reservation_status: 'READY_TO_BOOK' }, authorization: { ...data, transactions: authorization.transactions } };
}

export async function markReservationBooked(reference, payload = {}, actorId = null) {
  const bundle = await getReservation(reference);
  if (bundle.reservation.service_type !== 'CAR') throw serviceError('WRONG_SERVICE_TYPE', 'Only car reservations are supported by this action.', 409);
  if (bundle.latestAuthorization?.status !== 'AUTHORIZED') throw serviceError('AUTHORIZATION_REQUIRED', 'Customer authorization is required before marking this rental as booked.', 409);
  const confirmation = clean(payload.supplierConfirmation || bundle.car?.supplier_confirmation);
  if (!confirmation) throw serviceError('SUPPLIER_CONFIRMATION_REQUIRED', 'Enter the rental-company confirmation number before marking the reservation booked.', 409);
  const now = new Date().toISOString();
  const { error: carError } = await supabase.from('car_reservations').update({ supplier_confirmation: confirmation, supplier_notes: clean(payload.supplierNotes) || bundle.car?.supplier_notes || null, updated_at: now }).eq('reservation_id', bundle.reservation.id);
  throwDb(carError, 'Unable to save supplier confirmation');
  const { error } = await supabase.from('reservations').update({ reservation_status: 'BOOKED', updated_at: now }).eq('id', bundle.reservation.id);
  throwDb(error, 'Unable to mark reservation booked');
  await logActivity(bundle.reservation.id, 'RESERVATION_BOOKED', 'ADMIN', actorId, { supplierConfirmation: confirmation });
  return getReservation(reference);
}

export async function saveUploadedAsset({ dataUrl, filename, bookingReference, kind = 'snapshot' }) {
  const match = String(dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/i);
  if (!match) throw serviceError('INVALID_IMAGE', 'Upload a JPEG, PNG, WEBP or GIF image.', 400);
  const mimeType = match[1].toLowerCase();
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 5 * 1024 * 1024) throw serviceError('IMAGE_TOO_LARGE', 'Images must be 5 MB or smaller.', 413);
  const extension = mimeType.split('/')[1].replace('jpeg', 'jpg');
  const safeReference = String(bookingReference || 'unassigned').replace(/[^A-Z0-9-]/gi, '').toUpperCase();
  const safeName = String(filename || `${kind}.${extension}`).replace(/[^a-zA-Z0-9._-]/g, '-').slice(-80);
  const path = `${safeReference}/${kind}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeName}`;
  const { error } = await supabase.storage.from('car-authorization-assets').upload(path, buffer, { contentType: mimeType, upsert: false });
  throwDb(error, 'Unable to upload image');
  const { data } = supabase.storage.from('car-authorization-assets').getPublicUrl(path);
  return { imageUrl: data.publicUrl, storagePath: path };
}

export default {
  listReservations,
  listAuthorizations,
  getReservation,
  listRentalCompanies,
  createCarReservation,
  updateCarReservation,
  saveAuthorizationDraft,
  prepareAuthorizationForSend,
  markAuthorizationSent,
  resetAuthorizationSendPreparation,
  createAuthorizationRevision,
  getPublicAuthorization,
  acceptPublicAuthorization,
  markReservationBooked,
  saveUploadedAsset,
  buildFinalAcknowledgement
};
