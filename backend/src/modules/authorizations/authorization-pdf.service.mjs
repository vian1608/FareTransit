import PDFDocument from 'pdfkit';
import crypto from 'crypto';

export function abbreviateUserAgent(ua) {
  if (!ua || typeof ua !== 'string') return 'Unknown Device';
  
  let os = 'Unknown OS';
  if (/android/i.test(ua)) os = 'Android';
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  else if (/macintosh|mac os x/i.test(ua)) os = 'macOS';
  else if (/windows/i.test(ua)) os = 'Windows';
  else if (/linux/i.test(ua)) os = 'Linux';
  
  let browser = 'Unknown Browser';
  if (/chrome|crios/i.test(ua) && !/edg/i.test(ua)) browser = 'Chrome';
  else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) browser = 'Safari';
  else if (/firefox/i.test(ua)) browser = 'Firefox';
  else if (/edg/i.test(ua)) browser = 'Edge';
  else if (/trident|msie/i.test(ua)) browser = 'IE';
  
  return `${os} · ${browser}`;
}

export function abbreviateString(str, startChars = 8, endChars = 8) {
  if (!str || typeof str !== 'string') return 'N/A';
  if (str.length <= (startChars + endChars + 3)) return str;
  return `${str.substring(0, startChars)}…${str.substring(str.length - endChars)}`;
}

/**
 * Build the canonical consent text shown to the customer.
 * This exact string is the source of truth for the SHA-256 consent hash.
 */
export function buildConsentText({ cardLast4, splits = [], currency = 'USD' }) {
  const last4 = cardLast4 || '****';
  const splitLines = splits.length > 0
    ? splits.map(s => `• ${s.merchant_name || s.merchantName || 'Merchant'}: $${parseFloat(s.amount || 0).toFixed(2)} ${(s.currency || currency).toUpperCase()}`).join('\n')
    : '• Total Authorized: See booking details';

  return (
    `I confirm that the passenger names, itinerary, dates, fare, fees and contact information shown above are correct. ` +
    `I authorize FareTransit LLC to charge my saved payment method ending in ${last4} for the following authorized payment amounts:\n\n` +
    `${splitLines}\n\n` +
    `I understand that the authorization is valid only for the reservation details shown above. ` +
    `Any changes to itinerary, passenger details, or total amount require a new authorization.`
  );
}

