import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Handlebars from 'handlebars';
import { buildCanonicalItinerary } from '../../shared/utils/airline-lookup.mjs';
import passengerAuthorizationService from '../authorizations/passenger-authorization.service.mjs';
import bookingRepository from '../bookings/booking.repository.mjs';
import { renderEmailItineraryHtml, renderEmailItineraryText } from './email-itinerary-renderer.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, '../../integrations/resend/templates');

function formatUsDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export const emailRendererService = {
  /**
   * Render Booking Request Email
   */
  renderBookingRequestEmail: async (booking) => {
    const missingFields = [];
    if (!booking) {
      return { success: false, missingFields: ['Booking record'] };
    }

    const customerEmail = booking.email || booking.contacts?.[0]?.email || booking.travellers?.[0]?.email || '';
    if (!customerEmail || !customerEmail.includes('@')) {
      missingFields.push('Valid Customer Email');
    }

    const itinerary = buildCanonicalItinerary(booking);
    if (!itinerary.outbound || itinerary.outbound.length === 0) {
      missingFields.push('Flight Itinerary Segments');
    }

    const confirmationCode = booking.confirmation_code || booking.confirmationCode || 'TFS-PENDING';
    const passengerName = booking.passenger_name || 'Valued Passenger';
    const passengerFirstName = passengerName.split(' ')[0] || 'Passenger';
    const currency = (booking.currency || 'USD').toUpperCase();
    const currencySymbol = currency === 'EUR' ? '€' : (currency === 'GBP' ? '£' : '$');
    const customerTotal = parseFloat(booking.customer_price || booking.total_amount || 0).toFixed(2);
    const bookingDate = booking.created_at ? formatUsDate(booking.created_at) : formatUsDate(new Date());

    const outboundSegs = itinerary.outbound || [];
    const returnSegs = itinerary.return || [];
    const outSeg = outboundSegs[0] || {};
    const retSeg = returnSegs[0] || null;

    const itineraryHtml = renderEmailItineraryHtml(itinerary);
    const itineraryText = renderEmailItineraryText(itinerary);

    const templatePath = path.join(TEMPLATES_DIR, 'booking-confirmation.html');
    let templateSource = await fs.readFile(templatePath, 'utf8').catch(() => null);

    if (!templateSource) {
      templateSource = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #8b1236;">Booking Request Received</h2>
          <p>Dear <strong>{{passengerFirstName}}</strong>,</p>
          <p>Thank you for submitting your booking request with <strong>FareTransit</strong>. Your confirmation code is <strong>{{confirmationCode}}</strong>.</p>
          <p>Total Estimated Customer Price: <strong>{{currencySymbol}}{{amountPaid}} {{currency}}</strong></p>
          <hr />
          <div style="margin: 16px 0;">
            {{{itineraryHtml}}}
          </div>
          <hr />
          <p style="font-size: 12px; color: #64748b;">Support: support@faretransit.com | +1 (213) 965-9727 | www.faretransit.com</p>
        </div>
      `;
    } else {
      templateSource = templateSource.replace('Payment Confirmation', 'Booking Request Received');
      templateSource = templateSource.replace('Payment Successfully Received', 'Booking Request Received');
      templateSource = templateSource.replace('Your payment has been successfully processed.', 'Your booking request has been received.');
      templateSource = templateSource.replace(/This temporary confirmation number is not the airline's final PNR[\s\S]*?processing\./g, '');
    }

    const template = Handlebars.compile(templateSource);
    const templateData = {
      emailHeaderSubtitle: 'FLIGHT RESERVATION CONFIRMATION',
      confirmationCode,
      passengerFirstName,
      passengerName,
      currencySymbol,
      amountPaid: customerTotal,
      currency,
      paymentMethod: 'Card Authorization Pending',
      paymentDate: bookingDate,
      passengerCount: (booking.travellers?.length || 1).toString(),
      outboundRoute: outSeg.originCode && outSeg.destinationCode ? `${outSeg.originCode} → ${outSeg.destinationCode}` : 'Outbound Flight',
      outboundAirline: outSeg.airlineName || (outSeg.carrierCode ? `${outSeg.carrierCode} Airlines` : 'Commercial Airline'),
      outboundFlightNo: outSeg.carrierCode && outSeg.flightNumber ? `${outSeg.carrierCode} ${outSeg.flightNumber}` : (outSeg.flightNumber || 'N/A'),
      outboundCabin: outSeg.cabinClass || 'Economy',
      outboundDepDate: outSeg.departureDate || '',
      outboundDepTime: outSeg.departureTime || '',
      outboundArrTime: outSeg.arrivalTime || '',
      hasReturn: !!retSeg,
      returnRoute: retSeg && retSeg.originCode ? `${retSeg.originCode} → ${retSeg.destinationCode}` : '',
      returnAirline: retSeg ? (retSeg.airlineName || (retSeg.carrierCode ? `${retSeg.carrierCode} Airlines` : 'Commercial Airline')) : '',
      returnFlightNo: retSeg ? (retSeg.carrierCode && retSeg.flightNumber ? `${retSeg.carrierCode} ${retSeg.flightNumber}` : (retSeg.flightNumber || 'N/A')) : '',
      returnCabin: retSeg ? (retSeg.cabinClass || 'Economy') : '',
      returnDepDate: retSeg ? (retSeg.departureDate || '') : '',
      returnDepTime: retSeg ? (retSeg.departureTime || '') : '',
      returnArrTime: retSeg ? (retSeg.arrivalTime || '') : '',
      itineraryHtml,
      itineraryText,
      supportEmail: 'support@faretransit.com',
      supportPhone: '+1 (213) 965-9727',
      websiteUrl: 'https://www.faretransit.com'
    };

    const html = template(templateData);
    const subject = `Booking Request Received — ${confirmationCode}`;
    const text = `
THE FINAL SEAT — BOOKING REQUEST RECEIVED

Dear ${passengerFirstName},

Thank you for choosing FareTransit. Your flight booking request has been received.

Confirmation Code: ${confirmationCode}
Customer Total: ${currencySymbol}${customerTotal} ${currency}

Itinerary Summary:
${itineraryText}

For support, contact support@faretransit.com or call +1 (213) 965-9727.
www.faretransit.com
    `.trim();

    return {
      success: missingFields.length === 0,
      type: 'booking_request',
      recipient: customerEmail || 'N/A',
      subject,
      html,
      text,
      missingFields,
      authorizationExpiresAt: null
    };
  },

  /**
   * Render Authorization Request Email
   */
  renderAuthorizationEmail: async (booking, authContext = {}) => {
    const missingFields = [];
    if (!booking) {
      return { success: false, missingFields: ['Booking record'] };
    }

    const customerEmail = booking.email || booking.contacts?.[0]?.email || booking.travellers?.[0]?.email || '';
    if (!customerEmail || !customerEmail.includes('@')) {
      missingFields.push('Valid Customer Email');
    }

    const itinerary = buildCanonicalItinerary(booking);
    if (!itinerary.outbound || itinerary.outbound.length === 0) {
      missingFields.push('Flight Itinerary Segments');
    }

    const paymentMethod = booking.paymentMethod || booking.payment_method || {};
    if (!paymentMethod.card_last4 && !paymentMethod.cardLast4 && !booking.billingDetails?.cardLast4) {
      missingFields.push('Card Last 4 Digits');
    }
    if (!paymentMethod.cardholder_name && !paymentMethod.cardholderName && !booking.billingDetails?.cardholderName) {
      missingFields.push('Cardholder Name');
    }

    const confirmationCode = booking.confirmation_code || booking.confirmationCode || 'TFS-PENDING';
    const passengerName = booking.passenger_name || 'Valued Passenger';
    const passengerFirstName = passengerName.split(' ')[0] || 'Passenger';
    const currency = (booking.currency || 'USD').toUpperCase();
    const authorizedAmount = parseFloat(booking.authorized_amount || booking.customer_price || booking.total_amount || 0).toFixed(2);

    let splits = authContext.splits || [];
    if (!splits || splits.length === 0) {
      splits = await bookingRepository.getPaymentSplits(booking.id).catch(() => []);
    }
    if (!splits || splits.length === 0) {
      splits = [{ merchant_name: 'FareTransit', amount: authorizedAmount, currency }];
    }

    let token = authContext.token;
    let expiresAt = authContext.expiresAt;
    if (!token && booking.id) {
      const authResult = await passengerAuthorizationService.createAuthorizationToken(booking).catch(() => null);
      if (authResult?.token) {
        token = authResult.token;
        expiresAt = authResult.expiresAt || new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      }
    }
    const authUrl = token ? `https://www.faretransit.com/authorize/${token}` : 'https://www.faretransit.com/authorize/pending';

    const splitsHtml = `
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
              $${authorizedAmount} ${currency}
            </td>
          </tr>
        </table>
      </div>
    `;

    const templatePath = path.join(TEMPLATES_DIR, 'passenger-authorization-request.html');
    let templateSource = await fs.readFile(templatePath, 'utf8').catch(() => null);

    let html = '';
    if (templateSource) {
      const template = Handlebars.compile(templateSource);
      html = template({
        confirmationCode,
        passengerFirstName,
        passengerName,
        customerTotal: authorizedAmount,
        currency,
        splitsHtml,
        authUrl,
        cardLast4: paymentMethod.card_last4 || paymentMethod.cardLast4 || '••••',
        cardBrand: (paymentMethod.card_brand || paymentMethod.cardBrand || 'Card').toUpperCase(),
        cardholderName: paymentMethod.cardholder_name || paymentMethod.cardholderName || passengerName,
        supportEmail: 'support@faretransit.com',
        supportPhone: '+1 (213) 965-9727'
      });
    } else {
      html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #cbd5e1; border-radius: 8px;">
          <h2 style="color: #8b1236;">Action Required — Authorize Booking ${confirmationCode}</h2>
          <p>Dear ${passengerFirstName},</p>
          <p>Please review and authorize your flight reservation for total amount <strong>$${authorizedAmount} ${currency}</strong>.</p>
          ${splitsHtml}
          <div style="text-align: center; margin: 24px 0;">
            <a href="${authUrl}" style="background-color: #8b1236; color: #ffffff; padding: 14px 28px; font-weight: bold; text-decoration: none; border-radius: 6px; display: inline-block;">Authorize Booking Now</a>
          </div>
          <p style="font-size: 12px; color: #64748b;">Or copy this URL: ${authUrl}</p>
          <hr />
          <p style="font-size: 12px; color: #64748b;">FareTransit Support: support@faretransit.com | +1 (213) 965-9727</p>
        </div>
      `;
    }

    const subject = `Action Required — Authorize Booking ${confirmationCode}`;
    const text = `
THE FINAL SEAT — ACTION REQUIRED: AUTHORIZE FLIGHT RESERVATION

Dear ${passengerFirstName},

Please review and authorize your flight reservation ${confirmationCode} for a total charge of $${authorizedAmount} ${currency}.
${splits.map(s => `Merchant: ${s.merchant_name || s.merchantName} - $${parseFloat(s.amount || 0).toFixed(2)}`).join('\n')}

Total Authorized Amount: $${authorizedAmount} ${currency}

Secure Authorization URL:
${authUrl}

This authorization link expires in 24 hours.

Support: support@faretransit.com | +1 (213) 965-9727 | www.faretransit.com
    `.trim();

    return {
      success: missingFields.length === 0,
      type: 'authorization',
      recipient: customerEmail || 'N/A',
      subject,
      html,
      text,
      missingFields,
      authorizationExpiresAt: expiresAt || new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      authorizationUrl: authUrl
    };
  },

  /**
   * Render Final Ticket Email
   */
  renderFinalTicketEmail: async (booking) => {
    const missingFields = [];
    if (!booking) {
      return { success: false, missingFields: ['Booking record'] };
    }

    const customerEmail = booking.email || booking.contacts?.[0]?.email || booking.travellers?.[0]?.email || '';
    if (!customerEmail || !customerEmail.includes('@')) {
      missingFields.push('Valid Customer Email');
    }

    const pnr = (booking.pnr || booking.airline_pnrs?.[0] || booking.confirmation_code || '').trim().toUpperCase();
    if (!pnr || pnr.length !== 6) {
      missingFields.push('Valid 6-Character Airline PNR');
    }

    const ticketNo = booking.ticket_number || booking.ticketNo || booking.e_ticket_number || '';
    if (!ticketNo) {
      missingFields.push('Ticket Number');
    }

    const itinerary = buildCanonicalItinerary(booking);
    if (!itinerary.outbound || itinerary.outbound.length === 0) {
      missingFields.push('Flight Itinerary Segments');
    }

    const confirmationCode = booking.confirmation_code || booking.confirmationCode || 'TFS-PENDING';
    const passengerName = booking.passenger_name || 'Valued Passenger';
    const passengerFirstName = passengerName.split(' ')[0] || 'Passenger';
    const currency = (booking.currency || 'USD').toUpperCase();
    const customerTotal = parseFloat(booking.customer_price || booking.total_amount || 0).toFixed(2);

    const templatePath = path.join(TEMPLATES_DIR, 'e-ticket-delivery.html');
    let templateSource = await fs.readFile(templatePath, 'utf8').catch(() => null);

    let html = '';
    if (templateSource) {
      const template = Handlebars.compile(templateSource);
      html = template({
        confirmationCode,
        pnr: pnr || 'PNR-REQUIRED',
        ticketNumber: ticketNo || 'TICKET-REQUIRED',
        passengerName,
        passengerFirstName,
        customerTotal,
        currency,
        supportEmail: 'support@faretransit.com',
        supportPhone: '+1 (213) 965-9727'
      });
    } else {
      html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #cbd5e1; border-radius: 8px;">
          <h2 style="color: #8b1236;">Your E-Ticket Confirmation — ${pnr || confirmationCode}</h2>
          <p>Dear ${passengerFirstName},</p>
          <p>Your flight ticket has been issued! Here are your official ticket details:</p>
          <ul>
            <li><strong>Airline PNR:</strong> ${pnr || 'N/A'}</li>
            <li><strong>E-Ticket Number:</strong> ${ticketNo || 'N/A'}</li>
            <li><strong>Total Amount Paid:</strong> $${customerTotal} ${currency}</li>
          </ul>
          <hr />
          <p style="font-size: 12px; color: #64748b;">FareTransit Support: support@faretransit.com | +1 (213) 965-9727</p>
        </div>
      `;
    }

    const subject = `Official E-Ticket Confirmation — PNR ${pnr || confirmationCode}`;
    const text = `
THE FINAL SEAT — OFFICIAL E-TICKET CONFIRMATION

Dear ${passengerFirstName},

Your flight reservation has been ticketed.

Airline PNR: ${pnr || 'NOT_ISSUED'}
E-Ticket Number: ${ticketNo || 'NOT_ISSUED'}
Customer Total: $${customerTotal} ${currency}

Support: support@faretransit.com | +1 (213) 965-9727 | www.faretransit.com
    `.trim();

    return {
      success: missingFields.length === 0,
      type: 'final_ticket',
      recipient: customerEmail || 'N/A',
      subject,
      html,
      text,
      missingFields
    };
  }
};
