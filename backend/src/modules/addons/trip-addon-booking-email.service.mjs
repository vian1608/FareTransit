import env from '../../config/env.mjs';
import logger from '../../config/logger.mjs';
import bookingRepository from '../bookings/booking.repository.mjs';
import addonService from './addon.service.mjs';
import flexAddonService from './flex-addon.service.mjs';

const esc = (value) => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const money = (value) => Number(Number(value || 0).toFixed(2));

export async function sendTripAddonBookingSummaryEmail(bookingId) {
  if (!bookingId) return { skipped: true };
  let booking = await bookingRepository.getById(bookingId);
  if (!booking?.email) return { skipped: true, reason: 'BOOKING_EMAIL_MISSING' };
  try { booking = await addonService.attachToBooking(booking); } catch { /* optional */ }
  const flex = await flexAddonService.getForBooking(bookingId).catch(() => null);
  const baggage = booking.addonRequests || booking.addon_requests || [];
  if (!flex?.selected && !baggage.length) return { skipped: true };
  const apiKey = String(env.resendApiKey || '').trim();
  if (!apiKey) return { skipped: true, reason: 'RESEND_NOT_CONFIGURED' };

  const existing = await bookingRepository.getEmailDeliveryStatus?.(bookingId, 'TRIP_ADDONS_SUMMARY').catch(() => null);
  if (existing?.status === 'SENT') return { skipped: true, duplicate: true, messageId: existing.provider_message_id };

  const total = money(booking.customer_price || booking.total_amount);
  const flexPrice = flex?.selected ? money(flex.price) : 0;
  const ticketComponent = Number(booking.ticket_component_total);
  const ticket = Number.isFinite(ticketComponent) && ticketComponent >= 0 ? money(ticketComponent) : money(total - flexPrice);
  const currency = String(booking.currency || 'USD').toUpperCase();
  const ref = booking.confirmation_code || booking.confirmationCode || bookingId;

  const baggageLines = baggage.map((r) => {
    const t = r.traveller || {};
    const name = [t.first_name,t.middle_name,t.last_name].filter(Boolean).join(' ') || `Passenger ${(r.passenger_index ?? 0) + 1}`;
    return `${name} — ${r.journey_direction === 'RETURN' ? 'Return' : 'Outbound'}: ${r.quantity} extra checked bag${r.quantity === 1 ? '' : 's'} — $0.00 now, pending airline confirmation`;
  });

  const text = [
    'FARETRANSIT — RESERVATION TRIP OPTIONS',
    `Booking: ${ref}`,
    '', 'PRICE BREAKDOWN',
    `Ticket component: $${ticket.toFixed(2)} ${currency}`,
    ...(flex?.selected ? [`Flex Assist (10%): $${flexPrice.toFixed(2)} ${currency} — ${flex.termsVersion || 'FLEX_V1'}`] : []),
    ...(baggage.length ? ['Checked baggage request: $0.00 now'] : []),
    `Total authorized with airfare checkout: $${total.toFixed(2)} ${currency}`,
    '',
    ...(flex?.selected ? ['FLEX ASSIST', 'Flex Assist is an agency change/rebooking assistance service. It is not travel insurance and does not convert the airline fare into a flexible fare. Airline fare differences, penalties, taxes, availability and fare rules may still apply.', ''] : []),
    'CHECKED BAGGAGE', ...(baggageLines.length ? baggageLines : ['No extra baggage requested.']),
    '', 'Baggage is paid separately only after FareTransit confirms the supplier price. Payment receipt is not the same as supplier confirmation.',
  ].join('\n');

  const baggageHtml = baggage.length ? `<ul>${baggage.map((r) => { const t=r.traveller||{}; const name=[t.first_name,t.middle_name,t.last_name].filter(Boolean).join(' ')||`Passenger ${(r.passenger_index ?? 0)+1}`; return `<li>${esc(name)} · ${r.journey_direction === 'RETURN' ? 'Return' : 'Outbound'} · ${r.quantity} extra checked bag${r.quantity === 1 ? '' : 's'} — <strong>$0.00 now</strong>, pending airline confirmation</li>`; }).join('')}</ul>` : '<p>No extra baggage requested.</p>';
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#1f2937;max-width:640px;margin:auto"><h2 style="color:#74132f">Your reservation trip options</h2><p><strong>Booking:</strong> ${esc(ref)}</p><div style="border:1px solid #ead5dc;border-radius:12px;padding:16px;background:#fffafb"><div style="display:flex;justify-content:space-between"><span>Ticket component</span><strong>$${ticket.toFixed(2)} ${esc(currency)}</strong></div>${flex?.selected ? `<div style="display:flex;justify-content:space-between;margin-top:8px"><span>Flex Assist (10%)</span><strong>$${flexPrice.toFixed(2)} ${esc(currency)}</strong></div>` : ''}${baggage.length ? '<div style="display:flex;justify-content:space-between;margin-top:8px"><span>Checked baggage request</span><strong>$0.00 now</strong></div>' : ''}<div style="border-top:1px solid #ead5dc;margin-top:12px;padding-top:12px;display:flex;justify-content:space-between"><strong>Total authorized</strong><strong>$${total.toFixed(2)} ${esc(currency)}</strong></div></div>${flex?.selected ? `<h3>Flex Assist</h3><p>Active under <strong>${esc(flex.termsVersion || 'FLEX_V1')}</strong>. Flex Assist is an agency service, not travel insurance or an airline flexible fare. Fare differences, taxes, penalties, availability and airline/supplier rules may still apply.</p>` : ''}<h3>Checked baggage</h3>${baggageHtml}<p style="font-size:13px;color:#64748b">Baggage remains a request until airline/supplier availability and the exact fee are confirmed. Any baggage payment is separate from airfare, and payment receipt is not supplier confirmation.</p></div>`;

  await bookingRepository.upsertEmailDeliveryRecord?.({ booking_id: bookingId, confirmation_code: ref, email_type: 'TRIP_ADDONS_SUMMARY', recipient: booking.email, status: 'PENDING', provider: 'RESEND', attempt_count: Number(existing?.attempt_count || 0) + 1 }).catch(() => null);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.resendFrom?.trim() || 'FareTransit <support@faretransit.com>', to: [booking.email], subject: `Your trip options — ${ref}`, text, html, reply_to: 'support@faretransit.com' }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    await bookingRepository.upsertEmailDeliveryRecord?.({ booking_id: bookingId, confirmation_code: ref, email_type: 'TRIP_ADDONS_SUMMARY', recipient: booking.email, status: 'FAILED', provider: 'RESEND', error_message: body.message || `Resend ${response.status}` }).catch(() => null);
    throw new Error(body.message || `Resend error (${response.status})`);
  }
  await bookingRepository.upsertEmailDeliveryRecord?.({ booking_id: bookingId, confirmation_code: ref, email_type: 'TRIP_ADDONS_SUMMARY', recipient: booking.email, status: 'SENT', provider: 'RESEND', provider_message_id: body.id || null, sent_at: new Date().toISOString() }).catch(() => null);
  logger.info(`[TripAddons] FareTransit itemized add-on email sent for ${ref}`);
  return { success: true, messageId: body.id || null };
}

export default sendTripAddonBookingSummaryEmail;
