from pathlib import Path


def read(path):
    return Path(path).read_text()


def write(path, value):
    Path(path).write_text(value)


def replace_once(source, search, replacement, label):
    if search not in source:
        raise RuntimeError(f"Patch anchor not found: {label}")
    return source.replace(search, replacement, 1)

# 1) Active admin booking management UI
path = 'frontend/src/features/admin/components/AdminBookingManagementPanel.js'
s = read(path)
s = replace_once(s, """import AdminGdsImportModalV2 from './AdminGdsImportModalV2';
import { canonicalizeSegments, inferLegacyItineraryType, itineraryTypeLabel, normalizeItineraryType, validateJourneyContinuity } from '../../../shared/utils/itineraryArchitecture';""", """import AdminGdsImportModalV2 from './AdminGdsImportModalV2';
import AirlineLogo from '../../../shared/components/AirlineLogo';
import { MAJOR_AIRLINES, getAirlineName, getAirlineLogoUrl } from '../../../shared/utils/airlineCatalog';
import { canonicalizeSegments, inferLegacyItineraryType, itineraryTypeLabel, normalizeItineraryType, validateJourneyContinuity } from '../../../shared/utils/itineraryArchitecture';""", 'admin imports')

s = replace_once(s, """const unwrapBooking = response => response?.booking || response?.data?.booking || response?.data || response || null;
const emailWasSent""", """const unwrapBooking = response => response?.booking || response?.data?.booking || response?.data || response || null;
const inferAirlineCodeFromName = value => {
  const target = text(value).trim().toLowerCase();
  if (!target) return '';
  return Object.entries(MAJOR_AIRLINES).find(([, name]) => text(name).toLowerCase() === target)?.[0] || '';
};
const normalizeMerchantType = (value, merchantName = '', merchantCode = '') => {
  const explicit = text(value).trim().toUpperCase();
  if (['AIRLINE', 'FARETRANSIT', 'OTHER'].includes(explicit)) return explicit;
  if (text(merchantName).trim().toLowerCase() === 'faretransit llc') return 'FARETRANSIT';
  if (text(merchantCode).trim() || inferAirlineCodeFromName(merchantName)) return 'AIRLINE';
  return 'OTHER';
};
const merchantKey = (type, code = '', name = '') => {
  const normalizedType = normalizeMerchantType(type, name, code);
  if (normalizedType === 'AIRLINE') return `AIRLINE:${text(code || inferAirlineCodeFromName(name)).trim().toUpperCase()}`;
  if (normalizedType === 'FARETRANSIT') return 'FARETRANSIT:';
  return `OTHER:${text(name).trim().toLowerCase()}`;
};
const emailWasSent""", 'merchant helpers')

s = replace_once(s, """function SectionMessage({ state }) {
  if (!state?.message) return null;
  return <div className={`abm-message abm-message--${state.type || 'info'}`}>{state.message}</div>;
}

export default function AdminBookingManagementPanel() {""", """function SectionMessage({ state }) {
  if (!state?.message) return null;
  return <div className={`abm-message abm-message--${state.type || 'info'}`}>{state.message}</div>;
}

function PaymentMerchantSelect({ split, options, onSelect }) {
  const inferredType = normalizeMerchantType(split.merchantType, split.merchantName, split.merchantCode);
  const inferredCode = text(split.merchantCode || inferAirlineCodeFromName(split.merchantName)).trim().toUpperCase();
  let selected = options.find(option => option.key === merchantKey(inferredType, inferredCode, split.merchantName));
  if (!selected && split.merchantName) selected = options.find(option => option.name.toLowerCase() === text(split.merchantName).trim().toLowerCase());
  const currentValue = selected?.key || '';
  const airlines = options.filter(option => option.type === 'AIRLINE' && !option.stale);
  const staleAirlines = options.filter(option => option.type === 'AIRLINE' && option.stale);
  const fareTransit = options.find(option => option.type === 'FARETRANSIT');
  const others = options.filter(option => option.type === 'OTHER');

  return (
    <label className="abm-merchant-field">
      <span>Merchant</span>
      <select value={currentValue} onChange={event => onSelect(options.find(option => option.key === event.target.value) || null)}>
        <option value="">Select merchant…</option>
        {airlines.length > 0 && <optgroup label="Airlines in this itinerary">{airlines.map(option => <option key={option.key} value={option.key}>{option.name} ({option.code})</option>)}</optgroup>}
        {staleAirlines.length > 0 && <optgroup label="Saved airline — review">{staleAirlines.map(option => <option key={option.key} value={option.key}>{option.name}{option.code ? ` (${option.code})` : ''} — no longer in itinerary</option>)}</optgroup>}
        {fareTransit && <optgroup label="FareTransit"><option value={fareTransit.key}>{fareTransit.name}</option></optgroup>}
        {others.length > 0 && <optgroup label="Saved merchant">{others.map(option => <option key={option.key} value={option.key}>{option.name}</option>)}</optgroup>}
      </select>
      {selected?.type === 'AIRLINE' && <div className="abm-merchant-preview"><AirlineLogo carrierCode={selected.code} airlineName={selected.name} src={selected.logoUrl} size={24} /><span>{selected.name} <b>{selected.code}</b></span>{selected.stale && <em>Review</em>}</div>}
      {selected?.type === 'FARETRANSIT' && <div className="abm-merchant-preview"><span className="abm-ft-mark">FT</span><span>FareTransit LLC</span></div>}
    </label>
  );
}

export default function AdminBookingManagementPanel() {""", 'merchant selector component')

