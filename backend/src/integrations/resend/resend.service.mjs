import nodemailer from 'nodemailer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Handlebars from 'handlebars';
import env from '../../config/env.mjs';
import logger from '../../config/logger.mjs';
import bookingRepository from '../../modules/bookings/booking.repository.mjs';
import passengerAuthorizationService from '../../modules/authorizations/passenger-authorization.service.mjs';
import { resolveAirlineName, getCarrierLogoUrl, buildCanonicalItinerary, getArrivalDayShiftLabel, calculateLayoverDuration } from '../../shared/utils/airline-lookup.mjs';

export function validateHtmlOutput(html, templateName, bookingRef) {
  const unresolvedTemplatePattern = /{{[\s\S]*?}}/;
  if (unresolvedTemplatePattern.test(html)) {
    const unresolvedTokens = [];
    let match;
    const regex = /{{([\s\S]*?)}}/g;
    while ((match = regex.exec(html)) !== null) {
      unresolvedTokens.push(match[0]);
    }
    logger.error(`[EMAIL_TEMPLATE_RENDER_FAILED] Unresolved template tokens in template "${templateName}" for booking "${bookingRef}": ${unresolvedTokens.join(', ')}`);
    throw new Error("EMAIL_TEMPLATE_RENDER_FAILED: Unresolved template token detected");
  }
}

/**
 * Customer-Facing Payment Wording Formatter for Booking Confirmation Emails
 * Priority: Section 3 — Never expose raw internal payment status (PENDING, PROCESSING, PAID, FAILED, REFUNDED)
 */
export function getBookingEmailPaymentLabel(paymentStatus) {
  const normalized = String(paymentStatus || '').toUpperCase().trim();

  if (normalized === 'FAILED' || normalized === 'REFUNDED') {
    return null;
  }

  return 'Payment Under Process';
}





const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INQUIRIES_FILE = path.join(__dirname, '../../../../data/inquiries.jsonl');

const PLACEHOLDER_EMAIL_VALUES = [
  'your-email@gmail.com',
  'your-email-password',
  'your-app-password',
  '',
];

function getInquiryRecipients() {
  const fromEnv = env.inquiryNotifyEmails;
  if (fromEnv) {
    return fromEnv.split(',').map((e) => e.trim()).filter(Boolean);
  }
  return ['support@faretransit.com', 'viansaini1608@gmail.com'];
}

function isSmtpConfigured() {
  const user = process.env.EMAIL_USER?.trim();
  const pass = process.env.EMAIL_PASS?.trim();
  if (!user || !pass) return false;
  if (PLACEHOLDER_EMAIL_VALUES.includes(user.toLowerCase())) return false;
  if (PLACEHOLDER_EMAIL_VALUES.includes(pass.toLowerCase())) return false;
  return true;
}

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '587', 10),
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

async function sendViaResendOne({ to, subject, textBody, htmlBody, replyTo }) {
  const apiKey = env.resendApiKey?.trim();
  const from = env.resendFrom?.trim() || 'FareTransit <support@faretransit.com>';

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(10000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,

      to: [to],
      subject,
      text: textBody,
      html: htmlBody,
      reply_to: replyTo,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `Resend error (${response.status})`);
  }
  return data.id;
}

async function sendViaResend({ recipients, subject, textBody, htmlBody, replyTo }) {
  const apiKey = env.resendApiKey?.trim();
  if (!apiKey) return null;

  const sentTo = [];
  const failures = [];
  let lastMessageId = null;

  for (const to of recipients) {
    try {
      const messageId = await sendViaResendOne({
        to,
        subject,
        textBody,
        htmlBody,
        replyTo,
      });
      lastMessageId = messageId;
      sentTo.push(to);
      logger.info(`Resend sent to ${to}:`, messageId);
    } catch (err) {
      failures.push({ to, error: err.message });
      logger.error(`Resend failed for ${to}:`, err.message);
    }
  }

  if (sentTo.length > 0) {
    return { provider: 'resend', messageId: lastMessageId || sentTo.join(','), sentTo, failures };
  }


  if (failures.length > 0) {
    throw new Error(failures.map((f) => `${f.to}: ${f.error}`).join('; '));
  }

  return null;
}

async function sendViaSmtp({ recipients, subject, textBody, htmlBody, replyTo }) {
  if (!isSmtpConfigured()) return null;

  const transporter = getTransporter();
  const info = await transporter.sendMail({
    from: `"FareTransit LLC" <${process.env.EMAIL_USER}>`,
    to: recipients.join(', '),
    replyTo,
    subject,
    text: textBody,
    html: htmlBody,
  });

  return { provider: 'smtp', messageId: info.messageId };
}

export const saveInquiryToFile = async (inquiry) => {
  if (process.env.NODE_ENV !== 'production') {
    try {
      const record = { ...inquiry, receivedAt: new Date().toISOString() };
      await fs.mkdir(path.dirname(INQUIRIES_FILE), { recursive: true });
      await fs.appendFile(INQUIRIES_FILE, `${JSON.stringify(record)}\n`, 'utf8');
    } catch (_) {}
  }
  return inquiry;
};

