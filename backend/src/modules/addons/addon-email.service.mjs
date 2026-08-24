import env from '../../config/env.mjs';
import logger from '../../config/logger.mjs';

const esc = (value) => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const pax = (request) => [request?.traveller?.first_name, request?.traveller?.middle_name, request?.traveller?.last_name].filter(Boolean).join(' ') || 'Passenger';
const bookingRef = (value) => value?.booking?.confirmation_code || value?.confirmation_code || value?.confirmationCode || value?.booking_id || value?.id || 'Reservation';

async function sendEmail(to, subject, text, html) {
  const apiKey = String(env.resendApiKey || '').trim();
  if (!apiKey || !to) return { success: false, skipped: true, reason: !apiKey ? 'RESEND_NOT_CONFIGURED' : 'CUSTOMER_EMAIL_MISSING' };
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.resendFrom, to: [to], subject, text, html })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.message || `Email provider returned ${response.status}.`);
  return { success: true, provider: 'resend', messageId: body.id || null };
}

export async function sendBaggageRequestReceivedEmail(booking, requests = []) {
  const to = String(booking?.email || booking?.contact?.email || '').trim();
  if (!requests.length) return { success: false, skipped: true, reason: 'NO_BAGGAGE_REQUESTS' };
  const ref = bookingRef(booking);
  const lines = requests.map((r) => `${pax(r)} — ${r.journey_direction === 'RETURN' ? 'Return' : 'Outbound'}: ${r.quantity} additional checked bag${r.quantity === 1 ? '' : 's'}`);
  const text = ['Baggage Request Received', `Booking: ${ref}`, ...lines, '', 'This request is not yet confirmed.', 'No baggage fee has been charged.', 'We will verify airline/supplier availability and send the confirmed price. Baggage is paid separately only after you approve that price.'].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#1f2937"><h2>Baggage Request Received</h2><p><strong>Booking:</strong> ${esc(ref)}</p><ul>${requests.map((r) => `<li>${esc(pax(r))} — ${r.journey_direction === 'RETURN' ? 'Return' : 'Outbound'}: ${r.quantity} additional checked bag${r.quantity === 1 ? '' : 's'}</li>`).join('')}</ul><p><strong>This request is not yet confirmed. No baggage fee has been charged.</strong></p><p>We will verify airline/supplier availability and send the confirmed baggage price. Baggage is paid separately only after you approve that price.</p></div>`;
  const result = await sendEmail(to, `Baggage request received for ${ref}`, text, html);
  logger.info(`[BaggageAddons] request received email for ${ref}: ${result.success ? 'sent' : 'skipped'}`);
  return result;
}

export async function sendBaggageOfferEmail(request, quote) {
  const to = String(request?.booking?.email || '').trim();
  if (!quote?.public_token) return { success: false, skipped: true, reason: 'QUOTE_TOKEN_MISSING' };
  const ref = bookingRef(request);
  const currency = String(quote.currency || 'USD').toUpperCase();
  const amount = Number(quote.customer_price || 0).toFixed(2);
  const expiry = quote.valid_until ? new Date(quote.valid_until).toLocaleString('en-US', { timeZone: 'UTC', timeZoneName: 'short' }) : 'until availability changes';
  const payUrl = `${String(env.frontendUrl || '').replace(/\/$/, '')}/addons/pay/${encodeURIComponent(quote.public_token)}`;
  const text = [`Your baggage request is available.`, `Booking: ${ref}`, `Passenger: ${pax(request)}`, `Journey: ${request.journey_direction === 'RETURN' ? 'Return' : 'Outbound'}`, `Checked baggage: ${request.quantity} bag${request.quantity === 1 ? '' : 's'} up to ${request.requested_weight_kg || 23} kg each`, `Confirmed price: ${currency} ${amount}`, `Offer valid: ${expiry}`, `Pay separately: ${payUrl}`, `Baggage is only purchased after payment and remains subject to supplier confirmation.`].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#1f2937"><h2>Your baggage request is available</h2><p><strong>Booking:</strong> ${esc(ref)}<br><strong>Passenger:</strong> ${esc(pax(request))}<br><strong>Journey:</strong> ${request.journey_direction === 'RETURN' ? 'Return' : 'Outbound'}<br><strong>Checked baggage:</strong> ${request.quantity} bag${request.quantity === 1 ? '' : 's'} · up to ${esc(request.requested_weight_kg || 23)} kg each</p><p style="font-size:20px"><strong>${esc(currency)} ${esc(amount)}</strong></p><p>Offer valid: ${esc(expiry)}</p><p><a href="${esc(payUrl)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#7a1739;color:#fff;text-decoration:none;font-weight:700">Pay for baggage separately</a></p><p style="font-size:13px;color:#64748b">Baggage is only purchased after payment and remains subject to airline/supplier confirmation.</p></div>`;
  return sendEmail(to, `Baggage price confirmed for ${ref}`, text, html);
}

export async function sendBaggageConfirmedEmail(request, fulfillment) {
  const to = String(request?.booking?.email || '').trim();
  const ref = bookingRef(request);
  const quote = [...(request?.quotes || [])].sort((a,b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))[0];
  const amount = quote ? `${String(quote.currency || 'USD').toUpperCase()} ${Number(quote.customer_price || 0).toFixed(2)}` : 'Paid separately';
  const supplierRef = fulfillment?.supplier_reference || 'Confirmed by supplier';
  const text = ['Checked baggage confirmed', `Booking: ${ref}`, `Passenger: ${pax(request)}`, `Journey: ${request.journey_direction === 'RETURN' ? 'Return' : 'Outbound'}`, `Checked baggage: ${request.quantity} × ${request.requested_weight_kg || 23} kg`, `Amount paid: ${amount}`, `Airline/Supplier confirmation: ${supplierRef}`].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#1f2937"><h2>Checked baggage confirmed</h2><p><strong>Booking:</strong> ${esc(ref)}<br><strong>Passenger:</strong> ${esc(pax(request))}<br><strong>Journey:</strong> ${request.journey_direction === 'RETURN' ? 'Return' : 'Outbound'}<br><strong>Checked baggage:</strong> ${request.quantity} × ${esc(request.requested_weight_kg || 23)} kg<br><strong>Amount paid:</strong> ${esc(amount)}<br><strong>Airline/Supplier confirmation:</strong> ${esc(supplierRef)}</p></div>`;
  return sendEmail(to, `Checked baggage confirmed for ${ref}`, text, html);
}

export default { sendBaggageRequestReceivedEmail, sendBaggageOfferEmail, sendBaggageConfirmedEmail };
