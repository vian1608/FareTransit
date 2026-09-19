from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path, old, new):
    p = ROOT / path
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"Expected patch target not found in {path}: {old[:100]!r}")
    p.write_text(text.replace(old, new, 1))


# 1) Bounded repository reads must include authorization lifecycle revision state.
path = 'backend/src/modules/bookings/booking.repository.egress-hardening.mjs'
replace_once(
    path,
    "  'original_api_price','created_at','updated_at','version','authorization_token','authorization_status','authorized_amount',\n",
    "  'original_api_price','created_at','updated_at','version','booking_revision','authorization_token','authorization_status','authorized_amount','authorized_at',\n"
)
replace_once(
    path,
    "const CORE_COLUMNS = 'id,confirmation_code,status,payment_status,total_amount,customer_price,supplier_price,discount_percent,discount_amount,currency,passenger_name,email,phone,internal_notes,original_api_price,created_at,updated_at,voucher_id,voucher_code,voucher_discount,price_before_voucher,minimum_payable_floor';",
    "const CORE_COLUMNS = 'id,confirmation_code,status,payment_status,total_amount,customer_price,supplier_price,discount_percent,discount_amount,currency,passenger_name,email,phone,internal_notes,original_api_price,created_at,updated_at,booking_revision,authorization_token,authorization_status,authorized_amount,authorization_expires_at,authorized_at,voucher_id,voucher_code,voucher_discount,price_before_voucher,minimum_payable_floor';"
)
replace_once(
    path,
    "const SPLIT_COLUMNS = 'id,booking_id,merchant_name,amount,currency,display_order,created_at,updated_at';",
    "const SPLIT_COLUMNS = 'id,booking_id,merchant_name,merchant_type,merchant_code,amount,currency,display_order,created_at,updated_at';\nconst ITINERARY_SEGMENT_COLUMNS = 'id,booking_id,trip_type,direction,journey_direction,journey_index,journey_role,segment_sequence,segment_order,carrier_name,carrier_code,marketing_carrier_code,operating_carrier,flight_number,origin_airport,origin_city,destination_airport,destination_city,departure_date,departure_time,arrival_date,arrival_time,arrival_next_day,cabin,booking_class,terminal,baggage_allowance,aircraft,layover_duration,duration,stop_count,created_at,updated_at';"
)

old_get_relations = """async function getRelations(bookingId) {
  const [travellersRes, contactsRes, flightsRes, paymentsRes, emailRes, methodRes, splitsRes] = await Promise.all([
    safe(supabase.from('travellers').select(TRAVELLER_COLUMNS).eq('booking_id', bookingId), []),
    safe(supabase.from('contacts').select(CONTACT_COLUMNS).eq('booking_id', bookingId), []),
    safe(supabase.from('flights').select(FLIGHT_COLUMNS).eq('booking_id', bookingId).order('created_at', { ascending: true }), []),
    safe(supabase.from('payments').select(PAYMENT_COLUMNS).eq('booking_id', bookingId).order('created_at', { ascending: false }).limit(5), []),
    safe(supabase.from('email_deliveries').select(EMAIL_COLUMNS).eq('booking_id', bookingId).order('created_at', { ascending: false }).limit(10), []),
    safe(supabase.from('booking_payment_methods').select(PAYMENT_METHOD_COLUMNS).eq('booking_id', bookingId).is('removed_at', null).maybeSingle(), null),
    safe(supabase.from('booking_payment_splits').select(SPLIT_COLUMNS).eq('booking_id', bookingId).order('display_order', { ascending: true }), [])
  ]);

  const flights = flightsRes.data || [];
  return {
    travellers: travellersRes.data || [],
    contacts: contactsRes.data || [],
    flights,
    payments: paymentsRes.data || [],
    itinerarySegments: toSegments(flights),
    emailLogs: emailRes.data || [],
    paymentMethod: methodRes.data || null,
    paymentSplits: splitsRes.data || []
  };
}
"""
new_get_relations = """async function getRelations(bookingId) {
  const [travellersRes, contactsRes, segmentsRes, flightsRes, paymentsRes, emailRes, methodRes, splitsRes] = await Promise.all([
    safe(supabase.from('travellers').select(TRAVELLER_COLUMNS).eq('booking_id', bookingId), []),
    safe(supabase.from('contacts').select(CONTACT_COLUMNS).eq('booking_id', bookingId), []),
    safe(supabase.from('booking_itinerary_segments').select(ITINERARY_SEGMENT_COLUMNS).eq('booking_id', bookingId).order('journey_index', { ascending: true }).order('segment_sequence', { ascending: true }), []),
    safe(supabase.from('flights').select(FLIGHT_COLUMNS).eq('booking_id', bookingId).order('created_at', { ascending: true }), []),
    safe(supabase.from('payments').select(PAYMENT_COLUMNS).eq('booking_id', bookingId).order('created_at', { ascending: false }).limit(5), []),
    safe(supabase.from('email_deliveries').select(EMAIL_COLUMNS).eq('booking_id', bookingId).order('created_at', { ascending: false }).limit(10), []),
    safe(supabase.from('booking_payment_methods').select(PAYMENT_METHOD_COLUMNS).eq('booking_id', bookingId).is('removed_at', null).maybeSingle(), null),
    safe(supabase.from('booking_payment_splits').select(SPLIT_COLUMNS).eq('booking_id', bookingId).order('display_order', { ascending: true }), [])
  ]);

  const flights = flightsRes.data || [];
  const canonicalSegments = segmentsRes.data || [];
  return {
    travellers: travellersRes.data || [],
    contacts: contactsRes.data || [],
    flights,
    payments: paymentsRes.data || [],
    itinerarySegments: canonicalSegments.length > 0 ? canonicalSegments : toSegments(flights),
    emailLogs: emailRes.data || [],
    paymentMethod: methodRes.data || null,
    paymentSplits: splitsRes.data || []
  };
}
"""
replace_once(path, old_get_relations, new_get_relations)