export const sendConsultingInquiry = async (inquiry) => {
  const recipients = getInquiryRecipients();
  const isAirInquiry = ['flights', 'senior-travel'].includes(inquiry.serviceType);
  const isPayment = inquiry.serviceType === 'consulting-payment';

  const subjectLabel = isPayment
    ? 'Secure Consulting Payment'
    : isAirInquiry
      ? 'Air Travel Assistance'
      : 'Amtrak / Rail Travel Assistance';

  // Format inquiry text
  let textBody = '';
  if (isPayment) {
    textBody = [
      `NEW SECURE CONSULTING PAYMENT RECEIVED`,
      `FareTransit LLC`,
      `======================================`,
      ``,
      `CONTACT`,
      `=======`,
      `Name: ${inquiry.name}`,
      `Email: ${inquiry.email}`,
      `Phone: ${inquiry.phone || 'Not provided'}`,
      ``,
      `BILLING DETAILS`,
      `===============`,
      `City/State: ${inquiry.origin}, ${inquiry.destination}`,
      `Payment details & notes:`,
      inquiry.notes || 'None',
      ``,
      `Submitted: ${new Date().toLocaleString()}`,
      `Source: Secure Online Checkout`,
      `======================================`
    ].join('\n');
  } else {
    const lines = [
      `NEW ${isAirInquiry ? 'AIR' : 'RAIL'} TRAVEL ASSISTANCE INQUIRY`,
      `FareTransit LLC`,
      ``,
      `CONTACT`,
      `=======`,
      `Name: ${inquiry.name}`,
      `Email: ${inquiry.email}`,
      `Phone: ${inquiry.phone || 'Not provided'}`,
      ``,
      `ITINERARY`,
      `=========`,
      `Origin: ${inquiry.origin}`,
      `Destination: ${inquiry.destination}`,
    ];

    if (isAirInquiry) {
      lines.push(
        `Trip type: ${inquiry.tripType || 'Not specified'}`,
        `Departure date: ${inquiry.travelDate || 'Flexible'}`,
      );
      if (inquiry.tripType === 'roundtrip' || inquiry.tripType === 'round-trip') {
        lines.push(`Return date: ${inquiry.returnDate || 'Flexible'}`);
      }
      lines.push(`Preferred cabin: ${inquiry.cabinClass || inquiry.cabin || 'Not specified'}`);
    } else {
      lines.push(`Preferred travel date: ${inquiry.travelDate || 'Flexible'}`);
    }

    lines.push(
      `Passengers: ${inquiry.passengers || '1'}`,
      ``,
      `ADVISORY NOTES`,
      `==============`,
      inquiry.notes || 'None',
      ``,
      `Submitted: ${new Date().toLocaleString()}`,
      `Source: ${inquiry.serviceType === 'senior-travel' ? 'Senior Travel Assistance' : (isAirInquiry ? 'Flights landing page' : 'Amtrak / Rail landing page')}`,
    );
    textBody = lines.join('\n');
  }

  const htmlBody = textBody.replace(/\n/g, '<br>');
  const subject = `${subjectLabel} — ${inquiry.name}`;

  const payload = {
    recipients,
    subject,
    textBody,
    htmlBody: `<div style="font-family: Arial, sans-serif; line-height: 1.6;">${htmlBody}</div>`,
    replyTo: inquiry.email,
  };

  const errors = [];

  const leadId = `lead_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  if (env.resendApiKey?.trim()) {
    try {
      const result = await sendViaResend(payload);
      if (result?.sentTo?.length) {
        logger.info('Consulting inquiry emailed via Resend →', result.sentTo.join(', '));
        return {
          success: true,
          emailed: true,
          leadId,
          provider: 'resend',
          messageId: result.messageId,
          sentTo: result.sentTo,
        };
      }
    } catch (err) {
      errors.push(`Resend: ${err.message}`);
      logger.error('Resend failed:', err.message);
    }
  }

  if (isSmtpConfigured()) {
    try {
      const result = await sendViaSmtp(payload);
      if (result) {
        logger.info('Consulting inquiry emailed via SMTP →', recipients.join(', '));
        return { success: true, emailed: true, leadId, provider: 'smtp', messageId: result.messageId };
      }
    } catch (err) {
      errors.push(`SMTP: ${err.message}`);
      logger.error('SMTP failed:', err.message);
    }
  }

  logger.info('Consulting inquiry saved (email not sent). Details:\n', textBody);
  if (errors.length) logger.error('Email errors:', errors.join('; '));

  return {
    success: true,
    emailed: false,
    leadId,
    message: 'Inquiry received. Configure RESEND_API_KEY or SMTP variables to enable email delivery.',
    errors,
  };
};

function formatUsDate(dateVal) {
  if (!dateVal) return 'Scheduled';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatUsTime(timeVal) {
  if (!timeVal) return 'Scheduled';
  const str = String(timeVal);
  if (str.includes('T') || str.includes('-')) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
  }
  const match = str.match(/^(\d{1,2}):(\d{2})/);
  if (match) {
    let hrs = parseInt(match[1], 10);
    const mins = match[2];
    const ampm = hrs >= 12 ? 'PM' : 'AM';
    hrs = hrs % 12 || 12;
    return `${hrs}:${mins} ${ampm}`;
  }
  return str;
}

export const sendBookingConfirmation = async (bookingInput, options = {}) => {
  try {
    const rawId = typeof bookingInput === 'object' ? (bookingInput.id || bookingInput.booking_id || bookingInput.confirmation_code) : bookingInput;
    const booking = (await bookingRepository.getCompleteBookingById(rawId)) || (await bookingRepository.getById(rawId));
    if (!booking) {
      return { success: false, errorCode: 'BOOKING_NOT_FOUND', errorMessage: 'Booking record not found' };
    }

    const bookingId = booking.id;
    const confCode = booking.confirmation_code || booking.confirmationCode || 'TFS-PENDING';
    const customerEmail = booking.email || booking.customerEmail || '';

    // 1. Check Idempotency via email_deliveries table
    const existingDelivery = await bookingRepository.getEmailDeliveryStatus(bookingId, 'BOOKING_CONFIRMATION');
    if (existingDelivery && existingDelivery.status === 'SENT' && !options.force) {
      logger.info(`[Email] Idempotency: Skipping duplicate confirmation email for booking ${confCode} (already SENT with messageId ${existingDelivery.provider_message_id})`);
      return {
        success: true,
        duplicate: true,
        messageId: existingDelivery.provider_message_id,
        status: 'SENT'
      };
    }

    const currentAttempt = (existingDelivery?.attempt_count || 0) + 1;

    // Record PENDING state in email_deliveries table
    await bookingRepository.upsertEmailDeliveryRecord({
      booking_id: bookingId,
      confirmation_code: confCode,
      email_type: 'BOOKING_CONFIRMATION',
      recipient: customerEmail,
      status: 'PENDING',
      provider: 'RESEND',
      attempt_count: currentAttempt
    });

    // 2. Validate Booking Integrity Before Sending
    const { bookingValidatorService } = await import('../../modules/bookings/booking-validator.service.mjs');
    try {
      await bookingValidatorService.validateCompletedBooking(bookingId);
    } catch (valErr) {
      const errMsg = `EMAIL_PROTECTION_BLOCKED: ${valErr.message}`;
      logger.error(`[Email Protection] ${errMsg} (bookingId=${bookingId})`);
      await bookingRepository.upsertEmailDeliveryRecord({
        booking_id: bookingId,
        confirmation_code: confCode,
        email_type: 'BOOKING_CONFIRMATION',
        recipient: customerEmail,
        status: 'FAILED',
        error_code: 'BOOKING_DATA_INCOMPLETE',
        error_message: errMsg,
        attempt_count: currentAttempt
      });
      return { success: false, errorCode: 'BOOKING_DATA_INCOMPLETE', errorMessage: errMsg };
    }

    const itinerary = buildCanonicalItinerary(booking);

    const rawPassengers = booking.passengers || booking.traveller_details || booking.travellers || [];
    const passengers = Array.isArray(rawPassengers)
      ? rawPassengers
      : (typeof rawPassengers === 'string' ? JSON.parse(rawPassengers || '[]') : []);

    const firstPassenger = passengers[0] || {};
    const passengerName = booking.passenger_name || `${firstPassenger.firstName || firstPassenger.first_name || ''} ${firstPassenger.lastName || firstPassenger.last_name || ''}`.trim() || null;

    if (!passengerName && passengers.length === 0) {
      const errMsg = 'EMAIL_PROTECTION_BLOCKED: Cannot send booking confirmation email because passenger details are missing.';
      logger.error(`[Email Protection] ${errMsg} (bookingId=${bookingId})`);
      await bookingRepository.upsertEmailDeliveryRecord({
        booking_id: bookingId,
        confirmation_code: confCode,
        email_type: 'BOOKING_CONFIRMATION',
        recipient: customerEmail,
        status: 'FAILED',
        error_code: 'BOOKING_DATA_INCOMPLETE',
        error_message: errMsg,
        attempt_count: currentAttempt
      });
      return { success: false, errorCode: 'BOOKING_DATA_INCOMPLETE', errorMessage: errMsg };
    }

    const passengerFirstName = firstPassenger.firstName || firstPassenger.first_name || (passengerName ? passengerName.split(' ')[0] : 'Valued Customer');
    const confirmationCode = confCode;

    const customerPrice = parseFloat(booking.customer_price || booking.total_amount || 0);
    if (isNaN(customerPrice) || customerPrice <= 0) {
      const errMsg = 'EMAIL_PROTECTION_BLOCKED: Cannot send booking confirmation email because total amount is zero or invalid.';
      logger.error(`[Email Protection] ${errMsg} (bookingId=${bookingId})`);
      await bookingRepository.upsertEmailDeliveryRecord({
        booking_id: bookingId,
        confirmation_code: confCode,
        email_type: 'BOOKING_CONFIRMATION',
        recipient: customerEmail,
        status: 'FAILED',
        error_code: 'INVALID_BOOKING_PRICE',
        error_message: errMsg,
        attempt_count: currentAttempt
      });
      return { success: false, errorCode: 'INVALID_BOOKING_PRICE', errorMessage: errMsg };
    }

    const amountPaid = customerPrice.toFixed(2);
    const currency = (booking.currency || 'USD').toUpperCase();
    const currencySymbol = currency === 'USD' ? '$' : (currency === 'EUR' ? '€' : (currency === 'GBP' ? '£' : '$'));

    const rawPaymentProvider = (booking.payment_provider || booking.paymentProvider || 'card').toLowerCase();
    let paymentMethod = 'Credit / Debit Card';
    if (rawPaymentProvider.includes('paypal')) {
      paymentMethod = 'PayPal';
    } else if (rawPaymentProvider.includes('whop') || rawPaymentProvider.includes('card') || rawPaymentProvider.includes('stripe')) {
      paymentMethod = 'Credit / Debit Card';
    }

    const rawDate = booking.paid_at || booking.bookingDate || booking.created_at || new Date().toISOString();
    const paymentDate = formatUsDate(rawDate);
    const passengerCount = passengers.length > 0 ? `${passengers.length}` : '1';

    const outboundSegs = itinerary.outbound || [];
    const returnSegs = itinerary.return || [];
    const outSeg = outboundSegs[0] || {};
    const retSeg = returnSegs[0] || null;

    const rawPaymentStatus = booking.payment_status || booking.paymentStatus || booking.payment?.paymentStatus || 'PENDING';
    const customerPaymentLabel = getBookingEmailPaymentLabel(rawPaymentStatus);

    if (!customerPaymentLabel) {
      logger.info(`[Email Protection] Booking confirmation email suppressed for booking ${confCode} because payment status is ${rawPaymentStatus}.`);
      return { success: false, errorCode: 'EMAIL_SUPPRESSED_PAYMENT_STATUS', errorMessage: `Booking confirmation email suppressed for ${rawPaymentStatus} status.` };
    }

    const templatePath = path.join(__dirname, 'templates/booking-confirmation.html');
    const templateSource = await fs.readFile(templatePath, 'utf8');

    const template = Handlebars.compile(templateSource);

    const templateData = {
      emailHeaderSubtitle: 'FLIGHT RESERVATION CONFIRMATION',
      customerPaymentStatus: customerPaymentLabel,
      confirmationCode: confirmationCode,
      passengerFirstName: passengerFirstName,
      passengerName: passengerName,
      currencySymbol: currencySymbol,
      amountPaid: amountPaid,
      currency: currency,
      paymentMethod: paymentMethod,
      paymentDate: paymentDate,
      passengerCount: passengerCount,
      customerEmail: customerEmail,

      outboundAirline: outSeg.airlineName,
      outboundFlightNumber: outSeg.flightNumber,
      outboundOriginCity: outSeg.originName,
      outboundOriginCode: outSeg.originCode,
      outboundDestinationCity: outboundSegs[outboundSegs.length - 1]?.destinationName || '',
      outboundDestinationCode: outboundSegs[outboundSegs.length - 1]?.destinationCode || '',
      outboundDepartureDate: formatUsDate(outSeg.departureDate),
      outboundDepartureTime: formatUsTime(outSeg.departureTime),
      outboundArrivalDate: formatUsDate(outSeg.arrivalDate),
      outboundArrivalTime: formatUsTime(outSeg.arrivalTime),
      outboundCabin: outSeg.cabinClass,
      outboundStops: outboundSegs.length > 1 ? `${outboundSegs.length - 1} Stop(s)` : (outSeg.stops === 0 ? 'Nonstop' : `${outSeg.stops || 0} Stop(s)`),

      hasReturnFlight: !!retSeg,

      returnAirline: retSeg?.airlineName || '',
      returnFlightNumber: retSeg?.flightNumber || '',
      returnOriginCity: retSeg?.originName || '',
      returnOriginCode: retSeg?.originCode || '',
      returnDestinationCity: returnSegs.length > 0 ? returnSegs[returnSegs.length - 1]?.destinationName : '',
      returnDestinationCode: returnSegs.length > 0 ? returnSegs[returnSegs.length - 1]?.destinationCode : '',
      returnDepartureDate: retSeg ? formatUsDate(retSeg.departureDate) : '',
      returnDepartureTime: retSeg ? formatUsTime(retSeg.departureTime) : '',
      returnArrivalDate: retSeg ? formatUsDate(retSeg.arrivalDate) : '',
      returnArrivalTime: retSeg ? formatUsTime(retSeg.arrivalTime) : '',
      returnCabin: retSeg?.cabinClass || '',
      returnStops: returnSegs.length > 1 ? `${returnSegs.length - 1} Stop(s)` : (retSeg?.stops === 0 ? 'Nonstop' : `${retSeg?.stops || 0} Stop(s)`)
    };

    const html = template(templateData);

    validateHtmlOutput(html, 'booking-confirmation', confirmationCode);

    const outboundAirlineTxt = outSeg.airlineName || '';
    const outboundFlightNumberTxt = outSeg.flightNumber || '';
    const outboundOriginCityTxt = outSeg.originName || '';
    const outboundOriginCodeTxt = outSeg.originCode || '';
    const outboundDestinationCityTxt = outboundSegs[outboundSegs.length - 1]?.destinationName || '';
    const outboundDestinationCodeTxt = outboundSegs[outboundSegs.length - 1]?.destinationCode || '';
    const outboundDepartureDateTxt = formatUsDate(outSeg.departureDate);
    const outboundDepartureTimeTxt = formatUsTime(outSeg.departureTime);
    const outboundArrivalDateTxt = formatUsDate(outSeg.arrivalDate);
    const outboundArrivalTimeTxt = formatUsTime(outSeg.arrivalTime);
    const outboundCabinTxt = outSeg.cabinClass || 'Economy';
    const outboundStopsTxt = outboundSegs.length > 1 ? `${outboundSegs.length - 1} Stop(s)` : (outSeg.stops === 0 ? 'Nonstop' : `${outSeg.stops || 0} Stop(s)`);
    const hasReturnFlightTxt = returnSegs && returnSegs.length > 0;

    const customerTextBody = `
THE FINAL SEAT — RESERVATION RECEIVED

Thank you, ${passengerFirstName}!

Your reservation request for ${confirmationCode} has been received.

PAYMENT SUMMARY:
Payment Status: ${customerPaymentLabel}
Your payment details have been received and are currently being processed.
Reservation Amount: ${currencySymbol}${amountPaid} ${currency}
Payment Method: ${paymentMethod}

RESERVATION NUMBER: ${confirmationCode}

PASSENGER DETAILS:
Primary Passenger: ${passengerName}
Number of Travelers: ${passengerCount}
Contact Email: ${customerEmail}

FLIGHT ITINERARY:
Outbound: ${outboundAirlineTxt} ${outboundFlightNumberTxt} (${outboundOriginCityTxt} [${outboundOriginCodeTxt}] to ${outboundDestinationCityTxt} [${outboundDestinationCodeTxt}])
Departure: ${outboundDepartureDateTxt} ${outboundDepartureTimeTxt}
Arrival: ${outboundArrivalDateTxt} ${outboundArrivalTimeTxt}
Cabin: ${outboundCabinTxt} | Stops: ${outboundStopsTxt}
${hasReturnFlightTxt ? `
Return: ${retSeg?.airlineName || ''} (${retSeg?.originName || ''} to ${returnSegs[returnSegs.length - 1]?.destinationName || ''})
` : ''}
IMPORTANT NOTICE:
${confirmationCode} is a reservation reference number issued by FareTransit. It is not the airline's final PNR, ticket number, or electronic ticket. Please wait for the separate email containing your final airline-issued confirmation details.

Track your reservation at: https://www.faretransit.com/my-bookings?code=${confirmationCode}

Support 24/7: Call ${env.supportPhoneDisplay} or Email support@faretransit.com
    `.trim();

    const subject = `Your reservation has been received – ${confirmationCode}`;
    let emailMessageId = null;
    let sendSuccess = false;
    let providerError = null;

    if (env.resendApiKey?.trim()) {
      try {
        const result = await sendViaResend({
          recipients: [customerEmail],
          subject,
          textBody: customerTextBody,
          htmlBody: html,
          replyTo: 'support@faretransit.com',
        });
        if (result && (result.messageId || result.id)) {
          emailMessageId = result.messageId || result.id || `resend_${Date.now()}`;
          sendSuccess = true;
        }
      } catch (rErr) {
        providerError = rErr.message;
        logger.error(`[Email] Resend API error for booking ${confCode}:`, rErr.message);
      }
    } else if (isSmtpConfigured()) {
      try {
        const transporter = getTransporter();
        const info = await transporter.sendMail({
          from: env.resendFrom || 'FareTransit <support@faretransit.com>',
          to: customerEmail,
          subject,
          text: customerTextBody,
          html,
        });
        emailMessageId = info.messageId || `smtp_${Date.now()}`;
        sendSuccess = true;
        logger.info(`SMTP confirmation email sent to ${customerEmail} for booking ${confirmationCode}`);
      } catch (sErr) {
        providerError = sErr.message;
        logger.error(`SMTP email error for booking ${confCode}:`, sErr.message);
      }
    } else {
      emailMessageId = `simulated_${Date.now()}_${confCode}`;
      sendSuccess = true;
      logger.info(`[Email] Simulated local delivery for ${confCode} (messageId: ${emailMessageId})`);
    }

    if (sendSuccess) {
      await bookingRepository.upsertEmailDeliveryRecord({
        booking_id: bookingId,
        confirmation_code: confCode,
        email_type: 'BOOKING_CONFIRMATION',
        recipient: customerEmail,
        status: 'SENT',
        provider: 'RESEND',
        provider_message_id: emailMessageId,
        attempt_count: currentAttempt
      });
      await bookingRepository.markConfirmationEmailSent(bookingId, emailMessageId);
      return { success: true, messageId: emailMessageId, status: 'SENT' };
    } else {
      await bookingRepository.upsertEmailDeliveryRecord({
        booking_id: bookingId,
        confirmation_code: confCode,
        email_type: 'BOOKING_CONFIRMATION',
        recipient: customerEmail,
        status: 'FAILED',
        provider: 'RESEND',
        error_code: 'EMAIL_PROVIDER_ERROR',
        error_message: providerError || 'Failed to send email via email provider.',
        attempt_count: currentAttempt
      });
      return {
        success: false,
        errorCode: 'EMAIL_PROVIDER_ERROR',
        errorMessage: providerError || 'Failed to send email via provider',
        status: 'FAILED'
      };
    }

  } catch (error) {
    logger.error('[Email] Exception in sendBookingConfirmation:', error.message);
    return { success: false, errorCode: 'EMAIL_DELIVERY_EXCEPTION', errorMessage: error.message, status: 'FAILED' };
  }
};

export const sendBookingRequestReceivedEmail = async (bookingIdInput, { force = false } = {}) => {
  let bookingId = typeof bookingIdInput === 'object' ? (bookingIdInput.id || bookingIdInput.booking_id || bookingIdInput.confirmation_code) : bookingIdInput;
  try {
    const booking = await bookingRepository.getById(bookingId);
    if (!booking) return { success: false, error: 'Booking not found' };

    bookingId = booking.id;


    if (!force && booking.booking_request_email_status === 'SENT') {
      logger.info(`[Email] sendBookingRequestReceivedEmail skipped (already sent) for ${booking.confirmation_code}`);
      return { success: true, emailId: booking.booking_request_email_id, skipped: true };
    }

    const itinerary = buildCanonicalItinerary(booking);
    if (!itinerary.outbound || itinerary.outbound.length === 0) {
      const errMsg = 'BOOKING_ITINERARY_MISSING: Cannot dispatch email for booking without committed flight segments.';
      logger.error(`[Email] ${errMsg} (bookingId=${bookingId})`);
      await bookingRepository.updateBookingStatus(bookingId, {
        booking_request_email_status: 'FAILED',
        booking_request_email_error: 'BOOKING_ITINERARY_MISSING'
      });
      return { success: false, error: 'BOOKING_ITINERARY_MISSING' };
    }

    const customerEmail = booking.email || booking.contacts?.[0]?.email || booking.travellers?.[0]?.email;
    if (!customerEmail || !customerEmail.includes('@')) {
      const errMsg = 'This booking does not have a valid passenger email address.';
      await bookingRepository.updateBookingStatus(bookingId, {
        booking_request_email_status: 'FAILED',
        booking_request_email_error: errMsg
      });
      return { success: false, error: errMsg };
    }

    const confirmationCode = booking.confirmation_code || booking.confirmationCode || 'TFS-PENDING';
    const passengerName = booking.passenger_name || 'Valued Passenger';
    const passengerFirstName = passengerName.split(' ')[0] || 'Passenger';
    const passengerCount = (booking.travellers?.length || 1).toString();
    const currency = (booking.currency || 'USD').toUpperCase();
    const currencySymbol = currency === 'EUR' ? '€' : (currency === 'GBP' ? '£' : '$');
    const customerTotal = parseFloat(booking.customer_price || booking.total_amount || 0).toFixed(2);
    const bookingDate = booking.created_at ? formatUsDate(booking.created_at) : formatUsDate(new Date());

    const outboundSegs = itinerary.outbound;
    const returnSegs = itinerary.return;
    const outSeg = outboundSegs[0];
    const retSeg = returnSegs[0] || null;

    const templatePath = path.join(__dirname, 'templates', 'booking-confirmation.html');
    let templateSource = await fs.readFile(templatePath, 'utf8').catch(() => null);

    if (!templateSource) {
      templateSource = `<h2>Booking Request Received</h2><p>Thank you {{passengerFirstName}}! Confirmation Number: <strong>{{confirmationCode}}</strong></p>`;
    } else {
      templateSource = templateSource.replace('Payment Confirmation', 'Booking Request Received');
      templateSource = templateSource.replace('Payment Successfully Received', 'Booking Request Received');
      templateSource = templateSource.replace('Your payment has been successfully processed.', 'Your booking request has been received.');
      templateSource = templateSource.replace(/This temporary confirmation number is not the airline's final PNR[\s\S]*?processing\./g, '');
    }

    const template = Handlebars.compile(templateSource);

    const templateData = {
      emailHeaderSubtitle: 'FLIGHT RESERVATION CONFIRMATION',
      confirmationCode: confirmationCode,
      passengerFirstName: passengerFirstName,
      passengerName: passengerName,
      currencySymbol: currencySymbol,
      amountPaid: customerTotal,
      currency: currency,
      paymentMethod: 'Card Authorization Pending',
      paymentDate: bookingDate,
      passengerCount: passengerCount,
      customerEmail: customerEmail,

      outboundAirline: outSeg.airlineName,
      outboundFlightNumber: outSeg.flightNumber,
      outboundOriginCity: outSeg.originName,
      outboundOriginCode: outSeg.originCode,
      outboundDestinationCity: outboundSegs[outboundSegs.length - 1]?.destinationName || '',
      outboundDestinationCode: outboundSegs[outboundSegs.length - 1]?.destinationCode || '',
      outboundDepartureDate: formatUsDate(outSeg.departureDate),
      outboundDepartureTime: formatUsTime(outSeg.departureTime),
      outboundArrivalDate: formatUsDate(outSeg.arrivalDate),
      outboundArrivalTime: formatUsTime(outSeg.arrivalTime),
      outboundCabin: outSeg.cabinClass,
      outboundStops: outboundSegs.length > 1 ? `${outboundSegs.length - 1} Stop(s)` : (outSeg.stops === 0 ? 'Nonstop' : `${outSeg.stops || 0} Stop(s)`),

      hasReturnFlight: !!retSeg,

      returnAirline: retSeg?.airlineName || '',
      returnFlightNumber: retSeg?.flightNumber || '',
      returnOriginCity: retSeg?.originName || '',
      returnOriginCode: retSeg?.originCode || '',
      returnDestinationCity: returnSegs.length > 0 ? returnSegs[returnSegs.length - 1]?.destinationName : '',
      returnDestinationCode: returnSegs.length > 0 ? returnSegs[returnSegs.length - 1]?.destinationCode : '',
      returnDepartureDate: retSeg ? formatUsDate(retSeg.departureDate) : '',
      returnDepartureTime: retSeg ? formatUsTime(retSeg.departureTime) : '',
      returnArrivalDate: retSeg ? formatUsDate(retSeg.arrivalDate) : '',
      returnArrivalTime: retSeg ? formatUsTime(retSeg.arrivalTime) : '',
      returnCabin: retSeg?.cabinClass || '',
      returnStops: returnSegs.length > 1 ? `${returnSegs.length - 1} Stop(s)` : (retSeg?.stops === 0 ? 'Nonstop' : `${retSeg?.stops || 0} Stop(s)`)
    };

    const html = template(templateData);

    validateHtmlOutput(html, 'booking-confirmation', confirmationCode);


    const textBody = `
THE FINAL SEAT — BOOKING REQUEST RECEIVED

Thank you, ${passengerFirstName}!

Your booking request has been received for processing.

TEMPORARY CONFIRMATION NUMBER: ${confirmationCode}

PASSENGER DETAILS:
Primary Passenger: ${passengerName}
Number of Passengers: ${passengerCount}
Contact Email: ${customerEmail}

IMPORTANT NOTICE:
This temporary confirmation number is not the airline's final PNR or electronic ticket. Final airline confirmation and ticket details will be sent separately after processing.

Track your booking request at: https://www.faretransit.com/my-bookings?code=${confirmationCode}
Support: ${env.supportPhoneDisplay} | support@faretransit.com
    `.trim();

    const subject = `Booking Request Received — ${confirmationCode}`;
    const result = await sendViaResend({
      recipients: [customerEmail],
      subject,
      textBody,
      htmlBody: html,
      replyTo: 'support@faretransit.com'
    });

    const emailId = result?.messageId || result?.id || null;
    if (!emailId) {
      const errMsg = env.resendApiKey ? 'EMAIL_PROVIDER_ID_MISSING: Resend did not return a message ID' : 'EMAIL_PROVIDER_NOT_CONFIGURED: Resend API Key is missing';
      await bookingRepository.updateBookingStatus(bookingId, {
        booking_request_email_status: 'FAILED',
        booking_request_email_error: errMsg
      });
      return { success: false, error: errMsg };
    }

    const sentAt = new Date().toISOString();

    await bookingRepository.updateBookingStatus(bookingId, {
      booking_request_email_status: 'SENT',
      booking_request_email_id: emailId,
      booking_request_email_sent_at: sentAt,
      booking_request_email_recipient: customerEmail,
      booking_request_email_error: null
    });

    logger.info(`[Email Log] bookingId=${bookingId} confirmationCode=${confirmationCode} emailType=booking_request recipient=${customerEmail} providerMessageId=${emailId} result=success`);

    return { success: true, emailId, providerMessageId: emailId };
  } catch (err) {
    const errorMsg = err.message || 'Email dispatch failed';
    logger.error(`[Email Log] bookingId=${bookingId} emailType=booking_request result=failed error=${errorMsg}`);
    await bookingRepository.updateBookingStatus(bookingId, {
      booking_request_email_status: 'FAILED',
      booking_request_email_error: errorMsg
    });
    return { success: false, error: errorMsg };
  }
};

export const sendPassengerAuthorizationEmail = async (bookingIdInput) => {
  let bookingId = bookingIdInput;
  try {
    const booking = await bookingRepository.getCompleteBookingById(bookingIdInput);
    if (!booking) return { success: false, error: 'Booking not found' };
    bookingId = booking.id;


    if (!booking.itinerary || !booking.itinerary.outbound || booking.itinerary.outbound.length === 0) {
      const errMsg = 'EMAIL_PROTECTION_BLOCKED: Cannot dispatch authorization request email because flight itinerary segments snapshot is missing.';
      logger.error(`[Email Protection] ${errMsg} (bookingId=${bookingId})`);
      await bookingRepository.updateBookingStatus(bookingId, {
        authorization_email_status: 'FAILED',
        authorization_email_error: errMsg
      });
      return { success: false, error: errMsg };
    }

    const customerEmail = booking.email || booking.contacts?.[0]?.email || booking.travellers?.[0]?.email;
    if (!customerEmail || !customerEmail.includes('@')) {
      const errMsg = 'This booking does not have a valid passenger email address.';
      await bookingRepository.updateBookingStatus(bookingId, {
        authorization_email_status: 'FAILED',
        authorization_email_error: errMsg
      });
      return { success: false, error: errMsg };
    }

    // Always fetch fresh payment splits directly from backend repository
    const splits = await bookingRepository.getPaymentSplits(booking.id);

    if (!splits || splits.length === 0) {
      const errMsg = 'EMAIL_PROTECTION_BLOCKED: No saved payment split breakdown exists for this booking.';
      logger.error(`[Email Protection] ${errMsg} (bookingId=${bookingId})`);
      await bookingRepository.updateBookingStatus(bookingId, {
        authorization_email_status: 'FAILED',
        authorization_email_error: errMsg
      });
      return { success: false, error: errMsg };
    }

    // Validate split merchant names & amounts
    for (const s of splits) {
      const amt = parseFloat(s.amount || 0);
      const name = String(s.merchant_name || s.merchantName || '').trim();
      if (!name || isNaN(amt) || amt <= 0) {
        const errMsg = `EMAIL_PROTECTION_BLOCKED: Saved payment split for "${name || 'Merchant'}" contains invalid amount ($${amt}).`;
        await bookingRepository.updateBookingStatus(bookingId, {
          authorization_email_status: 'FAILED',
          authorization_email_error: errMsg
        });
        return { success: false, error: errMsg };
      }
    }

    const splitTotal = splits.reduce((sum, s) => sum + parseFloat(s.amount || 0), 0);
    const authorizedAmount = parseFloat(booking.authorized_amount || booking.customer_price || booking.total_amount || 0);

    // Decimal-safe validation: compare splitTotal vs authorizedAmount
    if (authorizedAmount > 0 && Math.abs(splitTotal - authorizedAmount) > 0.01) {
      const errMsg = `EMAIL_PROTECTION_BLOCKED: Saved payment split total ($${splitTotal.toFixed(2)}) does not match the authorized amount ($${authorizedAmount.toFixed(2)}).`;
      logger.error(`[Email Protection] ${errMsg} (bookingId=${bookingId})`);
      await bookingRepository.updateBookingStatus(bookingId, {
        authorization_email_status: 'FAILED',
        authorization_email_error: errMsg
      });
      return { success: false, error: errMsg };
    }

    const amount = splitTotal.toFixed(2);
    const currency = (booking.currency || 'USD').toUpperCase();

    const authResult = await passengerAuthorizationService.createAuthorizationToken(booking);
    const token = authResult.token;
    const authUrl = `https://www.faretransit.com/authorize/${token}`;

    const confirmationCode = booking.confirmation_code || 'TFS-PENDING';
    const passengerName = booking.passenger_name || 'Valued Passenger';
    const passengerFirstName = passengerName.split(' ')[0] || 'Passenger';


    let splitsHtml = '';
    if (splits && splits.length > 0) {
      splitsHtml = `
        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 10px; padding: 14px; margin: 16px 0;">
          <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #8b1236; letter-spacing: 0.8px; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">
            Payment Authorization Breakdown
          </div>
          <table role="presentation" width="100%" style="width: 100%; border-collapse: collapse; margin-bottom: 8px;">
            ${splits.map((s) => `
              <tr>
                <td style="font-size: 13px; color: #475569; padding: 6px 0; font-family: Arial, sans-serif;">
                  ${s.merchant_name || s.merchantName || 'Merchant'}
                </td>
                <td style="font-size: 13px; font-weight: 700; color: #1e293b; text-align: right; padding: 6px 0; font-family: Arial, sans-serif;">
                  $${parseFloat(s.amount || 0).toFixed(2)} ${(s.currency || currency).toUpperCase()}
                </td>
              </tr>
            `).join('')}
          </table>
          <table role="presentation" width="100%" style="width: 100%; border-collapse: collapse; border-top: 2px solid #8b1236; margin-top: 4px; padding-top: 8px;">
            <tr>
              <td style="font-size: 12px; font-weight: 800; color: #1e293b; text-transform: uppercase; padding: 8px 0; font-family: Arial, sans-serif;">
                Total Authorized Amount:
              </td>
              <td style="font-size: 15px; font-weight: 900; color: #8b1236; text-align: right; padding: 8px 0; font-family: Arial, sans-serif;">
                $${amount} ${currency}
              </td>
            </tr>
          </table>
        </div>
      `;
    }

    const subject = `Action Required — Authorize Booking ${confirmationCode}`;
    const textBody = `
THE FINAL SEAT — ACTION REQUIRED: AUTHORIZE FLIGHT RESERVATION

Dear ${passengerFirstName},

Please review and authorize your flight reservation ${confirmationCode} for a total charge of $${amount} ${currency}.
${splits.map(s => `\nMerchant: ${s.merchant_name || s.merchantName}\nAmount: $${parseFloat(s.amount || 0).toFixed(2)} ${(s.currency || currency).toUpperCase()}`).join('\n')}

Total Authorized Amount: $${amount} ${currency}

Click the secure authorization link below to confirm your itinerary:
${authUrl}

This single-use link expires in 24 hours.

Support 24/7: ${env.supportPhoneDisplay} | support@faretransit.com
    `.trim();

    const itineraryHtml = renderFlightItineraryHtml(booking);

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #ffffff; box-shadow: 0 8px 24px rgba(79,16,43,0.12);">
        <div style="background: #8b1236; padding: 24px 18px; text-align: center;">
          <div style="display: inline-block; margin-bottom: 6px;">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" fill="#e2b84d"/>
            </svg>
          </div>
          <div style="color: #ffffff; font-size: 22px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase;">THE FINAL SEAT</div>
          <div style="color: #f8dfe8; font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; margin-top: 4px;">PASSENGER RESERVATION AUTHORIZATION REQUEST</div>
        </div>
        <div style="padding: 24px; color: #334155;">
          <h2 style="color: #8b1236; margin-top: 0; font-size: 18px;">Action Required: Authorize Reservation</h2>
          <p>Dear <strong>${passengerFirstName}</strong>,</p>
          <p>Please review and confirm your flight details for temporary confirmation <strong>${confirmationCode}</strong>. Total authorized charge: <strong>$${amount} ${currency}</strong>.</p>
          
          <div style="margin: 20px 0;">
            ${itineraryHtml}
          </div>

          ${splitsHtml}

          <div style="text-align: center; margin: 28px 0;">
            <a href="${authUrl}" style="background-color: #8b1236; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 800; font-size: 15px; display: inline-block; letter-spacing: 0.5px;">Review &amp; Authorize Booking &rarr;</a>
          </div>
          <p style="font-size: 12px; color: #64748b; line-height: 1.4; text-align: center;">This secure, single-use authorization link expires in 24 hours. Your saved card will only be processed after you review and authorize.</p>
        </div>
        <div style="background: #fbf8f9; padding: 16px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0;">
          FareTransit LLC &bull; 24/7 Customer Desk: support@faretransit.com &bull; ${env.supportPhoneDisplay}
        </div>
      </div>
    `.trim();


    const result = await sendViaResend({
      recipients: [customerEmail],
      subject,
      textBody,
      htmlBody,
      replyTo: 'support@faretransit.com'
    });

    const emailId = result?.messageId || result?.id || null;
    if (!emailId) {
      const errMsg = env.resendApiKey ? 'EMAIL_PROVIDER_ID_MISSING: Resend did not return a message ID' : 'EMAIL_PROVIDER_NOT_CONFIGURED: Resend API Key is missing';
      await bookingRepository.updateBookingStatus(bookingId, {
        authorization_email_status: 'FAILED',
        authorization_email_error: errMsg
      });
      return { success: false, error: errMsg };
    }

    const sentAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await bookingRepository.saveEmailActivity(bookingId, {
      template_type: 'AUTHORIZATION_EMAIL',
      status: 'SENT',
      provider_message_id: emailId,
      recipient: customerEmail,
      sent_at: sentAt,
      expires_at: expiresAt
    });

    await bookingRepository.updateBookingStatus(bookingId, {
      status: 'AWAITING_AUTHORIZATION',
      authorization_email_status: 'SENT',
      authorization_email_id: emailId,
      authorization_email_sent_at: sentAt,
      authorization_email_recipient: customerEmail,
      authorization_email_error: null,
      authorization_expires_at: expiresAt
    });

    logger.info(`[Email Log] bookingId=${bookingId} confirmationCode=${confirmationCode} emailType=authorization recipient=${customerEmail} providerMessageId=${emailId} result=success`);

    return { success: true, emailId, providerMessageId: emailId, authUrl };
  } catch (err) {
    const errorMsg = err.message || 'Authorization email dispatch failed';
    logger.error(`[Email Log] bookingId=${bookingId} emailType=authorization result=failed error=${errorMsg}`);
    await bookingRepository.saveEmailActivity(bookingId, {
      template_type: 'AUTHORIZATION_EMAIL',
      status: 'FAILED',
      recipient: customerEmail,
      error: errorMsg
    });
    await bookingRepository.updateBookingStatus(bookingId, {
      authorization_email_status: 'FAILED',
      authorization_email_error: errorMsg
    });
    return { success: false, error: errorMsg };
  }
};



export const sendPaymentFailedEmail = async (booking, reason = 'Payment processing failed') => {
  try {
    const bookingId = booking.id || booking.booking_id;
    const email = booking.email || booking.customerEmail || '';
    if (!email) return { success: false, error: 'No recipient email provided' };

    const bookingReference = booking.confirmation_code || booking.bookingReference || 'TFS-RETRY';
    const customerName = booking.passenger_name || booking.customerName || 'Valued Customer';
    const frontendUrl = env.frontendUrl || 'https://faretransit.com';
    const retryUrl = `${frontendUrl}/booking`;

    const textBody = `
Dear ${customerName},

We were unable to process your payment for Booking ID ${bookingReference}.

Reason: ${reason}

Your reservation remains on hold. Please retry your payment using the link below to confirm your flight:
${retryUrl}

If you require assistance, contact our 24/7 support desk:
Email: support@faretransit.com
Phone: ${env.supportPhoneDisplay}

FareTransit LLC
    `.trim();

    const htmlBody = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
  <h2 style="color: #dc2626;">Payment Action Required</h2>
  <p>Dear ${customerName},</p>
  <p>We were unable to process your payment for Booking ID <strong>${bookingReference}</strong>.</p>
  <p style="background: #fef2f2; border: 1px solid #fecaca; padding: 12px; border-radius: 8px; color: #991b1b;">
    <strong>Details:</strong> ${reason}
  </p>
  <p>Please click the button below to retry your payment and secure your flight tickets:</p>
  <p style="text-align: center; margin: 24px 0;">
    <a href="${retryUrl}" style="background: #dc2626; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Retry Payment Now &rarr;</a>
  </p>
  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
  <p style="font-size: 12px; color: #64748b;">
    FareTransit LLC &middot; Support: support@faretransit.com | ${env.supportPhoneDisplay}
  </p>
</div>
    `.trim();

    let messageId = `failed_${Date.now()}`;
    if (env.resendApiKey?.trim()) {
      const res = await sendViaResend({
        recipients: [email],
        subject: `Payment Action Required — Booking ID ${bookingReference} | FareTransit`,
        textBody,
        htmlBody,
        replyTo: 'support@faretransit.com'
      });
      if (res && res.messageId) messageId = res.messageId;
    }

    return { success: true, messageId };
  } catch (err) {
    logger.error(`[Email] Error sending payment failed email: ${err.message}`);
    return { success: false, error: err.message };
  }
};