s = replace_once(s, """    setPaymentSplits((next.payment_splits || next.paymentSplits || []).map((split, index) => ({
      _key: split.id || `split-${Date.now()}-${index}`,
      merchantName: split.merchant_name || split.merchantName || '',
      amount: text(split.amount)
    })));""", """    setPaymentSplits((next.payment_splits || next.paymentSplits || []).map((split, index) => ({
      _key: split.id || `split-${Date.now()}-${index}`,
      merchantName: split.merchant_name || split.merchantName || '',
      merchantType: normalizeMerchantType(split.merchant_type || split.merchantType, split.merchant_name || split.merchantName, split.merchant_code || split.merchantCode),
      merchantCode: text(split.merchant_code || split.merchantCode || inferAirlineCodeFromName(split.merchant_name || split.merchantName)).toUpperCase(),
      logoUrl: split.logo_url || split.logoUrl || '',
      stale: Boolean(split.stale),
      currency: split.currency || next.currency || 'USD',
      amount: text(split.amount)
    })));""", 'hydrate payment splits')

s = replace_once(s, """      const responseBooking = unwrapBooking(response);
      if (responseBooking?.id) hydrate(responseBooking);
      else await load();""", """      const responseBooking = unwrapBooking(response);
      // Always reload the complete booking after a mutation. Compact mutation payloads
      // must never wipe relationship data such as persisted payment splits.
      const freshBooking = await load();
      if (!freshBooking?.id && responseBooking?.id) hydrate(responseBooking);""", 'full post-save reload')