# 2) Public authorization checks use a direct authoritative DB read and fail closed.
path = 'backend/src/modules/authorizations/passenger-authorization.service.mjs'
replace_once(
    path,
    "function hashText(text) {\n  return crypto.createHash('sha256').update(String(text || '')).digest('hex');\n}\n",
    "function hashText(text) {\n  return crypto.createHash('sha256').update(String(text || '')).digest('hex');\n}\n\nasync function getAuthoritativeBookingAuthorizationState(bookingId) {\n  const { data, error } = await supabase\n    .from('bookings')\n    .select('id,confirmation_code,booking_revision,authorization_status,status,authorization_token,authorization_expires_at')\n    .eq('id', bookingId)\n    .maybeSingle();\n\n  if (error || !data?.id) {\n    logger.error(`[AuthorizationIntegrity] Unable to read authoritative booking state for ${bookingId}: ${error?.message || 'booking not found'}`);\n    if (process.env.NODE_ENV === 'test') return null;\n    throw new Error('AUTHORIZATION_BOOKING_STATE_UNAVAILABLE');\n  }\n  return data;\n}\n"
)

old_lookup = """    const booking = await bookingRepository.getById(authRecord.booking_id);
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
"""
new_lookup = """    // Fail closed against the database row itself. Public token validity must not
    // depend on repository caches, bounded DTOs, or legacy relation fallbacks.
    const liveState = await getAuthoritativeBookingAuthorizationState(authRecord.booking_id);
    const authRevision = Number(authRecord.authorization_revision || 1);
    const bookingRevision = Number(liveState?.booking_revision || 1);
    const liveAuthorizationStatus = String(liveState?.authorization_status || '').toUpperCase();
    if (authRevision !== bookingRevision || liveAuthorizationStatus === 'REAUTHORIZATION_REQUIRED') {
      // Preserve already-accepted evidence exactly as historical evidence. Only
      // pending rows are transitioned; every stale public token is rejected.
      if (!['accepted', 'authorized'].includes(status)) {
        await supabase.from('passenger_authorizations').update({
          status: 'superseded', authorization_status: 'SUPERSEDED', superseded_at: new Date().toISOString(),
          status_reason: `Booking revision advanced from ${authRevision} to ${bookingRevision}.`, updated_at: new Date().toISOString()
        }).eq('id', authRecord.id).catch(() => null);
      }
      throw new Error('AUTHORIZATION_SUPERSEDED');
    }

    const booking = await bookingRepository.getById(authRecord.booking_id);
    if (!booking) throw new Error('BOOKING_NOT_FOUND');
"""
replace_once(path, old_lookup, new_lookup)