export function renderFlightItineraryHtml(bookingOrSegments) {

  const itinerary = buildCanonicalItinerary(bookingOrSegments);
  const outboundSegs = itinerary.outbound || [];
  const returnSegs = itinerary.return || [];

  if (outboundSegs.length === 0 && returnSegs.length === 0) {
    return `<div style="padding: 14px; background: #f8fafc; border-radius: 8px; color: #64748b; font-size: 13px; text-align: center;">Flight itinerary details will be updated upon final airline confirmation.</div>`;
  }

  function renderGroup(segList, title) {
    if (!segList || segList.length === 0) return '';

    const firstSeg = segList[0];
    const lastSeg = segList[segList.length - 1];

    const overallDepDate = firstSeg.departureDate || (firstSeg.departureAt ? String(firstSeg.departureAt).split('T')[0] : '');
    const overallArrDate = lastSeg.arrivalDate || (lastSeg.arrivalAt ? String(lastSeg.arrivalAt).split('T')[0] : '');
    const arrDayShiftLabel = getArrivalDayShiftLabel(overallDepDate, overallArrDate);

    // Multi-carrier check
    const uniqueCarriers = Array.from(new Set(segList.map(s => (s.carrierCode || '').trim().toUpperCase()).filter(Boolean)));
    const isMultiCarrier = uniqueCarriers.length > 1;
    const primaryCarrierCode = uniqueCarriers[0] || 'FLT';
    const primaryAirlineName = isMultiCarrier ? 'Multiple Airlines' : (firstSeg.airlineName || resolveAirlineName(primaryCarrierCode));
    const logoUrl = getCarrierLogoUrl(primaryCarrierCode);

    const logoHtml = logoUrl
      ? `<img src="${logoUrl}" alt="${primaryAirlineName}" width="60" height="44" style="max-width: 60px; max-height: 44px; object-fit: contain; display: block;" />`
      : `<div style="width: 60px; height: 44px; background: #ffffff; border: 1px solid #d7e0ec; border-radius: 8px; font-size: 13px; font-weight: 800; color: #1e3a5f; text-align: center; line-height: 44px;">${primaryCarrierCode}</div>`;

    let html = `
      <div style="border: 1px solid #cbd5e1; border-radius: 12px; padding: 16px; margin-bottom: 16px; background: #ffffff;">
        
        <!-- HEADING WITH LEFT-SIDE AIRLINE LOGO -->
        <table role="presentation" width="100%" style="width: 100%; border-collapse: collapse; margin-bottom: 14px; border-bottom: 1px solid #f1f5f9; padding-bottom: 10px;">
          <tr>
            <td style="width: 64px; vertical-align: middle; padding-right: 12px;">
              <div style="width: 60px; height: 44px; border: 1px solid #d7e0ec; border-radius: 8px; background: #ffffff; overflow: hidden; padding: 2px;">
                ${logoHtml}
              </div>
            </td>
            <td style="vertical-align: middle;">
              <div style="font-size: 13px; font-weight: 800; color: #1e3a5f; text-transform: uppercase; letter-spacing: 0.5px;">${title}</div>
              <div style="font-size: 11px; font-weight: 600; color: #64748b; margin-top: 2px;">${primaryAirlineName}</div>
            </td>
          </tr>
        </table>
    `;

    // VISUAL TIMELINE ROUTE TABLE
    html += `<table role="presentation" width="100%" style="width: 100%; border-collapse: collapse; margin-bottom: 12px;"><tr>`;

    // Build timeline nodes
    const nodes = [];
    nodes.push({
      isEndpoint: true,
      airportCode: firstSeg.originCode || 'ORIG',
      cityName: firstSeg.originName || '',
      time: firstSeg.departureTime || '',
      label: 'DEPARTURE',
      labelColor: '#8b1236'
    });

    for (let i = 0; i < segList.length - 1; i++) {
      const segArr = segList[i];
      const segNextDep = segList[i + 1];

      const arrDate = segArr.arrivalDate || '';
      const arrTime = segArr.arrivalTime || '';
      const depDate = segNextDep.departureDate || '';
      const depTime = segNextDep.departureTime || '';

      const layoverText = calculateLayoverDuration(arrDate, arrTime, depDate, depTime);

      nodes.push({
        isEndpoint: false,
        airportCode: segArr.destinationCode || 'CONN',
        cityName: segArr.destinationName || '',
        time: arrTime,
        label: layoverText.toUpperCase(),
        labelColor: '#0369a1'
      });
    }

    nodes.push({
      isEndpoint: true,
      airportCode: lastSeg.destinationCode || 'DEST',
      cityName: lastSeg.destinationName || '',
      time: lastSeg.arrivalTime || '',
      label: arrDayShiftLabel,
      labelColor: arrDayShiftLabel.includes('+') ? '#d97706' : '#15803d'
    });

    const cellWidth = Math.floor(100 / (nodes.length * 2 - 1));

    nodes.forEach((node, idx) => {
      // Node cell (50% scale for connection airports)
      const codeSize = node.isEndpoint ? '22px' : '13px';
      const timeSize = node.isEndpoint ? '13px' : '10px';
      const labelSize = node.isEndpoint ? '10px' : '8px';

      html += `
        <td style="vertical-align: top; text-align: center; width: ${cellWidth}%;">
          <div style="font-size: ${timeSize}; font-weight: 800; color: #1e293b;">${node.time}</div>
          <div style="font-size: ${codeSize}; font-weight: 900; color: #0f172a; margin: 2px 0; line-height: 1;">${node.airportCode}</div>
          <div style="font-size: ${labelSize}; font-weight: 800; color: ${node.labelColor}; text-transform: uppercase;">${node.label}</div>
          ${node.cityName && node.cityName !== node.airportCode ? `<div style="font-size: 8px; color: #64748b; margin-top: 1px;">${node.cityName}</div>` : ''}
        </td>
      `;

      // Connecting line cell if not last node
      if (idx < nodes.length - 1) {
        const seg = segList[idx];
        const flightDesignator = `${seg.carrierCode || ''} ${seg.flightNumber || ''}`.trim();
        html += `
          <td style="vertical-align: middle; text-align: center; width: ${cellWidth}%; padding: 0 4px;">
            <div style="font-size: 9px; font-weight: 700; color: #475569; margin-bottom: 2px; white-space: nowrap;">&#9992; ${flightDesignator}</div>
            <div style="border-top: 2px dashed #94a3b8; width: 100%; height: 1px;"></div>
          </td>
        `;
      }
    });

    html += `</tr></table>`;

    // SEGMENT DETAILS CARDS BELOW TIMELINE
    segList.forEach((s, idx) => {
      const code = (s.carrierCode || '').trim().toUpperCase();
      const carrierName = s.airlineName || (code ? `${code} Airlines` : 'Airline');
      const flightNum = s.flightNumber || '';
      const flightDesignator = `${code} ${flightNum}`.trim();
      const cabin = s.cabinClass || 'Economy';

      html += `
        <div style="border-top: 1px dashed #e2e8f0; padding-top: 8px; margin-top: 8px; font-size: 11px; color: #475569;">
          <strong>Segment ${idx + 1}:</strong> ${carrierName} (${flightDesignator}) &bull; ${s.originCode} &rarr; ${s.destinationCode} &bull; ${s.departureDate} ${s.departureTime ? 'at ' + s.departureTime : ''} &bull; ${cabin}
        </div>
      `;
    });

    html += `</div>`;
    return html;
  }

  let finalHtml = '';
  if (outboundSegs.length > 0) {
    finalHtml += renderGroup(outboundSegs, outboundSegs.length > 1 ? 'Outbound Journey (Connecting Flights)' : 'Outbound Flight');
  }
  if (returnSegs.length > 0) {
    finalHtml += renderGroup(returnSegs, returnSegs.length > 1 ? 'Return Journey (Connecting Flights)' : 'Return Flight');
  }

  return finalHtml;
}

