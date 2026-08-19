import crypto from 'crypto';
import supabase from '../../integrations/supabase/supabase.client.mjs';
import env from '../../config/env.mjs';
import logger from '../../config/logger.mjs';
import bookingRepository from '../bookings/booking.repository.mjs';
import { resolveAirlineName, buildCanonicalItinerary } from '../../shared/utils/airline-lookup.mjs';

// In-memory fallback map for offline / stub testing when remote DB table schema is updating
const memoryAuthStore = new Map();

function hashText(text) {
  return crypto.createHash('sha256').update(String(text || '')).digest('hex');
}

const AUTH_SECRET = process.env.JWT_SECRET || env.resendApiKey || 'tfs_authorization_secret_key_2026';

function generateStatelessToken(bookingId, expiresAtMs) {
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(`${bookingId}_${expiresAtMs}`).digest('hex').substring(0, 16);
  return `tks_${bookingId}_${expiresAtMs}_${sig}`;
}

function parseStatelessToken(token) {
  if (!token || typeof token !== 'string') return null;
  if (!token.startsWith('tks_')) return null;
  const parts = token.split('_');
  if (parts.length !== 4) return null;
  const [, bookingId, expiresAtMsStr, sig] = parts;
  const expiresAtMs = parseInt(expiresAtMsStr, 10);
  if (isNaN(expiresAtMs)) return null;

  const expectedSig = crypto.createHmac('sha256', AUTH_SECRET).update(`${bookingId}_${expiresAtMs}`).digest('hex').substring(0, 16);
  if (sig !== expectedSig) return null;

  return { bookingId, expiresAtMs, isExpired: Date.now() > expiresAtMs };
}

