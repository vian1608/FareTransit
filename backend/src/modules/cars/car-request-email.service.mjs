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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '');
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short'
  });
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

  try {
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

    await Promise.allSettled(sends);
    return { sent: true };
  } catch (error) {
    logger.warn(`[CarBooking] email notification failed: ${error.message}`);
    return { sent: false, reason: 'send_failed' };
  }
}

export default { sendCarRequestNotifications };