export function renderFlightItineraryText(bookingOrSegments) {
  const itinerary = buildCanonicalItinerary(bookingOrSegments);
  const segments = [...(itinerary.outbound || []), ...(itinerary.return || [])];
  if (segments.length === 0) return 'Flight itinerary details will be updated upon final airline confirmation.';

  return segments.map((s, idx) => {
    return `Flight #${idx + 1}: ${s.airlineName} (${s.carrierCode} ${s.flightNumber}) | ${s.originCode} -> ${s.destinationCode} | Dep: ${s.departureDate || s.departureAt} ${s.departureTime || ''} | Arr: ${s.arrivalDate || s.arrivalAt} ${s.arrivalTime || ''} | ${s.cabinClass}`;
  }).join('\n');
}



export const sendFinalTicketEmail = async (bookingInput) => {
  try {
    const bookingId = typeof bookingInput === 'object' ? (bookingInput.id || bookingInput.booking_id) : bookingInput;
    
    // Strict Data Integrity Validation before sending final ticket email
    const { default: bookingValidatorService } = await import('../../modules/bookings/booking-validator.service.mjs');
    const integrityResult = await bookingValidatorService.validateBookingIntegrity(bookingId, {
      requireItinerary: true,
      requirePassengers: true,
      requirePnr: true,
      requireTicket: true,
      requireAuthorization: true
    });

    if (!integrityResult.valid) {
      return {
        success: false,
        error: `Final ticket email blocked: ${integrityResult.errors.join(' ')}`
      };
    }

    const booking = integrityResult.booking || (await bookingRepository.getCompleteBookingById(bookingId));
    if (!booking) return { success: false, error: 'Booking not found' };

    const airlinePnr = (booking.airline_confirmation_number || booking.airline_pnr || booking.pnr || '').trim().toUpperCase();
    if (!airlinePnr || !/^[A-Z0-9]{6}$/.test(airlinePnr)) {
      return { success: false, error: 'Final ticket email cannot be sent because the airline PNR is missing or invalid.' };
    }

    // Check passenger authorization status from passenger_authorizations table/record
    const authStatus = (
      booking.authorization_status ||
      booking.authorization?.status ||
      booking.authorization_email_status
    );

    // Fetch authorization record directly if not on booking
    let isAuthorized = authStatus === 'AUTHORIZED' || authStatus === 'ACCEPTED' || authStatus === 'accepted';
    if (!isAuthorized) {
      try {
        const { default: passengerAuthorizationService } = await import('../../modules/authorizations/passenger-authorization.service.mjs');
        const evidence = await passengerAuthorizationService.generateAuditEvidenceExport(bookingId);
        if (evidence && (evidence.authorization?.status === 'ACCEPTED' || evidence.authorization?.status === 'AUTHORIZED')) {
          isAuthorized = true;
        }
      } catch (e) {
        /* Ignore lookup error if evidence absent */
      }
    }

    if (!isAuthorized) {
      return {
        success: false,
        error: 'Final ticket email cannot be sent because passenger authorization status is not AUTHORIZED.'
      };
    }

    const customerEmail = booking.email || booking.customerEmail || booking.contacts?.[0]?.email || booking.travellers?.[0]?.email;
    if (!customerEmail || !customerEmail.includes('@')) {
      const errMsg = 'This booking does not have a valid passenger email address.';
      await bookingRepository.updateBookingStatus(booking.id, {
        final_confirmation_email_status: 'FAILED',
        final_confirmation_email_error: errMsg
      });
      return { success: false, error: errMsg };
    }

    const bookingReference = booking.confirmation_code || booking.bookingReference || booking.id;
    const passengerName = booking.passenger_name || booking.customerName || 'Valued Passenger';
    const passengerFirstName = passengerName.split(' ')[0] || 'Passenger';
    const travellers = booking.passengers || booking.travellers || booking.traveller_details || [];
    const amountPaid = parseFloat(booking.customer_price || booking.total_amount || 0).toFixed(2);
    const currency = (booking.currency || 'USD').toUpperCase();
    const ticketNumber = booking.ticket_number || `TKT-${Date.now().toString().slice(-8)}`;

    const itineraryHtml = renderFlightItineraryHtml(booking);



    const subject = `Official Flight E-Ticket & Confirmation — Booking ID ${bookingReference} | FareTransit`;

    const textBody = `
THE FINAL SEAT — OFFICIAL FLIGHT E-TICKET CONFIRMATION

Dear ${passengerFirstName},

Your flight ticket has been issued successfully. Below are your official booking and e-ticket details:

BOOKING ID: ${bookingReference}
AIRLINE CONFIRMATION (PNR): ${airlinePnr}
TICKET NUMBER: ${ticketNumber}
Passenger: ${passengerName} (${travellers.length || 1} Traveler(s))
Contact Email: ${customerEmail}

PAYMENT SUMMARY:
Total Amount Paid: $${amountPaid} ${currency}
Payment Status: PAID & VERIFIED

Thank you for choosing FareTransit! Have a wonderful trip.

24/7 Support Desk: ${env.supportPhoneDisplay} | support@faretransit.com
    `.trim();

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; background: #f8f4f5; margin: 0; padding: 20px; }
    .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 24px rgba(79,16,43,0.12); }
    <div style="background: #8b1236; color: #ffffff; padding: 24px 18px; text-align: center;">
      <div style="display: inline-block; margin-bottom: 6px;">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" fill="#e2b84d"/>
        </svg>
      </div>
      <div style="font-size: 22px; line-height: 26px; font-weight: 900; color: #ffffff; letter-spacing: 2px; text-transform: uppercase;">THE FINAL SEAT</div>
      <div style="font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #f8dfe8; margin-top: 4px;">OFFICIAL FLIGHT E-TICKET &amp; CONFIRMATION</div>
    </div>

    <div class="body">
      <div class="ticket-badge">✓ E-Ticket Issued Successfully</div>
      <p style="font-size: 15px; color: #475569; line-height: 1.5;">
        Dear <strong>${passengerFirstName}</strong>,<br>
        Your flight booking is confirmed and ticketed. Below are your official reservation and ticket details:
      </p>

      <div class="box">
        <div class="box-title">Booking ID</div>
        <div class="box-code">${bookingReference}</div>
        <div style="font-size: 14px; color: #1e3a5f; margin-top: 6px;">
          Airline Confirmation (PNR): <strong>${airlinePnr}</strong>
        </div>
        <div style="font-size: 13px; color: #64748b; margin-top: 2px;">
          Ticket #: <strong>${ticketNumber}</strong> &middot; Passenger: <strong>${passengerName}</strong>
        </div>
      </div>

      <h4 style="color: #1e3a5f; margin: 20px 0 10px 0; font-size: 14px;">Flight Itinerary</h4>
      ${itineraryHtml}

      <div style="background: #f1f5f9; border-radius: 8px; padding: 12px; font-size: 13px; color: #334155; margin-top: 16px;">
        <strong>Payment Status:</strong> Paid &amp; Confirmed ($${amountPaid} ${currency})
      </div>
    </div>
    <div class="footer">
      FareTransit LLC &middot; 24/7 Customer Support: support@faretransit.com &middot; ${env.supportPhoneDisplay}
    </div>
  </div>
</body>
</html>
    `.trim();

    let emailMessageId = null;
    if (env.resendApiKey?.trim()) {
      const result = await sendViaResend({
        recipients: [customerEmail],
        subject,
        textBody,
        htmlBody,
        replyTo: 'support@faretransit.com'
      });
      emailMessageId = result?.messageId || result?.id || null;
    }

    if (!emailMessageId) {
      const errMsg = env.resendApiKey?.trim() ? 'EMAIL_PROVIDER_ID_MISSING: Resend did not return a message ID' : 'EMAIL_PROVIDER_NOT_CONFIGURED: Resend API Key is missing';
      await bookingRepository.updateBookingStatus(booking.id, {
        final_confirmation_email_status: 'FAILED',
        final_confirmation_email_error: errMsg
      });
      return { success: false, error: errMsg };
    }

    const sentAt = new Date().toISOString();
    await bookingRepository.updateBookingStatus(booking.id, {
      final_confirmation_email_status: 'SENT',
      final_confirmation_email_id: emailMessageId,
      final_confirmation_email_sent_at: sentAt,
      final_confirmation_email_recipient: customerEmail,
      final_confirmation_email_error: null
    });

    logger.info(`[Email Log] bookingId=${booking.id} confirmationCode=${bookingReference} emailType=final_confirmation recipient=${customerEmail} providerMessageId=${emailMessageId} result=success`);
    return { success: true, emailId: emailMessageId, sentAt };
  } catch (err) {
    const errorMsg = err.message || 'Final ticket email dispatch failed';
    logger.error(`[Email Log] emailType=final_confirmation result=failed error=${errorMsg}`);
    if (typeof bookingInput === 'string' || bookingInput?.id) {
      const targetId = typeof bookingInput === 'string' ? bookingInput : bookingInput.id;
      await bookingRepository.updateBookingStatus(targetId, {
        final_confirmation_email_status: 'FAILED',
        final_confirmation_email_error: errorMsg
      });
    }
    return { success: false, error: errorMsg };
  }
};

export const sendAdminBookingAcknowledgement = async (bookingInput, options = {}) => {
  try {
    if (!env.adminBookingNotificationsEnabled && !options.force) {
      logger.info('[Admin Email] Notifications disabled via ADMIN_BOOKING_NOTIFICATIONS_ENABLED=false.');
      return { success: true, disabled: true, status: 'SKIPPED' };
    }

    const rawId = typeof bookingInput === 'object' ? (bookingInput.id || bookingInput.booking_id || bookingInput.confirmation_code) : bookingInput;
    const booking = (await bookingRepository.getCompleteBookingById(rawId)) || (await bookingRepository.getById(rawId));
    if (!booking) {
      return { success: false, errorCode: 'BOOKING_NOT_FOUND', errorMessage: 'Booking record not found' };
    }

    const bookingId = booking.id;
    const confCode = booking.confirmation_code || booking.confirmationCode || 'TFS-PENDING';
    const adminRecipient = env.adminBookingNotificationEmail || 'viansaini1608@gmail.com';

    // 1. Idempotency Guard via email_deliveries table
    const existingDelivery = await bookingRepository.getEmailDeliveryStatus(bookingId, 'ADMIN_NEW_BOOKING_ACKNOWLEDGEMENT');
    if (existingDelivery && existingDelivery.status === 'SENT' && !options.force) {
      logger.info(`[Admin Email] Idempotency: Skipping duplicate admin notification email for booking ${confCode} (already SENT with messageId ${existingDelivery.provider_message_id})`);
      return {
        success: true,
        duplicate: true,
        messageId: existingDelivery.provider_message_id,
        status: 'SENT'
      };
    }

    const currentAttempt = (existingDelivery?.attempt_count || 0) + 1;

    // Record PENDING state in email_deliveries table
    await bookingRepository.upsertEmailDeliveryRecord({
      booking_id: bookingId,
      confirmation_code: confCode,
      email_type: 'ADMIN_NEW_BOOKING_ACKNOWLEDGEMENT',
      recipient: adminRecipient,
      status: 'PENDING',
      provider: 'RESEND',
      attempt_count: currentAttempt
    });

    // 2. Validate Data Integrity Before Sending
    const { bookingValidatorService } = await import('../../modules/bookings/booking-validator.service.mjs');
    try {
      await bookingValidatorService.validateCompletedBooking(bookingId);
    } catch (valErr) {
      const errMsg = `ADMIN_EMAIL_BLOCKED: ${valErr.message}`;
      logger.error(`[Admin Email Protection] ${errMsg} (bookingId=${bookingId})`);
      await bookingRepository.upsertEmailDeliveryRecord({
        booking_id: bookingId,
        confirmation_code: confCode,
        email_type: 'ADMIN_NEW_BOOKING_ACKNOWLEDGEMENT',
        recipient: adminRecipient,
        status: 'FAILED',
        error_code: 'BOOKING_DATA_INCOMPLETE',
        error_message: errMsg,
        attempt_count: currentAttempt
      });
      return { success: false, errorCode: 'BOOKING_DATA_INCOMPLETE', errorMessage: errMsg };
    }

    const customerPrice = parseFloat(booking.customer_price || booking.total_amount || 0);
    if (isNaN(customerPrice) || customerPrice <= 0) {
      const errMsg = 'ADMIN_EMAIL_BLOCKED: Cannot send admin notification because total reservation amount is zero or invalid.';
      logger.error(`[Admin Email Protection] ${errMsg} (bookingId=${bookingId})`);
      await bookingRepository.upsertEmailDeliveryRecord({
        booking_id: bookingId,
        confirmation_code: confCode,
        email_type: 'ADMIN_NEW_BOOKING_ACKNOWLEDGEMENT',
        recipient: adminRecipient,
        status: 'FAILED',
        error_code: 'INVALID_BOOKING_PRICE',
        error_message: errMsg,
        attempt_count: currentAttempt
      });
      return { success: false, errorCode: 'INVALID_BOOKING_PRICE', errorMessage: errMsg };
    }

    const itinerary = buildCanonicalItinerary(booking);
    if (!itinerary.outbound || itinerary.outbound.length === 0) {
      const errMsg = 'ADMIN_EMAIL_BLOCKED: Cannot send admin notification for booking without itinerary segments.';
      logger.error(`[Admin Email Protection] ${errMsg} (bookingId=${bookingId})`);
      await bookingRepository.upsertEmailDeliveryRecord({
        booking_id: bookingId,
        confirmation_code: confCode,
        email_type: 'ADMIN_NEW_BOOKING_ACKNOWLEDGEMENT',
        recipient: adminRecipient,
        status: 'FAILED',
        error_code: 'BOOKING_ITINERARY_MISSING',
        error_message: errMsg,
        attempt_count: currentAttempt
      });
      return { success: false, errorCode: 'BOOKING_ITINERARY_MISSING', errorMessage: errMsg };
    }

    // 3. Server-side Urgency Calculation
    const outboundSegs = itinerary.outbound || [];
    const returnSegs = itinerary.return || [];
    const outSeg = outboundSegs[0] || {};
    
    let isUrgent = false;
    if (outSeg.departureDate || outSeg.departure_date) {
      const depDateStr = outSeg.departureDate || outSeg.departure_date;
      const depDate = new Date(depDateStr);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffMs = depDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays <= 3) {
        isUrgent = true;
      }
    }

    // Subject calculation
    const isTest = env.nodeEnv !== 'production';
    const testPrefix = isTest ? '[TEST] ' : '';
    const subjectPrefix = isUrgent ? `${testPrefix}URGENT New Booking` : `${testPrefix}New Booking Received`;
    const subject = `${subjectPrefix} — ${confCode}`;

    // Extract Passenger Info
    const rawPassengers = booking.passengers || booking.traveller_details || booking.travellers || [];
    const passengers = Array.isArray(rawPassengers)
      ? rawPassengers
      : (typeof rawPassengers === 'string' ? JSON.parse(rawPassengers || '[]') : []);
    const firstPassenger = passengers[0] || {};
    const passengerName = booking.passenger_name || `${firstPassenger.firstName || firstPassenger.first_name || ''} ${firstPassenger.lastName || firstPassenger.last_name || ''}`.trim() || 'Valued Customer';
    const customerEmail = booking.email || booking.customerEmail || 'Not provided';
    const customerPhone = booking.phone || booking.customerPhone || 'Not provided';
    const passengerCount = passengers.length > 0 ? String(passengers.length) : '1';

    // Price & Currency
    const amountStr = customerPrice.toFixed(2);
    const currency = (booking.currency || 'USD').toUpperCase();
    const currencySymbol = currency === 'USD' ? '$' : (currency === 'EUR' ? '€' : (currency === 'GBP' ? '£' : '$'));
    const formattedAmount = `${currencySymbol}${amountStr} ${currency}`;

    // Card Reference Info (Safe Metadata Only)
    const pm = booking.payment_method || booking.paymentMethod || booking.card_reference || {};
    const cardholderName = pm.cardholder_name || pm.cardholderName || booking.customerName || null;
    const cardBrand = pm.card_brand || pm.cardBrand || null;
    const cardLast4 = pm.card_last4 || pm.cardLast4 || null;
    const expMonth = pm.card_exp_month || pm.cardExpMonth || null;
    const expYear = pm.card_exp_year || pm.cardExpYear || null;

    let cardReferenceStr = 'Card reference unavailable';
    if (cardLast4) {
      const brandStr = cardBrand ? String(cardBrand).toUpperCase() : 'Card';
      const expStr = expMonth && expYear ? ` (Exp: ${expMonth}/${expYear})` : '';
      cardReferenceStr = `${brandStr} ending in ${cardLast4}${cardholderName ? ` · ${cardholderName}` : ''}${expStr}`;
    }

    const adminBookingUrl = `${env.frontendUrl}/admin/dashboard?search=${encodeURIComponent(confCode)}`;
    const createdAtStr = formatUsDate(booking.created_at || new Date());

    // Build Outbound & Return HTML & Text Summaries
    let outboundSummaryHtml = outboundSegs.map((s, idx) => `
      <div style="background: #f8fafc; padding: 12px 16px; border-radius: 8px; margin-bottom: 8px; border: 1px solid #e2e8f0;">
        <strong style="color: #1e3a5f;">Segment ${idx + 1}: ${s.airlineName || 'Airline'} ${s.flightNumber || ''}</strong> (${s.cabinClass || 'Economy'})<br/>
        From: <strong>${s.originName} (${s.originCode})</strong> → To: <strong>${s.destinationName} (${s.destinationCode})</strong><br/>
        Departure: ${formatUsDate(s.departureDate)} at ${formatUsTime(s.departureTime)}<br/>
        Arrival: ${formatUsDate(s.arrivalDate)} at ${formatUsTime(s.arrivalTime)}<br/>
        Stops: ${s.stops === 0 ? 'Nonstop' : `${s.stops} Stop(s)`}
      </div>
    `).join('');

    let returnSummaryHtml = returnSegs.map((s, idx) => `
      <div style="background: #faf5f7; padding: 12px 16px; border-radius: 8px; margin-bottom: 8px; border: 1px solid #f0d5de;">
        <strong style="color: #8b1538;">Return Segment ${idx + 1}: ${s.airlineName || 'Airline'} ${s.flightNumber || ''}</strong> (${s.cabinClass || 'Economy'})<br/>
        From: <strong>${s.originName} (${s.originCode})</strong> → To: <strong>${s.destinationName} (${s.destinationCode})</strong><br/>
        Departure: ${formatUsDate(s.departureDate)} at ${formatUsTime(s.departureTime)}<br/>
        Arrival: ${formatUsDate(s.arrivalDate)} at ${formatUsTime(s.arrivalTime)}<br/>
        Stops: ${s.stops === 0 ? 'Nonstop' : `${s.stops} Stop(s)`}
      </div>
    `).join('');

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 680px; margin: 0 auto; color: #1e293b; line-height: 1.6;">
        <div style="background: ${isUrgent ? '#8b1538' : '#1e3a5f'}; color: #ffffff; padding: 20px 24px; border-radius: 12px 12px 0 0;">
          <h2 style="margin: 0; font-size: 22px;">NEW BOOKING RECEIVED</h2>
          <p style="margin: 4px 0 0 0; font-size: 14px; opacity: 0.9;">FareTransit Internal Admin Notification</p>
        </div>

        ${isUrgent ? `
          <div style="background: #fffbeb; border-left: 4px solid #f59e0b; padding: 14px 18px; margin: 16px 0;">
            <strong style="color: #b45309; font-size: 16px;">⚠️ Priority Review Required</strong><br/>
            <span style="color: #78350f;">Travel begins within 3 days. Please review and process itinerary immediately.</span>
          </div>
        ` : ''}

        <div style="border: 1px solid #cbd5e1; border-top: none; padding: 24px; border-radius: 0 0 12px 12px; background: #ffffff;">
          <h3 style="margin: 0 0 12px 0; color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px;">Booking Summary</h3>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
            <tr><td style="padding: 6px 0; color: #64748b; width: 180px;">Booking Code:</td><td><strong style="color: #8b1538; font-size: 16px;">${confCode}</strong></td></tr>
            <tr><td style="padding: 6px 0; color: #64748b;">Booking Date:</td><td>${createdAtStr}</td></tr>
            <tr><td style="padding: 6px 0; color: #64748b;">Primary Passenger:</td><td><strong>${passengerName}</strong></td></tr>
            <tr><td style="padding: 6px 0; color: #64748b;">Passenger Email:</td><td><a href="mailto:${customerEmail}" style="color: #8b1538;">${customerEmail}</a></td></tr>
            <tr><td style="padding: 6px 0; color: #64748b;">Passenger Phone:</td><td>${customerPhone}</td></tr>
            <tr><td style="padding: 6px 0; color: #64748b;">Number of Passengers:</td><td>${passengerCount} Traveler(s)</td></tr>
          </table>

          <h3 style="margin: 20px 0 12px 0; color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px;">Itinerary Details</h3>
          ${outboundSummaryHtml}
          ${returnSummaryHtml}

          <h3 style="margin: 20px 0 12px 0; color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px;">Payment & Billing Reference</h3>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
            <tr><td style="padding: 6px 0; color: #64748b; width: 180px;">Reservation Amount:</td><td><strong style="color: #059669; font-size: 16px;">${formattedAmount}</strong></td></tr>
            <tr><td style="padding: 6px 0; color: #64748b;">Payment Status:</td><td><span style="background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 13px;">Payment Under Process</span></td></tr>
            <tr><td style="padding: 6px 0; color: #64748b;">Card Reference:</td><td>${cardReferenceStr}</td></tr>
          </table>

          <div style="margin-top: 28px; text-align: center;">
            <a href="${adminBookingUrl}" style="background: #8b1538; color: #ffffff; padding: 14px 28px; border-radius: 10px; text-decoration: none; font-weight: 800; font-size: 15px; display: inline-block;">
              Open Booking in Admin
            </a>
          </div>
        </div>
      </div>
    `;

    const textBody = `
NEW BOOKING RECEIVED — ${confCode}
${isUrgent ? 'PRIORITY REVIEW REQUIRED — Travel begins within 3 days.\n' : ''}
Booking ID: ${confCode}
Booking Date: ${createdAtStr}

PASSENGER:
Name: ${passengerName}
Email: ${customerEmail}
Phone: ${customerPhone}
Passengers Count: ${passengerCount}

PRICE:
Reservation Amount: ${formattedAmount}
Payment Status: Payment Under Process
Card Reference: ${cardReferenceStr}

OPEN BOOKING IN ADMIN:
${adminBookingUrl}
    `.trim();

    let emailMessageId = null;
    let sendSuccess = false;
    let providerError = null;

    if (env.resendApiKey?.trim()) {
      try {
        const result = await sendViaResend({
          recipients: [adminRecipient],
          subject,
          textBody,
          htmlBody,
          replyTo: customerEmail !== 'Not provided' ? customerEmail : undefined,
        });
        if (result && (result.messageId || result.id)) {
          emailMessageId = result.messageId || result.id || `admin_resend_${Date.now()}`;
          sendSuccess = true;
        }
      } catch (rErr) {
        providerError = rErr.message;
        logger.error(`[Admin Email] Resend API error for booking ${confCode}:`, rErr.message);
      }
    } else if (isSmtpConfigured()) {
      try {
        const transporter = getTransporter();
        const info = await transporter.sendMail({
          from: env.resendFrom || 'FareTransit <support@faretransit.com>',
          to: adminRecipient,
          subject,
          text: textBody,
          html: htmlBody,
        });
        emailMessageId = info.messageId || `admin_smtp_${Date.now()}`;
        sendSuccess = true;
        logger.info(`SMTP admin booking notification sent to ${adminRecipient} for booking ${confCode}`);
      } catch (sErr) {
        providerError = sErr.message;
        logger.error(`SMTP admin email error for booking ${confCode}:`, sErr.message);
      }
    } else {
      emailMessageId = `admin_simulated_${Date.now()}_${confCode}`;
      sendSuccess = true;
      logger.info(`[Admin Email] Simulated local delivery to ${adminRecipient} for ${confCode} (messageId: ${emailMessageId})`);
    }

    if (sendSuccess) {
      await bookingRepository.upsertEmailDeliveryRecord({
        booking_id: bookingId,
        confirmation_code: confCode,
        email_type: 'ADMIN_NEW_BOOKING_ACKNOWLEDGEMENT',
        recipient: adminRecipient,
        status: 'SENT',
        provider: 'RESEND',
        provider_message_id: emailMessageId,
        attempt_count: currentAttempt
      });
      return { success: true, messageId: emailMessageId, status: 'SENT' };
    } else {
      await bookingRepository.upsertEmailDeliveryRecord({
        booking_id: bookingId,
        confirmation_code: confCode,
        email_type: 'ADMIN_NEW_BOOKING_ACKNOWLEDGEMENT',
        recipient: adminRecipient,
        status: 'FAILED',
        provider: 'RESEND',
        error_code: 'EMAIL_PROVIDER_ERROR',
        error_message: providerError || 'Failed to send admin notification via provider.',
        attempt_count: currentAttempt
      });
      return {
        success: false,
        errorCode: 'EMAIL_PROVIDER_ERROR',
        errorMessage: providerError || 'Failed to send admin notification via provider',
        status: 'FAILED'
      };
    }
  } catch (error) {
    logger.error('[Admin Email] Exception in sendAdminBookingAcknowledgement:', error.message);
    return { success: false, errorCode: 'EMAIL_DELIVERY_EXCEPTION', errorMessage: error.message, status: 'FAILED' };
  }
};




