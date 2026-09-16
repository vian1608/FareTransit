import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import supabase from '../../config/supabase.mjs';

function clean(value) {
  return String(value ?? '').trim();
}

function money(value, currency = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: String(currency || 'USD').toUpperCase() }).format(Number(value || 0));
  } catch {
    return `$${Number(value || 0).toFixed(2)}`;
  }
}

function fmtDate(value) {
  if (!value) return 'Not recorded';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString().replace('T', ' ').replace('.000Z', ' UTC');
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function evidenceHash(payload) {
  return crypto.createHash('sha256').update(stableStringify(payload || {})).digest('hex');
}

function addHeading(doc, text) {
  doc.moveDown(0.7).font('Helvetica-Bold').fontSize(13).fillColor('#102d54').text(text);
  doc.moveDown(0.25).strokeColor('#dfe6f0').lineWidth(0.7).moveTo(doc.x, doc.y).lineTo(555, doc.y).stroke();
  doc.moveDown(0.45).fillColor('#172033').font('Helvetica').fontSize(10);
}

function row(doc, label, value) {
  const left = 52;
  const labelWidth = 155;
  const valueX = left + labelWidth;
  const y = doc.y;
  doc.font('Helvetica-Bold').fillColor('#475569').text(label, left, y, { width: labelWidth - 10 });
  doc.font('Helvetica').fillColor('#172033').text(clean(value) || '—', valueX, y, { width: 348 });
  doc.y = Math.max(doc.y, y + 15);
  doc.moveDown(0.15);
}

async function loadAcceptedEvidence(reference) {
  const normalized = clean(reference).toUpperCase();
  const { data: reservation, error: reservationError } = await supabase
    .from('reservations')
    .select('id,booking_reference,service_type,reservation_status,authorization_status,customer_name,customer_email,currency,total_amount')
    .eq('booking_reference', normalized)
    .maybeSingle();
  if (reservationError) throw reservationError;
  if (!reservation) {
    const error = new Error(`Reservation ${normalized} was not found.`);
    error.statusCode = 404;
    error.code = 'RESERVATION_NOT_FOUND';
    throw error;
  }

  const { data: authorization, error: authorizationError } = await supabase
    .from('authorizations')
    .select('*')
    .eq('reservation_id', reservation.id)
    .eq('status', 'AUTHORIZED')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (authorizationError) throw authorizationError;
  if (!authorization) {
    const error = new Error('No accepted authorization evidence is available for this reservation yet.');
    error.statusCode = 409;
    error.code = 'AUTHORIZATION_EVIDENCE_NOT_AVAILABLE';
    throw error;
  }

  const evidence = authorization.evidence_payload || {};
  if (!evidence.authorizedAt && !authorization.authorized_at) {
    const error = new Error('The authorization record does not contain an acceptance event.');
    error.statusCode = 409;
    error.code = 'AUTHORIZATION_EVIDENCE_INCOMPLETE';
    throw error;
  }

  return { reservation, authorization, evidence };
}

export async function buildCarAuthorizationEvidencePdf(reference) {
  const { reservation, authorization, evidence } = await loadAcceptedEvidence(reference);
  const customer = evidence.customer || authorization.customer_snapshot || {};
  const billing = evidence.billing || authorization.billing_snapshot || {};
  const service = evidence.service || {};
  const car = service.car || authorization.service_snapshot?.car || {};
  const payment = evidence.payment || {};
  const transactions = Array.isArray(payment.transactions) ? payment.transactions : [];
  const terms = evidence.terms || authorization.terms_snapshot || {};
  const hash = evidenceHash(evidence);

  const doc = new PDFDocument({ size: 'LETTER', margin: 52, info: {
    Title: `FareTransit Authorization Evidence ${reservation.booking_reference}`,
    Author: 'FareTransit',
    Subject: 'Customer authorization evidence'
  }});
  const chunks = [];
  doc.on('data', chunk => chunks.push(chunk));
  const completed = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc.font('Helvetica-Bold').fontSize(22).fillColor('#102d54').text('FareTransit');
  doc.fontSize(16).fillColor('#172033').text('Customer Authorization Evidence');
  doc.moveDown(0.3).font('Helvetica').fontSize(9).fillColor('#64748b')
    .text('Generated from the authorization snapshot stored when the customer accepted the request.');

  addHeading(doc, 'Evidence record');
  row(doc, 'Booking ID', reservation.booking_reference);
  row(doc, 'Authorization ID', authorization.id);
  row(doc, 'Authorization version', authorization.version);
  row(doc, 'Status', authorization.status);
  row(doc, 'Sent to', authorization.sent_to_email || customer.email);
  row(doc, 'Sent at', fmtDate(authorization.sent_at));
  row(doc, 'Viewed at', fmtDate(authorization.viewed_at));
  row(doc, 'Authorized at', fmtDate(evidence.authorizedAt || authorization.authorized_at));
  row(doc, 'Acceptance action', evidence.actionLabel || 'I AUTHORIZE TO PAY');
  row(doc, 'IP address', evidence.ipAddress || authorization.authorized_ip);
  row(doc, 'User agent', evidence.userAgent || authorization.authorized_user_agent);
  row(doc, 'Evidence SHA-256', hash);

  addHeading(doc, 'Customer');
  row(doc, 'Name', customer.fullName || reservation.customer_name);
  row(doc, 'Email', customer.email || reservation.customer_email);
  row(doc, 'Phone', customer.phone);
  row(doc, 'Date of birth', customer.dateOfBirth);

  addHeading(doc, 'Rental details');
  row(doc, 'Rental company', car.rental_company_name);
  row(doc, 'Vehicle', car.vehicle_name || car.vehicle_category);
  row(doc, 'Pickup', `${clean(car.pickup_location)}${car.pickup_at ? ` — ${fmtDate(car.pickup_at)}` : ''}`);
  row(doc, 'Drop-off', `${clean(car.dropoff_location)}${car.dropoff_at ? ` — ${fmtDate(car.dropoff_at)}` : ''}`);
  if (car.mileage_policy) row(doc, 'Mileage policy', car.mileage_policy);
  if (car.fuel_policy) row(doc, 'Fuel policy', car.fuel_policy);

  addHeading(doc, 'Payment authorization');
  row(doc, 'Total authorized', money(payment.totalAmount ?? authorization.total_amount, payment.currency || authorization.currency));
  row(doc, 'Payment card', `${clean(billing.card_brand || 'Card')} ending ${clean(billing.card_last4 || '----')}`);
  row(doc, 'Cardholder', billing.cardholder_name);
  transactions.forEach((item, index) => {
    const method = String(item.collection_method || item.collectionMethod || 'PAY_NOW').toUpperCase() === 'PAY_AT_COUNTER' ? 'Pay at counter' : 'Pay now';
    row(doc, `Transaction ${index + 1}`, `${money(item.amount, item.currency || authorization.currency)} — ${clean(item.merchant_name || item.merchantName)} — ${method}${item.description ? ` — ${clean(item.description)}` : ''}`);
  });

  addHeading(doc, 'Customer acknowledgement');
  doc.font('Helvetica').fontSize(10).fillColor('#172033').text(clean(evidence.acknowledgement || authorization.final_acknowledgement) || '—', { align: 'left', lineGap: 2 });

  addHeading(doc, `Terms & Conditions${terms.version ? ` (${clean(terms.version)})` : ''}`);
  doc.font('Helvetica').fontSize(8.5).fillColor('#334155').text(clean(terms.text) || 'No terms snapshot was stored.', { lineGap: 1.5 });

  doc.moveDown(1).font('Helvetica').fontSize(8).fillColor('#64748b')
    .text('This evidence document intentionally contains only masked payment-card information. FareTransit does not include a full card number or CVV in this PDF.');

  doc.end();
  const buffer = await completed;
  return {
    buffer,
    filename: `FareTransit-Authorization-${reservation.booking_reference}-v${authorization.version}.pdf`,
    authorizationId: authorization.id,
    version: authorization.version,
    evidenceHash: hash
  };
}

export default { buildCarAuthorizationEvidencePdf };
