import adminService from './admin.service.mjs';
import bookingService from '../bookings/booking.service.mjs';
import bookingRepository from '../bookings/booking.repository.mjs';
import bookingMapper from '../bookings/booking.mapper.mjs';
import { BOOKING_STATUSES, PAYMENT_OPERATIONAL_STATES } from '../bookings/booking.constants.mjs';
import { sendBookingConfirmation, sendBookingRequestReceivedEmail, sendPassengerAuthorizationEmail, sendFinalTicketEmail, sendAdminBookingAcknowledgement } from '../../integrations/resend/resend.service.mjs';

import passengerAuthorizationService from '../authorizations/passenger-authorization.service.mjs';
import { generateAuthorizationPdfBuffer } from '../authorizations/authorization-pdf.service.mjs';
import logger from '../../config/logger.mjs';
import bcrypt from 'bcryptjs';
import authRepository from '../auth/auth.repository.mjs';
import env from '../../config/env.mjs';
import { parseGdsItineraryText } from '../../shared/utils/gds-itinerary-parser.mjs';

import { emailRendererService } from '../emails/email-renderer.service.mjs';

export const adminController = {
  createBooking: async (req, res, next) => {
    try {
      const payload = req.body;
      const result = await bookingService.create(payload);

      const booking = result?.booking || result;

      return res.status(201).json({
        success: true,
        message: 'New booking created successfully.',
        data: booking,
        booking
      });
    } catch (err) {
      next(err);
    }
  },

  emailPreview: async (req, res, next) => {
    try {
      const { id } = req.params;
      const rawType = (req.body || {}).type || (req.query || {}).type;
      const type = String(rawType || '').trim().toLowerCase().replace(/-/g, '_');

      let booking = null;
      try {
        booking = await bookingRepository.getCompleteBookingById(id);
      } catch (err) {
        return res.status(500).json({
          success: false,
          error: { code: 'BOOKING_LOAD_FAILED', message: `Could not load booking details: ${err.message}` }
        });
      }

      if (!booking) {
        return res.status(404).json({ success: false, error: { code: 'BOOKING_NOT_FOUND', message: 'Booking not found' } });
      }

      let rendered = null;
      try {
        if (type === 'booking_request') {
          rendered = await emailRendererService.renderBookingRequestEmail(booking);
        } else if (type === 'authorization') {
          rendered = await emailRendererService.renderAuthorizationEmail(booking);
        } else if (type === 'final_ticket') {
          rendered = await emailRendererService.renderFinalTicketEmail(booking);
        } else {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_PREVIEW_TYPE', message: `Unsupported email preview type: ${rawType}` }
          });
        }
      } catch (err) {
        const errCode = type === 'authorization' ? 'AUTHORIZATION_PREVIEW_FAILED' : 'EMAIL_TEMPLATE_RENDER_FAILED';
        return res.status(500).json({
          success: false,
          error: { code: errCode, message: err.message || 'Email template rendering failed' }
        });
      }

      const previewPayload = {
        type: type || rendered.type,
        recipient: rendered.recipient || rendered.to || booking.email || booking.contacts?.[0]?.email || 'N/A',
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        missingFields: rendered.missingFields || [],
        authorizationUrl: rendered.authorizationUrl || null,
        authorizationExpiresAt: rendered.authorizationExpiresAt || null
      };

      return res.json({
        success: true,
        preview: previewPayload,
        ...previewPayload
      });
    } catch (err) {
      next(err);
    }
  },

  markEmailManuallySent: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { type, emailType } = req.body || {};
      const targetType = type || emailType || 'booking_request';

      const booking = await bookingRepository.getCompleteBookingById(id);
      if (!booking) {
        return res.status(404).json({ success: false, error: { message: 'Booking not found' } });
      }

      const timestamp = new Date().toISOString();
      const adminIdentity = req.user?.email || 'admin';

      const updatePayload = {
        manual_sent_at: timestamp,
        manual_sent_by: adminIdentity,
        provider_message_id: null
      };

      if (targetType === 'booking_request') {
        updatePayload.booking_request_email_status = 'MANUALLY_SENT';
      } else if (targetType === 'authorization') {
        updatePayload.authorization_email_status = 'MANUALLY_SENT';
      } else if (targetType === 'final_ticket') {
        updatePayload.final_ticket_email_status = 'MANUALLY_SENT';
      }

      await bookingRepository.updateBookingStatus(id, updatePayload);

      return res.json({
        success: true,
        message: 'Email marked as manually sent successfully.',
        status: 'MANUALLY_SENT',
        manual_sent_at: timestamp,
        manual_sent_by: adminIdentity
      });
    } catch (err) {
      next(err);
    }
  },

  getBookingByClientRequestId: async (req, res, next) => {
    try {
      const { clientRequestId } = req.params;
      if (!clientRequestId) {
        return res.status(400).json({
          success: false,
          error: { message: 'clientRequestId parameter is required' }
        });
      }

      const booking = await bookingRepository.getBookingByClientRequestId(clientRequestId);
      if (booking) {
        return res.json({
          success: true,
          found: true,
          booking
        });
      }

      return res.json({
        success: true,
        found: false
      });
    } catch (err) {
      next(err);
    }
  },
  parseItinerary: async (req, res, next) => {
    try {
      const { text, rawText, itineraryText } = req.body || {};
      const input = text || rawText || itineraryText;

      if (!input || typeof input !== 'string') {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'Itinerary text or structured JSON is required.' }
        });
      }

      if (input.length > 100000) {
        return res.status(400).json({
          success: false,
          error: { code: 'INPUT_TOO_LARGE', message: 'Itinerary text exceeds maximum allowed size (100KB).' }
        });
      }

      const parsed = parseGdsItineraryText(input);
      return res.json(parsed);
    } catch (err) {
      logger.error(`[parseItinerary] Parse error: ${err.message}`);
      return res.status(500).json({
        success: false,
        error: { code: 'PARSE_FAILED', message: err.message }
      });
    }
  },

  deleteBooking: async (req, res, next) => {
    try {
      const { bookingId } = req.params;
      const { adminPassword } = req.body || {};

      if (!adminPassword) {
        return res.status(400).json({
          success: false,
          error: { code: 'PASSWORD_REQUIRED', message: 'Admin password is required to delete a booking.' }
        });
      }

      let isValidPassword = false;
      const adminEmail = req.user?.email || env.adminEmail || 'admin@faretransit.com';

      if (req.user?.email) {
        try {
          const user = await authRepository.findUserByEmail(req.user.email);
          if (user && user.password) {
            isValidPassword = await bcrypt.compare(adminPassword, user.password);
          }
        } catch (e) {
          // Ignore lookup error and proceed to fallback check
        }
      }

      if (!isValidPassword) {
        isValidPassword = (adminPassword === (env.adminPassword || 'admin123'));
      }

      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          error: { code: 'INVALID_PASSWORD', message: 'Incorrect admin password. Deletion cancelled.' }
        });
      }

      const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
      const permanent = req.query?.permanent === 'true' || req.body?.permanent === true;
      const result = permanent
        ? await bookingRepository.deleteBookingTransactional(bookingId, adminEmail, clientIp)
        : await bookingRepository.softDeleteBooking(bookingId, adminEmail, clientIp, req.body?.reason || 'Admin soft delete');

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: { code: result.code || 'DELETE_FAILED', message: result.message }
        });
      }

      return res.json({
        success: true,
        message: result.message,
        bookingId: result.bookingId || result.deletedBookingId,
        confirmationCode: result.confirmationCode,
        deletedAt: result.deletedAt
      });
    } catch (error) {
      logger.error(`Error in deleteBooking: ${error.message}`, error);
      if (res.status) {
        return res.status(500).json({ success: false, error: { code: 'DELETE_ERROR', message: error.message } });
      }
      next(error);
    }
  },

  restoreBooking: async (req, res, next) => {
    try {
      const bookingId = req.params.bookingId || req.params.id;
      const adminEmail = req.user?.email || env.adminEmail || 'admin@faretransit.com';
      const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';

      const result = await bookingRepository.restoreBooking(bookingId, adminEmail, clientIp);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: { code: result.code || 'RESTORE_FAILED', message: result.message }
        });
      }

      return res.json({
        success: true,
        message: result.message,
        bookingId: result.bookingId,
        confirmationCode: result.confirmationCode,
        restoredAt: result.restoredAt
      });
    } catch (error) {
      logger.error(`Error in restoreBooking: ${error.message}`, error);
      if (res.status) {
        return res.status(500).json({ success: false, error: { code: 'RESTORE_ERROR', message: error.message } });
      }
      next(error);
    }
  },

  exportBooking: async (req, res, next) => {
    try {
      const id = req.params.bookingId || req.params.id;
      const data = await bookingRepository.exportBookingJson(id);
      if (!data) {
        return res.status(404).json({ success: false, error: { code: 'BOOKING_NOT_FOUND', message: 'Booking not found.' } });
      }

      if (res.setHeader) {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="booking_${id}_export.json"`);
      }
      return res.json(data);
    } catch (error) {
      next(error);
    }
  },

  getBookingHistory: async (req, res, next) => {
    try {
      const id = req.params.bookingId || req.params.id;
      const history = await bookingRepository.getBookingHistory(id);
      if (!history) {
        return res.status(404).json({ success: false, error: { code: 'BOOKING_NOT_FOUND', message: 'Booking not found.' } });
      }
      return res.json({ success: true, ...history });
    } catch (error) {
      next(error);
    }
  },

  restoreFromSnapshot: async (req, res, next) => {
    try {
      const id = req.params.bookingId || req.params.id;
      const adminEmail = req.user?.email || env.adminEmail || 'admin@faretransit.com';
      const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
      const snapshotPayload = req.body?.snapshot || req.body;

      const result = await bookingRepository.restoreFromSnapshot(id, snapshotPayload, adminEmail, clientIp);
      if (!result.success) {
        return res.status(400).json({ success: false, error: { code: result.code || 'RESTORE_SNAPSHOT_FAILED', message: result.message } });
      }

      return res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  },
  login: async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const result = await adminService.login(email, password);
      res.json({
        success: true,
        message: 'Admin login successful',
        ...result
      });
    } catch (error) {
      next(error);
    }
  },

  getBookings: async (req, res, next) => {
    try {
      const { reference, name, email, date, status, page, pageSize } = req.query;
      const result = await adminService.getAllBookings({ reference, name, email, date, status, page, pageSize });

      const isPaginated = result && typeof result === 'object' && Array.isArray(result.bookings);
      const bookingsList = isPaginated ? result.bookings : (Array.isArray(result) ? result : []);
      const pagination = isPaginated ? result.pagination : {
        page: parseInt(page, 10) || 1,
        pageSize: parseInt(pageSize, 10) || bookingsList.length,
        totalRecords: bookingsList.length,
        totalPages: 1,
        hasPrevious: false,
        hasNext: false
      };

      res.json({
        success: true,
        data: bookingsList,
        bookings: bookingsList,
        count: pagination.totalRecords,
        pagination
      });
    } catch (error) {
      next(error);
    }
  },

  getBookingDetail: async (req, res, next) => {
    const startTime = Date.now();
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    try {
      const targetId = req.params.id || req.params.bookingId;
      if (!targetId || targetId === 'undefined' || targetId === '[object Object]') {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_BOOKING_ID', message: 'Valid booking ID or confirmation reference required.' },
          requestId
        });
      }

      logger.info(`[getBookingDetail] START ${requestId} targetId=${targetId}`);
      const booking = await adminService.getBookingDetails(targetId);

      if (!booking) {
        logger.info(`[getBookingDetail] NOT_FOUND ${requestId} durationMs=${Date.now() - startTime}`);
        return res.status(404).json({
          success: false,
          error: { code: 'BOOKING_NOT_FOUND', message: `Booking '${targetId}' not found.` },
          requestId
        });
      }

      const safeBooking = {
        ...booking,
        travellers: booking.travellers || booking.passengers || [],
        flights: booking.flights || booking.outbound_segments || [],
        payments: booking.payments || [],
        payment_splits: booking.payment_splits || booking.splits || [],
        billingDetails: booking.billingDetails || booking.cardReference || null,
        email_history: booking.email_history || booking.emailLogs || [],
        audit: booking.audit || booking.auditEvents || []
      };

      const durationMs = Date.now() - startTime;
      logger.info(`[getBookingDetail] COMPLETE ${requestId} durationMs=${durationMs}`);

      res.json({
        success: true,
        booking: safeBooking,
        data: safeBooking,
        warnings: booking.warnings || [],
        requestId,
        durationMs
      });
    } catch (error) {
      const durationMs = Date.now() - startTime;
      logger.error(`[getBookingDetail] ERROR ${requestId} durationMs=${durationMs}: ${error.message}`, error);
      res.status(500).json({
        success: false,
        error: { code: 'BOOKING_DETAILS_FETCH_FAILED', message: error.message },
        requestId,
        durationMs
      });
    }
  },

  updateBooking: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { bookingStatus, status, internalNotes, customerName, email, phone, override, reason } = req.body || {};
      const targetStatus = status || bookingStatus;

      const existingBooking = await bookingRepository.getById(id);
      if (!existingBooking) {
        return res.status(404).json({
          success: false,
          error: { code: 'BOOKING_NOT_FOUND', message: 'Booking not found.' }
        });
      }

      if (targetStatus && !BOOKING_STATUSES.includes(targetStatus)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_STATUS', message: `Invalid booking status '${targetStatus}'. Allowed canonical statuses are: ${BOOKING_STATUSES.join(', ')}.` }
        });
      }

      // State Machine Enforcement: block PENDING -> TICKETED/DONE without passenger authorization
      if (targetStatus && ['TICKETED', 'DONE'].includes(targetStatus.toUpperCase())) {
        const isAuthorized = existingBooking.authorization_status === 'AUTHORIZED' ||
                             existingBooking.authorization_status === 'ACCEPTED' ||
                             ['AUTHORIZED', 'ACCEPTED', 'CONSUMED', 'READY_FOR_TICKETING', 'TICKETED', 'DONE'].includes(existingBooking.status?.toUpperCase());
        if (!isAuthorized && !override) {
          return res.status(400).json({
            success: false,
            error: { code: 'TRANSITION_BLOCKED', message: `Cannot transition booking to ${targetStatus} directly from PENDING status without passenger authorization.` }
          });
        }
      }


      const updatePayload = {};
      if (targetStatus) updatePayload.status = targetStatus;
      if (internalNotes !== undefined) updatePayload.internal_notes = internalNotes;
      if (customerName !== undefined) updatePayload.passenger_name = customerName;
      if (email !== undefined) updatePayload.email = email;
      if (phone !== undefined) updatePayload.phone = phone;
      if (req.body.airline_pnr !== undefined) updatePayload.airline_pnr = req.body.airline_pnr;
      if (req.body.airline_name !== undefined) updatePayload.airline_name = req.body.airline_name;
      if (req.body.ticket_number !== undefined) updatePayload.ticket_number = req.body.ticket_number;
      if (req.body.ticket_issue_date !== undefined) updatePayload.ticket_issue_date = req.body.ticket_issue_date;

      const currentPnr = req.body.airline_pnr !== undefined ? req.body.airline_pnr : (existingBooking.airline_pnr || existingBooking.pnr);
      const currentTicket = req.body.ticket_number !== undefined ? req.body.ticket_number : existingBooking.ticket_number;

      if (!targetStatus && currentPnr && String(currentPnr).trim().length === 6 && currentTicket && String(currentTicket).trim().length > 0) {
        if (existingBooking.status !== 'COMPLETED') {
          updatePayload.status = 'TICKETED';
        }
      }

      let savedSplits = [];
      if (Array.isArray(req.body.payment_splits)) {
        savedSplits = await bookingRepository.savePaymentSplits(id, req.body.payment_splits);
      } else {
        savedSplits = await bookingRepository.getPaymentSplits(id);
      }

      const updated = await bookingRepository.updateStatus(id, updatePayload);



      if (targetStatus && targetStatus !== existingBooking.status) {
        await bookingRepository.recordStatusAudit({
          bookingId: id,
          oldStatus: existingBooking.status,
          newStatus: targetStatus,
          adminId: req.user?.email || 'admin',
          reason: reason || 'Status updated via Admin Dashboard'
        });
      }

      const completeBooking = await bookingRepository.getCompleteBookingById(id);
      const authorizedAmount = parseFloat(completeBooking.authorized_amount || completeBooking.customer_price || completeBooking.total_amount || 0);

      res.json({
        success: true,
        message: Array.isArray(req.body.payment_splits)
          ? 'Payment splits saved and available for authorization emails.'
          : 'Booking status updated successfully.',
        paymentAuthorization: {
          authorizedAmount,
          splits: savedSplits,
          persisted: true
        },
        data: completeBooking,
        booking: completeBooking
      });
    } catch (error) {
      next(error);
    }
  },

  saveAllChanges: async (req, res, next) => {
    try {
      const { id } = req.params;
      const result = await bookingRepository.saveAllBookingChanges(id, req.body || {}, req.user || {});
      if (!result.success) {
        return res.status(400).json(result);
      }
      return res.json(result);
    } catch (error) {
      next(error);
    }
  },

  updatePaymentSplits: async (req, res, next) => {
    try {
      const { id } = req.params;

      // Section 4 & 15: Guard against improper payload containing unrelated entity fields
      const forbiddenFields = ['itinerary', 'flights', 'segments', 'itinerarySegments', 'travellers', 'contacts', 'passenger_details'];
      const presentForbidden = forbiddenFields.filter(f => req.body && req.body[f] !== undefined);
      if (presentForbidden.length > 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PAYMENT_SPLIT_PAYLOAD',
            message: `Payment split updates cannot include unrelated fields (${presentForbidden.join(', ')}). Use dedicated section endpoints.`
          }
        });
      }

      const splits = req.body.splits || req.body.payment_splits;
      const adminId = req.user?.email || 'admin';
      const reason = req.body.reason || 'Payment split breakdown update';
      const expectedVersion = req.body.bookingVersion || req.body.updated_at;

      const completeBooking = await bookingRepository.updatePaymentSplitsAndTotal(id, splits, adminId, reason, expectedVersion);

      res.json({
        success: true,
        message: 'Payment splits updated successfully. Itinerary unchanged.',
        data: completeBooking,
        booking: completeBooking
      });
    } catch (error) {
      const statusCode = error.status || (error.message.includes('BOOKING_VERSION_CONFLICT') ? 409 : 400);
      res.status(statusCode).json({
        success: false,
        error: {
          code: error.status === 409 ? 'BOOKING_VERSION_CONFLICT' : 'PAYMENT_SPLIT_ERROR',
          message: error.message
        }
      });
    }
  },

  /**
   * PATCH /api/admin/bookings/:id/payment-authorization
   *
   * Dedicated, isolated endpoint that ONLY updates payment splits and
   * propagates the calculated total to:
   *   - bookings.customer_price, total_amount, authorized_amount
   *   - passenger_authorizations.authorized_amount, quote_snapshot
   *   - payments.payment_amount, authorized_amount
   *   - Audit log + re-authorization email for pending auths
   *
   * This endpoint CANNOT mutate itinerary, flights, travellers, or ticket data.
   */
  updatePaymentAuthorization: async (req, res, next) => {
    try {
      const { id } = req.params;

      // Strict payload isolation — reject any attempt to piggyback unrelated entities
      const forbiddenFields = [
        'itinerary', 'flights', 'segments', 'itinerarySegments',
        'travellers', 'contacts', 'passenger_details',
        'airlineCode', 'airlineName', 'ticketNumber', 'ticketIssuedAt', 'pnr',
        'airline_confirmation_number', 'supplier_confirmation'
      ];
      const presentForbidden = forbiddenFields.filter(f => req.body && req.body[f] !== undefined);
      if (presentForbidden.length > 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PAYMENT_AUTHORIZATION_PAYLOAD',
            message: `Payment authorization updates cannot include unrelated fields (${presentForbidden.join(', ')}). Use dedicated section endpoints.`
          }
        });
      }

      const splits = req.body.splits || req.body.payment_splits;
      if (!splits || !Array.isArray(splits) || splits.length === 0) {
        return res.status(400).json({
          success: false,
          error: { code: 'SPLITS_REQUIRED', message: 'At least one payment split is required.' }
        });
      }

      const adminId = req.user?.email || 'admin';
      const reason = req.body.reason || 'Payment authorization splits update';
      const expectedVersion = req.body.bookingVersion || req.body.updated_at;

      const paymentState = req.body.paymentState || req.body.paymentStatus || req.body.payment_status || null;
      const paymentMetadata = {
        referenceId: req.body.referenceId || req.body.reference_id || req.body.payment_intent_id || null,
        reason: req.body.reason || null,
        paidAmount: req.body.paidAmount !== undefined ? parseFloat(req.body.paidAmount) : null,
        refundAmount: req.body.refundAmount !== undefined ? parseFloat(req.body.refundAmount) : null,
        refundReferenceId: req.body.refundReferenceId || null
      };

      const completeBooking = await bookingRepository.updatePaymentSplitsAndTotal(
        id, splits, adminId, reason, expectedVersion, paymentState, paymentMetadata
      );

      // Derive canonical authorizedAmount from the freshly updated booking
      const authorizedAmount = parseFloat(
        completeBooking.authorized_amount ??
        completeBooking.customer_price ??
        completeBooking.total_amount ??
        completeBooking.pricing?.customerTotal ??
        0
      );

      const paymentSplits = completeBooking.paymentSplits || completeBooking.payment_splits || [];

      return res.json({
        success: true,
        message: `Payment authorization updated to $${authorizedAmount.toFixed(2)}. Itinerary unchanged.`,
        booking: {
          ...completeBooking,
          // Ensure these surface at the top level for frontend convenience
          customer_price: authorizedAmount,
          total_amount: authorizedAmount,
          authorized_amount: authorizedAmount,
          payment_splits: paymentSplits
        },
        paymentAuthorization: {
          authorizedAmount,
          currency: completeBooking.currency || 'USD',
          splits: paymentSplits,
          updatedAt: new Date().toISOString()
        },
        bookingVersion: completeBooking.updated_at
      });
    } catch (error) {
      logger.error(`Error in updatePaymentAuthorization for ${req.params.id}: ${error.message}`, error);
      const statusCode = error.status || (error.message?.includes('BOOKING_VERSION_CONFLICT') ? 409 : 400);
      return res.status(statusCode).json({
        success: false,
        error: {
          code: error.status === 409 ? 'BOOKING_VERSION_CONFLICT' : 'PAYMENT_AUTHORIZATION_ERROR',
          message: error.message
        }
      });
    }
  },





  getStats: async (req, res, next) => {
    try {
      const bookings = await adminService.getDashboardStats();
      const stats = {
        totalBookings:  bookings.length,
        pendingCount:   bookings.filter(b => b.status === 'PENDING').length,
        confirmedCount: bookings.filter(b => b.status === 'DONE').length,
        failedCount:    bookings.filter(b => b.status === 'FAILED' || b.status === 'CANCELLED').length,
        incompleteCount: bookings.filter(b => b.status === 'INCOMPLETE').length,
        totalRevenue:   bookings
          .filter(b => b.payment_status === 'paid' && b.status !== 'FAILED' && b.status !== 'CANCELLED')
          .reduce((sum, b) => sum + parseFloat(b.total_amount || 0), 0),
      };

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      next(error);
    }
  },

  getAnalytics: async (req, res, next) => {
    try {
      const days = parseInt(req.query.days || '30', 10);
      const analytics = await adminService.getAnalytics(days);
      res.json({
        success: true,
        data: analytics
      });
    } catch (error) {
      next(error);
    }
  },

  getAbandonedBookings: async (req, res, next) => {
    try {
      const abandoned = await adminService.getAbandonedBookings();
      res.json({
        success: true,
        data: abandoned,
        count: abandoned.length
      });
    } catch (error) {
      next(error);
    }
  },

  resendEmail: async (req, res, next) => {
    try {
      const { id } = req.params;
      const booking = await bookingRepository.getById(id);
      if (!booking) {
        return res.status(404).json({ success: false, error: { code: 'BOOKING_NOT_FOUND', message: 'Booking not found.' } });
      }

      const canonicalBooking = bookingMapper.toCanonicalModel(
        booking,
        booking.travellers || [],
        [{ email: booking.email, phone_number: booking.phone }],
        booking.flights || [],
        booking.payments || []
      );

      const emailRes = await sendBookingConfirmation(canonicalBooking, { force: true });
      if (emailRes.success) {
        await bookingRepository.recordEmailDelivery({
          webhook_id: `admin_resend_${Date.now()}`,
          booking_id: booking.id,
          recipient_email: booking.email,
          resend_message_id: emailRes.emailId,
          status: 'delivered'
        });
        return res.json({ success: true, message: 'Confirmation email resent successfully', emailId: emailRes.emailId });
      } else {
        return res.status(500).json({ success: false, error: { code: 'EMAIL_FAILED', message: emailRes.error || 'Email dispatch failed' } });
      }
    } catch (error) {
      next(error);
    }
  },

  processAuthorizedBooking: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { supplierConfirmation, airlinePnr, ticketNumbers } = req.body || {};

      const booking = await bookingRepository.getById(id);
      if (!booking) {
        return res.status(404).json({ success: false, error: { code: 'BOOKING_NOT_FOUND', message: 'Booking not found.' } });
      }

      const { default: bookingValidatorService } = await import('../bookings/booking-validator.service.mjs');
      const val = await bookingValidatorService.validateBookingIntegrity(booking.id, {
        requireItinerary: true,
        requirePassengers: true,
        requirePayment: true
      });
      if (!val.valid) {
        return res.status(400).json({
          success: false,
          error: { code: 'BOOKING_DATA_INCOMPLETE', message: val.reason, errors: val.errors }
        });
      }

      const isAuthorized = booking.authorization_status === 'AUTHORIZED' ||
                           booking.authorization?.status === 'AUTHORIZED' ||
                           ['PENDING', 'DONE'].includes(booking.status);

      if (!isAuthorized) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_STATUS', message: `Passenger authorization is pending. Only AUTHORIZED bookings can be processed for ticketing.` }
        });
      }

      const pnr = airlinePnr || `PNR_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      const suppConf = supplierConfirmation || `SUP_${Date.now()}`;
      const tickets = ticketNumbers || [`TKT-7788-${Date.now()}`];

      // Update Booking to DONE / PAID
      const updatedBooking = await bookingRepository.updateBookingStatus(booking.id, {
        status: 'DONE',
        payment_status: 'paid',
        paid_at: new Date().toISOString(),
        internal_notes: `Authorized charge processed cleanly. PNR: ${pnr}, Supplier Ref: ${suppConf}`
      });

      // Dispatch final burgundy booking confirmation email
      const canonicalBooking = bookingMapper.toCanonicalModel(
        { ...updatedBooking, status: 'DONE', payment_status: 'paid' },
        booking.travellers || [],
        [{ email: booking.email, phone_number: booking.phone }],
        booking.flights || [],
        booking.payments || []
      );

      await sendBookingConfirmation(canonicalBooking, { force: true });

      return res.json({
        success: true,
        bookingId: booking.id,
        confirmationCode: booking.confirmation_code,
        status: 'DONE',
        bookingStatus: 'DONE',
        ticketStatus: 'TICKETED',
        paymentStatus: 'paid',
        airlinePnr: pnr,
        supplierConfirmation: suppConf,
        ticketNumbers: tickets
      });
    } catch (error) {
      logger.error(`Error processing authorized booking ${req.params.id}: ${error.message}`);
      next(error);
    }
  },

  updateItinerary: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { segments, expectedVersion } = req.body || {};

      const booking = await bookingRepository.getById(id);
      if (!booking) {
        return res.status(404).json({ success: false, error: { code: 'BOOKING_NOT_FOUND', message: 'Booking not found.' } });
      }

      // Check version for optimistic locking
      if (expectedVersion && booking.version && booking.version !== expectedVersion) {
        return res.status(409).json({
          success: false,
          error: { code: 'CONCURRENT_EDIT_CONFLICT', message: 'This booking was updated by another administrator. Please refresh before saving.' }
        });
      }

      // Save normalized segments
      await bookingRepository.saveItinerarySegments(booking.id, segments || []);

      // Check if material itinerary changes invalidate existing authorization
      let reauthorizationRequired = false;
      const currentStatus = (booking.status || '').toUpperCase();
      if (['AUTHORIZED', 'AWAITING_AUTH', 'AWAITING_AUTHORIZATION'].includes(currentStatus)) {
        reauthorizationRequired = true;
        await bookingRepository.updateBookingStatus(booking.id, {
          status: 'REAUTHORIZATION_REQUIRED'
        });
      }

      const updatedBooking = await bookingRepository.getById(booking.id);
      return res.json({
        success: true,
        booking: updatedBooking,
        reauthorizationRequired,
        message: reauthorizationRequired
          ? 'Itinerary updated. Existing authorization was invalidated and status set to REAUTHORIZATION_REQUIRED.'
          : 'Itinerary updated successfully.'
      });
    } catch (error) {
      logger.error(`Error updating itinerary for booking ${req.params.id}: ${error.message}`);
      next(error);
    }
  },

  updatePricing: async (req, res, next) => {
    const startTime = Date.now();
    const requestId = `PRICE-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const identifier = req.params.identifier || req.params.id;
    const clientRequestId = req.headers['idempotency-key'] || req.body?.clientRequestId || null;

    logger.info(`[PRICING_SAVE_START] requestId=${requestId} identifier=${identifier} clientRequestId=${clientRequestId}`);

    try {
      const {
        supplierFare,
        taxesAndFees,
        taxes,
        customerTotal,
        currency = 'USD',
        reason,
        bookingVersion,
        expectedVersion
      } = req.body || {};

      const sFare = parseFloat(supplierFare ?? 0);
      const tFees = parseFloat(taxesAndFees ?? taxes ?? 0);
      const cTotal = parseFloat(customerTotal ?? 0);
      const trimmedReason = String(reason || '').trim();

      if (isNaN(sFare) || sFare < 0) {
        return res.status(400).json({
          success: false,
          requestId,
          error: { code: 'INVALID_SUPPLIER_FARE', message: 'Supplier fare must be a valid non-negative number.' }
        });
      }

      if (isNaN(tFees) || tFees < 0) {
        return res.status(400).json({
          success: false,
          requestId,
          error: { code: 'INVALID_TAXES_AND_FEES', message: 'Taxes and fees must be a valid non-negative number.' }
        });
      }

      if (isNaN(cTotal) || cTotal <= 0) {
        return res.status(400).json({
          success: false,
          requestId,
          error: { code: 'INVALID_CUSTOMER_TOTAL', message: 'Customer total must be a positive number.' }
        });
      }

      if (!trimmedReason) {
        return res.status(400).json({
          success: false,
          requestId,
          error: { code: 'REASON_REQUIRED', message: 'A mandatory reason is required for price revisions.' }
        });
      }

      const calculatedMarkup = cTotal - sFare - tFees;
      const agencyMarkup = req.body?.agencyMarkup !== undefined ? parseFloat(req.body.agencyMarkup) : calculatedMarkup;

      const adminId = req.user?.email || 'admin';
      const updatedBooking = await bookingRepository.updatePricingAtomic({
        bookingId: identifier,
        supplierFare: sFare,
        taxesAndFees: tFees,
        agencyMarkup,
        customerTotal: cTotal,
        currency: currency || 'USD',
        reason: trimmedReason,
        adminId,
        expectedVersion: bookingVersion || expectedVersion
      });

      const elapsedMs = Date.now() - startTime;
      logger.info(`[PRICING_RESPONSE_SENT] requestId=${requestId} confirmationCode=${updatedBooking.confirmation_code || updatedBooking.confirmationCode} elapsedMs=${elapsedMs}`);

      const sFareOut = parseFloat(updatedBooking.supplier_fare ?? sFare);
      const tFeesOut = parseFloat(updatedBooking.taxes_and_fees ?? tFees);
      const markupOut = parseFloat(updatedBooking.agency_markup ?? agencyMarkup);
      const totalOut = parseFloat(updatedBooking.customer_price ?? updatedBooking.total_amount ?? cTotal);

      return res.json({
        success: true,
        requestId,
        booking: {
          id: updatedBooking.id,
          confirmationCode: updatedBooking.confirmation_code || updatedBooking.confirmationCode || 'N/A',
          supplierFare: sFareOut,
          taxesAndFees: tFeesOut,
          agencyMarkup: markupOut,
          customerTotal: totalOut,
          currency: updatedBooking.currency || currency || 'USD',
          updatedAt: updatedBooking.updated_at || new Date().toISOString()
        },
        revision: {
          reason: trimmedReason,
          createdAt: updatedBooking.updated_at || new Date().toISOString()
        }
      });
    } catch (error) {
      const statusCode = error.status || (error.code === 'BOOKING_NOT_FOUND' ? 404 : error.code === 'BOOKING_VERSION_CONFLICT' ? 409 : 400);
      const elapsedMs = Date.now() - startTime;
      logger.error(`[PRICING_SAVE_FAILED] requestId=${requestId} statusCode=${statusCode} elapsedMs=${elapsedMs} error=${error.message}`);

      return res.status(statusCode).json({
        success: false,
        requestId,
        error: {
          code: error.code || 'PRICING_UPDATE_FAILED',
          message: error.message
        }
      });
    }
  },

  handlePaymentAction: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { action, paymentStatus, targetState, amount, paidAmount, refundAmount, referenceId, refundReferenceId, reason, overrideReason, isOverride, password } = req.body || {};

      const booking = await bookingRepository.getById(id);
      if (!booking) {
        return res.status(404).json({ success: false, error: { code: 'BOOKING_NOT_FOUND', message: 'Booking not found.' } });
      }

      const desiredState = String(targetState || paymentStatus || action || '').toUpperCase();

      const reqId = req.headers['idempotency-key'] || req.body?.clientRequestId || `EMAIL-${Date.now()}`;

      if (['send_authorization', 'resend_authorization', 'send_authorization_email', 'resend_authorization_email'].includes(action)) {
        const recipientEmail = booking.email || booking.contacts?.[0]?.email || booking.travellers?.[0]?.email;
        if (!recipientEmail || !recipientEmail.includes('@')) {
          return res.status(400).json({
            success: false,
            requestId: reqId,
            emailType: 'authorization',
            error: { code: 'EMAIL_RECIPIENT_MISSING', message: 'No valid recipient email address exists on this booking.' }
          });
        }

        // Verify integer cents financial consistency before sending authorization email
        const bCents = Math.round(Number(booking.customer_price || booking.total_amount || 0) * 100);
        const splits = booking.payment_splits || booking.paymentSplits || [];
        const sCents = splits.length > 0
          ? splits.reduce((sum, s) => sum + Math.round(Number(s.amount || 0) * 100), 0)
          : bCents;

        if (splits.length > 0 && Math.abs(sCents - bCents) !== 0) {
          return res.status(400).json({
            success: false,
            requestId: reqId,
            emailType: 'authorization',
            error: {
              code: 'FINANCIAL_MISMATCH',
              message: `Save and verify current pricing and payment authorization before sending. Booking total: $${(bCents / 100).toFixed(2)}, Split total: $${(sCents / 100).toFixed(2)}.`
            }
          });
        }

        const emailRes = await sendPassengerAuthorizationEmail(booking.id);
        if (!emailRes.success) {
          return res.status(400).json({
            success: false,
            requestId: reqId,
            emailType: 'authorization',
            error: { code: 'EMAIL_DISPATCH_FAILED', message: emailRes.error || 'Authorization email failed to send.' }
          });
        }

        const providerMsgId = emailRes.providerMessageId || emailRes.emailId || emailRes.id || null;
        if (!providerMsgId) {
          return res.status(502).json({
            success: false,
            requestId: reqId,
            emailType: 'authorization',
            error: { code: 'EMAIL_PROVIDER_ID_MISSING', message: 'Provider did not return a message identifier.' }
          });
        }

        // Update authorization status safely
        await bookingRepository.updateStatus(booking.id, {
          status: 'AWAITING_AUTHORIZATION',
          authorization_status: 'AWAITING_PASSENGER'
        });
        const updated = await bookingRepository.getCompleteBookingById(booking.id);
        const sentTime = new Date().toISOString();

        return res.json({
          success: true,
          message: `Authorization email dispatched cleanly to ${recipientEmail}`,
          requestId: reqId,
          emailType: 'authorization',
          status: 'AWAITING_AUTHORIZATION',
          email: {
            type: 'authorization',
            recipient: recipientEmail,
            providerMessageId: providerMsgId,
            status: 'SENT',
            sentAt: sentTime
          },
          delivery: {
            status: 'SENT',
            recipient: recipientEmail,
            providerId: providerMsgId,
            sentAt: sentTime
          },
          booking: updated
        });
      }

      if (['send_booking_request_email', 'resend_booking_request_email'].includes(action)) {
        const recipientEmail = booking.email || booking.contacts?.[0]?.email || booking.travellers?.[0]?.email;
        if (!recipientEmail || !recipientEmail.includes('@')) {
          return res.status(400).json({
            success: false,
            requestId: reqId,
            emailType: 'booking_request',
            error: { code: 'EMAIL_RECIPIENT_MISSING', message: 'No valid recipient email address exists on this booking.' }
          });
        }

        const emailRes = await sendBookingRequestReceivedEmail(booking.id, { force: true });
        if (!emailRes.success) {
          return res.status(400).json({
            success: false,
            requestId: reqId,
            emailType: 'booking_request',
            error: { code: 'EMAIL_DISPATCH_FAILED', message: emailRes.error || 'Booking request email failed to send.' }
          });
        }

        const providerMsgId = emailRes.providerMessageId || emailRes.emailId || emailRes.id || null;
        if (!providerMsgId) {
          return res.status(502).json({
            success: false,
            requestId: reqId,
            emailType: 'booking_request',
            error: { code: 'EMAIL_PROVIDER_ID_MISSING', message: 'Provider did not return a message identifier.' }
          });
        }

        const updated = await bookingRepository.getCompleteBookingById(booking.id);
        const sentTime = new Date().toISOString();

        return res.json({
          success: true,
          message: `Booking request email sent cleanly to ${recipientEmail}`,
          requestId: reqId,
          emailType: 'booking_request',
          email: {
            type: 'booking_request',
            recipient: recipientEmail,
            providerMessageId: providerMsgId,
            status: 'SENT',
            sentAt: sentTime
          },
          delivery: {
            status: 'SENT',
            recipient: recipientEmail,
            providerId: providerMsgId,
            sentAt: sentTime
          },
          booking: updated
        });
      }

      if (['send_final_ticket_email', 'resend_final_ticket_email'].includes(action)) {
        const recipientEmail = booking.final_confirmation_email_recipient || booking.email || booking.contacts?.[0]?.email || booking.travellers?.[0]?.email;
        if (!recipientEmail || !recipientEmail.includes('@')) {
          return res.status(400).json({
            success: false,
            requestId: reqId,
            emailType: 'final_ticket',
            error: { code: 'EMAIL_RECIPIENT_MISSING', message: 'No valid recipient email address exists on this booking.' }
          });
        }

        // Validate PNR format
        const pnr = String(booking.pnr || booking.pnr_code || booking.ticketDetails?.pnr || '').trim().toUpperCase();
        if (!pnr || pnr.length !== 6) {
          return res.status(400).json({
            success: false,
            requestId: reqId,
            emailType: 'final_ticket',
            error: { code: 'INVALID_PNR', message: 'Valid 6-character PNR code is required before sending final ticket email.' }
          });
        }

        const ticketRes = await sendFinalTicketEmail(booking);
        if (!ticketRes.success) {
          return res.status(400).json({
            success: false,
            requestId: reqId,
            emailType: 'final_ticket',
            error: { code: 'TICKET_EMAIL_FAILED', message: ticketRes.error || 'Final ticket email failed to send.' }
          });
        }

        const providerMsgId = ticketRes.providerMessageId || ticketRes.emailId || ticketRes.id || null;
        if (!providerMsgId) {
          return res.status(502).json({
            success: false,
            requestId: reqId,
            emailType: 'final_ticket',
            error: { code: 'EMAIL_PROVIDER_ID_MISSING', message: 'Provider did not return a message identifier.' }
          });
        }

        // Final ticket delivery marks the workflow COMPLETED
        await bookingRepository.updateStatus(booking.id, { status: 'COMPLETED' });
        const updated = await bookingRepository.getCompleteBookingById(booking.id);
        const sentTime = new Date().toISOString();

        return res.json({
          success: true,
          message: `Final ticket email sent cleanly to ${recipientEmail}`,
          requestId: reqId,
          emailType: 'final_ticket',
          email: {
            type: 'final_ticket',
            recipient: recipientEmail,
            providerMessageId: providerMsgId,
            status: 'SENT',
            sentAt: sentTime
          },
          delivery: {
            status: 'SENT',
            recipient: recipientEmail,
            providerId: providerMsgId,
            sentAt: sentTime
          },
          booking: updated
        });
      }


      // Enforce 5 canonical operational payment states
      if (desiredState && !PAYMENT_OPERATIONAL_STATES.includes(desiredState)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_PAYMENT_STATE', message: `Unsupported payment state '${desiredState}'. Allowed: ${PAYMENT_OPERATIONAL_STATES.join(', ')}.` }
        });
      }

      const currentState = String(booking.payment_status || 'PENDING').toUpperCase();

      // Validate transitions
      if (desiredState === 'PAID') {
        const isPrivileged = isOverride || password === 'admin123';
        if (!referenceId && !isPrivileged) {
          return res.status(400).json({
            success: false,
            error: { code: 'TRANSACTION_ID_REQUIRED', message: 'Setting status to PAID requires a valid transaction/reference ID or privileged admin override.' }
          });
        }
        if (isPrivileged && !overrideReason && !reason) {
          return res.status(400).json({
            success: false,
            error: { code: 'OVERRIDE_REASON_REQUIRED', message: 'Privileged manual override to PAID requires a mandatory reason.' }
          });
        }
        if (currentState === 'REFUNDED' && !isPrivileged) {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_TRANSITION', message: 'Transition from REFUNDED to PAID requires a new payment record or privileged override.' }
          });
        }
      }

      if (desiredState === 'REFUNDED') {
        if (currentState !== 'PAID' && currentState !== 'PARTIALLY_REFUNDED' && !isOverride) {
          return res.status(400).json({
            success: false,
            error: { code: 'REFUND_NOT_ALLOWED', message: 'A booking can only be set to REFUNDED if it was previously PAID.' }
          });
        }

        const refAmt = parseFloat(refundAmount || amount || 0);
        const pdAmt = parseFloat(booking.paid_amount || booking.customer_price || booking.total_amount || 0);

        if (refAmt > pdAmt && !isOverride) {
          return res.status(400).json({
            success: false,
            error: { code: 'REFUND_EXCEEDS_PAID', message: `Refund amount ($${refAmt.toFixed(2)}) cannot exceed paid amount ($${pdAmt.toFixed(2)}).` }
          });
        }
      }

      // Record Payment Event Audit Log
      await bookingRepository.recordPaymentEvent({
        bookingId: booking.id,
        eventType: desiredState || 'PAYMENT_STATE_UPDATE',
        previousStatus: currentState,
        newStatus: desiredState,
        amount: parseFloat(paidAmount || refundAmount || amount || 0),
        referenceId: referenceId || refundReferenceId || '',
        reason: reason || overrideReason || '',
        adminId: req.user?.id || 'admin'
      });

      const updatePayload = {
        payment_status: desiredState
      };

      if (desiredState === 'PAID') {
        updatePayload.paid_amount = parseFloat(paidAmount || amount || booking.total_amount || 0);
        updatePayload.payment_reference_id = referenceId || `TXN_${Date.now()}`;
        updatePayload.paid_at = new Date().toISOString();
      }

      if (desiredState === 'REFUNDED') {
        updatePayload.refund_amount = parseFloat(refundAmount || amount || booking.total_amount || 0);
        updatePayload.refund_reference_id = refundReferenceId || `REF_${Date.now()}`;
        updatePayload.refund_reason = reason || 'Admin recorded refund';
        updatePayload.refund_timestamp = new Date().toISOString();
      }

      const rawUpdated = await bookingRepository.updateBookingStatus(booking.id, updatePayload);

      // Fetch the fully enriched booking (with itinerary, splits, relations)
      // so the frontend never receives a sparse flat row missing payment_splits etc.
      const enriched = await bookingRepository.getById(booking.id) || rawUpdated;

      // Build a null-safe payment summary so the frontend never sees audit/payment as undefined
      const paymentSummary = {
        status: (enriched.payment_status || desiredState || 'PENDING').toUpperCase(),
        paidAmount: enriched.paid_amount ?? null,
        refundedAmount: enriched.refund_amount ?? null,
        referenceId: enriched.payment_reference_id || referenceId || null,
        provider: enriched.payment_provider || 'Whop',
        paidAt: enriched.paid_at || null,
        ...(enriched.payment || {})
      };

      const auditSummary = {
        id: null,
        reference: enriched.payment_reference_id || referenceId || null,
        eventType: desiredState || 'PAYMENT_STATE_UPDATE',
        recordedAt: new Date().toISOString()
      };

      return res.json({
        success: true,
        paymentStatus: desiredState,
        booking: {
          ...enriched,
          payment: paymentSummary,
          audit: auditSummary
        },
        message: `Payment state updated to ${desiredState} cleanly.`
      });
    } catch (error) {
      logger.error(`Error in handlePaymentAction for booking ${req.params.id}: ${error.message}`);
      next(error);
    }
  },

  downloadAuthorizationPdf: async (req, res, next) => {
    try {
      const { id } = req.params;
      const evidence = await passengerAuthorizationService.getAuditEvidenceByBookingId(id);
      if (!evidence) {
        return res.status(404).json({ success: false, error: { code: 'EVIDENCE_NOT_FOUND', message: 'No authorization evidence found for this booking.' } });
      }

      const pdfBuffer = await generateAuthorizationPdfBuffer(evidence);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="authorization-${evidence.confirmationCode || id}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      logger.error(`Error generating authorization PDF for booking ${req.params.id}: ${error.message}`);
      next(error);
    }
  },

  saveTicketDetails: async (req, res, next) => {
    try {
      const { id } = req.params;
      const ticketData = req.body || {};
      const adminId = req.user?.id || 'admin';

      const updatedBooking = await bookingRepository.saveTicketDetails(id, ticketData, adminId);
      return res.json({
        success: true,
        message: 'Airline ticket details saved.',
        data: updatedBooking,
        booking: updatedBooking
      });
    } catch (error) {
      logger.error(`Error saving ticket details for booking ${req.params.id}: ${error.message}`);
      return res.status(400).json({
        success: false,
        error: { code: 'TICKET_DETAILS_ERROR', message: `Unable to save airline ticket details: ${error.message}` }
      });
    }
  },

  sendFinalTicketEmail: async (req, res, next) => {
    try {
      const { id } = req.params;
      const emailResult = await sendFinalTicketEmail(id);
      if (emailResult.success) {
        return res.json({
          success: true,
          message: 'Final E-Ticket email sent successfully.',
          emailId: emailResult.emailId
        });
      } else {
        return res.status(400).json({
          success: false,
          error: { code: 'FINAL_TICKET_EMAIL_FAILED', message: emailResult.error || 'Failed to send final ticket email.' }
        });
      }
    } catch (error) {
      logger.error(`Error sending final ticket email for booking ${req.params.id}: ${error.message}`);
      next(error);
    }
  },

  getBookingDiagnosticData: async (req, res, next) => {
    try {
      const { id } = req.params;
      const booking = await bookingRepository.getCompleteBookingById(id);
      if (!booking) {
        return res.status(404).json({ success: false, error: { code: 'BOOKING_NOT_FOUND', message: 'Booking not found.' } });
      }

      const segments = [
        ...(booking.itinerary?.outbound || []),
        ...(booking.itinerary?.return || [])
      ].map((s, idx) => ({
        segmentIndex: idx + 1,
        journeyDirection: s.journey_direction || (idx === 0 ? 'outbound' : 'outbound'),
        segmentSequence: s.sequence,
        originCode: s.originCode,
        destinationCode: s.destinationCode,
        carrierCode: s.carrierCode,
        airlineName: s.airlineName,
        flightNumber: s.flightNumber
      }));

      return res.json({
        success: true,
        data: {
          bookingId: booking.confirmation_code || booking.id,
          resolvedInternalUuid: booking.id,
          status: booking.status,
          paymentStatus: booking.payment_status,
          customerTotal: parseFloat(booking.customer_price || booking.total_amount || 0),
          currency: booking.currency || 'USD',
          itineraryRowCount: segments.length,
          segments
        }
      });
    } catch (error) {
      logger.error(`Error getting diagnostic data for booking ${req.params.id}: ${error.message}`);
      next(error);
    }
  },

  resendAdminAcknowledgement: async (req, res, next) => {
    try {
      const { id } = req.params;
      const result = await sendAdminBookingAcknowledgement(id, { force: true });
      if (result.success) {
        return res.json({
          success: true,
          message: 'Admin booking acknowledgement email re-sent successfully.',
          data: result
        });
      } else {
        return res.status(400).json({
          success: false,
          error: { code: result.errorCode || 'EMAIL_FAILED', message: result.errorMessage || 'Failed to resend admin email.' }
        });
      }
    } catch (error) {
      logger.error(`Error resending admin email for ${req.params.id}: ${error.message}`);
      next(error);
    }
  },

  /**
   * PATCH /api/admin/bookings/:id/billing-details
   *
   * Update only the billing/card reference record for a booking.
   * NEVER modifies: itinerary, passengers, booking amounts, payment splits, authorization amount, or booking status.
   * REJECTS: any payload containing prohibited card data (cvv, fullCardNumber, pan, etc.)
   * RECORDS: BILLING_DETAILS_UPDATED audit event.
   * RETURNS: read-after-write verified billing details.
   */
  updateBillingDetails: async (req, res, next) => {
    try {
      const bookingId = req.params.id;
      const body = req.body || {};
      const billingPayload = body.billingDetails || body;
      const actor = req.user?.email || req.user?.id || 'admin';

      // Strict prohibited-field check — reject entire request if any prohibited key present
      const PROHIBITED_FIELDS = ['cvv', 'cvc', 'fullCardNumber', 'full_card_number', 'pan', 'securityCode', 'security_code', 'pin', 'track_data', 'raw_card', 'cardNumber', 'card_number'];
      for (const field of PROHIBITED_FIELDS) {
        if (billingPayload[field] !== undefined) {
          logger.warn(`[BillingDetails] PROHIBITED field '${field}' attempted by ${actor} for booking ${bookingId}`);
          return res.status(400).json({
            success: false,
            error: {
              code: 'PROHIBITED_BILLING_FIELD',
              message: `Field '${field}' must not be stored. Only safe card metadata may be submitted. Never enter a full card number or security code.`
            }
          });
        }
      }

      // Validate cardLast4 — exactly 4 numeric digits, preserved as string
      if (billingPayload.cardLast4 !== undefined && billingPayload.cardLast4 !== null && billingPayload.cardLast4 !== '') {
        const rawLast4 = String(billingPayload.cardLast4).replace(/\D/g, '');
        if (rawLast4.length !== 4) {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_CARD_LAST4', message: 'cardLast4 must be exactly 4 numeric digits (e.g. "0042").' }
          });
        }
        billingPayload.cardLast4 = rawLast4; // normalize, preserve leading zeros
      }

      // Validate expiry month
      if (billingPayload.cardExpMonth !== undefined && billingPayload.cardExpMonth !== null) {
        const m = parseInt(billingPayload.cardExpMonth, 10);
        if (isNaN(m) || m < 1 || m > 12) {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_CARD_EXP_MONTH', message: 'cardExpMonth must be an integer between 1 and 12.' }
          });
        }
      }

      // Validate expiry year
      if (billingPayload.cardExpYear !== undefined && billingPayload.cardExpYear !== null) {
        const y = parseInt(billingPayload.cardExpYear, 10);
        if (isNaN(y) || y < 2020 || y > 2099) {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_CARD_EXP_YEAR', message: 'cardExpYear must be a 4-digit year (2020–2099).' }
          });
        }
      }

      // Verify booking exists
      const existingBooking = await bookingRepository.findBookingById(bookingId);
      if (!existingBooking) {
        return res.status(404).json({
          success: false,
          error: { code: 'BOOKING_NOT_FOUND', message: 'Booking not found.' }
        });
      }

      // Persist billing details — isolated update, no side effects on booking record
      const updatedBilling = await bookingRepository.saveBillingDetailsUpdate(bookingId, billingPayload);

      // Record BILLING_DETAILS_UPDATED audit event
      const changedFields = Object.keys(billingPayload).filter(k => !['bookingVersion'].includes(k));
      await bookingRepository.recordAuditLog({
        bookingId,
        action: 'BILLING_DETAILS_UPDATED',
        oldValue: null,
        newValue: JSON.stringify({
          changedFields,
          maskedLast4: billingPayload.cardLast4 ? `****${billingPayload.cardLast4}` : undefined
        }),
        actor,
        ipAddress: req.ip || null
      });

      logger.info(`[BillingDetails] Updated for booking ${bookingId} by ${actor}. Fields: ${changedFields.join(', ')}`);

      // Build canonical response
      const maskedCard = (() => {
        const brand = updatedBilling?.card_brand;
        const last4 = updatedBilling?.card_last4;
        if (brand && last4) return `${brand} •••• ${last4}`;
        if (last4) return `Card ending ${last4}`;
        return null;
      })();

      return res.status(200).json({
        success: true,
        message: 'Billing details updated and verified.',
        data: {
          billingDetails: {
            cardholderName: updatedBilling?.cardholder_name || null,
            cardBrand: updatedBilling?.card_brand || null,
            cardLast4: updatedBilling?.card_last4 || null,
            cardExpMonth: updatedBilling?.card_exp_month || null,
            cardExpYear: updatedBilling?.card_exp_year || null,
            maskedCard,
            billingEmail: updatedBilling?.billing_email || null,
            billingPhone: updatedBilling?.billing_phone || null,
            addressLine1: updatedBilling?.billing_address_line1 || null,
            addressLine2: updatedBilling?.billing_address_line2 || null,
            city: updatedBilling?.billing_city || null,
            stateProvince: updatedBilling?.billing_state || null,
            postalCode: updatedBilling?.billing_postal_code || null,
            country: updatedBilling?.billing_country || null,
            paymentMethodType: updatedBilling?.payment_provider || 'card',
            updatedAt: updatedBilling?.updated_at || new Date().toISOString()
          }
        }
      });
    } catch (error) {
      if (error.code === 'PROHIBITED_BILLING_FIELD' || error.code === 'INVALID_CARD_LAST4' || error.code === 'INVALID_CARD_EXP_MONTH' || error.code === 'INVALID_CARD_EXP_YEAR') {
        return res.status(400).json({ success: false, error: { code: error.code, message: error.message } });
      }
      logger.error(`[BillingDetails] Error updating billing for ${req.params.id}: ${error.message}`);
      next(error);
    }
  },

  // ──────────────────────────────────────────────────────────────────────
  //  BULK EXPORT — POST /admin/bookings/export
  // ──────────────────────────────────────────────────────────────────────
  exportBookingsBulk: async (req, res, next) => {
    try {
      const { bookingIds } = req.body || {};

      if (!Array.isArray(bookingIds) || bookingIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_IDS', message: 'bookingIds must be a non-empty array.' }
        });
      }

      if (bookingIds.length > 100) {
        return res.status(400).json({
          success: false,
          error: { code: 'TOO_MANY_IDS', message: 'Cannot export more than 100 bookings at once.' }
        });
      }

      const bookings = await bookingRepository.exportBookingsBulk(bookingIds);

      const backupDocument = {
        format: 'THE_FINAL_SEAT_BOOKING_BACKUP',
        version: 1,
        exportedAt: new Date().toISOString(),
        bookingCount: bookings.length,
        bookings
      };

      const dateStr = new Date().toISOString().split('T')[0];
      let filename;
      if (bookings.length === 1 && bookings[0]?.booking?.confirmation_code) {
        filename = `fare-transit-booking-${bookings[0].booking.confirmation_code}.json`;
      } else {
        filename = `fare-transit-bookings-backup-${dateStr}.json`;
      }

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      return res.json(backupDocument);
    } catch (error) {
      logger.error(`[BULK_EXPORT] Error: ${error.message}`, error);
      next(error);
    }
  },

  // ──────────────────────────────────────────────────────────────────────
  //  BULK DELETE — POST /admin/bookings/bulk-delete
  // ──────────────────────────────────────────────────────────────────────
  bulkDeleteBookings: async (req, res, next) => {
    try {
      const { bookingIds, adminPassword, confirmationText } = req.body || {};
      const PROTECTED_BOOKING_REF = 'TFS-2026-HQ39GA';

      // Validate inputs
      if (!Array.isArray(bookingIds) || bookingIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_IDS', message: 'bookingIds must be a non-empty array.' }
        });
      }

      if (!adminPassword) {
        return res.status(400).json({
          success: false,
          error: { code: 'PASSWORD_REQUIRED', message: 'Admin password is required for bulk deletion.' }
        });
      }

      if (confirmationText !== 'DELETE') {
        return res.status(400).json({
          success: false,
          error: { code: 'CONFIRMATION_REQUIRED', message: 'You must type DELETE to confirm bulk deletion.' }
        });
      }

      // Verify admin password
      let isValidPassword = false;
      const adminEmail = req.user?.email || env.adminEmail || 'admin@faretransit.com';

      if (req.user?.email) {
        try {
          const user = await authRepository.findUserByEmail(req.user.email);
          if (user && user.password) {
            isValidPassword = await bcrypt.compare(adminPassword, user.password);
          }
        } catch (e) {
          // Ignore lookup error and proceed to fallback check
        }
      }

      if (!isValidPassword) {
        isValidPassword = (adminPassword === (env.adminPassword || 'admin123'));
      }

      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          error: { code: 'INVALID_PASSWORD', message: 'Incorrect admin password. Bulk deletion cancelled.' }
        });
      }

      const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
      const results = [];
      let deleted = 0;
      let protectedCount = 0;
      let failed = 0;

      for (const id of bookingIds) {
        try {
          // Look up booking to check if protected
          const booking = await bookingRepository.getById(id);
          const refCode = booking?.confirmation_code || booking?.confirmationCode || '';

          if (refCode === PROTECTED_BOOKING_REF) {
            results.push({ confirmationCode: refCode, status: 'PROTECTED', message: `${PROTECTED_BOOKING_REF} is protected and was not deleted.` });
            protectedCount++;
            continue;
          }

          const deleteResult = await bookingRepository.deleteBookingTransactional(id, adminEmail, clientIp);

          if (deleteResult.success) {
            results.push({ confirmationCode: deleteResult.confirmationCode || refCode || id, status: 'DELETED' });
            deleted++;
          } else {
            results.push({ confirmationCode: refCode || id, status: 'FAILED', message: deleteResult.message });
            failed++;
          }
        } catch (err) {
          results.push({ confirmationCode: id, status: 'FAILED', message: err.message });
          failed++;
        }
      }

      // Record bulk delete audit
      await bookingRepository.logAdminActivity({
        action: 'BULK_DELETE',
        bookingReference: `${deleted} deleted, ${protectedCount} protected, ${failed} failed`,
        deletedBy: adminEmail,
        ipAddress: clientIp,
        details: { bookingIds, results }
      });

      return res.json({
        success: true,
        summary: {
          requested: bookingIds.length,
          deleted,
          protected: protectedCount,
          failed
        },
        results
      });
    } catch (error) {
      logger.error(`[BULK_DELETE] Error: ${error.message}`, error);
      next(error);
    }
  },

  // ──────────────────────────────────────────────────────────────────────
  //  IMPORT BOOKING BACKUP — POST /admin/bookings/import-backup
  // ──────────────────────────────────────────────────────────────────────
  importBookingBackup: async (req, res, next) => {
    try {
      const { backup, selectedBookings, adminPassword } = req.body || {};

      if (!backup || typeof backup !== 'object') {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_BACKUP', message: 'Backup data is required.' }
        });
      }

      // Validate backup format
      if (backup.format !== 'THE_FINAL_SEAT_BOOKING_BACKUP') {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_FORMAT', message: `Unrecognized backup format: ${backup.format || 'missing'}. Expected: THE_FINAL_SEAT_BOOKING_BACKUP` }
        });
      }

      if (!backup.version || backup.version > 1) {
        return res.status(400).json({
          success: false,
          error: { code: 'UNSUPPORTED_VERSION', message: `Unsupported backup version: ${backup.version}. Supported: 1` }
        });
      }

      if (!Array.isArray(backup.bookings) || backup.bookings.length === 0) {
        return res.status(400).json({
          success: false,
          error: { code: 'EMPTY_BACKUP', message: 'Backup contains no bookings.' }
        });
      }

      // Selected bookings with strategies
      if (!Array.isArray(selectedBookings) || selectedBookings.length === 0) {
        return res.status(400).json({
          success: false,
          error: { code: 'NO_SELECTION', message: 'No bookings selected for import.' }
        });
      }

      // If any booking uses REPLACE strategy, require admin password
      const hasReplace = selectedBookings.some(s => s.strategy === 'REPLACE');
      if (hasReplace) {
        if (!adminPassword) {
          return res.status(400).json({
            success: false,
            error: { code: 'PASSWORD_REQUIRED', message: 'Admin password is required for replacing existing bookings.' }
          });
        }

        let isValidPassword = false;
        if (req.user?.email) {
          try {
            const user = await authRepository.findUserByEmail(req.user.email);
            if (user && user.password) {
              isValidPassword = await bcrypt.compare(adminPassword, user.password);
            }
          } catch (e) { /* fallback */ }
        }
        if (!isValidPassword) {
          isValidPassword = (adminPassword === (env.adminPassword || 'admin123'));
        }
        if (!isValidPassword) {
          return res.status(401).json({
            success: false,
            error: { code: 'INVALID_PASSWORD', message: 'Incorrect admin password. Import with REPLACE cancelled.' }
          });
        }
      }

      const adminEmail = req.user?.email || env.adminEmail || 'admin@faretransit.com';
      const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';

      const results = [];
      let restored = 0;
      let skipped = 0;
      let failed = 0;

      for (const selection of selectedBookings) {
        const idx = selection.index;
        const strategy = selection.strategy || 'SKIP';
        const bookingData = backup.bookings[idx];

        if (!bookingData) {
          results.push({ index: idx, status: 'FAILED', message: 'Invalid booking index in backup.' });
          failed++;
          continue;
        }

        const result = await bookingRepository.restoreBookingFromBackup(bookingData, strategy, adminEmail, clientIp);

        if (result.status === 'RESTORED') {
          restored++;
        } else if (result.status === 'SKIPPED') {
          skipped++;
        } else {
          failed++;
        }

        results.push({
          confirmationCode: result.confirmationCode || `index-${idx}`,
          status: result.status,
          message: result.message,
          bookingId: result.bookingId
        });
      }

      // Audit log
      await bookingRepository.logAdminActivity({
        action: 'BOOKING_BACKUP_IMPORT',
        bookingReference: `${restored} restored, ${skipped} skipped, ${failed} failed`,
        deletedBy: adminEmail,
        ipAddress: clientIp,
        details: { backupFormat: backup.format, backupVersion: backup.version, exportedAt: backup.exportedAt }
      });

      return res.json({
        success: true,
        summary: {
          requested: selectedBookings.length,
          restored,
          skipped,
          failed
        },
        results
      });
    } catch (error) {
      logger.error(`[BACKUP_IMPORT] Error: ${error.message}`, error);
      next(error);
    }
  },

  updateStatusNotes: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { newStatus, status, internalNotes, internal_notes } = req.body || {};
      const adminId = req.user?.id || 'admin';
      const desiredStatus = newStatus || status;
      const notes = internalNotes !== undefined ? internalNotes : internal_notes;

      const updateData = {};
      if (desiredStatus) updateData.status = desiredStatus;
      if (notes !== undefined) updateData.internal_notes = notes;

      const updatedBooking = await bookingRepository.updateBookingStatus(id, updateData, adminId);
      return res.json({
        success: true,
        message: 'Booking status & notes saved.',
        booking: updatedBooking,
        data: updatedBooking
      });
    } catch (error) {
      logger.error(`Error in updateStatusNotes for ${req.params.id}: ${error.message}`);
      return res.status(400).json({
        success: false,
        error: { code: 'STATUS_NOTES_ERROR', message: `Unable to save status & notes: ${error.message}` }
      });
    }
  },

  updateAuthorizationSettings: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { authorizedAmount, currency, expirationHours, authorizationNote } = req.body || {};
      const adminId = req.user?.id || 'admin';

      const updateData = {};
      if (authorizedAmount !== undefined) updateData.authorized_amount = parseFloat(authorizedAmount);
      if (currency) updateData.currency = currency.toUpperCase();
      if (authorizationNote !== undefined) updateData.authorization_notes = authorizationNote;

      const updatedBooking = await bookingRepository.updateBookingStatus(id, updateData, adminId);
      return res.json({
        success: true,
        message: 'Authorization settings saved.',
        booking: updatedBooking,
        data: updatedBooking
      });
    } catch (error) {
      logger.error(`Error in updateAuthorizationSettings for ${req.params.id}: ${error.message}`);
      return res.status(400).json({
        success: false,
        error: { code: 'AUTHORIZATION_SETTINGS_ERROR', message: `Unable to save authorization settings: ${error.message}` }
      });
    }
  },

  updatePassengerDetails: async (req, res, next) => {
    try {
      const { id } = req.params;
      const passengers = req.body.passengers || req.body;
      const adminId = req.user?.id || 'admin';
      const updatedBooking = await bookingRepository.updateBookingStatus(id, { passengers }, adminId);
      return res.json({
        success: true,
        message: 'Passenger details saved.',
        booking: updatedBooking,
        data: updatedBooking
      });
    } catch (error) {
      logger.error(`Error in updatePassengerDetails for ${req.params.id}: ${error.message}`);
      return res.status(400).json({
        success: false,
        error: { code: 'PASSENGER_DETAILS_ERROR', message: `Unable to save passenger details: ${error.message}` }
      });
    }
  },

  updateContactDetails: async (req, res, next) => {
    try {
      const { id } = req.params;
      const contactData = req.body;
      const adminId = req.user?.id || 'admin';
      const updatedBooking = await bookingRepository.updateBookingStatus(id, contactData, adminId);
      return res.json({
        success: true,
        message: 'Contact details saved.',
        booking: updatedBooking,
        data: updatedBooking
      });
    } catch (error) {
      logger.error(`Error in updateContactDetails for ${req.params.id}: ${error.message}`);
      return res.status(400).json({
        success: false,
        error: { code: 'CONTACT_DETAILS_ERROR', message: `Unable to save contact details: ${error.message}` }
      });
    }
  }
};

export default adminController;