s = replace_once(s, """  const savePayment = () => {""", """  const paymentMerchantOptions = useMemo(() => {
    const options = new Map();
    const serverOptions = booking?.availablePaymentMerchants || booking?.available_payment_merchants || [];
    serverOptions.forEach(option => {
      const type = normalizeMerchantType(option.merchantType || option.merchant_type || option.type, option.merchantName || option.merchant_name || option.name, option.merchantCode || option.merchant_code || option.code);
      const code = text(option.merchantCode || option.merchant_code || option.code).trim().toUpperCase();
      const name = text(option.merchantName || option.merchant_name || option.name || (code ? getAirlineName(code) : '')).trim();
      if (!name) return;
      const key = merchantKey(type, code, name);
      options.set(key, { key, type, code, name, logoUrl: option.logoUrl || option.logo_url || (type === 'AIRLINE' ? getAirlineLogoUrl(code) : ''), stale: Boolean(option.stale) });
    });
    segments.forEach(segment => {
      const code = text(segment.carrier_code || segment.marketing_carrier_code || segment.airlineCode).trim().toUpperCase();
      if (!code) return;
      const name = text(segment.carrier_name || segment.airline_name || segment.airlineName || getAirlineName(code)).trim() || getAirlineName(code);
      const key = `AIRLINE:${code}`;
      options.set(key, { key, type: 'AIRLINE', code, name, logoUrl: getAirlineLogoUrl(code), stale: false });
    });
    options.set('FARETRANSIT:', { key: 'FARETRANSIT:', type: 'FARETRANSIT', code: '', name: 'FareTransit LLC', logoUrl: '', stale: false });
    paymentSplits.forEach(split => {
      const name = text(split.merchantName).trim();
      if (!name) return;
      let type = normalizeMerchantType(split.merchantType, name, split.merchantCode);
      let code = text(split.merchantCode || inferAirlineCodeFromName(name)).trim().toUpperCase();
      const nameMatch = [...options.values()].find(option => option.type === 'AIRLINE' && option.name.toLowerCase() === name.toLowerCase());
      if (nameMatch) { type = 'AIRLINE'; code = nameMatch.code; }
      const key = merchantKey(type, code, name);
      if (!options.has(key)) options.set(key, { key, type, code, name, logoUrl: type === 'AIRLINE' ? getAirlineLogoUrl(code) : '', stale: type === 'AIRLINE' });
    });
    return [...options.values()];
  }, [booking, segments, paymentSplits]);

  const resolvePaymentMerchant = split => {
    const type = normalizeMerchantType(split.merchantType, split.merchantName, split.merchantCode);
    const code = text(split.merchantCode || inferAirlineCodeFromName(split.merchantName)).trim().toUpperCase();
    return paymentMerchantOptions.find(option => option.key === merchantKey(type, code, split.merchantName))
      || paymentMerchantOptions.find(option => option.name.toLowerCase() === text(split.merchantName).trim().toLowerCase())
      || null;
  };

  const stalePaymentSplits = paymentSplits.filter(split => resolvePaymentMerchant(split)?.stale || split.stale);

  const savePayment = () => {""", 'payment merchant options')

s = replace_once(s, """    const splits = paymentSplits.map(split => ({ merchantName: split.merchantName.trim(), amount: num(split.amount, NaN) }));
    if (splits.some(split => !split.merchantName || !Number.isFinite(split.amount) || split.amount <= 0)) {""", """    const splits = paymentSplits.map(split => {
      const merchant = resolvePaymentMerchant(split);
      return {
        merchantName: text(merchant?.name || split.merchantName).trim(),
        merchantType: merchant?.type || normalizeMerchantType(split.merchantType, split.merchantName, split.merchantCode),
        merchantCode: text(merchant?.code || split.merchantCode || inferAirlineCodeFromName(split.merchantName)).trim().toUpperCase() || null,
        currency: pricingForm.currency || 'USD',
        amount: num(split.amount, NaN)
      };
    });
    if (splits.some(split => !split.merchantName || !split.merchantType || !Number.isFinite(split.amount) || split.amount <= 0)) {""", 'structured payment save')

s = replace_once(s, """          <button className="abm-button abm-button--secondary" type="button" onClick={() => setPaymentSplits(current => [...current, { _key: `split-${Date.now()}`, merchantName: 'FareTransit LLC', amount: '0.00' }])}>+ Add Payment Split</button>
          {!paymentSplits.length && num(pricingForm.customerTotal, 0) > 0 && <button className="abm-button abm-button--secondary" type="button" onClick={() => setPaymentSplits([{ _key: `split-${Date.now()}`, merchantName: 'FareTransit LLC', amount: num(pricingForm.customerTotal, 0).toFixed(2) }])}>Use Customer Total as One Split</button>}""", """          <button className="abm-button abm-button--secondary" type="button" onClick={() => setPaymentSplits(current => [...current, { _key: `split-${Date.now()}`, merchantName: '', merchantType: '', merchantCode: '', amount: '0.00' }])}>+ Add Payment Split</button>
          {!paymentSplits.length && num(pricingForm.customerTotal, 0) > 0 && <button className="abm-button abm-button--secondary" type="button" onClick={() => setPaymentSplits([{ _key: `split-${Date.now()}`, merchantName: 'FareTransit LLC', merchantType: 'FARETRANSIT', merchantCode: '', amount: num(pricingForm.customerTotal, 0).toFixed(2) }])}>Use Customer Total as One Split</button>}""", 'split add controls')

