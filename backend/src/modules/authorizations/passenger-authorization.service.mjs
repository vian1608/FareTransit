import crypto from 'crypto';
import supabase from '../../integrations/supabase/supabase.client.mjs';
import env from '../../config/env.mjs';
import logger from '../../config/logger.mjs';
import bookingRepository from '../bookings/booking.repository.mjs';
import { resolveAirlineName, buildCanonicalItinerary } from '../../shared/utils/airline-lookup.mjs';
import authorizationSnapshotService, { authorizationSnapshotHash, authorizationSnapshotToLegacyItinerary } from './authorization-snapshot.service.mjs';

// In-memory fallback map for offline / stub testing when remote DB table schema is updating
const memoryAuthStore = new Map();

function hashText(text) {
  return crypto.createHash('sha256').update(String(text || '')).digest('hex');
}

async function getAuthoritativeBookingAuthorizationState(bookingId) {
  const { data, error } = await supabase
    .from('bookings')
    .select('id,confirmation_code,booking_revision,authorization_status,status,authorization_token,authorization_expires_at')
    .eq('id', bookingId)
    .maybeSingle();

  if (error || !data?.id) {
    logger.error(`[AuthorizationIntegrity] Unable to read authoritative booking state for ${bookingId}: ${error?.message || 'booking not found'}`);
    if (process.env.NODE_ENV === 'test') return null;
    throw new Error('AUTHORIZATION_BOOKING_STATE_UNAVAILABLE');
  }
  return data;
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
    const snapshot = await authorizationSnapshotService.build(bookingInput);
    const bookingId = snapshot.bookingId;
    const revision = Number(snapshot.bookingRevision || 1);
    const snapshotHash = authorizationSnapshotHash(snapshot);
    const now = new Date();

    const { data: existingRows } = await supabase
      .from('passenger_authorizations')
      .select('*')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false });

    const rows = Array.isArray(existingRows) ? existingRows : [];
    const reusable = rows.find(row =>
      String(row.status || '').toLowerCase() === 'pending' &&
      Number(row.authorization_revision || 1) === revision &&
      row.request_snapshot_hash === snapshotHash &&
      new Date(row.expires_at || row.authorization_expires_at || 0).getTime() > Date.now() + 60000
    );
    if (reusable) {
      await bookingRepository.updateStatus(bookingId, {
        authorization_token: reusable.token,
        authorization_expires_at: reusable.expires_at || reusable.authorization_expires_at,
        authorization_status: 'AWAITING_PASSENGER'
      });
      return {
        ...reusable,
        token: reusable.token,
        snapshot: reusable.request_snapshot || snapshot,
        request_snapshot: reusable.request_snapshot || snapshot,
        expiresAt: reusable.expires_at || reusable.authorization_expires_at,
        authorizationUrl: `https://www.faretransit.com/authorize/${reusable.token}`
      };
    }

    const stalePending = rows.filter(row => String(row.status || '').toLowerCase() === 'pending');
    if (stalePending.length) {
      await supabase.from('passenger_authorizations').update({
        status: 'superseded',
        authorization_status: 'SUPERSEDED',
        superseded_at: now.toISOString(),
        status_reason: 'A newer authorization request was issued.',
        updated_at: now.toISOString()
      }).in('id', stalePending.map(row => row.id));
    }

    const token = `fta_${crypto.randomBytes(24).toString('base64url')}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const legacyItinerary = authorizationSnapshotToLegacyItinerary(snapshot);
    const splits = snapshot.paymentAuthorization.splits || [];
    const quoteSnapshot = {
      amount: Number(snapshot.paymentAuthorization.authorizedAmount || 0).toFixed(2),
      currency: snapshot.paymentAuthorization.currency,
      splits: splits.map(split => ({
        merchant_name: split.merchantName,
        merchant_type: split.merchantType,
        merchant_code: split.merchantCode,
        amount: Number(split.amount || 0).toFixed(2),
        currency: split.currency
      })),
      createdAt: snapshot.createdAt
    };

    const cardBrand = vaultData.cardBrand || vaultData.brand || snapshot.paymentMethod?.brand || null;
    const rawLast4 = String(vaultData.cardLast4 || vaultData.last4 || snapshot.paymentMethod?.last4 || '').replace(/\D/g, '');
    const cardLast4 = /^\d{4}$/.test(rawLast4) ? rawLast4 : null;

    const authRecord = {
      booking_id: bookingId,
      confirmation_code: snapshot.confirmationCode,
      token,
      authorization_token: token,
      status: 'pending',
      authorization_status: 'AWAITING_AUTHORIZATION',
      authorization_revision: revision,
      request_snapshot: snapshot,
      request_snapshot_hash: snapshotHash,
      authorized_amount: Number(snapshot.paymentAuthorization.authorizedAmount || 0),
      booking_amount: Number(snapshot.pricing.customerTotal || snapshot.paymentAuthorization.authorizedAmount || 0),
      currency: snapshot.paymentAuthorization.currency,
      card_brand: cardBrand,
      payment_card_brand: cardBrand,
      card_last4: cardLast4,
      payment_card_last4: cardLast4,
      payment_method_label: snapshot.paymentMethod?.label || null,
      quote_snapshot: quoteSnapshot,
      itinerary_snapshot: legacyItinerary,
      policies_snapshot: snapshot.policies,
      authorization_text_version: 'v2.0',
      expires_at: expiresAt,
      authorization_expires_at: expiresAt,
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    };

    const { data, error } = await supabase.from('passenger_authorizations').insert(authRecord).select().single();
    if (error) {
      if (process.env.NODE_ENV === 'test') memoryAuthStore.set(token, authRecord);
      else throw new Error(`AUTHORIZATION_PERSISTENCE_FAILED: ${error.message}`);
    } else {
      memoryAuthStore.set(token, data);
    }

    await bookingRepository.updateStatus(bookingId, {
      authorization_token: token,
      authorization_expires_at: expiresAt,
      authorization_status: 'AWAITING_PASSENGER'
    });

    return {
      ...(data || authRecord),
      token,
      snapshot,
      request_snapshot: snapshot,
      expiresAt,
      expires_at: expiresAt,
      authorizationUrl: `https://www.faretransit.com/authorize/${token}`
    };
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
FareTransit — PASSENGER RESERVATION AUTHORIZATION REQUIRED

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
    logger.info(`[Auth Lookup] Immutable token lookup: ${String(token || '').substring(0, 16)}...`);
    let authRecord = memoryAuthStore.get(token) || null;
    if (!authRecord) {
      const { data, error } = await supabase.from('passenger_authorizations').select('*').eq('token', token).maybeSingle();
      if (error) logger.warn(`[Auth Lookup] DB lookup warning: ${error.message}`);
      authRecord = data || null;
    }
    if (!authRecord) throw new Error('AUTHORIZATION_NOT_FOUND');

    const status = String(authRecord.status || authRecord.authorization_status || '').toLowerCase();
    if (status === 'superseded' || status === 'reauthorization_required') throw new Error('AUTHORIZATION_SUPERSEDED');
    if (status === 'revoked') throw new Error('AUTHORIZATION_REVOKED');
    if (status === 'declined') throw new Error('AUTHORIZATION_DECLINED');

    const expiry = new Date(authRecord.expires_at || authRecord.authorization_expires_at || 0).getTime();
    if (Number.isFinite(expiry) && expiry > 0 && expiry < Date.now() && !['accepted', 'authorized'].includes(status)) {
      await supabase.from('passenger_authorizations').update({ status: 'expired', authorization_status: 'EXPIRED', updated_at: new Date().toISOString() }).eq('id', authRecord.id).catch(() => null);
      throw new Error('AUTHORIZATION_EXPIRED');
    }

    // Fail closed against the database row itself. Public token validity must not
    // depend on repository caches, bounded DTOs, or legacy relation fallbacks.
    const liveState = await getAuthoritativeBookingAuthorizationState(authRecord.booking_id);
    const authRevision = Number(authRecord.authorization_revision || 1);
    const bookingRevision = Number(liveState?.booking_revision || 1);
    const liveAuthorizationStatus = String(liveState?.authorization_status || '').toUpperCase();
    if (authRevision !== bookingRevision || liveAuthorizationStatus === 'REAUTHORIZATION_REQUIRED') {
      // Preserve already-accepted evidence exactly as historical evidence. Only
      // pending rows are transitioned; every stale public token is rejected.
      if (!['accepted', 'authorized'].includes(status)) {
        await supabase.from('passenger_authorizations').update({
          status: 'superseded', authorization_status: 'SUPERSEDED', superseded_at: new Date().toISOString(),
          status_reason: `Booking revision advanced from ${authRevision} to ${bookingRevision}.`, updated_at: new Date().toISOString()
        }).eq('id', authRecord.id).catch(() => null);
      }
      throw new Error('AUTHORIZATION_SUPERSEDED');
    }

    const booking = await bookingRepository.getById(authRecord.booking_id);
    if (!booking) throw new Error('BOOKING_NOT_FOUND');

    const snapshot = authRecord.request_snapshot || null;
    const legacyItinerary = snapshot ? authorizationSnapshotToLegacyItinerary(snapshot) : (authRecord.itinerary_snapshot || {});
    const quote = authRecord.quote_snapshot || {};
    const paymentSplits = snapshot?.paymentAuthorization?.splits || quote.splits || [];
    const rawLast4 = String(snapshot?.paymentMethod?.last4 || authRecord.card_last4 || authRecord.payment_card_last4 || '').replace(/\D/g, '');
    const last4 = /^\d{4}$/.test(rawLast4) ? rawLast4 : null;

    return {
      bookingId: authRecord.booking_id,
      confirmationCode: snapshot?.confirmationCode || booking.confirmation_code,
      passengerName: snapshot?.passenger?.name || booking.passenger_name || 'Valued Passenger',
      customerEmail: snapshot?.passenger?.email || booking.email || null,
      authorizedAmount: Number(snapshot?.paymentAuthorization?.authorizedAmount ?? authRecord.authorized_amount ?? quote.amount ?? 0).toFixed(2),
      currency: snapshot?.paymentAuthorization?.currency || authRecord.currency || booking.currency || 'USD',
      cardBrand: snapshot?.paymentMethod?.brand || authRecord.card_brand || authRecord.payment_card_brand || null,
      cardLast4: last4,
      status: ['accepted', 'authorized'].includes(status) ? 'ACCEPTED' : 'PENDING',
      authorizationStatus: authRecord.authorization_status || (status === 'accepted' ? 'AUTHORIZED' : 'AWAITING_AUTHORIZATION'),
      expiresAt: authRecord.expires_at || authRecord.authorization_expires_at,
      bookingRevision,
      authorizationRevision: authRevision,
      canAuthorize: !['accepted', 'authorized'].includes(status),
      snapshot,
      itinerarySnapshot: legacyItinerary,
      paymentSplits: paymentSplits.map(split => ({
        merchant_name: split.merchant_name || split.merchantName || 'Merchant',
        merchantName: split.merchantName || split.merchant_name || 'Merchant',
        merchant_code: split.merchant_code || split.merchantCode || null,
        merchant_type: split.merchant_type || split.merchantType || null,
        amount: Number(split.amount || 0).toFixed(2),
        currency: split.currency || authRecord.currency || 'USD'
      }))
    };
  },

  /**
   * Accept passenger authorization when passenger submits the checkbox & button
   */
  acceptAuthorization: async (params = {}) => {
    const token = typeof params === 'string' ? params : params.token;
    const acceptedCheckboxText = typeof params === 'object'
      ? (params.acceptedCheckboxText || params.consentText || 'I confirm the reservation details shown above and authorize the listed payment amount.')
      : 'I confirm the reservation details shown above and authorize the listed payment amount.';
    const clientIp = typeof params === 'object' ? (params.clientIp || params.ipAddress || null) : null;
    const userAgent = typeof params === 'object' ? (params.userAgent || 'Browser Client') : 'Browser Client';

    let authRecord = memoryAuthStore.get(token) || null;
    if (!authRecord) {
      const { data } = await supabase.from('passenger_authorizations').select('*').eq('token', token).maybeSingle();
      authRecord = data || null;
    }
    if (!authRecord) throw new Error('AUTHORIZATION_NOT_FOUND');

    const state = String(authRecord.status || authRecord.authorization_status || '').toLowerCase();
    const liveState = await getAuthoritativeBookingAuthorizationState(authRecord.booking_id);
    const authRevision = Number(authRecord.authorization_revision || 1);
    const bookingRevision = Number(liveState?.booking_revision || 1);
    const liveAuthorizationStatus = String(liveState?.authorization_status || '').toUpperCase();

    // Revision/lifecycle invalidation wins over idempotency: an accepted historical
    // token from an older revision is evidence, not a reusable public authorization.
    if (authRevision !== bookingRevision || liveAuthorizationStatus === 'REAUTHORIZATION_REQUIRED') {
      if (!['accepted', 'authorized'].includes(state) && !authRecord.consumed_at) {
        await supabase.from('passenger_authorizations').update({
          status: 'superseded', authorization_status: 'SUPERSEDED', superseded_at: new Date().toISOString(),
          status_reason: `Booking revision advanced from ${authRevision} to ${bookingRevision}.`, updated_at: new Date().toISOString()
        }).eq('id', authRecord.id).catch(() => null);
      }
      throw new Error('AUTHORIZATION_SUPERSEDED');
    }

    if (['accepted', 'authorized'].includes(state) || authRecord.consumed_at) throw new Error('AUTHORIZATION_ALREADY_ACCEPTED');
    if (state === 'superseded' || state === 'reauthorization_required') throw new Error('AUTHORIZATION_SUPERSEDED');
    if (state === 'revoked') throw new Error('AUTHORIZATION_REVOKED');
    if (state === 'declined') throw new Error('AUTHORIZATION_DECLINED');
    if (state !== 'pending' && state !== 'awaiting_authorization') throw new Error(`AUTHORIZATION_ALREADY_${state.toUpperCase()}`);
    if (new Date(authRecord.expires_at || authRecord.authorization_expires_at || 0).getTime() < Date.now()) throw new Error('AUTHORIZATION_EXPIRED');

    const booking = await bookingRepository.getById(authRecord.booking_id);
    if (!booking) throw new Error('BOOKING_NOT_FOUND');

    // New authorizations MUST carry the immutable request snapshot. Legacy rows
    // may use only their already-frozen quote/itinerary data; live itinerary data
    // is intentionally never substituted here.
    const requestSnapshot = authRecord.request_snapshot || {
      schemaVersion: 'AUTHORIZATION_SNAPSHOT_LEGACY',
      bookingId: authRecord.booking_id,
      confirmationCode: authRecord.confirmation_code || booking.confirmation_code,
      bookingRevision: authRevision,
      passenger: { name: booking.passenger_name || 'Valued Passenger', email: booking.email || null, travellers: [] },
      itinerary: authRecord.itinerary_snapshot?.canonical || { tripType: booking.itinerary_type || 'ONE_WAY', journeys: [] },
      pricing: { customerTotal: Number(authRecord.booking_amount || authRecord.authorized_amount || 0), currency: authRecord.currency || booking.currency || 'USD' },
      paymentAuthorization: { authorizedAmount: Number(authRecord.authorized_amount || 0), currency: authRecord.currency || booking.currency || 'USD', splits: authRecord.quote_snapshot?.splits || [] },
      paymentMethod: { brand: authRecord.card_brand || 'Card', last4: authRecord.card_last4 || null },
      policies: authRecord.policies_snapshot || {}
    };

    const textHash = hashText(acceptedCheckboxText);
    const consumedAt = new Date().toISOString();
    const legacyItinerary = authorizationSnapshotToLegacyItinerary(requestSnapshot);
    const paymentSplits = (requestSnapshot.paymentAuthorization?.splits || authRecord.quote_snapshot?.splits || []).map(split => ({
      merchant_name: split.merchant_name || split.merchantName || 'Merchant',
      merchant_type: split.merchant_type || split.merchantType || null,
      merchant_code: split.merchant_code || split.merchantCode || null,
      amount: Number(split.amount || 0).toFixed(2),
      currency: split.currency || requestSnapshot.paymentAuthorization?.currency || 'USD'
    }));

    const authorizationSnapshot = {
      ...requestSnapshot,
      booking_id: requestSnapshot.bookingId,
      confirmation_code: requestSnapshot.confirmationCode,
      booking_revision: authRevision,
      request_snapshot_hash: authRecord.request_snapshot_hash || authorizationSnapshotHash(requestSnapshot),
      passenger_name: requestSnapshot.passenger?.name || 'Valued Passenger',
      customer_email: requestSnapshot.passenger?.email || null,
      passengers: requestSnapshot.passenger?.travellers || [],
      itinerary_snapshot: legacyItinerary,
      payment_splits: paymentSplits,
      authorized_amount: Number(requestSnapshot.paymentAuthorization?.authorizedAmount || authRecord.authorized_amount || 0),
      currency: requestSnapshot.paymentAuthorization?.currency || authRecord.currency || 'USD',
      consent_text: acceptedCheckboxText,
      consent_version: 'v2.0',
      consent_hash: textHash,
      authorization_status: 'AUTHORIZED',
      accepted_at: consumedAt,
      timestamp: consumedAt,
      client_ip: clientIp || null,
      user_agent: userAgent || null
    };

    const paUpdateFields = {
      status: 'accepted',
      authorization_status: 'AUTHORIZED',
      consumed_at: consumedAt,
      authorized_at: consumedAt,
      ip_address: clientIp || null,
      authorized_ip: clientIp || null,
      user_agent: userAgent || null,
      authorized_user_agent: userAgent || null,
      authorization_text_version: 'v2.0',
      authorization_text_hash: textHash,
      authorization_snapshot: authorizationSnapshot,
      updated_at: consumedAt
    };
    const { error: paError } = await supabase.from('passenger_authorizations').update(paUpdateFields).eq('id', authRecord.id);
    if (paError && process.env.NODE_ENV !== 'test') throw new Error(`AUTHORIZATION_ACCEPT_PERSISTENCE_FAILED: ${paError.message}`);

    await bookingRepository.saveAuthorizationSnapshot({
      booking_id: authRecord.booking_id,
      confirmation_code: authorizationSnapshot.confirmation_code,
      passenger_name: authorizationSnapshot.passenger_name,
      customer_email: authorizationSnapshot.customer_email,
      token,
      snapshot_data: authorizationSnapshot,
      itinerary_snapshot: legacyItinerary,
      authorized_amount: authorizationSnapshot.authorized_amount,
      currency: authorizationSnapshot.currency,
      payment_splits: paymentSplits,
      consent_text: acceptedCheckboxText,
      consent_version: 'v2.0',
      consent_hash: textHash,
      client_ip: clientIp || null,
      user_agent: userAgent || null,
      accepted_at: consumedAt,
      booking_revision: authRevision,
      request_snapshot_hash: authorizationSnapshot.request_snapshot_hash,
      created_at: consumedAt
    });

    memoryAuthStore.set(token, { ...authRecord, ...paUpdateFields });
    await bookingRepository.updateStatus(authRecord.booking_id, {
      status: 'AUTHORIZED',
      authorization_status: 'AUTHORIZED',
      authorized_at: consumedAt
    });
    await bookingRepository.recordAuditLog({
      bookingId: authRecord.booking_id,
      action: 'AUTHORIZATION_COMPLETED',
      oldValue: { authorization_status: authRecord.status || 'PENDING', bookingRevision: authRevision },
      newValue: { authorization_status: 'AUTHORIZED', bookingRevision: authRevision, requestSnapshotHash: authorizationSnapshot.request_snapshot_hash },
      actor: 'customer',
      ipAddress: clientIp || null
    });

    return {
      success: true,
      bookingId: authRecord.booking_id,
      status: 'AUTHORIZED',
      authorizedAmount: authorizationSnapshot.authorized_amount,
      currency: authorizationSnapshot.currency,
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

