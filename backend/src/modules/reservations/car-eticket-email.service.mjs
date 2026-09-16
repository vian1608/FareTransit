import PDFDocument from 'pdfkit';
import supabase from '../../config/supabase.mjs';
import { sendCustomerHtmlEmail } from './car-authorization-email.service.mjs';

function clean(value) {
  return String(value ?? '').trim();
}

function esc(value) {
  return clean(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
}

function safeHttpsImageUrl(value) {
  try {
    const url = new URL(clean(value));
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function money(value, currency = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: clean(currency || 'USD').toUpperCase() || 'USD' }).format(Number(value || 0));
  } catch {
    return `$${Number(value || 0).toFixed(2)}`;
  }
}

function formatDateTime(value) {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return clean(value);
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short'
  }).format(date);
}

function primaryTraveller(bundle) {
  return bundle?.travellers?.find(item => item.role === 'PRIMARY_DRIVER') || bundle?.travellers?.[0] || {};
}

async function resolveCompanyBrand(car = {}) {
  let name = clean(car.rental_company_name);
  let logoUrl = safeHttpsImageUrl(car.rental_company_logo_url);
  if (logoUrl && name) return { name, logoUrl };

  let query = supabase.from('car_rental_companies').select('display_name,logo_url').eq('active', true);
  if (car.rental_company_id) query = query.eq('id', car.rental_company_id);
  else if (name) query = query.ilike('display_name', name);
  else return { name, logoUrl };

  const { data, error } = await query.limit(1).maybeSingle();
  if (!error && data) {
    name = name || clean(data.display_name);
    logoUrl = logoUrl || safeHttpsImageUrl(data.logo_url);
  }
  return { name, logoUrl };
}

function addHeading(doc, text) {
  doc.moveDown(0.8).font('Helvetica-Bold').fontSize(13).fillColor('#102d54').text(text);
  doc.moveDown(0.25).strokeColor('#dfe6f0').lineWidth(0.7).moveTo(doc.x, doc.y).lineTo(555, doc.y).stroke();
  doc.moveDown(0.45).fillColor('#172033').font('Helvetica').fontSize(10);
}

function row(doc, label, value) {
  const left = 52;
  const labelWidth = 165;
  const valueX = left + labelWidth;
  const y = doc.y;
  doc.font('Helvetica-Bold').fillColor('#475569').text(label, left, y, { width: labelWidth - 10 });
  doc.font('Helvetica').fillColor('#172033').text(clean(value) || '—', valueX, y, { width: 338 });
  doc.y = Math.max(doc.y, y + 15);
  doc.moveDown(0.15);
}

export async function buildCarEticketPdf({ bundle, supplierConfirmation, companyBrand }) {
  const reservation = bundle?.reservation || {};
  const car = bundle?.car || {};
  const traveller = primaryTraveller(bundle);
  const brand = companyBrand || await resolveCompanyBrand(car);
  const doc = new PDFDocument({
    size: 'LETTER',
    margin: 52,
    info: {
      Title: `FareTransit Car E-Ticket ${reservation.booking_reference || ''}`,
      Author: 'FareTransit',
      Subject: 'Car rental reservation confirmation'
    }
  });
  const chunks = [];
  doc.on('data', chunk => chunks.push(chunk));
  const completed = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc.font('Helvetica-Bold').fontSize(22).fillColor('#102d54').text('FareTransit');
  doc.fontSize(16).fillColor('#172033').text('Car Rental E-Ticket / Reservation Confirmation');
  doc.moveDown(0.3).font('Helvetica').fontSize(9).fillColor('#64748b')
    .text('Keep this confirmation with you and present the supplier confirmation number if requested at pickup.');

  addHeading(doc, 'Confirmation');
  row(doc, 'FareTransit booking ID', reservation.booking_reference);
  row(doc, 'Supplier confirmation', supplierConfirmation);
  row(doc, 'Reservation status', 'BOOKED');
  row(doc, 'Rental company', brand.name || car.rental_company_name);

  addHeading(doc, 'Renter');
  row(doc, 'Name', traveller.full_name || reservation.customer_name);
  row(doc, 'Email', traveller.email || reservation.customer_email);
  row(doc, 'Phone', traveller.phone || reservation.customer_phone);

  addHeading(doc, 'Rental details');
  row(doc, 'Vehicle', car.vehicle_name || car.vehicle_category || 'As reserved / similar');
  row(doc, 'Pickup', `${clean(car.pickup_location)}${car.pickup_at ? ` — ${formatDateTime(car.pickup_at)}` : ''}`);
  row(doc, 'Drop-off', `${clean(car.dropoff_location)}${car.dropoff_at ? ` — ${formatDateTime(car.dropoff_at)}` : ''}`);
  if (car.mileage_policy) row(doc, 'Mileage policy', car.mileage_policy);
  if (car.fuel_policy) row(doc, 'Fuel policy', car.fuel_policy);
  row(doc, 'Reservation total', money(reservation.total_amount, reservation.currency));

  addHeading(doc, 'Pickup reminder');
  doc.font('Helvetica').fontSize(9.5).fillColor('#334155').text(
    'The renter must satisfy the rental company’s identification, driver-license, payment-card, age, deposit and eligibility requirements at pickup. Vehicle make/model may be substituted with a similar vehicle when stated in the reservation.',
    { lineGap: 2 }
  );

  doc.moveDown(1).font('Helvetica').fontSize(8.5).fillColor('#64748b').text(
    'FareTransit arranged this reservation. The supplier confirmation number above is the rental company reference for this booking. Contact FareTransit support if any booking detail appears incorrect.'
  );

  doc.end();
  return completed;
}