old_rows = '''{paymentSplits.map((split, index) => <div className="abm-split-row" key={split._key || index}><label><span>Merchant</span><input value={split.merchantName} onChange={event => setPaymentSplits(current => current.map((item, idx) => idx === index ? { ...item, merchantName: event.target.value } : item))} /></label><label><span>Amount</span><input inputMode="decimal" value={split.amount} onChange={event => setPaymentSplits(current => current.map((item, idx) => idx === index ? { ...item, amount: event.target.value } : item))} /></label><button className="abm-button abm-button--danger" type="button" onClick={() => setPaymentSplits(current => current.filter((_, idx) => idx !== index))}>Remove</button></div>)}'''
new_rows = '''{paymentSplits.map((split, index) => <div className="abm-split-row" key={split._key || index}><PaymentMerchantSelect split={split} options={paymentMerchantOptions} onSelect={merchant => setPaymentSplits(current => current.map((item, idx) => idx === index ? { ...item, merchantName: merchant?.name || '', merchantType: merchant?.type || '', merchantCode: merchant?.code || '', logoUrl: merchant?.logoUrl || '', stale: Boolean(merchant?.stale) } : item))} /><label><span>Amount</span><input inputMode="decimal" value={split.amount} onChange={event => setPaymentSplits(current => current.map((item, idx) => idx === index ? { ...item, amount: event.target.value } : item))} /></label><button className="abm-button abm-button--danger" type="button" onClick={() => setPaymentSplits(current => current.filter((_, idx) => idx !== index))}>Remove</button></div>)}'''
s = replace_once(s, old_rows, new_rows, 'merchant input rows')

s = replace_once(s, """          <div className="abm-note">Split total: {money(paymentSplits.reduce((sum, split) => sum + num(split.amount, 0), 0))} · Booking total: {money(pricingForm.customerTotal)}</div>
          <SectionMessage state={messages.payment} />""", """          <div className="abm-note">Split total: {money(paymentSplits.reduce((sum, split) => sum + num(split.amount, 0), 0), pricingForm.currency)} · Booking total: {money(pricingForm.customerTotal, pricingForm.currency)}</div>
          {stalePaymentSplits.length > 0 && <div className="abm-message abm-message--warning">⚠ The itinerary airlines changed after these payment splits were saved. Review {stalePaymentSplits.map(split => split.merchantName).filter(Boolean).join(', ')} before sending authorization. Existing splits were kept unchanged.</div>}
          <SectionMessage state={messages.payment} />""", 'stale split warning')
write(path, s)

# 2) Admin detail read path: historical authorization table first, mirror table second.
path = 'backend/src/modules/admin/admin-booking-read.repository.mjs'
s = read(path)
s = replace_once(s, "const SPLIT_COLUMNS = 'id,booking_id,merchant_name,amount,currency,created_at,updated_at';", """const SPLIT_COLUMNS = 'id,booking_id,merchant_name,merchant_type,merchant_code,amount,currency,display_order,created_at,updated_at,removed_at';
const SPLIT_CORE_COLUMNS = 'id,booking_id,merchant_name,amount,currency,display_order,created_at,updated_at,removed_at';
const LEGACY_SPLIT_COLUMNS = 'id,booking_id,merchant_name,amount,currency,created_at,updated_at';""", 'split column contracts')

s = replace_once(s, 'async function loadDetailRelations(bookingId) {', """async function loadPaymentSplits(bookingId) {
  const legacy = await safeResult(
    supabase.from('payment_authorization_splits').select(LEGACY_SPLIT_COLUMNS).eq('booking_id', bookingId).order('created_at', { ascending: true }),
    []
  );
  if ((legacy.data || []).length) return { data: legacy.data.map((row, index) => ({ ...row, display_order: index + 1, _source: 'payment_authorization_splits' })), error: null };

  let canonical = await safeResult(
    supabase.from('booking_payment_splits').select(SPLIT_COLUMNS).eq('booking_id', bookingId).is('removed_at', null).order('display_order', { ascending: true }),
    []
  );
  if (canonical.error && isSchemaDrift(canonical.error)) {
    canonical = await safeResult(
      supabase.from('booking_payment_splits').select(SPLIT_CORE_COLUMNS).eq('booking_id', bookingId).is('removed_at', null).order('display_order', { ascending: true }),
      []
    );
  }
  return { data: canonical.data || [], error: canonical.error || legacy.error || null };
}

async function loadDetailRelations(bookingId) {""", 'load payment splits helper')

