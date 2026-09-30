import { Resend } from 'resend';
import logger from '../../config/logger.mjs';

function client() {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  return apiKey ? new Resend(apiKey) : null;
}

function fromAddress() {
  return process.env.RESEND_FROM || 'FareTransit LLC <support@faretransit.com>';
}

function money(amount, currency = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount || 0));
  } catch {
    return `$${Number(amount || 0).toFixed(2)}`;
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function locationName(location, fallback = 'Enterprise location') {
  return escapeHtml(location?.name || location?.airportCode || fallback);
}

function vehicleName(vehicle = {}) {
  const category = vehicle.name || vehicle.category || 'Rental vehicle';
  const model = vehicle.makeModel ? ` — ${vehicle.makeModel} or similar` : '';
  return `${escapeHtml(category)}${escapeHtml(model)}`;
}

function detailsTable({ orderReference, supplierConfirmation, vehicle, pickupLocation, returnLocation, search, amount, currency }) {
  const confirmationRow = supplierConfirmation
    ? `<tr><td style="padding:6px 12px 6px 0;color:#64748b">Enterprise confirmation</td><td style="padding:6px 0;font-weight:700">${escapeHtml(supplierConfirmation)}</td></tr>`
    : '';
  return `<table style="border-collapse:collapse;width:100%;font-size:14px">
    <tr><td style="padding:6px 12px 6px 0;color:#64748b">FareTransit reference</td><td style="padding:6px 0;font-weight:700">${escapeHtml(orderReference)}</td></tr>
    ${confirmationRow}
    <tr><td style="padding:6px 12px 6px 0;color:#64748b">Vehicle class</td><td style="padding:6px 0;font-weight:700">${vehicleName(vehicle)}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#64748b">Pickup</td><td style="padding:6px 0">${locationName(pickupLocation)}<br>${escapeHtml(search?.pickup_date || '')} at ${escapeHtml(search?.pickup_time || '')}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#64748b">Return</td><td style="padding:6px 0">${locationName(returnLocation)}<br>${escapeHtml(search?.return_date || '')} at ${escapeHtml(search?.return_time || '')}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#64748b">Amount</td><td style="padding:6px 0;font-weight:700">${escapeHtml(money(amount, currency))}</td></tr>
  </table>`;
}

async function deliver({ to, subject, html }) {
  const resend = client();
  if (!resend || !to) return { skipped: true };
  const { error } = await resend.emails.send({ from: fromAddress(), to: [to], subject, html });
  if (error) throw new Error(error.message || 'Resend delivery failed');
  return { skipped: false };
}

export async function sendRentalRequestAuthorized(order = {}) {
  const firstName = escapeHtml(order.customer?.firstName || 'Traveler');
  return deliver({
    to: order.customer?.email,
    subject: `Rental request received — ${order.order_reference}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#172033;line-height:1.55">
      <h2 style="margin-bottom:8px">Your rental request is being confirmed</h2>
      <p>Hello ${firstName},</p>
      <p>FareTransit received your rental request and your card has been <strong>authorized</strong> for ${escapeHtml(money(order.amount, order.currency))}. This is not yet a completed supplier reservation or final capture.</p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:18px 0">${detailsTable(order)}</div>
      <p>Our reservation team will confirm the Enterprise rental. Once the supplier reservation is confirmed, the authorization will be captured and we will send the final confirmation number.</p>
      <p style="font-size:13px;color:#64748b">Need help? Call FareTransit at +1 (888) 780-8855. FareTransit is an independent reservation assistance service and is not affiliated with Enterprise Rent-A-Car.</p>
    </div>`
  });
}

export async function sendRentalConfirmed(order = {}) {
  const firstName = escapeHtml(order.customer?.firstName || 'Traveler');
  return deliver({
    to: order.customer?.email,
    subject: `Rental confirmed — ${order.order_reference}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#172033;line-height:1.55">
      <h2 style="margin-bottom:8px;color:#126b43">Your rental is confirmed</h2>
      <p>Hello ${firstName},</p>
      <p>Your Enterprise supplier reservation has been confirmed and the authorized amount has now been captured.</p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:18px 0">${detailsTable(order)}</div>
      <p>Please keep both the FareTransit reference and Enterprise confirmation available for pickup.</p>
      <p style="font-size:13px;color:#64748b">Need help? Call FareTransit at +1 (888) 780-8855. Vehicle make/model is representative of the booked class unless the supplier confirms otherwise.</p>
    </div>`
  });
}

export async function sendRentalUnableToConfirm(order = {}) {
  const firstName = escapeHtml(order.customer?.firstName || 'Traveler');
  return deliver({
    to: order.customer?.email,
    subject: `Update on rental request — ${order.order_reference}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#172033;line-height:1.55">
      <h2 style="margin-bottom:8px">We could not confirm the requested rental</h2>
      <p>Hello ${firstName},</p>
      <p>FareTransit was unable to confirm the requested Enterprise rental at the selected availability. The reservation has not been completed.</p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:18px 0">${detailsTable(order)}</div>
      <p>If a card authorization was placed, our team will release/void the outstanding authorization through the payment gateway as applicable.</p>
      <p style="font-size:13px;color:#64748b">Need another option? Call FareTransit at +1 (888) 780-8855.</p>
    </div>`
  });
}

export function sendRentalEmailSafely(kind, order) {
  const task = kind === 'confirmed'
    ? sendRentalConfirmed(order)
    : kind === 'unable'
      ? sendRentalUnableToConfirm(order)
      : sendRentalRequestAuthorized(order);
  Promise.resolve(task).catch((error) => logger.warn(`[EnterpriseRentalEmail] ${kind} email failed: ${error.message}`));
}

export default { sendRentalRequestAuthorized, sendRentalConfirmed, sendRentalUnableToConfirm, sendRentalEmailSafely };