export async function buildCarEticketEmail({ bundle, supplierConfirmation }) {
  const reservation = bundle?.reservation || {};
  const car = bundle?.car || {};
  const traveller = primaryTraveller(bundle);
  const companyBrand = await resolveCompanyBrand(car);
  const companyName = companyBrand.name || clean(car.rental_company_name) || 'Rental company';
  const companyLogo = safeHttpsImageUrl(companyBrand.logoUrl);
  const bookingReference = clean(reservation.booking_reference);
  const recipient = clean(traveller.email || reservation.customer_email).toLowerCase();
  const renterName = clean(traveller.full_name || reservation.customer_name) || 'Traveler';
  const subject = `Confirmed: ${companyName} reservation ${supplierConfirmation} — ${bookingReference}`.slice(0, 180);
  const companyBranding = companyLogo
    ? `<div style="text-align:center;margin:0 0 22px"><img src="${esc(companyLogo)}" alt="${esc(companyName)}" style="display:block;max-width:220px;max-height:68px;width:auto;height:auto;margin:0 auto;border:0"><div style="margin-top:7px;font-size:12px;color:#667085">Reservation with ${esc(companyName)}</div></div>`
    : `<p style="margin:0 0 22px;text-align:center;color:#667085">Reservation with <strong>${esc(companyName)}</strong></p>`;

  const html = `<!doctype html><html><body style="margin:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#172033"><table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td align="center" style="padding:32px 12px"><table width="640" style="max-width:100%;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #dce3ef" cellpadding="0" cellspacing="0"><tr><td style="padding:28px 32px;background:#0f2a4f;color:#fff"><div style="font-size:26px;font-weight:800">Fare<span style="color:#55a7ff">Transit</span></div><div style="margin-top:6px;opacity:.9">Car Rental E-Ticket / Reservation Confirmation</div></td></tr><tr><td style="padding:30px 32px">${companyBranding}<h2 style="margin:0 0 10px;font-size:22px;color:#102d54">Your rental is confirmed</h2><p style="margin:0 0 22px;font-size:15px;line-height:1.65">Hi ${esc(renterName)}, your car rental reservation has been confirmed. Keep the supplier confirmation number below available for pickup.</p><table width="100%" cellpadding="10" cellspacing="0" style="background:#f7f9fc;border-radius:12px"><tr><td style="color:#667085">Supplier confirmation</td><td align="right"><strong style="font-size:18px;color:#102d54">${esc(supplierConfirmation)}</strong></td></tr><tr><td style="color:#667085">FareTransit booking ID</td><td align="right"><strong>${esc(bookingReference)}</strong></td></tr><tr><td style="color:#667085">Rental company</td><td align="right"><strong>${esc(companyName)}</strong></td></tr><tr><td style="color:#667085">Vehicle</td><td align="right"><strong>${esc(car.vehicle_name || car.vehicle_category || 'As reserved / similar')}</strong></td></tr><tr><td style="color:#667085">Pickup</td><td align="right"><strong>${esc(car.pickup_location || 'Not set')}</strong><br><span style="font-size:12px;color:#667085">${esc(formatDateTime(car.pickup_at))}</span></td></tr><tr><td style="color:#667085">Drop-off</td><td align="right"><strong>${esc(car.dropoff_location || 'Not set')}</strong><br><span style="font-size:12px;color:#667085">${esc(formatDateTime(car.dropoff_at))}</span></td></tr><tr><td style="color:#667085">Reservation total</td><td align="right"><strong>${esc(money(reservation.total_amount, reservation.currency))}</strong></td></tr></table><p style="margin:22px 0 8px;font-size:14px;line-height:1.6">Your PDF e-ticket is attached to this email. The renter must still satisfy the rental company’s identification, driver-license, payment-card, age, deposit and eligibility requirements at pickup.</p><p style="margin:0;font-size:13px;line-height:1.55;color:#667085">If any reservation detail looks incorrect, contact FareTransit support before pickup.</p></td></tr></table></td></tr></table></body></html>`;
  const pdfBuffer = await buildCarEticketPdf({ bundle, supplierConfirmation, companyBrand });
  return {
    recipient,
    subject,
    html,
    attachment: {
      filename: `FareTransit-Car-E-Ticket-${bookingReference}.pdf`,
      content: pdfBuffer
    },
    preview: {
      to: recipient,
      subject,
      bookingReference,
      supplierConfirmation,
      renterName,
      rentalCompany: companyName,
      rentalCompanyLogoUrl: companyLogo,
      vehicle: car.vehicle_name || car.vehicle_category || '',
      pickupLocation: car.pickup_location || '',
      pickupAt: car.pickup_at || null,
      dropoffLocation: car.dropoff_location || '',
      dropoffAt: car.dropoff_at || null,
      totalAmount: reservation.total_amount,
      currency: reservation.currency || 'USD'
    }
  };
}

export async function sendCarEticketEmail({ bundle, supplierConfirmation }) {
  const email = await buildCarEticketEmail({ bundle, supplierConfirmation });
  if (!email.recipient) {
    const error = new Error('Customer email is required before sending the e-ticket.');
    error.code = 'CUSTOMER_EMAIL_REQUIRED';
    error.statusCode = 409;
    throw error;
  }
  const result = await sendCustomerHtmlEmail({
    recipient: email.recipient,
    subject: email.subject,
    html: email.html,
    attachments: [email.attachment]
  });
  return { ...result, to: email.recipient, subject: email.subject, filename: email.attachment.filename, preview: email.preview };
}

export default { buildCarEticketPdf, buildCarEticketEmail, sendCarEticketEmail };