s = replace_once(s, "safeResult(supabase.from('booking_payment_splits').select(SPLIT_COLUMNS).eq('booking_id', bookingId).order('created_at', { ascending: true }), [])", 'loadPaymentSplits(bookingId)', 'admin split relation read')
write(path, s)

# 3) Canonical view builds available merchants and stale split warnings.
path = 'backend/src/modules/bookings/booking-current-view.mjs'
s = read(path)
s = replace_once(s, "import { buildCanonicalItinerary } from '../../shared/utils/airline-lookup.mjs';", "import { buildCanonicalItinerary, getAirlineName, getCarrierLogoUrl } from '../../shared/utils/airline-lookup.mjs';", 'current view airline imports')
s = replace_once(s, 'function orderedTravellers(record) {', """function paymentMerchantContext(record) {
  const segments = Array.isArray(record.itinerary_segments) && record.itinerary_segments.length ? record.itinerary_segments : (Array.isArray(record.flights) ? record.flights : []);
  const airlines = new Map();
  segments.forEach(segment => {
    const code = clean(segment.carrier_code || segment.marketing_carrier_code || segment.airline_code).toUpperCase();
    if (!code) return;
    const name = clean(segment.carrier_name || segment.airline_name) || getAirlineName(code);
    airlines.set(code, { merchantType: 'AIRLINE', merchant_type: 'AIRLINE', merchantCode: code, merchant_code: code, merchantName: name, merchant_name: name, logoUrl: getCarrierLogoUrl(code), logo_url: getCarrierLogoUrl(code), stale: false });
  });
  const available = [...airlines.values(), { merchantType: 'FARETRANSIT', merchant_type: 'FARETRANSIT', merchantCode: null, merchant_code: null, merchantName: 'FareTransit LLC', merchant_name: 'FareTransit LLC', logoUrl: null, logo_url: null, stale: false }];
  const rawSplits = Array.isArray(record.payment_splits) ? record.payment_splits : (Array.isArray(record.paymentSplits) ? record.paymentSplits : []);
  const byName = new Map([...airlines.values()].map(item => [clean(item.merchantName).toLowerCase(), item]));
  const enriched = rawSplits.map(split => {
    const name = clean(split.merchant_name || split.merchantName);
    let type = clean(split.merchant_type || split.merchantType).toUpperCase();
    let code = clean(split.merchant_code || split.merchantCode).toUpperCase();
    if (!type && name.toLowerCase() === 'faretransit llc') type = 'FARETRANSIT';
    const nameMatch = byName.get(name.toLowerCase());
    if (nameMatch) { type = 'AIRLINE'; code = nameMatch.merchantCode; }
    if (!type) type = code ? 'AIRLINE' : 'OTHER';
    const stale = type === 'AIRLINE' && Boolean(code) && !airlines.has(code);
    return { ...split, merchant_type: type, merchantType: type, merchant_code: code || null, merchantCode: code || null, merchant_name: name, merchantName: name, logo_url: type === 'AIRLINE' && code ? getCarrierLogoUrl(code) : null, logoUrl: type === 'AIRLINE' && code ? getCarrierLogoUrl(code) : null, stale };
  });
  const staleNames = enriched.filter(split => split.stale).map(split => split.merchantName).filter(Boolean);
  return { available, splits: enriched, warnings: staleNames.length ? [`Itinerary airlines changed after payment splits were saved. Review: ${staleNames.join(', ')}.`] : [] };
}

function orderedTravellers(record) {""", 'payment merchant context')
s = replace_once(s, """  const airlineCode = clean(first.carrierCode || record.airline_code || record.airlineCode).toUpperCase();

  return {""", """  const airlineCode = clean(first.carrierCode || record.airline_code || record.airlineCode).toUpperCase();
  const paymentMerchant = paymentMerchantContext(record);

  return {""", 'current view context call')
