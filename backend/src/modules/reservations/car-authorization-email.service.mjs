import { Resend } from 'resend';
import env from '../../config/env.mjs';

const FROM = 'FareTransit <support@faretransit.com>';

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
}

function money(value, currency = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: String(currency || 'USD').toUpperCase() }).format(Number(value || 0));
  } catch {
    return `$${Number(value || 0).toFixed(2)}`;
  }
}

export async function sendCarAuthorizationEmail({ recipient, bookingReference, authorization, token }) {
  const base = String(env.frontendUrl || 'https://faretransit.com').replace(/\/$/, '');
  const url = `${base}/car-authorization.html?token=${encodeURIComponent(token)}`;
  const total = money(authorization.total_amount, authorization.currency);
  const subject = `Action required: authorize car rental ${bookingReference}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#172033"><table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td align="center" style="padding:32px 12px"><table width="620" style="max-width:100%;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #dce3ef" cellpadding="0" cellspacing="0"><tr><td style="padding:28px 32px;background:#0f2a4f;color:#fff"><div style="font-size:26px;font-weight:800">Fare<span style="color:#55a7ff">Transit</span></div><div style="margin-top:6px;opacity:.9">Car Rental Authorization</div></td></tr><tr><td style="padding:30px 32px"><p style="margin:0 0 18px;font-size:16px;line-height:1.55">Your car rental authorization is ready for review.</p><table width="100%" style="background:#f7f9fc;border-radius:12px" cellpadding="10"><tr><td><strong>Booking ID</strong></td><td align="right">${esc(bookingReference)}</td></tr><tr><td><strong>Total authorized amount</strong></td><td align="right">${esc(total)}</td></tr></table><p style="margin:22px 0;line-height:1.55">Review the rental details, merchant amounts and Terms &amp; Conditions before authorizing payment.</p><p style="text-align:center;margin:28px 0"><a href="${esc(url)}" style="display:inline-block;background:#1466d9;color:#fff;text-decoration:none;font-weight:800;padding:14px 24px;border-radius:9px">Review &amp; Authorize</a></p><p style="font-size:13px;color:#667085;line-height:1.5">This secure authorization link expires in 24 hours. If you did not expect this request, contact FareTransit support.</p></td></tr></table></td></tr></table></body></html>`;

  if (!env.resendApiKey) {
    if (String(env.nodeEnv || '').toLowerCase() === 'production') throw new Error('RESEND_API_KEY is required to send car authorization email.');
    return { id: `dev-${Date.now()}`, simulated: true, from: FROM, to: recipient, subject, url };
  }

  const resend = new Resend(env.resendApiKey);
  const { data, error } = await resend.emails.send({ from: FROM, to: [recipient], subject, html });
  if (error) throw new Error(error.message || 'Unable to send authorization email.');
  return { ...(data || {}), from: FROM, to: recipient, subject, url };
}

export default { sendCarAuthorizationEmail };
