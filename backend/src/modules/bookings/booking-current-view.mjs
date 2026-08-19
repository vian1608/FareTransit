import { buildCanonicalItinerary } from '../../shared/utils/airline-lookup.mjs';

const clean = value => value === null || value === undefined ? '' : String(value).trim();
const numeric = value => { const n = Number(value); return Number.isFinite(n) ? n : null; };

function latestPayment(record) {
  const rows = Array.isArray(record.payments) ? [...record.payments] : [];
  rows.sort((a, b) => new Date(b.payment_date || b.paid_at || b.created_at || 0) - new Date(a.payment_date || a.paid_at || a.created_at || 0));
  return rows[0] || null;
}

function orderedTravellers(record) {
  const rows = Array.isArray(record.travellers) ? record.travellers : (Array.isArray(record.passengers) ? record.passengers : []);
  return [...rows].sort((a, b) => {
    const primaryDelta = Number(Boolean(b.is_primary ?? b.isPrimary)) - Number(Boolean(a.is_primary ?? a.isPrimary));
    if (primaryDelta) return primaryDelta;
    const aSeq = Number(a.passenger_sequence ?? a.passengerSequence ?? Number.MAX_SAFE_INTEGER);
    const bSeq = Number(b.passenger_sequence ?? b.passengerSequence ?? Number.MAX_SAFE_INTEGER);
    if (aSeq !== bSeq) return aSeq - bSeq;
    return new Date(a.created_at || 0) - new Date(b.created_at || 0);
  });
}

export function bookingCurrentView(record = {}) {
  if (!record || typeof record !== 'object') return record;
  const travellers = orderedTravellers(record);
  const contacts = Array.isArray(record.contacts) ? record.contacts : [];
  const traveller = travellers[0] || null;
  const contact = contacts[0] || record.contact || null;
  const payment = latestPayment(record);
  const primaryName = traveller
    ? [traveller.first_name ?? traveller.firstName, traveller.middle_name ?? traveller.middleName, traveller.last_name ?? traveller.lastName].map(clean).filter(Boolean).join(' ')
    : clean(record.passenger_name || record.passengerName);
  const email = clean(contact?.email) || clean(record.email);
  const phone = clean(contact?.phone_number ?? contact?.phoneNumber ?? contact?.phone) || clean(record.phone);
  const customerTotal = numeric(record.customer_price ?? record.customerPrice ?? record.total_amount ?? record.totalAmount);
  const supplierTotal = numeric(record.supplier_price ?? record.supplierPrice ?? record.supplier_fare ?? record.supplierFare ?? record.original_api_price);
  const currency = (clean(record.currency) || 'USD').toUpperCase();
  const paymentStatus = (clean(payment?.payment_status ?? record.payment_status ?? record.paymentStatus) || 'PENDING').toUpperCase();
  const itinerary = buildCanonicalItinerary(record);
  const outbound = Array.isArray(itinerary?.outbound) ? itinerary.outbound : [];
  const first = outbound[0] || {};
  const last = outbound[outbound.length - 1] || first;
  const airline = clean(first.airlineName || first.carrierName || record.airline_name || record.airlineName || record.carrier || record.airline);
  const airlineCode = clean(first.carrierCode || record.airline_code || record.airlineCode).toUpperCase();

  return {
    ...record,
    travellers,
    passengers: travellers,
    passenger_name: primaryName || record.passenger_name,
    passengerName: primaryName || record.passengerName,
    email,
    phone,
    contact: contact ? { ...contact, email, phone } : { email, phone },
    payment_status: paymentStatus,
    paymentStatus,
    customer_price: customerTotal,
    customerPrice: customerTotal,
    total_amount: customerTotal ?? numeric(record.total_amount),
    totalAmount: customerTotal ?? numeric(record.total_amount),
    supplier_price: supplierTotal,
    supplierPrice: supplierTotal,
    currency,
    itinerary,
    carrier: airline || null,
    airline: airline || null,
    airline_name: airline || clean(record.airline_name) || null,
    airlineName: airline || clean(record.airline_name) || null,
    airline_code: airlineCode || clean(record.airline_code) || null,
    airlineCode: airlineCode || clean(record.airline_code) || null,
    origin_code: clean(first.originCode || record.origin_code).toUpperCase() || null,
    destination_code: clean(last.destinationCode || record.destination_code).toUpperCase() || null,
    departure_date: first.departureDate || record.departure_date || null,
    pricing: {
      ...(record.pricing || {}),
      supplierCost: supplierTotal,
      supplierFare: numeric(record.supplier_fare ?? record.supplierFare) ?? supplierTotal,
      taxes: numeric(record.taxes_and_fees ?? record.taxesAndFees ?? record.taxes) ?? 0,
      customerTotal,
      currency
    },
    currentVersion: Number(record.version || 1)
  };
}

export default bookingCurrentView;