s = replace_once(s, """    currency,
    itinerary,""", """    currency,
    itinerary,
    payment_splits: paymentMerchant.splits,
    paymentSplits: paymentMerchant.splits,
    available_payment_merchants: paymentMerchant.available,
    availablePaymentMerchants: paymentMerchant.available,
    payment_split_warnings: paymentMerchant.warnings,
    paymentSplitWarnings: paymentMerchant.warnings,""", 'current view merchant output')
write(path, s)

# 4) Transitional dual-write to keep old authorization and admin detail stores aligned.
path = 'backend/src/modules/bookings/booking.repository.mjs'
s = read(path)
s = replace_once(s, """const emailDeliveriesMemoryStore = new Map();


export const bookingRepository = {""", """const emailDeliveriesMemoryStore = new Map();

const splitMerchantType = (split = {}) => {
  const explicit = String(split.merchant_type || split.merchantType || '').trim().toUpperCase();
  if (['AIRLINE', 'FARETRANSIT', 'OTHER'].includes(explicit)) return explicit;
  if (String(split.merchant_name || split.merchantName || '').trim().toLowerCase() === 'faretransit llc') return 'FARETRANSIT';
  return String(split.merchant_code || split.merchantCode || '').trim() ? 'AIRLINE' : 'OTHER';
};

async function mirrorBookingPaymentSplits(bookingId, splits = [], defaultCurrency = 'USD') {
  try {
    await supabase.from('booking_payment_splits').delete().eq('booking_id', bookingId);
    if (!splits.length) return;
    const structured = splits.map((split, index) => ({
      booking_id: bookingId,
      merchant_name: String(split.merchant_name || split.merchantName || '').trim(),
      merchant_type: splitMerchantType(split),
      merchant_code: String(split.merchant_code || split.merchantCode || '').trim().toUpperCase() || null,
      amount: Math.round(Number(split.amount || 0) * 100) / 100,
      currency: String(split.currency || defaultCurrency || 'USD').toUpperCase(),
      display_order: index + 1,
      updated_at: new Date().toISOString()
    }));
    let result = await supabase.from('booking_payment_splits').insert(structured);
    if (result.error && (String(result.error.message).includes('schema cache') || String(result.error.message).includes('column'))) {
      const compatible = structured.map(({ merchant_type, merchant_code, ...row }) => row);
      result = await supabase.from('booking_payment_splits').insert(compatible);
    }
    if (result.error) logger.warn(`[PaymentSplits] mirror warning: ${result.error.message}`);
  } catch (error) {
    logger.warn(`[PaymentSplits] mirror warning: ${error.message}`);
  }
}

export const bookingRepository = {""", 'payment split mirror helper')
s = replace_once(s, """      return formatted;
    } catch (e) {
      logger.warn(`savePaymentSplits notice: ${e.message}`);""", """      await mirrorBookingPaymentSplits(realId, splits, booking?.currency || 'USD');
      return formatted;
    } catch (e) {
      logger.warn(`savePaymentSplits notice: ${e.message}`);""", 'savePaymentSplits mirror')
s = replace_once(s, """      logger.info(`[Transaction] --- updatePaymentSplitsAndTotal END ---`);

      // Return refreshed full booking representation""", """      await mirrorBookingPaymentSplits(realId, splitsInput, booking.currency || 'USD');
      logger.info(`[Transaction] --- updatePaymentSplitsAndTotal END ---`);

      // Return refreshed full booking representation""", 'updatePaymentSplitsAndTotal mirror')
write(path, s)

# 5) UI styling.
path = 'frontend/src/features/admin/components/AdminBookingManagementPanel.css'
s = read(path)
anchor = """.abm-message--error {
  color: #9f1239;
  background: #fff1f2;
  border: 1px solid #fecdd3;
}
"""
addition = anchor + """
.abm-message--warning {
  color: #7a4b00;
  background: #fff8e7;
  border: 1px solid #efd38a;
}

.abm-merchant-preview {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  margin-top: 6px;
  color: #475569;
  font-size: 12px;
}

.abm-merchant-preview em {
  margin-left: auto;
  color: #9a6200;
  font-style: normal;
  font-weight: 800;
}

.abm-ft-mark {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #8d153a;
  color: #fff;
  font-size: 9px;
  font-weight: 900;
}
"""
s = replace_once(s, anchor, addition, 'payment split styles')
write(path, s)