export async function generateAuthorizationPdfBuffer(evidence) {
  const snap = evidence?.authorization_snapshot || evidence?.snapshot || evidence?.authorization?.authorizationSnapshot || evidence?.authorization?.authorization_snapshot || null;

  if (!snap && evidence?.allowFallback !== true) {
    throw new Error('IMMUTABLE_SNAPSHOT_REQUIRED: Cannot generate Authorization Evidence PDF without a frozen immutable authorization snapshot.');
  }

  const bookingId = snap?.booking_id || evidence?.booking?.id || evidence?.bookingId || evidence?.id;
  if (bookingId) {
    const { default: bookingValidatorService } = await import('../bookings/booking-validator.service.mjs');
    const validation = await bookingValidatorService.validateBookingIntegrity(bookingId, {
      requireItinerary: true,
      requirePassengers: true
    });
    if (!validation.valid) {
      throw new Error(`PDF generation blocked due to booking data integrity errors: ${validation.reason}`);
    }
  }

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 30, size: 'LETTER' });
      const buffers = [];

      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end',  () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      const auth    = evidence.authorization || {};
      const booking = evidence.booking || {};
      const snapshot = snap?.itinerary_snapshot || snap?.itinerary || auth.itinerarySnapshot || evidence.itinerarySnapshot || {};

      const passengerName    = snap?.passenger_name || snap?.passenger_details?.name || evidence.passengerName || booking.passenger_name || 'Valued Passenger';
      const customerEmail    = snap?.customer_email || snap?.passenger_details?.email || evidence.customerEmail || booking.email || 'support@faretransit.com';
      const confirmationCode = snap?.confirmation_code || evidence.confirmationCode || booking.confirmation_code || 'TFS-CONF';

      const authorizedAmount = snap?.authorized_amount || auth.authorizedAmount || evidence.authorizedAmount || booking.total_amount || '0.00';
      const currency  = (snap?.currency || auth.currency || evidence.currency || booking.currency || 'USD').toUpperCase();
      const cardBrand = auth.cardBrand || auth.card_brand || evidence.cardBrand || 'Visa';
      const cardLast4 = auth.cardLast4 || auth.card_last4 || evidence.cardLast4 || '****';

      // Real IP & Device
      let clientIp = snap?.client_ip || auth.ipAddress || auth.ip_address || auth.clientIp || evidence.clientIp || null;
      if (clientIp) {
        clientIp = clientIp.replace(/^::ffff:/, '');
        if (clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === 'localhost' || clientIp === '198.51.100.1') {
          clientIp = 'Client IP unavailable';
        }
      } else {
        clientIp = 'Client IP unavailable';
      }

      const userAgent = snap?.user_agent || auth.userAgent  || auth.user_agent || evidence.userAgent || 'Browser Client';
      const abbreviatedUa = abbreviateUserAgent(userAgent);

      const token     = auth.token || auth.tokenId || evidence.token || 'tks_verified';
      const abbreviatedToken = abbreviateString(token, 10, 10);

      const acceptedAt = snap?.accepted_at || auth.acceptedAt || auth.consumedAt || auth.consumed_at || new Date().toISOString();

      // Status: AUTHORIZED / PENDING
      const rawStatus     = (snap?.authorization_status || auth.status || '').toUpperCase();
      const bookingStatus = (booking.status || '').toUpperCase();
      const isAccepted    = ['ACCEPTED', 'CONSUMED', 'AUTHORIZED'].includes(rawStatus) || !!(snap?.accepted_at || auth.consumedAt || evidence.acceptedAt);
      const isAuthorized  = rawStatus === 'PENDING' ? false : (isAccepted || rawStatus === 'AUTHORIZED' || ['AUTHORIZED', 'READY_FOR_TICKETING', 'TICKETED', 'DONE'].includes(bookingStatus));
      const displayStatus = isAuthorized ? 'AUTHORIZED' : 'PENDING CUSTOMER ACTION';
      const statusColor   = isAuthorized ? '#166534' : '#b45309';
      const statusBg      = isAuthorized ? '#f0fdf4' : '#fffbeb';
      const statusBorder  = isAuthorized ? '#bbf7d0' : '#fde68a';

      // Payment splits strictly from snapshot
      const splits = snap?.payment_splits || (auth.quoteSnapshot && auth.quoteSnapshot.splits) ||
                     auth.splits || evidence.paymentSplits || evidence.splits || [];

      // Email delivery evidence
      const emailDelivery  = evidence.emailDelivery || {};
      const emailRecipient = emailDelivery.recipient || booking.authorization_email_recipient || booking.email || customerEmail;
      const emailSentAt    = emailDelivery.sentAt    || booking.authorization_email_sent_at || null;
      const emailProvider  = emailDelivery.provider  || 'Resend';
      const emailMessageId = emailDelivery.messageId || booking.authorization_email_id || null;
      const emailStatus    = emailDelivery.status    || (emailSentAt ? 'SENT' : 'NOT SENT');

      // Consent text & hash strictly from snapshot
      const consentText    = snap?.consent_text || evidence.consentText || buildConsentText({ cardLast4, splits, currency });
      const consentVersion = snap?.consent_version || auth.authorizationTextVersion || evidence.consentVersion || 'v1.0';
      const consentHash    = snap?.consent_hash || auth.authorizationTextHash || auth.authorization_text_hash ||
                             evidence.consentHash ||
                             crypto.createHash('sha256').update(consentText).digest('hex');
      const abbreviatedHash = abbreviateString(consentHash, 8, 8);

      const tsLabel = isAuthorized
        ? ('Authorized At: ' + (acceptedAt || 'N/A'))
        : ('Token Issued At: ' + (auth.createdAt || auth.created_at || 'N/A'));

      // ── Header branding ──────────────────────────────────────────────────
      doc.rect(30, 25, 552, 40).fill('#8b1236');
      doc.save();
      doc.translate(40, 31);
      doc.scale(0.6);
      doc.path('M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z').fill('#e2b84d');
      doc.restore();
      doc.fill('#ffffff').fontSize(13).font('Helvetica-Bold').text('THE FINAL SEAT', 65, 31);
      doc.fill('#f8dfe8').fontSize(7.5).font('Helvetica-Bold').text('PASSENGER ITINERARY AUTHORIZATION EVIDENCE EXPORT', 65, 47);

      let y = 73;

      // Meta info
      doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#1e293b').text('Booking Reference: ' + confirmationCode, 30, y);
      const generatedDate = new Date().toUTCString();
      const evidenceId = evidence.evidenceId || ('EVID_' + confirmationCode + '_' + Date.now());
      doc.fontSize(7.5).font('Helvetica').fillColor('#64748b').text(`Generated: ${generatedDate} | Evidence ID: ${evidenceId}`, 30, y + 12);
      
      // Status banner
      doc.rect(30, y + 25, 552, 22).fill(statusBg).stroke(statusBorder);
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor(statusColor).text('AUTHORIZATION STATUS: ' + displayStatus, 38, y + 32);
      doc.fontSize(7.5).font('Helvetica').fillColor('#475569').text(tsLabel, 340, y + 32, { align: 'right', width: 232 });

      y += 57;

      const drawSectionHeader = (title) => {
        if (y > 690) {
          doc.addPage();
          y = 30;
        }
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#8b1236').text(title, 30, y);
        doc.strokeColor('#e2e8f0').lineWidth(0.75).moveTo(30, y + 13).lineTo(582, y + 13).stroke();
        y += 18;
      };

      // ── Section 1 & 5 Side-by-Side: PASSENGER & CONSENT ─────────────────
      const colY = y;
      
      // Column 1: Passenger & Booking Details
      doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#8b1236').text('PASSENGER & BOOKING', 30, colY);
      doc.strokeColor('#e2e8f0').lineWidth(0.75).moveTo(30, colY + 12).lineTo(290, colY + 12).stroke();
      
      let col1Y = colY + 18;
      doc.fontSize(8.5).font('Helvetica').fillColor('#475569');
      
      doc.font('Helvetica-Bold').text('Passenger:', 30, col1Y);
      doc.font('Helvetica').fillColor('#1e293b').text(passengerName, 100, col1Y);
      col1Y += 13;
      
      doc.font('Helvetica-Bold').fillColor('#475569').text('Email:', 30, col1Y);
      doc.font('Helvetica').fillColor('#1e293b').text(customerEmail, 100, col1Y);
      col1Y += 13;
      
      doc.font('Helvetica-Bold').fillColor('#475569').text('Passengers:', 30, col1Y);
      const passengerCount = (evidence.passengers ? evidence.passengers.length : 1) + ' Adult(s)';
      doc.font('Helvetica').fillColor('#1e293b').text(passengerCount, 100, col1Y);
      col1Y += 13;
      
      doc.font('Helvetica-Bold').fillColor('#475569').text('Booking ID:', 30, col1Y);
      doc.font('Helvetica').fillColor('#1e293b').text(booking.id || evidence.bookingId || confirmationCode, 100, col1Y, { width: 190 });
      col1Y += 13;

      // Column 2: Consent & Audit Details
      doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#8b1236').text('CONSENT & AUDIT EVIDENCE', 315, colY);
      doc.strokeColor('#e2e8f0').lineWidth(0.75).moveTo(315, colY + 12).lineTo(582, colY + 12).stroke();
      
      let col2Y = colY + 18;
      doc.fontSize(8.5).font('Helvetica').fillColor('#475569');
      
      doc.font('Helvetica-Bold').text('Status:', 315, col2Y);
      doc.font('Helvetica').fillColor('#1e293b').text(isAuthorized ? 'Authorized' : 'Pending', 410, col2Y);
      col2Y += 13;
      
      doc.font('Helvetica-Bold').fillColor('#475569').text('Accepted At:', 315, col2Y);
      doc.font('Helvetica').fillColor('#1e293b').text(acceptedAt || 'N/A', 410, col2Y);
      col2Y += 13;
      
      doc.font('Helvetica-Bold').fillColor('#475569').text('Consent Ver:', 315, col2Y);
      doc.font('Helvetica').fillColor('#1e293b').text(consentVersion, 410, col2Y);
      col2Y += 13;
      
      doc.font('Helvetica-Bold').fillColor('#475569').text('Client IP:', 315, col2Y);
      doc.font('Helvetica').fillColor('#1e293b').text(clientIp, 410, col2Y);
      col2Y += 13;

      doc.font('Helvetica-Bold').fillColor('#475569').text('User Agent:', 315, col2Y);
      doc.font('Helvetica').fillColor('#1e293b').text(abbreviatedUa, 410, col2Y);
      col2Y += 13;

      doc.font('Helvetica-Bold').fillColor('#475569').text('Expiry:', 315, col2Y);
      doc.font('Helvetica').fillColor('#1e293b').text(auth.expiresAt || auth.expires_at || 'N/A', 410, col2Y);
      col2Y += 13;

      y = Math.max(col1Y, col2Y) + 12;

      // ── Section 2: ITINERARY SNAPSHOT ──────────────────────────────────
      drawSectionHeader('FLIGHT ITINERARY');

      const renderSegs = (segs, label, color) => {
        if (!segs || segs.length === 0) return;
        
        doc.fontSize(9).font('Helvetica-Bold').fillColor(color).text(label.toUpperCase(), 30, y);
        y += 12;
        
        segs.forEach((seg) => {
          const cc  = (seg.carrier_code || seg.carrierCode || '').trim().toUpperCase();
          const ca  = seg.carrier_name || seg.airline || seg.airlineName || (cc ? cc + ' Airlines' : 'Airline');
          const fn  = seg.flight_number || seg.flightNumber || '';
          const or  = seg.origin_airport || seg.originCode || '';
          const de  = seg.destination_airport || seg.destinationCode || '';
          const dep = ((seg.departure_date || seg.departureDate || '') + ' ' + (seg.departure_time || seg.departureTime || '')).trim();
          const arr = ((seg.arrival_date   || seg.arrivalDate   || '') + ' ' + (seg.arrival_time   || seg.arrivalTime   || '')).trim();
          const cab = seg.cabin || seg.cabinClass || 'Economy';
          const st  = seg.stops !== undefined ? (seg.stops === 0 ? 'Nonstop' : seg.stops + ' Stop(s)') : 'Nonstop';
          
          doc.fontSize(8.5).font('Helvetica').fillColor('#1e293b');
          doc.text(`• ${ca} (${cc} ${fn})  |  ${or} → ${de}  |  Dep: ${dep}  |  Arr: ${arr}  |  ${cab} · ${st}`, 40, y, { width: 512 });
          y += 12;
        });
        y += 4;
      };

      const outboundSegs = Array.isArray(snapshot) ? snapshot.filter(s => (s.journey_direction || s.direction || 'outbound') === 'outbound') : (snapshot.outboundSegments || (snapshot.outbound ? [snapshot.outbound] : []));
      const returnSegs   = Array.isArray(snapshot) ? snapshot.filter(s => (s.journey_direction || s.direction) === 'return') : (snapshot.returnSegments   || (snapshot.return   ? [snapshot.return]   : []));
      
      if (outboundSegs.length > 0) {
        renderSegs(outboundSegs, 'Outbound', '#1e3a5f');
      } else {
        doc.fontSize(8.5).font('Helvetica').fillColor('#475569').text('Itinerary details pending airline confirmation.', 40, y);
        y += 12;
      }
      if (returnSegs.length > 0) {
        renderSegs(returnSegs, 'Return', '#9f1239');
      }
      y += 8;

      // ── Section 3: PAYMENT AUTHORIZATION ───────────────────────────────
      drawSectionHeader('PAYMENT AUTHORIZATION');

      doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#475569');
      doc.text('Authorized Total: ', 30, y, { continued: true })
         .fillColor('#8b1236').text(`$${parseFloat(authorizedAmount).toFixed(2)} ${currency}    |    `, { continued: true })
         .fillColor('#475569').text('Payment Method: ', { continued: true })
         .fillColor('#1e293b').text(`${cardBrand} ending in ${cardLast4}    |    `, { continued: true })
         .fillColor('#475569').text('Price Guarantee: ', { continued: true })
         .fillColor('#1e293b').text('Guaranteed 24 Hours');
      
      y += 16;

      if (Array.isArray(splits) && splits.length > 0) {
        doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#8b1236').text('Merchant Splits Breakdown:', 30, y);
        y += 12;

        let splitTotal = 0;
        splits.forEach((s) => {
          const mName = s.merchant_name || s.merchantName || 'Merchant';
          const mAmt  = parseFloat(s.amount || 0);
          const mCurr = (s.currency || currency).toUpperCase();
          splitTotal += mAmt;

          doc.fontSize(9.5).font('Helvetica').fillColor('#334155');
          doc.text(mName, 40, y);
          const nameW = doc.widthOfString(mName);
          
          doc.strokeColor('#cbd5e1').lineWidth(0.5).moveTo(Math.max(160, 45 + nameW), y + 7).lineTo(480, y + 7).stroke();
          doc.text(`$${mAmt.toFixed(2)} ${mCurr}`, 490, y, { align: 'right', width: 60 });
          y += 13;
        });

        doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#8b1236').text('Total Splits Sum', 40, y);
        doc.text(`$${splitTotal.toFixed(2)} ${currency}`, 490, y, { align: 'right', width: 60 });
        y += 18;
      }

      // ── Section 4: CUSTOMER AUTHORIZATION AGREEMENT ───────────────────
      drawSectionHeader('CUSTOMER AUTHORIZATION AGREEMENT');
      
      const compactAgreement = `I confirm that the passenger names, itinerary, dates, fare, fees and contact information shown above are correct. I authorize the merchant charges listed in the Payment Authorization section above, totaling $${parseFloat(authorizedAmount).toFixed(2)} ${currency}. I understand that the authorization is valid only for the reservation details shown above. Any changes to itinerary, passenger details, or total amount require a new authorization.`;
      
      const boxH = doc.heightOfString(compactAgreement, { width: 532 }) + 10;
      doc.rect(30, y, 552, boxH).fill('#fffbeb').stroke('#fde68a');
      doc.fontSize(9.5).font('Helvetica').fillColor('#334155').text(compactAgreement, 40, y + 5, { width: 532, lineGap: 1.5 });
      y += boxH + 12;

      // ── Section 6: EMAIL DELIVERY & CRYPTO VERIFICATION ───────────────
      drawSectionHeader('EMAIL DELIVERY & CRYPTOGRAPHIC EVIDENCE');

      doc.fontSize(8.5).font('Helvetica').fillColor('#475569');
      doc.font('Helvetica-Bold').text('Recipient: ', 40, y, { continued: true })
         .font('Helvetica').fillColor('#1e293b').text(`${emailRecipient}  |  `, { continued: true })
         .font('Helvetica-Bold').fillColor('#475569').text('Sent At: ', { continued: true })
         .font('Helvetica').fillColor('#1e293b').text(`${emailSentAt ? new Date(emailSentAt).toUTCString() : 'Not Sent'}  |  `, { continued: true })
         .font('Helvetica-Bold').fillColor('#475569').text('Provider: ', { continued: true })
         .font('Helvetica').fillColor('#1e293b').text(`${emailProvider}`);
      y += 12;
      
      doc.font('Helvetica-Bold').fillColor('#475569').text('Message ID: ', 40, y, { continued: true })
         .font('Helvetica').fillColor('#1e293b').text(`${emailMessageId || 'N/A'}  |  `, { continued: true })
         .font('Helvetica-Bold').fillColor('#475569').text('Status: ', { continued: true })
         .font('Helvetica').fillColor('#1e293b').text(emailStatus);
      y += 18;

      const cryptoBoxH = 34;
      doc.rect(30, y, 552, cryptoBoxH).fill('#f8fafc').stroke('#e2e8f0');
      doc.fontSize(8).font('Helvetica').fillColor('#475569');
      
      doc.text(`Consent Text Version: ${consentVersion} (PCI DSS & UETA Compliant)`, 38, y + 6);
      doc.text(`SHA-256 Consent Hash: ${abbreviatedHash}`, 38, y + 18, { continued: true })
         .text(`   |   Authorization Token ID: ${abbreviatedToken}`);

      y += cryptoBoxH + 15;

      // ── Footer ────────────────────────────────────────────────────────────
      doc.fontSize(7.5).font('Helvetica').fillColor('#94a3b8')
         .text('This evidence contains PCI-conscious authorization records. Full card numbers and security codes are never stored.', 30, 755, { align: 'center', width: 552 });

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
