import nodemailer from 'nodemailer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import env from '../../config/env.mjs';
import logger from '../../config/logger.mjs';

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
  const from = env.resendFrom?.trim();

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
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

  for (const to of recipients) {
    try {
      const messageId = await sendViaResendOne({
        to,
        subject,
        textBody,
        htmlBody,
        replyTo,
      });
      sentTo.push(to);
      logger.info(`Resend sent to ${to}:`, messageId);
    } catch (err) {
      failures.push({ to, error: err.message });
      logger.error(`Resend failed for ${to}:`, err.message);
    }
  }

  if (sentTo.length > 0) {
    return { provider: 'resend', messageId: sentTo.join(','), sentTo, failures };
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
  const record = { ...inquiry, receivedAt: new Date().toISOString() };
  await fs.mkdir(path.dirname(INQUIRIES_FILE), { recursive: true });
  await fs.appendFile(INQUIRIES_FILE, `${JSON.stringify(record)}\n`, 'utf8');
  return record;
};

export const sendConsultingInquiry = async (inquiry) => {
  const recipients = getInquiryRecipients();
  const isFlights = inquiry.serviceType === 'flights';
  const isPayment = inquiry.serviceType === 'consulting-payment';

  const subjectLabel = isPayment
    ? 'Secure Consulting Payment'
    : isFlights
      ? 'Air Logistics Advisory'
      : 'Amtrak / Rail Logistics Advisory';

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
      `NEW ${isFlights ? 'AIR' : 'RAIL'} LOGISTICS CONSULTING INQUIRY`,
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

    if (isFlights) {
      lines.push(
        `Trip type: ${inquiry.tripType || 'Not specified'}`,
        `Departure date: ${inquiry.travelDate || 'Flexible'}`,
      );
      if (inquiry.tripType === 'roundtrip') {
        lines.push(`Return date: ${inquiry.returnDate || 'Flexible'}`);
      }
      lines.push(`Preferred cabin: ${inquiry.cabinClass || 'Not specified'}`);
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
      `Source: ${isFlights ? 'Flights landing page' : 'Amtrak / Rail landing page'}`,
    );
    textBody = lines.join('\n');
  }

  const htmlBody = textBody.replace(/\n/g, '<br>');
  const subject = `${subjectLabel} — ${inquiry.name}`;

  await saveInquiryToFile(inquiry);

  const payload = {
    recipients,
    subject,
    textBody,
    htmlBody: `<div style="font-family: Arial, sans-serif; line-height: 1.6;">${htmlBody}</div>`,
    replyTo: inquiry.email,
  };

  const errors = [];

  if (env.resendApiKey?.trim()) {
    try {
      const result = await sendViaResend(payload);
      if (result?.sentTo?.length) {
        logger.info('Consulting inquiry emailed via Resend →', result.sentTo.join(', '));
        return {
          success: true,
          emailed: true,
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
        return { success: true, emailed: true, provider: 'smtp', messageId: result.messageId };
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
    message: 'Inquiry received. Configure RESEND_API_KEY or SMTP variables to enable email delivery.',
    errors,
  };
};

export const sendBookingConfirmation = async (booking) => {
  try {
    const flight = booking.flight || booking.flight_details || {};
    const rawPassengers = booking.passengers || booking.traveller_details;
    const passengers = Array.isArray(rawPassengers) ? rawPassengers : JSON.parse(rawPassengers || '[]');
    
    const customerName = booking.customerName || booking.passenger_name || 'Customer';
    const bookingReference = booking.bookingReference || booking.confirmation_code || 'Pending';
    const displayedWebsitePrice = booking.displayedWebsitePrice || booking.amount || 0;
    const transactionId = booking.transactionId || booking.payment_reference || 'Offline Verified';
    const bookingDate = booking.bookingDate || booking.created_at || new Date();
    const originalApiPrice = booking.originalApiPrice || booking.amount || 0;
    const paymentStatus = booking.paymentStatus || 'paid';
    const email = booking.email || '';
    const phone = booking.phone || '';

    const passengerTextLines = passengers.map((p, i) => {
      const passportInfo = p.passportNumber ? `, Passport: ${p.passportNumber} (${p.nationality || 'N/A'})` : '';
      const ktnInfo = p.knownTravelerNumber ? `, KTN: ${p.knownTravelerNumber}` : '';
      return `${i + 1}. ${p.firstName} ${p.middleName || ''} ${p.lastName} (${p.role || 'Adult'}) - DOB: ${p.dateOfBirth}, Gender: ${p.gender}${passportInfo}${ktnInfo}`;
    }).join('\n');

    const flightRouteText = flight.departure && flight.arrival 
      ? `${flight.departure.city || flight.departureAirport} (${flight.departure.airport || ''}) to ${flight.arrival.city || flight.arrivalAirport} (${flight.arrival.airport || ''})`
      : 'Itinerary details';

    const customerEmailBody = `
Dear ${customerName},

Thank you! Your flight reservation request has been received successfully. 

Our travel specialists will verify your itinerary details and manually issue your e-ticket shortly. A secondary email with your ticket number will be dispatched once confirmed.

====================================================
RESERVATION RECEIPT
====================================================
Booking Reference: ${bookingReference}
Booking Status: Pending Confirmation
Amount Charged: $${parseFloat(displayedWebsitePrice).toFixed(2)} USD
Transaction ID: ${transactionId}
Booking Date: ${new Date(bookingDate).toLocaleString()}

TRAVELERS:
${passengerTextLines}

FLIGHT ITINERARY:
Airline: ${flight.airline}
Flight Number: ${flight.flightNumber}
Route: ${flightRouteText}
Departure: ${flight.departure?.time || ''} on ${flight.departure?.date || ''}
Arrival: ${flight.arrival?.time || ''} on ${flight.arrival?.date || ''}
Cabin Class: ${flight.class || 'Economy'}
Stops: ${flight.stops === 0 ? 'Nonstop' : `${flight.stops} stop(s)`}

If you have any questions or need immediate assistance, please reply directly to this email or contact us at support@faretransit.com.

Best Regards,
Support Team
FareTransit LLC
    `.trim();

    const adminEmailBody = `
⚠️ NEW FLIGHT BOOKING REQUEST - MANUAL TICKETING REQUIRED
====================================================
Booking Reference: ${bookingReference}
Booking Status: Pending Confirmation
Booking Date: ${new Date(bookingDate).toLocaleString()}

PRICING & VERIFICATION:
-----------------------
Original API Price: $${parseFloat(originalApiPrice).toFixed(2)} USD
Website Displayed Price: $${parseFloat(displayedWebsitePrice).toFixed(2)} USD
Stripe Payment Status: ${paymentStatus}
Transaction Reference: ${transactionId}

PRIMARY CONTACT:
----------------
Name: ${customerName}
Email: ${email}
Phone: ${phone}

TRAVELERS DETAILS:
------------------
${passengerTextLines}

FLIGHT ITINERARY:
-----------------
Airline: ${flight.airline}
Flight Number: ${flight.flightNumber}
Route: ${flightRouteText}
Departure: ${flight.departure?.time || ''} on ${flight.departure?.date || ''}
Arrival: ${flight.arrival?.time || ''} on ${flight.arrival?.date || ''}
Cabin Class: ${flight.class || 'Economy'}
Stops: ${flight.stops === 0 ? 'Nonstop' : `${flight.stops} stop(s)`}
Aircraft: ${flight.aircraft || 'Unknown'}
Refundable: ${flight.refundableStatus || 'Unknown'}
Baggage Allowance: ${flight.baggageAllowance || 'Standard'}

ACTION REQUIRED:
Please review traveler credentials, verify original fares, issue the ticket manually, and update the booking status to "Confirmed" in the admin dashboard.
    `.trim();

    if (isSmtpConfigured()) {
      const transporter = getTransporter();

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: `Flight Booking Received - Ref: ${bookingReference}`,
        text: customerEmailBody,
        html: customerEmailBody.replace(/\n/g, '<br>')
      });

      const adminEmails = getInquiryRecipients();
      for (const emailAddress of adminEmails) {
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: emailAddress,
          subject: `🚨 [Manual Ticket Needed] New Booking Ref: ${bookingReference}`,
          text: adminEmailBody,
          html: adminEmailBody.replace(/\n/g, '<br>')
        });
      }
      
      logger.info(`✅ Success/Admin notification emails sent for ${bookingReference}`);
      return { success: true };
    }

    logger.warn('Nodemailer SMTP not configured. Logged notification templates below:');
    logger.info('------------- CUSTOMER EMAIL -------------\n', customerEmailBody);
    logger.info('-------------- ADMIN EMAIL --------------\n', adminEmailBody);
    return { success: true, message: 'SMTP not configured, templates printed to console logs.' };
  } catch (error) {
    logger.error('Error sending booking confirmation email templates:', error.message);
    throw error;
  }
};