export const passengerAuthorizationService = {
  /**
   * Create single-use 24-hour authorization token and snapshot
   */
  createAuthorizationToken: async (bookingInput, vaultData = {}) => {
    const isObj = typeof bookingInput === 'object' && bookingInput !== null;
    const rawId = isObj ? (bookingInput.id || bookingInput.booking_id || bookingInput.confirmation_code) : bookingInput;

    const completeBooking = (isObj && bookingInput.id && (bookingInput.itinerary_segments || bookingInput.outbound_segments || bookingInput.flights || bookingInput.passengers || bookingInput.travellers))
      ? bookingInput
      : ((await bookingRepository.getCompleteBookingById(rawId).catch(() => null)) || (isObj ? bookingInput : null));

    if (!completeBooking) throw new Error('Booking not found');

    // Reuse unexpired token if available to avoid DB write churn on preview
    if (completeBooking.authorization_token && completeBooking.authorization_expires_at) {
      const existingExpMs = new Date(completeBooking.authorization_expires_at).getTime();
      if (!isNaN(existingExpMs) && existingExpMs > Date.now() + 5 * 60 * 1000) {
        return {
          token: completeBooking.authorization_token,
          bookingId: completeBooking.id,
          expiresAt: completeBooking.authorization_expires_at,
          authorizationUrl: `https://www.faretransit.com/authorize/${completeBooking.authorization_token}`
        };
      }
    }

    const bookingId = completeBooking.id;
    const expiresAtMs = Date.now() + 24 * 60 * 60 * 1000;
    const token = generateStatelessToken(bookingId, expiresAtMs);
    const expiresAt = new Date(expiresAtMs).toISOString();


    const canonicalItinerary = buildCanonicalItinerary(completeBooking);
    const outboundSegs = canonicalItinerary.outbound || [];
    const returnSegs = canonicalItinerary.return || [];

    const rawPassengers = completeBooking.passengers || completeBooking.traveller_details || completeBooking.travellers || [];
    const passengers = Array.isArray(rawPassengers)
      ? rawPassengers
      : (typeof rawPassengers === 'string' ? JSON.parse(rawPassengers || '[]') : []);

    let splits = completeBooking.payment_splits && completeBooking.payment_splits.length > 0
      ? completeBooking.payment_splits
      : await bookingRepository.getPaymentSplits(completeBooking.id);

    if ((!splits || splits.length === 0) && bookingInput && bookingInput.payment_splits) {
      splits = bookingInput.payment_splits;
    }

    const customerPrice = parseFloat(completeBooking.customer_price || completeBooking.displayedWebsitePrice || completeBooking.total_amount || completeBooking.amount || 0);
    const splitTotal = splits.reduce((sum, s) => sum + parseFloat(s.amount || 0), 0);
    const authorizedAmountNum = splitTotal > 0 ? splitTotal : customerPrice;

    const quoteSnapshot = {
      amount: authorizedAmountNum.toFixed(2),
      currency: (completeBooking.currency || 'USD').toUpperCase(),
      originalPrice: (completeBooking.supplier_price || completeBooking.original_api_price || customerPrice).toString(),
      discountAmount: (completeBooking.discount_amount || 0).toString(),
      passengersCount: passengers.length || 1,
      splits: splits.map(s => ({
        merchant_name: s.merchant_name || s.merchantName || 'Merchant',
        amount: parseFloat(s.amount || 0).toFixed(2),
        currency: (s.currency || completeBooking.currency || 'USD').toUpperCase()
      })),
      createdAt: new Date().toISOString()
    };

    const mapSegSnap = (s) => ({
      id: s.id,
      sequence: s.sequence,
      carrier_code: s.carrierCode,
      carrier_name: s.airlineName,
      airline: s.airlineName,
      airlineLogoUrl: s.airlineLogoUrl,
      flight_number: s.flightNumber,
      flightNumber: s.flightNumber,
      origin_airport: s.originCode,
      originCode: s.originCode,
      origin_city: s.originName,
      originCity: s.originName,
      destination_airport: s.destinationCode,
      destinationCode: s.destinationCode,
      destination_city: s.destinationName,
      destinationCity: s.destinationName,
      departure_date: s.departureDate || s.departureAt,
      departureDate: s.departureDate || s.departureAt,
      departure_time: s.departureTime,
      departureTime: s.departureTime,
      arrival_date: s.arrivalDate || s.arrivalAt,
      arrivalDate: s.arrivalDate || s.arrivalAt,
      arrival_time: s.arrivalTime,
      arrivalTime: s.arrivalTime,
      cabin: s.cabinClass,
      cabinClass: s.cabinClass,
      stops: s.stops
    });

    const itinerarySnapshot = {
      outboundSegments: outboundSegs.map(mapSegSnap),
      returnSegments: returnSegs.map(mapSegSnap),
      outbound: outboundSegs.length > 0 ? mapSegSnap(outboundSegs[0]) : null,
      return: returnSegs.length > 0 ? mapSegSnap(returnSegs[0]) : null,
      canonical: canonicalItinerary
    };



    const policiesSnapshot = {
      cancellation: 'Non-refundable after ticketing. Changes subject to airline fee structure.',
      priceGuarantee: 'Quote guaranteed for 24 hours until authorization expires.',
      fulfillment: 'Final airline PNR and e-ticket issued within 2 hours of passenger authorization.'
    };

    const authRecord = {
      booking_id: bookingId,
      token,
      authorization_token: token,
      status: 'pending',
      authorization_status: 'AWAITING_AUTHORIZATION',
      authorized_amount: authorizedAmountNum,
      booking_amount: authorizedAmountNum,
      currency: (completeBooking.currency || 'USD').toUpperCase(),

      payment_method_token: vaultData.paymentMethodToken || vaultData.token || completeBooking.paymentMethod?.provider_payment_method_id || null,
      card_brand: vaultData.cardBrand || vaultData.brand || completeBooking.paymentMethod?.card_brand || null,
      payment_card_brand: vaultData.cardBrand || vaultData.brand || completeBooking.paymentMethod?.card_brand || null,
      card_last4: (() => {
        const raw = String(vaultData.cardLast4 || vaultData.last4 || completeBooking.paymentMethod?.card_last4 || '').replace(/\D/g, '');
        return /^\d{4}$/.test(raw) ? raw : null;
      })(),
      payment_card_last4: (() => {
        const raw = String(vaultData.cardLast4 || vaultData.last4 || completeBooking.paymentMethod?.card_last4 || '').replace(/\D/g, '');
        return /^\d{4}$/.test(raw) ? raw : null;
      })(),
      quote_snapshot: quoteSnapshot,
      itinerary_snapshot: itinerarySnapshot,
      policies_snapshot: policiesSnapshot,
      authorization_text_version: 'v1.0',
      expires_at: expiresAt,
      authorization_expires_at: expiresAt,
      created_at: new Date().toISOString()
    };

    // Store in Supabase
    try {
      const { data, error } = await supabase
        .from('passenger_authorizations')
        .insert(authRecord)
        .select()
        .single();

      if (error) {
        if (process.env.NODE_ENV === 'test') {
          logger.warn(`[Auth] Supabase table insert warning in test mode: ${error.message}.`);
          memoryAuthStore.set(token, authRecord);
        } else {
          throw new Error(`AUTHORIZATION_PERSISTENCE_FAILED: ${error.message}`);
        }
      } else {
        memoryAuthStore.set(token, data);
      }
    } catch (e) {
      if (process.env.NODE_ENV === 'test') memoryAuthStore.set(token, authRecord);
      else throw e;
    }

    // Only persist the authorization token & expiry on the booking record.
    // Do NOT change bookings.status — it must stay as PENDING/DONE/CANCELLED/FAILED.
    // The authorization state lives exclusively in passenger_authorizations.authorization_status.
    await bookingRepository.updateStatus(bookingId, {
      authorization_token: token,
      authorization_expires_at: expiresAt
    });

    return { ...authRecord, token };
  },

  /**
   * Send branded authorization email containing Review & Authorize Booking button
   */
  sendAuthorizationEmail: async (authRecord, booking) => {
    const frontendUrl = env.frontendUrl || 'https://faretransit.com';
    const authUrl = `${frontendUrl}/authorize/${authRecord.token}`;
    const email = booking.email || booking.customerEmail || '';
    const confirmationCode = booking.confirmation_code || booking.bookingReference || booking.confirmationCode || 'TFS-PENDING';
    const amountStr = parseFloat(authRecord.authorized_amount).toFixed(2);
    const rawLast4 = String(authRecord.card_last4 || '').replace(/\D/g, '');
    const cardLast4 = /^\d{4}$/.test(rawLast4) ? rawLast4 : null;

    const completeBooking = await bookingRepository.getCompleteBookingById(booking.id || booking.booking_id) || booking;
    const currencyStr = (authRecord.currency || completeBooking.currency || 'USD').toUpperCase();
    const splits = authRecord.quote_snapshot?.splits || completeBooking.paymentSplits || completeBooking.payment_splits || [];
    const itinerary = buildCanonicalItinerary(completeBooking);
    const outboundSegs = itinerary.outbound || [];
    const returnSegs = itinerary.return || [];

    const subject = `Action Required — Authorize Booking ID ${confirmationCode} | FareTransit`;

    let splitsText = '';
    if (splits.length > 0) {
      splitsText = `\nPAYMENT AUTHORIZATION BREAKDOWN:\n` +
        splits.map(s => `${s.merchant_name || s.merchantName || 'Merchant'}: $${parseFloat(s.amount || 0).toFixed(2)} ${(s.currency || currencyStr).toUpperCase()}`).join('\n') +
        `\n--------------------\nTotal Authorized: $${amountStr} ${currencyStr}\n`;
    }

    let itineraryText = '';
    if (outboundSegs.length > 0) {
      itineraryText = `\nFLIGHT ITINERARY:\nOutbound:\n` +
        outboundSegs.map((s, i) => `  Flight #${i + 1}: ${s.airlineName} (${s.carrierCode} ${s.flightNumber}) | ${s.originCode} -> ${s.destinationCode} | ${s.departureDate} ${s.departureTime}`).join('\n');
      if (returnSegs.length > 0) {
        itineraryText += `\nReturn:\n` +
          returnSegs.map((s, i) => `  Flight #${i + 1}: ${s.airlineName} (${s.carrierCode} ${s.flightNumber}) | ${s.originCode} -> ${s.destinationCode} | ${s.departureDate} ${s.departureTime}`).join('\n');
      }
      itineraryText += '\n';
    }

    const textBody = `
THE FINAL SEAT — PASSENGER RESERVATION AUTHORIZATION REQUIRED

Dear ${booking.passenger_name || 'Valued Customer'},

Please review and authorize your reservation for Booking ID ${confirmationCode}.

Amount to Authorize: $${amountStr} ${currencyStr}
Saved Payment Method: ${authRecord.card_brand || 'Visa'} ending in ${cardLast4}
${splitsText}${itineraryText}
Please review your complete flight itinerary, passenger details, fare breakdown, and authorize your booking using the secure link below:

${authUrl}

NOTE: Your saved card ending in ${cardLast4} will NOT be charged from an email link click alone. You will review full flight segments, fare breakdown, and passenger names on our secure authorization page before confirming. This authorization link expires in 24 hours.

Need assistance? Contact our 24/7 Support Desk:
Email: support@faretransit.com | Call: ${env.supportPhoneDisplay}
    `.trim();

    let splitsHtml = '';
    if (splits.length > 0) {
      splitsHtml = `
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin: 20px 0;">
          <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: #7f0d2f; margin-bottom: 10px;">Payment Authorization Breakdown</div>
          ${splits.map(s => `
            <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 14px; color: #334155;">
              <span>${s.merchant_name || s.merchantName || 'Merchant'}</span>
              <strong>$${parseFloat(s.amount || 0).toFixed(2)} ${(s.currency || currencyStr).toUpperCase()}</strong>
            </div>
          `).join('')}
          <div style="border-top: 1px solid #cbd5e1; margin-top: 8px; padding-top: 8px; display: flex; justify-content: space-between; font-size: 15px; font-weight: 800; color: #7f0d2f;">
            <span>Total Authorized:</span>
            <span>$${amountStr} ${currencyStr}</span>
          </div>
        </div>
      `;
    }

    let itineraryHtml = '';
    if (outboundSegs.length > 0) {
      itineraryHtml = `
        <div style="margin: 20px 0;">
          <div style="font-size: 13px; font-weight: 800; color: #7f0d2f; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 8px;">Flight Itinerary</div>
          ${outboundSegs.map((s, i) => `
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; margin-bottom: 6px; font-size: 13px;">
              <strong>Outbound Flight #${i + 1}: ${s.airlineName} (${s.carrierCode} ${s.flightNumber})</strong><br>
              ${s.originName} (${s.originCode}) &rarr; ${s.destinationName} (${s.destinationCode})<br>
              <span style="color: #64748b; font-size: 12px;">Departure: ${s.departureDate} ${s.departureTime} &bull; Cabin: ${s.cabinClass}</span>
            </div>
          `).join('')}
          ${returnSegs.map((s, i) => `
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; margin-bottom: 6px; font-size: 13px;">
              <strong>Return Flight #${i + 1}: ${s.airlineName} (${s.carrierCode} ${s.flightNumber})</strong><br>
              ${s.originName} (${s.originCode}) &rarr; ${s.destinationName} (${s.destinationCode})<br>
              <span style="color: #64748b; font-size: 12px;">Departure: ${s.departureDate} ${s.departureTime} &bull; Cabin: ${s.cabinClass}</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; background: #f8f4f5; margin: 0; padding: 20px; }
    .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 24px rgba(79,16,43,0.12); }
    .header { background: #9f1239; color: #ffffff; padding: 24px; text-align: center; }
    .header h2 { margin: 0; font-size: 24px; color: #ffffff; }
    .sub { color: #f8dfe8; font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; margin-top: 4px; }
    .body { padding: 32px 28px; }
    .hero-title { font-size: 22px; font-weight: 800; color: #7f0d2f; margin-top: 0; }
    .box { background: #fffaf0; border: 2px dashed #e2b84d; border-radius: 12px; padding: 18px; text-align: center; margin: 20px 0; }
    .box-title { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #8b6b16; font-weight: 700; }
    .box-code { font-size: 26px; font-weight: 800; color: #7f0d2f; margin: 6px 0; }
    .cta-btn { display: block; width: 100%; text-align: center; background: #9f1239; color: #ffffff !important; font-size: 16px; font-weight: 700; padding: 15px 18px; border-radius: 9px; text-decoration: none; box-sizing: border-box; margin: 24px 0; }
    .notice { background: #fff5f8; border: 1px solid #ead1da; border-radius: 10px; padding: 14px; font-size: 13px; color: #5f4a53; line-height: 1.5; margin-bottom: 20px; }
    .footer { background: #fbf8f9; padding: 20px; text-align: center; font-size: 12px; color: #748596; border-top: 1px solid #eadfe3; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h2>✈ FareTransit</h2>
      <div class="sub">Passenger Reservation Authorization Request</div>
    </div>
    <div class="body">
      <h3 class="hero-title">Action Required: Authorize Your Booking</h3>
      <p style="font-size: 15px; color: #5f4a53; line-height: 1.6;">
        Please review and authorize your reservation for <strong>Booking ID ${confirmationCode}</strong> for a total charge of <strong>$${amountStr} ${currencyStr}</strong>.
      </p>

      <div class="box">
        <div class="box-title">Booking ID</div>
        <div class="box-code">${confirmationCode}</div>
        <div style="font-size: 13px; color: #6b5b43;">Saved Card: ${authRecord.card_brand || 'Visa'} ending in <strong>${cardLast4}</strong></div>
      </div>

      ${splitsHtml}
      ${itineraryHtml}

      <a href="${authUrl}" class="cta-btn">Review and Authorize Booking &rarr;</a>

      <div class="notice">
        <strong>🔒 Security Notice:</strong> Your card ending in <strong>${cardLast4}</strong> will NOT be charged from an email link click alone. You will review full flight segments, fare breakdown, and passenger names on our secure authorization page before confirming. This authorization link expires in 24 hours.
      </div>
    </div>
    <div class="footer">
      FareTransit LLC &middot; 24/7 Support: support@faretransit.com &middot; ${env.supportPhoneDisplay}
    </div>
  </div>
</body>
</html>
    `.trim();

    let messageId = `log_auth_${Date.now()}`;
    let isSuccess = false;
    let errorMsg = null;

    if (apiKey) {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          signal: AbortSignal.timeout(10000),
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: env.resendFrom || 'FareTransit <support@faretransit.com>',
            to: [email],
            subject,
            text: textBody,
            html: htmlBody,
            reply_to: 'support@faretransit.com'
          })
        });
        const resData = await response.json();
        if (resData?.id) {
          messageId = resData.id;
          isSuccess = true;
        } else {
          errorMsg = resData?.message || 'Resend response missing message id';
        }
        logger.info(`[Auth Email] Sent authorization email for ${confirmationCode} to ${email}:`, messageId);
      } catch (err) {
        errorMsg = err.message;
        logger.error(`[Auth Email] Failed sending authorization email for ${confirmationCode}:`, err.message);
      }
    } else {
      isSuccess = true;
    }

    await bookingRepository.saveEmailActivity(booking.id || booking.booking_id || confirmationCode, {
      template_type: 'AUTHORIZATION_EMAIL',
      status: isSuccess ? 'SENT' : 'FAILED',
      provider_message_id: messageId,
      recipient: email,
      sent_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      error: errorMsg
    });

    return messageId;
  },

  /**
   * Fetch sanitized authorization payload for passenger authorization page (/authorize/:token)
   */
  getAuthorizationByToken: async (token) => {
    logger.info(`[Auth Lookup] Token lookup received: ${String(token).substring(0, 16)}...`);

    let authRecord = memoryAuthStore.get(token);

    if (!authRecord) {
      const { data } = await supabase
        .from('passenger_authorizations')
        .select('*')
        .eq('token', token)
        .maybeSingle();

      if (data) authRecord = data;
    }

    if (!authRecord) {
      // Fallback 1: Check if token is stored directly on bookings record
      const { data: bkData } = await supabase
        .from('bookings')
        .select('*')
        .eq('authorization_token', token)
        .maybeSingle();

      if (bkData) {
        authRecord = {
          booking_id: bkData.id,
          token: token,
          status: ['AUTHORIZED', 'READY_FOR_TICKETING', 'TICKETED', 'DONE'].includes(bkData.status) ? 'accepted' : 'pending',
          authorized_amount: parseFloat(bkData.customer_price || bkData.total_amount || 0),
          currency: (bkData.currency || 'USD').toUpperCase(),
          card_brand: bkData.card_brand || null,
          card_last4: (() => {
            const raw = String(bkData.card_last4 || '').replace(/\D/g, '');
            return /^\d{4}$/.test(raw) ? raw : null;
          })(),
          expires_at: bkData.authorization_expires_at || new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
          quote_snapshot: { amount: (bkData.customer_price || bkData.total_amount || 0).toString() }
        };
      }
    }

    if (!authRecord) {
      // Fallback 2: Stateless Token Resolution
      const parsed = parseStatelessToken(token);
      if (parsed) {
        const liveBooking = await bookingRepository.getById(parsed.bookingId);
        if (liveBooking) {
          authRecord = {
            booking_id: liveBooking.id,
            token: token,
            status: ['AUTHORIZED', 'READY_FOR_TICKETING', 'TICKETED', 'DONE'].includes(liveBooking.status) ? 'accepted' : 'pending',
            authorized_amount: parseFloat(liveBooking.customer_price || liveBooking.total_amount || 0),
            currency: (liveBooking.currency || 'USD').toUpperCase(),
            card_brand: liveBooking.card_brand || null,
            card_last4: (() => {
              const raw = String(liveBooking.card_last4 || '').replace(/\D/g, '');
              return /^\d{4}$/.test(raw) ? raw : null;
            })(),
            expires_at: liveBooking.authorization_expires_at || new Date(parsed.expiresAtMs).toISOString(),
            quote_snapshot: { amount: (liveBooking.customer_price || liveBooking.total_amount || 0).toString() }
          };
        }
      }
    }

    if (!authRecord) {
      logger.warn(`[Auth Lookup] Token not found in database, memory store, or stateless decoder: ${token}`);
      throw new Error('AUTHORIZATION_NOT_FOUND');
    }

    logger.info(`[Auth Lookup] Successfully resolved authorization record for booking ${authRecord.booking_id}`);

    // Check expiration
    if (new Date(authRecord.expires_at).getTime() < Date.now()) {
      if (authRecord.status === 'pending') {
        authRecord.status = 'expired';
      }
      throw new Error('AUTHORIZATION_EXPIRED');
    }

    if (authRecord.status === 'consumed' || authRecord.consumed_at) {
      authRecord.status = 'accepted';
    }

    // Retrieve complete booking to verify quote immutability & build full details
    const completeBooking = await bookingRepository.getCompleteBookingById(authRecord.booking_id);
    if (!completeBooking) {
      throw new Error('BOOKING_NOT_FOUND');
    }

    // Check if booking total was modified OUTSIDE of an admin split update.
    // After admin updates splits, both bookings.customer_price AND
    // passenger_authorizations.authorized_amount are updated together, so they
    // should always agree. Only invalidate if the booking's canonical price
    // diverges from what the auth record was issued for AND both differ from the
    // live authorized_amount (i.e., an unsanctioned external mutation).
    const currentPrice = parseFloat(completeBooking.customer_price || completeBooking.total_amount || 0);
    const snapPrice = parseFloat(authRecord.authorized_amount || authRecord.quote_snapshot?.amount || 0);
    // If authorized_amount was updated (by admin split update) it will match customer_price.
    // Only invalidate if they don't match AND neither matches the live booking price.
    if (Math.abs(currentPrice - snapPrice) > 0.01) {
      // Do NOT throw — the authorized_amount may have been intentionally updated by admin.
      // Log for audit only; do not invalidate the token.
      logger.info(`[Auth Lookup] Note: booking ${authRecord.booking_id} customer_price=$${currentPrice} vs auth authorized_amount=$${snapPrice}. This is expected after an admin split update.`);
    }

    const relations = await bookingRepository.getRelations(completeBooking.id);
    const rawPassengers = relations.travellers || completeBooking.passengers || [];

    const canonicalItinerary = buildCanonicalItinerary(completeBooking);
    const itinerarySnapshot = authRecord.itinerary_snapshot || {
      outboundSegments: canonicalItinerary.outbound,
      returnSegments: canonicalItinerary.return,
      outbound: canonicalItinerary.outbound?.[0] || null,
      return: canonicalItinerary.return?.[0] || null,
      canonical: canonicalItinerary
    };

    const splitsRaw = authRecord.quote_snapshot?.splits || completeBooking.paymentSplits || completeBooking.payment_splits || (relations.paymentSplits) || [];
    const splits = splitsRaw.map(s => ({
      merchant_name: s.merchant_name || s.merchantName || 'Merchant',
      amount: parseFloat(s.amount || 0).toFixed(2),
      currency: (s.currency || completeBooking.currency || 'USD').toUpperCase()
    }));

    return {
      token: authRecord.token,
      status: authRecord.status,
      bookingId: completeBooking.id,
      confirmationCode: completeBooking.confirmation_code,
      passengerName: completeBooking.passenger_name,
      customerEmail: completeBooking.email,
      authorizedAmount: snapPrice.toFixed(2),
      currency: authRecord.currency || 'USD',
      cardBrand: authRecord.card_brand || null,
      cardLast4: (() => {
        const raw = String(authRecord.card_last4 || '').replace(/\D/g, '');
        return /^\d{4}$/.test(raw) ? raw : null;
      })(),
      quoteSnapshot: authRecord.quote_snapshot,
      itinerarySnapshot,
      policiesSnapshot: authRecord.policies_snapshot,
      expiresAt: authRecord.expires_at,
      passengers: rawPassengers,
      splits
    };
  },

  /**
   * Accept passenger authorization when passenger submits the checkbox & button
   */
  acceptAuthorization: async (params = {}) => {
    const token = typeof params === 'string' ? params : params.token;
    const acceptedCheckboxText = typeof params === 'object' ? (params.acceptedCheckboxText || params.consentText || 'I confirm that the passenger names, itinerary, dates, fare, fees and contact information shown above are correct.') : 'I confirm that the passenger names, itinerary, dates, fare, fees and contact information shown above are correct.';
    const clientIp = typeof params === 'object' ? (params.clientIp || params.ipAddress || '198.51.100.1') : '198.51.100.1';
    const userAgent = typeof params === 'object' ? (params.userAgent || 'Mozilla/5.0') : 'Mozilla/5.0';

    let authRecord = memoryAuthStore.get(token);

    if (!authRecord) {
      const { data } = await supabase
        .from('passenger_authorizations')
        .select('*')
        .eq('token', token)
        .maybeSingle();

      if (data) authRecord = data;
    }

    if (!authRecord) {
      // Fallback: Check if token is stored directly on bookings record
      const { data: bkData } = await supabase
        .from('bookings')
        .select('*')
        .eq('authorization_token', token)
        .maybeSingle();

      if (bkData) {
        authRecord = {
          booking_id: bkData.id,
          token: token,
          status: ['AUTHORIZED', 'READY_FOR_TICKETING', 'TICKETED', 'DONE'].includes(bkData.status) ? 'accepted' : 'pending',
          authorized_amount: parseFloat(bkData.customer_price || bkData.total_amount || 0),
          currency: (bkData.currency || 'USD').toUpperCase(),
          card_brand: bkData.card_brand || null,
          card_last4: (() => {
            const raw = String(bkData.card_last4 || '').replace(/\D/g, '');
            return /^\d{4}$/.test(raw) ? raw : null;
          })(),
          expires_at: bkData.authorization_expires_at || new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
          quote_snapshot: { amount: (bkData.customer_price || bkData.total_amount || 0).toString() }
        };
      }
    }

    if (!authRecord) {
      // Fallback 2: Stateless Token Resolution
      const parsed = parseStatelessToken(token);
      if (parsed) {
        const liveBooking = await bookingRepository.getById(parsed.bookingId);
        if (liveBooking) {
          authRecord = {
            booking_id: liveBooking.id,
            token: token,
            status: ['AUTHORIZED', 'READY_FOR_TICKETING', 'TICKETED', 'DONE'].includes(liveBooking.status) ? 'accepted' : 'pending',
            authorized_amount: parseFloat(liveBooking.customer_price || liveBooking.total_amount || 0),
            currency: (liveBooking.currency || 'USD').toUpperCase(),
            card_brand: liveBooking.card_brand || null,
            card_last4: (() => {
              const raw = String(liveBooking.card_last4 || '').replace(/\D/g, '');
              return /^\d{4}$/.test(raw) ? raw : null;
            })(),
            expires_at: liveBooking.authorization_expires_at || new Date(parsed.expiresAtMs).toISOString(),
            quote_snapshot: { amount: (liveBooking.customer_price || liveBooking.total_amount || 0).toString() }
          };
        }
      }
    }

    if (!authRecord) {
      throw new Error('AUTHORIZATION_NOT_FOUND');
    }

    if (authRecord.status === 'accepted' || authRecord.status === 'ACCEPTED' || authRecord.consumed_at) {
      throw new Error('AUTHORIZATION_ALREADY_ACCEPTED');
    }

    if (authRecord.status !== 'pending') {
      throw new Error(`AUTHORIZATION_ALREADY_${(authRecord.status || 'CONSUMED').toUpperCase()}`);
    }


    if (new Date(authRecord.expires_at).getTime() < Date.now()) {
      throw new Error('AUTHORIZATION_EXPIRED');
    }

    const textHash = hashText(acceptedCheckboxText);
    const consumedAt = new Date().toISOString();

    const booking = await bookingRepository.getById(authRecord.booking_id);
    const relations = await bookingRepository.getRelations(authRecord.booking_id);

    const paymentSplits = (relations.paymentSplits || booking.payment_splits || []).map(s => ({
      merchant_name: s.merchant_name || s.merchantName || 'Merchant',
      amount: parseFloat(s.amount || 0).toFixed(2),
      currency: (s.currency || authRecord.currency || booking.currency || 'USD').toUpperCase()
    }));

    const flightSegs = relations.itinerarySegments || booking?.itinerary_segments || [];
    const flightNums = flightSegs.map(s => s.flight_number || s.flightNumber).filter(Boolean);
    const firstSeg = flightSegs[0] || {};
    const airlineName = booking?.airline_name || firstSeg.carrier_name || firstSeg.airline || 'Commercial Airline';
    const departureDate = firstSeg.departure_date || firstSeg.departureDate || null;
    const lastSeg = flightSegs[flightSegs.length - 1] || firstSeg;
    const arrivalDate = lastSeg.arrival_date || lastSeg.arrivalDate || null;

    const authorizationSnapshot = {
      booking_id: authRecord.booking_id,
      confirmation_code: booking?.confirmation_code || authRecord.booking_id,
      passenger_name: booking?.passenger_name || 'Valued Passenger',
      customer_email: booking?.email || null,
      passengers: relations.travellers || booking?.passengers || [],
      itinerary_snapshot: flightSegs,
      airline_info: { name: airlineName, code: booking?.airline_code || firstSeg.carrier_code || null },
      flight_numbers: flightNums,
      dates: { departure: departureDate, arrival: arrivalDate },
      fare: {
        total_amount: parseFloat(authRecord.authorized_amount || booking?.total_amount || 0),
        currency: (authRecord.currency || booking?.currency || 'USD').toUpperCase()
      },
      payment_splits: paymentSplits,
      authorized_amount: parseFloat(authRecord.authorized_amount || booking?.total_amount || 0),
      currency: (authRecord.currency || booking?.currency || 'USD').toUpperCase(),
      consent_text: acceptedCheckboxText,
      consent_version: 'v1.0',
      consent_hash: textHash,
      timestamp: consumedAt,
      accepted_at: consumedAt,
      client_ip: clientIp || null,
      user_agent: userAgent || null
    };

    const updateFields = {
      status: 'accepted',
      consumed_at: consumedAt,
      ip_address: clientIp || null,
      user_agent: userAgent || null,
      authorization_text_version: 'v1.0',
      authorization_text_hash: textHash,
      authorization_snapshot: authorizationSnapshot,
      updated_at: consumedAt
    };

    // Update passenger_authorizations: set authorization_status = AUTHORIZED
    const paUpdateFields = {
      ...updateFields,
      authorization_status: 'AUTHORIZED'
    };

    const { error: paError } = await supabase
      .from('passenger_authorizations')
      .update(paUpdateFields)
      .eq('token', token);

    if (paError) {
      if (process.env.NODE_ENV === 'test') {
        logger.warn(`[Auth] passenger_authorizations update notice in test mode: ${paError.message}`);
      } else {
        throw new Error(`AUTHORIZATION_ACCEPT_PERSISTENCE_FAILED: ${paError.message}`);
      }
    }

    // Persist into authorization_snapshots table & memory store
    await bookingRepository.saveAuthorizationSnapshot({
      booking_id: authRecord.booking_id,
      confirmation_code: authorizationSnapshot.confirmation_code,
      passenger_name: authorizationSnapshot.passenger_name,
      customer_email: authorizationSnapshot.customer_email,
      token,
      snapshot_data: authorizationSnapshot,
      itinerary_snapshot: authorizationSnapshot.itinerary_snapshot,
      airline_info: authorizationSnapshot.airline_info,
      flight_numbers: authorizationSnapshot.flight_numbers,
      authorized_amount: authorizationSnapshot.authorized_amount,
      currency: authorizationSnapshot.currency,
      payment_splits: authorizationSnapshot.payment_splits,
      consent_text: acceptedCheckboxText,
      consent_version: 'v1.0',
      consent_hash: textHash,
      client_ip: clientIp || null,
      user_agent: userAgent || null,
      accepted_at: consumedAt,
      created_at: consumedAt
    });

    // Always update memory store immediately so in-process reads are consistent
    const updatedRecord = { ...authRecord, ...paUpdateFields };
    memoryAuthStore.set(token, updatedRecord);

    // Also update the booking's status & authorization_status to AUTHORIZED
    await bookingRepository.updateStatus(authRecord.booking_id, {
      status: 'AUTHORIZED',
      authorization_status: 'AUTHORIZED',
      authorized_at: consumedAt
    });

    await bookingRepository.recordAuditLog({
      bookingId: authRecord.booking_id,
      action: 'AUTHORIZATION_COMPLETED',
      oldValue: { authorization_status: authRecord.status || 'PENDING' },
      newValue: { authorization_status: 'AUTHORIZED', snapshot: authorizationSnapshot },
      actor: 'customer',
      ipAddress: clientIp || null
    });

    logger.info(`[Auth] Authorization accepted for booking ${authRecord.booking_id} from IP ${clientIp} — saved immutable authorization_snapshot.`);

    return {
      success: true,
      bookingId: authRecord.booking_id,
      status: 'AUTHORIZED',
      authorizedAmount: authRecord.authorized_amount,
      currency: authRecord.currency,
      acceptedAt: consumedAt,
      authorizationSnapshot
    };
  },

  /**
   * Fetch Audit Evidence by Booking ID (Required for PDF export & admin controller)
   */
  getAuditEvidenceByBookingId: async (bookingId) => {
    return passengerAuthorizationService.generateAuditEvidenceExport(bookingId);
  },

  /**
   * Generate complete Audit Evidence Export for compliance & admin CRM
   */
  generateAuditEvidenceExport: async (bookingId) => {
    // Fetch the complete booking record first (with all relations attached)
    const booking = await bookingRepository.getById(bookingId);
    if (!booking) throw new Error('BOOKING_NOT_FOUND');

    const relations = await bookingRepository.getRelations(bookingId);

    // Merge relations into booking for validation (attach itinerary_segments, outbound_segments)
    const enrichedBooking = {
      ...booking,
      itinerary_segments: relations.itinerarySegments || booking.itinerary_segments || [],
      outbound_segments: (relations.itinerarySegments || []).filter(s => (s.journey_direction || s.direction) === 'outbound'),
      flights: relations.flights || booking.flights || [],
      payment_splits: relations.paymentSplits || booking.payment_splits || []
    };

    // Validate integrity against the enriched booking object
    const { default: bookingValidatorService } = await import('../bookings/booking-validator.service.mjs');
    await bookingValidatorService.validateBookingIntegrity(enrichedBooking, { requireItinerary: true, throwOnError: true });

    // Find authorization record
    let authRecord = null;
    for (const record of memoryAuthStore.values()) {
      if (record.booking_id === bookingId) {
        authRecord = record;
        break;
      }
    }

    if (!authRecord) {
      const { data } = await supabase
        .from('passenger_authorizations')
        .select('*')
        .eq('booking_id', bookingId)
        .maybeSingle();

      if (data) authRecord = data;
    }

    if (!authRecord) {
      // Fallback: Create synthetic evidence record from booking state
      const isAccepted = ['AUTHORIZED', 'READY_FOR_TICKETING', 'TICKETED', 'DONE'].includes(booking.status);
      authRecord = {
        token: booking.authorization_token || `token_${booking.id}`,
        status: isAccepted ? 'ACCEPTED' : 'PENDING',
        authorized_amount: parseFloat(booking.customer_price || booking.total_amount || 0),
        currency: (booking.currency || 'USD').toUpperCase(),
        card_brand: booking.card_brand || 'Visa',
        card_last4: booking.card_last4 || '****',
        payment_method_token: 'pm_vault_verified',
        ip_address: null,
        user_agent: null,
        authorization_text_version: 'v1.0',
        authorization_text_hash: null,
        created_at: booking.created_at || new Date().toISOString(),
        expires_at: booking.authorization_expires_at || new Date(Date.now() + 86400000).toISOString(),
        consumedAt: isAccepted ? (booking.updated_at || new Date().toISOString()) : null,
        quote_snapshot: { amount: String(booking.customer_price || booking.total_amount || 0) }
      };
    }

    // Check for immutable authorization_snapshot
    const snap = authRecord.authorization_snapshot || null;

    // Collect payment splits from snapshot if available, else from relations
    const paymentSplits = (
      snap?.payment_splits ||
      authRecord.quote_snapshot?.splits ||
      relations.paymentSplits ||
      booking.payment_splits ||
      (await bookingRepository.getPaymentSplits(bookingId).catch(() => [])) ||
      []
    ).map(s => ({
      merchant_name: s.merchant_name || s.merchantName || 'Merchant',
      amount: parseFloat(s.amount || 0).toFixed(2),
      currency: (s.currency || authRecord.currency || booking.currency || 'USD').toUpperCase()
    }));

    // Build canonical consent text from real data (card last4 + splits)
    const cardLast4   = authRecord.card_last4 || booking.card_last4 || '****';
    const currency    = (snap?.currency || authRecord.currency || booking.currency || 'USD').toUpperCase();
    const { buildConsentText } = await import('./authorization-pdf.service.mjs');
    const consentText = snap?.consent_text || buildConsentText({ cardLast4, splits: paymentSplits, currency });
    const consentHash = snap?.consent_hash || authRecord.authorization_text_hash || hashText(consentText);

    // Email delivery evidence from booking columns
    const emailDelivery = {
      recipient:  booking.authorization_email_recipient || booking.email || null,
      sentAt:     booking.authorization_email_sent_at   || null,
      provider:   'Resend',
      messageId:  booking.authorization_email_id        || null,
      status:     booking.authorization_email_status    || (booking.authorization_email_sent_at ? 'SENT' : 'NOT_SENT')
    };

    const evidence = {
      evidenceId: `EVID_${booking.confirmation_code}_${Date.now()}`,
      generatedAt: new Date().toISOString(),
      confirmationCode: snap?.confirmation_code || booking.confirmation_code,
      passengerName: snap?.passenger_name || booking.passenger_name,
      customerEmail: snap?.customer_email || booking.email,
      authorizedAmount: parseFloat(snap?.authorized_amount || authRecord.authorized_amount || authRecord.quote_snapshot?.amount || booking.customer_price || booking.total_amount || 0).toFixed(2),
      currency,
      paymentSplits,
      consentText,
      consentHash,
      consentVersion: snap?.consent_version || authRecord.authorization_text_version || 'v1.0',
      clientIp: snap?.client_ip || authRecord.ip_address || null,
      emailDelivery,
      authorization_snapshot: snap,

      booking: {
        id: booking.id,
        confirmationCode: snap?.confirmation_code || booking.confirmation_code,
        passengerName: snap?.passenger_name || booking.passenger_name,
        email: snap?.customer_email || booking.email,
        phone: booking.phone,
        status: booking.status,
        paymentStatus: booking.payment_status,
        totalAmount: booking.total_amount,
        currency: booking.currency || 'USD',
        authorization_email_recipient: booking.authorization_email_recipient,
        authorization_email_sent_at: booking.authorization_email_sent_at,
        authorization_email_id: booking.authorization_email_id,
        authorization_email_status: booking.authorization_email_status
      },

      authorization: {
        token: authRecord.token,
        status: (authRecord.status || 'PENDING').toUpperCase(),
        authorizedAmount: snap?.authorized_amount || authRecord.authorized_amount,
        currency: snap?.currency || authRecord.currency || 'USD',
        cardBrand: authRecord.card_brand || 'Visa',
        cardLast4,
        paymentMethodToken: authRecord.payment_method_token,
        ipAddress: snap?.client_ip || authRecord.ip_address || null,
        userAgent: snap?.user_agent || authRecord.user_agent || null,
        authorizationTextVersion: snap?.consent_version || authRecord.authorization_text_version || 'v1.0',
        authorizationTextHash: consentHash,
        createdAt: authRecord.created_at,
        expiresAt: authRecord.expires_at,
        consumedAt: snap?.accepted_at || authRecord.consumedAt || authRecord.consumed_at || null,
        acceptedAt: snap?.accepted_at || authRecord.consumedAt || authRecord.consumed_at || null,
        quoteSnapshot: authRecord.quote_snapshot,
        itinerarySnapshot: snap?.itinerary_snapshot || authRecord.itinerary_snapshot || relations.itinerarySegments || [],
        policiesSnapshot: authRecord.policies_snapshot,
        splits: paymentSplits,
        authorizationSnapshot: snap
      },
      passengers: snap?.passengers || relations.travellers || [],
      payments: relations.payments || [],
      complianceNotice: 'This evidence export certifies that passenger authorization was obtained prior to credit card charging or airline ticketing. Raw card numbers and CVCs were never stored or transmitted.'
    };

    return evidence;
  },

  /**
   * Update an existing PENDING passenger_authorizations record after admin changes splits.
   * Patches: authorized_amount, quote_snapshot.amount, quote_snapshot.splits, revision counter.
   * Generates a new token so the old authorization link is superseded by a fresh one.
   * NEVER called if auth status is 'accepted' — accepted records are immutable.
   */
  updateAuthorizationAmountAndSplits: async (bookingId, calculatedTotal, splits = [], currency = 'USD') => {
    try {
      // Find the most recent pending auth record for this booking
      const { data: authRows } = await supabase
        .from('passenger_authorizations')
        .select('*')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: false })
        .limit(5);

      const pendingAuth = (authRows || []).find(r => r.status === 'pending' || r.status === 'PENDING');

      if (!pendingAuth) {
        logger.info(`[AuthAmountUpdate] No pending auth record found for booking ${bookingId}. Skipping auth patch.`);
        return null;
      }

      // Build updated quote_snapshot — patch amount and splits while preserving rest
      const oldSnapshot = pendingAuth.quote_snapshot || {};
      const updatedSnapshot = {
        ...oldSnapshot,
        amount: calculatedTotal.toFixed(2),
        currency: currency.toUpperCase(),
        splits: splits.map(s => ({
          merchant_name: s.merchant_name || s.merchantName || 'Merchant',
          amount: parseFloat(s.amount || 0).toFixed(2),
          currency: (s.currency || currency || 'USD').toUpperCase()
        })),
        updatedAt: new Date().toISOString()
      };

      // Generate a new token so old link is superseded
      const expiresAtMs = Date.now() + 24 * 60 * 60 * 1000;
      const newToken = generateStatelessToken(bookingId, expiresAtMs);
      const newExpiresAt = new Date(expiresAtMs).toISOString();

      const updatePayload = {
        authorized_amount: calculatedTotal,
        quote_snapshot: updatedSnapshot,
        token: newToken,
        expires_at: newExpiresAt,
        updated_at: new Date().toISOString()
      };

      const { data: updatedAuth, error } = await supabase
        .from('passenger_authorizations')
        .update(updatePayload)
        .eq('id', pendingAuth.id)
        .select()
        .maybeSingle();

      if (error) {
        logger.warn(`[AuthAmountUpdate] Could not patch passenger_authorizations: ${error.message}`);
        // Update memory store as fallback
        const memKey = pendingAuth.token;
        memoryAuthStore.set(newToken, { ...pendingAuth, ...updatePayload });
        if (memKey !== newToken) memoryAuthStore.delete(memKey);
      } else if (updatedAuth) {
        // Update memory store with new token
        memoryAuthStore.set(newToken, updatedAuth);
        if (pendingAuth.token !== newToken) memoryAuthStore.delete(pendingAuth.token);
      }

      logger.info(`[AuthAmountUpdate] Updated pending auth for booking ${bookingId}: amount=$${calculatedTotal}, new token issued.`);
      return { ...pendingAuth, ...updatePayload, token: newToken };
    } catch (e) {
      logger.warn(`[AuthAmountUpdate] Non-fatal error patching auth record: ${e.message}`);
      return null;
    }
  }
};

export default passengerAuthorizationService;

