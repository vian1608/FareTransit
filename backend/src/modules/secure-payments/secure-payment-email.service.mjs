import { Resend } from 'resend';

function getClient() {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    const error = new Error('Secure-payment email delivery is not configured.');
    error.statusCode = 503;
    error.code = 'SECURE_PAYMENT_EMAIL_NOT_CONFIGURED';
    throw error;
  }
  return new Resend(apiKey);
}

function fromAddress() {
  return process.env.RESEND_FROM || 'FareTransit LLC <support@faretransit.com>';
}

export async function sendSecurePaymentOtp({ to, code, minutes = 5 }) {
  const resend = getClient();
  const { error } = await resend.emails.send({
    from: fromAddress(),
    to: [to],
    subject: 'FareTransit secure payment access code',
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#172033"><h2 style="margin-bottom:8px">Secure payment access</h2><p>Use this one-time code to access the protected payment method:</p><div style="font-size:30px;font-weight:800;letter-spacing:8px;padding:18px 0">${code}</div><p>This code expires in ${minutes} minutes. If you did not request access, do not share this code.</p><p style="color:#687386;font-size:13px">FareTransit security system</p></div>`,
  });
  if (error) {
    const deliveryError = new Error('Unable to deliver the secure-payment access code.');
    deliveryError.statusCode = 502;
    deliveryError.code = 'SECURE_PAYMENT_OTP_DELIVERY_FAILED';
    throw deliveryError;
  }
}

export async function sendCustomerSecurePaymentLink({ to, customerName, publicUrl, purpose, amount, currency = 'USD' }) {
  const resend = getClient();
  const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount || 0));
  const { error } = await resend.emails.send({
    from: fromAddress(),
    to: [to],
    subject: 'Secure payment authorization — FareTransit',
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033"><h2>Secure payment authorization</h2><p>Hello ${customerName || 'Traveler'},</p><p>FareTransit has prepared a secure payment authorization for <strong>${purpose}</strong>, up to <strong>${formatted}</strong>.</p><p><a href="${publicUrl}" style="display:inline-block;background:#861b3d;color:white;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:700">Open secure authorization</a></p><p>Please review the amount and purpose before submitting your payment method. The secure card fields are provided by our payment-data vault provider.</p><p style="color:#687386;font-size:13px">Do not send card numbers or security codes by email, text message, or chat.</p></div>`,
  });
  if (error) {
    const deliveryError = new Error('Unable to send the secure payment authorization link.');
    deliveryError.statusCode = 502;
    deliveryError.code = 'SECURE_PAYMENT_LINK_DELIVERY_FAILED';
    throw deliveryError;
  }
}

export default { sendSecurePaymentOtp, sendCustomerSecurePaymentLink };
