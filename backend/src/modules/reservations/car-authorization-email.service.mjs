import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import env from '../../config/env.mjs';

function fromAddress() {
  return String(env.resendFrom || 'FareTransit <support@faretransit.com>').trim();
}

function smtpConfigured() {
  return Boolean(String(process.env.EMAIL_USER || '').trim() && String(process.env.EMAIL_PASS || '').trim());
}

export function carAuthorizationEmailProviderStatus() {
  return {
    configured: Boolean(env.resendApiKey || smtpConfigured()),
    resend: Boolean(env.resendApiKey),
    smtp: smtpConfigured()
  };
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
}

function safeHttpsImageUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function money(value, currency = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: String(currency || 'USD').toUpperCase() }).format(Number(value || 0));
  } catch {
    return `$${Number(value || 0).toFixed(2)}`;
  }
}

function messageHtml(value) {
  return esc(value || '').replace(/\r?\n/g, '<br>');
}

function normalizeAttachments(attachments = []) {
  return (Array.isArray(attachments) ? attachments : []).filter(item => item?.filename && item?.content).map(item => ({
    filename: String(item.filename),
    content: Buffer.isBuffer(item.content) ? item.content : Buffer.from(item.content)
  }));
}

async function sendViaSmtp({ recipient, subject, html, attachments = [] }) {
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: Number(process.env.EMAIL_PORT || 587),
    secure: String(process.env.EMAIL_SECURE || '').toLowerCase() === 'true' || Number(process.env.EMAIL_PORT || 587) === 465,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
  });
  const info = await transporter.sendMail({
    from: fromAddress(),
    to: recipient,
    subject,
    html,
    attachments: normalizeAttachments(attachments)
  });
  return { id: info.messageId, provider: 'smtp' };
}

export async function sendCustomerHtmlEmail({ recipient, subject, html, attachments = [] }) {
  const from = fromAddress();
  const normalizedAttachments = normalizeAttachments(attachments);

  if (env.resendApiKey) {
    const resend = new Resend(env.resendApiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: [recipient],
      subject,
      html,
      ...(normalizedAttachments.length ? {
        attachments: normalizedAttachments.map(item => ({ filename: item.filename, content: item.content.toString('base64') }))
      } : {})
    });
    if (!error) return { ...(data || {}), provider: 'resend', from, to: recipient, subject };
    if (!smtpConfigured()) throw new Error(error.message || 'Unable to send customer email.');
  }

  if (smtpConfigured()) {
    const result = await sendViaSmtp({ recipient, subject, html, attachments: normalizedAttachments });
    return { ...result, from, to: recipient, subject };
  }

  if (String(env.nodeEnv || '').toLowerCase() !== 'production') {
    return { id: `dev-${Date.now()}`, provider: 'simulation', simulated: true, from, to: recipient, subject };
  }

  const error = new Error('Customer email delivery is not configured. Configure RESEND_API_KEY or EMAIL_USER/EMAIL_PASS before sending customer emails.');
  error.code = 'EMAIL_PROVIDER_NOT_CONFIGURED';
  error.statusCode = 503;
  throw error;
}

export function buildCarAuthorizationEmail({ bookingReference, authorization, token, subject, message, rentalCompanyName, rentalCompanyLogoUrl }) {
  const base = String(env.frontendUrl || 'https://www.faretransit.com').replace(/\/$/, '');
  const url = `${base}/car-authorization.html?token=${encodeURIComponent(token)}`;
  const total = money(authorization.total_amount, authorization.currency);
  const finalSubject = String(subject || `Action required: authorize car rental ${bookingReference}`).trim().slice(0, 180);
  const finalMessage = String(message || 'Your car rental authorization is ready for review.').trim().slice(0, 8000);
  const companyName = String(rentalCompanyName || '').trim().slice(0, 180);
  const companyLogo = safeHttpsImageUrl(rentalCompanyLogoUrl);
  const companyBranding = companyLogo
    ? `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 22px"><tr><td align="center" style="padding:14px 12px;background:#fff;border:1px solid #e5eaf2;border-radius:12px"><img src="${esc(companyLogo)}" alt="${esc(companyName || 'Rental company')}" width="220" style="display:block;max-width:220px;max-height:68px;width:auto;height:auto;margin:0 auto;border:0"><div style="margin-top:8px;font-size:12px;color:#667085">Rental provided by ${esc(companyName || 'your selected rental company')}</div></td></tr></table>`
    : (companyName ? `<p style="margin:0 0 22px;text-align:center;color:#667085;font-size:13px">Rental provided by <strong>${esc(companyName)}</strong></p>` : '');
  const html = `<!doctype html><html><body style="margin:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#172033"><table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td align="center" style="padding:32px 12px"><table width="620" style="max-width:100%;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #dce3ef" cellpadding="0" cellspacing="0"><tr><td style="padding:28px 32px;background:#0f2a4f;color:#fff"><div style="font-size:26px;font-weight:800">Fare<span style="color:#55a7ff">Transit</span></div><div style="margin-top:6px;opacity:.9">Car Rental Authorization</div></td></tr><tr><td style="padding:30px 32px">${companyBranding}<p style="margin:0 0 22px;font-size:16px;line-height:1.65">${messageHtml(finalMessage)}</p><table width="100%" style="background:#f7f9fc;border-radius:12px" cellpadding="10"><tr><td><strong>Booking ID</strong></td><td align="right">${esc(bookingReference)}</td></tr><tr><td><strong>Total authorized amount</strong></td><td align="right">${esc(total)}</td></tr></table><p style="margin:22px 0;line-height:1.55">The secure authorization page contains the rental details, merchant amounts and Terms &amp; Conditions for your review.</p><p style="text-align:center;margin:28px 0"><a href="${esc(url)}" style="display:inline-block;background:#1466d9;color:#fff;text-decoration:none;font-weight:800;padding:14px 24px;border-radius:9px">Review &amp; Authorize</a></p><p style="font-size:13px;color:#667085;line-height:1.5">This secure authorization link expires in 24 hours. If you did not expect this request, contact FareTransit support.</p></td></tr></table></td></tr></table></body></html>`;
  return { subject: finalSubject, html, url };
}

export async function sendCarAuthorizationEmail({ recipient, bookingReference, authorization, token, subject, message, rentalCompanyName, rentalCompanyLogoUrl }) {
  const email = buildCarAuthorizationEmail({ bookingReference, authorization, token, subject, message, rentalCompanyName, rentalCompanyLogoUrl });
  const result = await sendCustomerHtmlEmail({ recipient, subject: email.subject, html: email.html });
  return { ...result, url: email.url };
}

export default { buildCarAuthorizationEmail, sendCarAuthorizationEmail, sendCustomerHtmlEmail, carAuthorizationEmailProviderStatus };