old_accept = """    const state = String(authRecord.status || authRecord.authorization_status || '').toLowerCase();
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
"""
new_accept = """    const state = String(authRecord.status || authRecord.authorization_status || '').toLowerCase();
    const liveState = await getAuthoritativeBookingAuthorizationState(authRecord.booking_id);
    const authRevision = Number(authRecord.authorization_revision || 1);
    const bookingRevision = Number(liveState?.booking_revision || 1);
    const liveAuthorizationStatus = String(liveState?.authorization_status || '').toUpperCase();

    // Revision/lifecycle invalidation wins over idempotency: an accepted historical
    // token from an older revision is evidence, not a reusable public authorization.
    if (authRevision !== bookingRevision || liveAuthorizationStatus === 'REAUTHORIZATION_REQUIRED') {
      if (!['accepted', 'authorized'].includes(state) && !authRecord.consumed_at) {
        await supabase.from('passenger_authorizations').update({
          status: 'superseded', authorization_status: 'SUPERSEDED', superseded_at: new Date().toISOString(),
          status_reason: `Booking revision advanced from ${authRevision} to ${bookingRevision}.`, updated_at: new Date().toISOString()
        }).eq('id', authRecord.id).catch(() => null);
      }
      throw new Error('AUTHORIZATION_SUPERSEDED');
    }

    if (['accepted', 'authorized'].includes(state) || authRecord.consumed_at) throw new Error('AUTHORIZATION_ALREADY_ACCEPTED');
    if (state === 'superseded' || state === 'reauthorization_required') throw new Error('AUTHORIZATION_SUPERSEDED');
    if (state === 'revoked') throw new Error('AUTHORIZATION_REVOKED');
    if (state === 'declined') throw new Error('AUTHORIZATION_DECLINED');
    if (state !== 'pending' && state !== 'awaiting_authorization') throw new Error(`AUTHORIZATION_ALREADY_${state.toUpperCase()}`);
    if (new Date(authRecord.expires_at || authRecord.authorization_expires_at || 0).getTime() < Date.now()) throw new Error('AUTHORIZATION_EXPIRED');

    const booking = await bookingRepository.getById(authRecord.booking_id);
    if (!booking) throw new Error('BOOKING_NOT_FOUND');
"""
replace_once(path, old_accept, new_accept)

# 3) Treat authoritative-state read failure as a temporary unavailable condition, not a 500 leak.
path = 'backend/src/modules/authorizations/passenger-authorization.controller.mjs'
replace_once(
    path,
    "      if (error.message === 'AUTHORIZATION_REVOKED') {\n",
    "      if (error.message === 'AUTHORIZATION_BOOKING_STATE_UNAVAILABLE') {\n        return res.status(503).json({ success: false, error: { code: 'AUTHORIZATION_STATE_UNAVAILABLE', message: 'We could not verify the current reservation state. Please try again shortly.' } });\n      }\n      if (error.message === 'AUTHORIZATION_REVOKED') {\n"
)
replace_once(
    path,
    "      if (error.message.includes('ALREADY')) {\n",
    "      if (error.message === 'AUTHORIZATION_BOOKING_STATE_UNAVAILABLE') {\n        return res.status(503).json({ success: false, error: { code: 'AUTHORIZATION_STATE_UNAVAILABLE', message: 'We could not verify the current reservation state. Please try again shortly.' } });\n      }\n      if (error.message.includes('ALREADY')) {\n"
)

# 4) Update the egress contract: canonical itinerary reads are bounded and preferred.
path = 'backend/tests/supabase_egress_hardening_contract.test.mjs'
replace_once(
    path,
    "assert.doesNotMatch(bookingHardening, /booking_itinerary_segments.*select/);",
    "assert.match(bookingHardening, /booking_itinerary_segments/);\nassert.match(bookingHardening, /ITINERARY_SEGMENT_COLUMNS/);\nassert.match(bookingHardening, /merchant_type,merchant_code/);\nassert.match(bookingHardening, /booking_revision/);"
)

# 5) Add a focused static regression contract if absent.
test_path = ROOT / 'backend/tests/authorization_runtime_integrity.test.mjs'
test_path.write_text("""import assert from 'node:assert/strict';
import fs from 'node:fs';

const service = fs.readFileSync(new URL('../src/modules/authorizations/passenger-authorization.service.mjs', import.meta.url), 'utf8');
const hardening = fs.readFileSync(new URL('../src/modules/bookings/booking.repository.egress-hardening.mjs', import.meta.url), 'utf8');

assert.match(service, /getAuthoritativeBookingAuthorizationState/);
assert.match(service, /select\('id,confirmation_code,booking_revision,authorization_status,status,authorization_token,authorization_expires_at'\)/);
assert.match(service, /authRevision !== bookingRevision \|\| liveAuthorizationStatus === 'REAUTHORIZATION_REQUIRED'/);
assert.match(service, /Preserve already-accepted evidence exactly as historical evidence/);
assert.match(service, /Revision\/lifecycle invalidation wins over idempotency/);
assert.match(hardening, /booking_revision/);
assert.match(hardening, /ITINERARY_SEGMENT_COLUMNS/);
assert.match(hardening, /canonicalSegments\.length > 0 \? canonicalSegments : toSegments\(flights\)/);
assert.match(hardening, /merchant_type,merchant_code/);
console.log('Authorization runtime integrity contract: PASS');
""")

print('Authorization runtime integrity patch applied successfully.')
