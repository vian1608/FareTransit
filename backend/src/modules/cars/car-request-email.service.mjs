import { Resend } from 'resend';
import env from '../../config/env.mjs';
import logger from '../../config/logger.mjs';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatMoney(amount, currency = 'USD') {
  const value = Number(amount);
  if (!Number.isFinite(value)) return 'To be confirmed';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function formatDateTime(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (match) {
    const [, year, month, day, hourRaw, minute] = match;
    const hour24 = Number(hourRaw);
    const hour12 = hour24 % 12 || 12;
    const ampm = hour24 >= 12 ? 'PM' : 'AM';
    const monthName = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' })
      .format(new Date(Date.UTC(Number(year), Number(month) - 1, 1)));
    return `${monthName} ${Number(day)}, ${year} at ${hour12}:${minute} ${ampm} (rental location local time)`;
  }
  return raw;
}

export async function sendCarRequestNotifications({ booking, customer }) {
  if (!env.carRequestEmailsEnabled || !env.resendApiKey) return { sent: false, reason: 'not_configured' };

  const resend = new Resend(env.resendApiKey);
  const reference = booking.bookingReference;
  const vehicle = booking.vehicleName || booking.vehicleCategory || 'Rental car';
  const total = formatMoney(booking.totalAmount, booking.currency);
  const customerHtml = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033;line-height:1.55">
      <h2 style="margin-bottom:8px">Reservation request received</h2>
      <p>Hi ${escapeHtml(customer.firstName)},</p>
      <p>We received your FareTransit car-rental request. Our reservation team will verify live supplier availability and the final rental details before the reservation is confirmed.</p>
      <div style="border:1px solid #dfe5ee;border-radius:12px;padding:18px;margin:20px 0">
        <p style="margin:0 0 8px"><strong>FareTransit reference:</strong> ${escapeHtml(reference)}</p>
        <p style="margin:0 0 8px"><strong>Supplier:</strong> ${escapeHtml(booking.supplier || 'Enterprise')}</p>
        <p style="margin:0 0 8px"><strong>Vehicle:</strong> ${escapeHtml(vehicle)}</p>
        <p style="margin:0 0 8px"><strong>Pickup:</strong> ${escapeHtml(booking.pickupLocation || '')} — ${escapeHtml(formatDateTime(booking.pickupAt))}</p>
        <p style="margin:0 0 8px"><strong>Return:</strong> ${escapeHtml(booking.dropoffLocation || '')} — ${escapeHtml(formatDateTime(booking.dropoffAt))}</p>
        <p style="margin:0"><strong>Estimated total:</strong> ${escapeHtml(total)}</p>
      </div>
      <p><strong>This is a reservation request, not a supplier confirmation.</strong> Price and availability remain subject to final confirmation by FareTransit.</p>
      <p>For assistance, call ${escapeHtml(env.supportPhoneDisplay)}.</p>
    </div>`;

  const adminHtml = `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#172033;line-height:1.5">
      <h2>New public car-rental request</h2>
      <p><strong>${escapeHtml(reference)}</strong> is ready for manual fulfillment.</p>
      <ul>
        <li>Customer: ${escapeHtml(customer.fullName)}</li>
        <li>Email: ${escapeHtml(customer.email)}</li>
        <li>Phone: ${escapeHtml(customer.phone)}</li>
        <li>Supplier: ${escapeHtml(booking.supplier || 'Enterprise')}</li>
        <li>Vehicle: ${escapeHtml(vehicle)}</li>
        <li>Pickup: ${escapeHtml(booking.pickupLocation || '')} — ${escapeHtml(formatDateTime(booking.pickupAt))}</li>
        <li>Return: ${escapeHtml(booking.dropoffLocation || '')} — ${escapeHtml(formatDateTime(booking.dropoffAt))}</li>
        <li>Captured customer total: ${escapeHtml(total)}</li>
      </ul>
      <p>Open the FareTransit admin dashboard and verify supplier availability before marking the reservation booked.</p>
    </div>`;

  const sends = [
    resend.emails.send({
      from: env.resendFrom,
      to: [customer.email],
      subject: `FareTransit request received — ${reference}`,
      html: customerHtml
    })
  ];

  if (env.adminBookingNotificationsEnabled && env.adminBookingNotificationEmail) {
    sends.push(
      resend.emails.send({
        from: env.resendFrom,
        to: [env.adminBookingNotificationEmail],
        subject: `New car-rental request ${reference}`,
        html: adminHtml
      })
    );
  }

  try {
    const results = await Promise.allSettled(sends);
    const rejected = results.filter((result) => result.status === 'rejected');
    const providerErrors = results.filter((result) => result.status === 'fulfilled' && result.value?.error);
    if (rejected.length || providerErrors.length) {
      logger.warn(`[CarBooking] ${rejected.length + providerErrors.length} request email(s) were not accepted by the provider.`);
      return { sent: false, reason: 'partial_or_total_failure' };
    }
    return { sent: true };
  } catch (error) {
    logger.warn(`[CarBooking] email notification failed: ${error.message}`);
    return { sent: false, reason: 'send_failed' };
  }
}

export default { sendCarRequestNotifications };