# 6) Additive migration and contract test.
Path('backend/migrations/128_structured_payment_split_merchants.sql').write_text("""-- Structured merchant identity for airline-aware payment splits.
ALTER TABLE public.booking_payment_splits ADD COLUMN IF NOT EXISTS merchant_type varchar(20), ADD COLUMN IF NOT EXISTS merchant_code varchar(10);
ALTER TABLE public.payment_authorization_splits ADD COLUMN IF NOT EXISTS merchant_type varchar(20), ADD COLUMN IF NOT EXISTS merchant_code varchar(10);
UPDATE public.booking_payment_splits SET merchant_type = 'FARETRANSIT' WHERE merchant_type IS NULL AND lower(trim(merchant_name)) = 'faretransit llc';
UPDATE public.payment_authorization_splits SET merchant_type = 'FARETRANSIT' WHERE merchant_type IS NULL AND lower(trim(merchant_name)) = 'faretransit llc';
UPDATE public.booking_payment_splits ps SET merchant_type = 'AIRLINE', merchant_code = upper(s.carrier_code) FROM public.booking_itinerary_segments s WHERE ps.booking_id = s.booking_id AND ps.merchant_type IS NULL AND nullif(trim(s.carrier_code), '') IS NOT NULL AND lower(trim(ps.merchant_name)) = lower(trim(coalesce(s.carrier_name, '')));
UPDATE public.payment_authorization_splits ps SET merchant_type = 'AIRLINE', merchant_code = upper(s.carrier_code) FROM public.booking_itinerary_segments s WHERE ps.booking_id = s.booking_id AND ps.merchant_type IS NULL AND nullif(trim(s.carrier_code), '') IS NOT NULL AND lower(trim(ps.merchant_name)) = lower(trim(coalesce(s.carrier_name, '')));
UPDATE public.booking_payment_splits SET merchant_type = 'OTHER' WHERE merchant_type IS NULL;
UPDATE public.payment_authorization_splits SET merchant_type = 'OTHER' WHERE merchant_type IS NULL;
CREATE INDEX IF NOT EXISTS idx_booking_payment_splits_merchant ON public.booking_payment_splits(booking_id, merchant_type, merchant_code);
CREATE INDEX IF NOT EXISTS idx_payment_authorization_splits_merchant ON public.payment_authorization_splits(booking_id, merchant_type, merchant_code);
NOTIFY pgrst, 'reload schema';
""")

Path('backend/tests/payment_split_merchant_architecture.test.mjs').write_text("""import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const panel = fs.readFileSync('frontend/src/features/admin/components/AdminBookingManagementPanel.js', 'utf8');
const readRepo = fs.readFileSync('backend/src/modules/admin/admin-booking-read.repository.mjs', 'utf8');
const currentView = fs.readFileSync('backend/src/modules/bookings/booking-current-view.mjs', 'utf8');
const bookingRepo = fs.readFileSync('backend/src/modules/bookings/booking.repository.mjs', 'utf8');
test('airline-aware payment split architecture', () => {
  assert.match(panel, /Airlines in this itinerary/);
  assert.match(panel, /PaymentMerchantSelect/);
  assert.match(panel, /availablePaymentMerchants/);
  assert.match(panel, /merchantType/);
  assert.match(panel, /merchantCode/);
  assert.match(panel, /freshBooking = await load/);
  assert.match(panel, /Existing splits were kept unchanged/);
  assert.match(readRepo, /payment_authorization_splits/);
  assert.match(readRepo, /booking_payment_splits/);
  assert.match(currentView, /available_payment_merchants/);
  assert.match(currentView, /payment_split_warnings/);
  assert.match(bookingRepo, /mirrorBookingPaymentSplits/);
});
""")

print('Payment split merchant architecture patch applied.')
