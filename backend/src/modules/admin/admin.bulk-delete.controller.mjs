import bcrypt from 'bcryptjs';
import env from '../../config/env.mjs';
import logger from '../../config/logger.mjs';
import supabase from '../../integrations/supabase/supabase.client.mjs';
import authRepository from '../auth/auth.repository.mjs';
import bookingRepository from '../bookings/booking.repository.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROTECTED_BOOKING_REF = 'TFS-2026-HQ39GA';

function withTimeout(promise, ms = 8000, label = 'database operation') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`${label} timed out after ${ms}ms`);
      error.code = 'OPERATION_TIMEOUT';
      reject(error);
    }, ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

function isIgnorableSchemaError(error) {
  const text = String(error?.message || error || '').toLowerCase();
  return (
    text.includes('schema cache') ||
    text.includes('does not exist') ||
    text.includes('not found') ||
    (text.includes('relation') && text.includes('does not exist'))
  );
}

async function verifyAdminPassword(req, adminPassword) {
  if (!adminPassword) return false;

  if (req.user?.email) {
    try {
      const user = await withTimeout(
        authRepository.findUserByEmail(req.user.email),
        4000,
        'admin credential lookup'
      );
      if (user?.password && await bcrypt.compare(adminPassword, user.password)) return true;
    } catch (error) {
      logger.warn(`[AdminBulkDelete] Admin credential lookup warning: ${error.message}`);
    }
  }

  return Boolean(env.adminPassword && adminPassword === env.adminPassword);
}

async function resolveSelectedBookings(bookingIds) {
  const requested = [...new Set(
    (bookingIds || []).map(value => String(value || '').trim()).filter(Boolean)
  )];

  const uuidIds = requested.filter(value => UUID_RE.test(value));
  const referenceIds = requested.filter(value => !UUID_RE.test(value));

  const queries = [];
  if (uuidIds.length) {
    queries.push(
      withTimeout(
        supabase.from('bookings').select('id, confirmation_code').in('id', uuidIds),
        7000,
        'resolve selected booking UUIDs'
      )
    );
  }
  if (referenceIds.length) {
    queries.push(
      withTimeout(
        supabase.from('bookings').select('id, confirmation_code').in('confirmation_code', referenceIds),
        7000,
        'resolve selected booking references'
      )
    );
  }

  const responses = await Promise.all(queries);
  const rows = [];
  for (const response of responses) {
    if (response?.error) throw new Error(response.error.message);
    if (Array.isArray(response?.data)) rows.push(...response.data);
  }

  const uniqueRows = [...new Map(rows.filter(Boolean).map(row => [row.id, row])).values()];
  const byAlias = new Map();
  for (const row of uniqueRows) {
    if (row.id) byAlias.set(String(row.id), row);
    if (row.confirmation_code) byAlias.set(String(row.confirmation_code), row);
  }

  return {
    requested,
    resolved: requested.map(input => ({ input, row: byAlias.get(input) || null })),
    rows: uniqueRows
  };
}

async function deleteBatch(table, column, values, timeoutMs = 8000) {
  const cleanValues = [...new Set((values || []).filter(Boolean))];
  if (!cleanValues.length) return { ok: true, table, skipped: true };

  try {
    const result = await withTimeout(
      supabase.from(table).delete().in(column, cleanValues),
      timeoutMs,
      `delete ${table}`
    );

    if (result?.error) {
      if (isIgnorableSchemaError(result.error)) {
        return { ok: true, table, warning: result.error.message };
      }
      return { ok: false, table, error: result.error.message };
    }

    return { ok: true, table };
  } catch (error) {
    if (isIgnorableSchemaError(error)) return { ok: true, table, warning: error.message };
    return {
      ok: false,
      table,
      error: error.message,
      timeout: error.code === 'OPERATION_TIMEOUT'
    };
  }
}

async function deleteResolvedBookings(resolution, adminEmail, ipAddress) {
  const resultsByInput = new Map();

  // Idempotency: if a stale dashboard row was already removed by an earlier
  // timed-out request, treat it as successfully absent instead of failing it.
  for (const entry of resolution.resolved) {
    if (!entry.row) {
      resultsByInput.set(entry.input, {
        confirmationCode: entry.input,
        bookingId: entry.input,
        status: 'DELETED',
        message: 'Booking is already absent from the database.'
      });
    }
  }

  const protectedRows = resolution.rows.filter(row => row.confirmation_code === PROTECTED_BOOKING_REF);
  for (const row of protectedRows) {
    const aliases = [row.id, row.confirmation_code].filter(Boolean);
    for (const entry of resolution.resolved.filter(item => item.row?.id === row.id)) {
      resultsByInput.set(entry.input, {
        confirmationCode: row.confirmation_code,
        bookingId: row.id,
        status: 'PROTECTED',
        message: `${PROTECTED_BOOKING_REF} is protected and was not deleted.`
      });
    }
    logger.info(`[AdminBulkDelete] Protected booking skipped: ${aliases.join(' / ')}`);
  }

  const targetRows = resolution.rows.filter(row => row.confirmation_code !== PROTECTED_BOOKING_REF);
  const targetIds = targetRows.map(row => row.id).filter(Boolean);
  const targetRefs = targetRows.map(row => row.confirmation_code).filter(Boolean);

  if (!targetIds.length) {
    return resolution.requested.map(input => resultsByInput.get(input));
  }

  // Delete related records by TABLE, not by BOOKING. This turns a 21-booking
  // deletion from hundreds of network calls into a small fixed number of calls.
  const dependencyTasks = [
    ['email_logs', 'booking_id', targetIds],
    ['email_logs', 'booking_reference', targetRefs],
    ['email_deliveries', 'booking_id', targetIds],
    ['passenger_authorizations', 'booking_id', targetIds],
    ['authorization_snapshots', 'booking_id', targetIds],
    ['payment_authorization_splits', 'booking_id', targetIds],
    ['payment_splits', 'booking_id', targetIds],
    ['payments', 'booking_id', targetIds],
    ['payment_methods', 'booking_id', targetIds],
    ['booking_payment_methods', 'booking_id', targetIds],
    ['ticket_details', 'booking_id', targetIds],
    ['ticket_snapshots', 'booking_id', targetIds],
    ['booking_itinerary_segments', 'booking_id', targetIds],
    ['flights', 'booking_id', targetIds],
    ['travellers', 'booking_id', targetIds],
    ['contacts', 'booking_id', targetIds],
    ['booking_status_audits', 'booking_id', targetIds],
    ['audit_events', 'booking_id', targetIds]
  ];

  const dependencyResults = await Promise.all(
    dependencyTasks.map(([table, column, values]) => deleteBatch(table, column, values))
  );
  const dependencyFailures = dependencyResults.filter(item => !item.ok);

  if (dependencyFailures.length) {
    logger.warn('[AdminBulkDelete] Dependency cleanup warnings', {
      bookingCount: targetIds.length,
      failures: dependencyFailures
    });
  }

  let bookingDelete;
  try {
    bookingDelete = await withTimeout(
      supabase
        .from('bookings')
        .delete()
        .in('id', targetIds)
        .select('id, confirmation_code'),
      10000,
      'delete selected booking rows'
    );
  } catch (error) {
    bookingDelete = { error };
  }

  if (bookingDelete?.error) {
    const message = bookingDelete.error.message || 'Unable to delete selected booking rows.';
    for (const row of targetRows) {
      for (const entry of resolution.resolved.filter(item => item.row?.id === row.id)) {
        resultsByInput.set(entry.input, {
          confirmationCode: row.confirmation_code || entry.input,
          bookingId: row.id,
          status: 'FAILED',
          message,
          errorCode: bookingDelete.error.code || 'BOOKING_DELETE_FAILED'
        });
      }
    }
    return resolution.requested.map(input => resultsByInput.get(input));
  }

  let remainingIds = new Set();
  try {
    const verify = await withTimeout(
      supabase.from('bookings').select('id').in('id', targetIds),
      7000,
      'verify bulk booking deletion'
    );
    if (verify?.error) throw new Error(verify.error.message);
    remainingIds = new Set((verify?.data || []).map(row => row.id));
  } catch (error) {
    // The DELETE response itself returns the deleted rows. If verification is
    // temporarily unavailable, use that response rather than hanging the UI.
    logger.warn(`[AdminBulkDelete] Verification warning: ${error.message}`);
    const returnedDeleted = new Set((bookingDelete?.data || []).map(row => row.id));
    remainingIds = new Set(targetIds.filter(id => !returnedDeleted.has(id)));
  }

  const deletedAt = new Date().toISOString();
  const confirmedDeletedRows = targetRows.filter(row => !remainingIds.has(row.id));

  // Prevent warm serverless instances from resurfacing stale in-memory records.
  // updateStatus writes the tombstone into the repository memory store even when
  // the database row has already been removed. Failures here are non-blocking.
  await Promise.all(confirmedDeletedRows.map(async row => {
    try {
      await withTimeout(
        bookingRepository.updateStatus(row.id, {
          _deleted: true,
          status: 'DELETED',
          deleted_at: deletedAt,
          deleted_by: adminEmail
        }),
        2500,
        'mark deleted booking cache'
      );
    } catch (error) {
      logger.warn(`[AdminBulkDelete] Cache tombstone warning for ${row.id}: ${error.message}`);
    }
  }));

  for (const row of targetRows) {
    const deleted = !remainingIds.has(row.id);
    for (const entry of resolution.resolved.filter(item => item.row?.id === row.id)) {
      resultsByInput.set(entry.input, deleted
        ? {
            confirmationCode: row.confirmation_code || entry.input,
            bookingId: row.id,
            status: 'DELETED',
            message: `Booking ${row.confirmation_code || row.id} permanently deleted.`,
            dependencyWarnings: dependencyFailures
          }
        : {
            confirmationCode: row.confirmation_code || entry.input,
            bookingId: row.id,
            status: 'FAILED',
            message: 'The booking is still present after the delete request. Refresh and retry this booking.',
            errorCode: 'BOOKING_DELETE_NOT_PERSISTED'
          }
      );
    }
  }

  try {
    await withTimeout(
      bookingRepository.logAdminActivity({
        action: 'BULK_DELETE',
        bookingReference: `${confirmedDeletedRows.length} booking(s) deleted`,
        deletedBy: adminEmail,
        ipAddress,
        details: {
          requested: resolution.requested.length,
          deletedBookingIds: confirmedDeletedRows.map(row => row.id),
          protectedBookingIds: protectedRows.map(row => row.id),
          dependencyWarnings: dependencyFailures
        }
      }),
      2500,
      'bulk delete audit log'
    );
  } catch (error) {
    logger.warn(`[AdminBulkDelete] Audit log warning: ${error.message}`);
  }

  return resolution.requested.map(input => resultsByInput.get(input));
}

async function executeDelete(req, bookingIds, requireConfirmationText = false) {
  const { adminPassword, confirmationText } = req.body || {};

  if (!Array.isArray(bookingIds) || bookingIds.length === 0) {
    return { status: 400, body: { success: false, error: { code: 'INVALID_IDS', message: 'Select at least one booking to delete.' } } };
  }
  if (bookingIds.length > 50) {
    return { status: 400, body: { success: false, error: { code: 'TOO_MANY_IDS', message: 'Delete at most 50 bookings at a time.' } } };
  }
  if (requireConfirmationText && confirmationText !== 'DELETE') {
    return { status: 400, body: { success: false, error: { code: 'CONFIRMATION_REQUIRED', message: 'Type DELETE to confirm deletion.' } } };
  }
  if (!adminPassword) {
    return { status: 400, body: { success: false, error: { code: 'PASSWORD_REQUIRED', message: 'Admin password is required.' } } };
  }

  const validPassword = await verifyAdminPassword(req, adminPassword);
  if (!validPassword) {
    return { status: 401, body: { success: false, error: { code: 'INVALID_PASSWORD', message: 'Incorrect admin password. Deletion cancelled.' } } };
  }

  const adminEmail = req.user?.email || env.adminEmail || 'admin';
  const ipAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || 'unknown';
  const resolution = await resolveSelectedBookings(bookingIds);
  const results = await deleteResolvedBookings(resolution, adminEmail, ipAddress);

  const deleted = results.filter(item => item?.status === 'DELETED').length;
  const protectedCount = results.filter(item => item?.status === 'PROTECTED').length;
  const failed = results.filter(item => item?.status === 'FAILED').length;

  return {
    status: 200,
    body: {
      success: failed === 0,
      summary: {
        requested: bookingIds.length,
        deleted,
        protected: protectedCount,
        failed
      },
      results
    }
  };
}

export const adminBulkDeleteController = {
  bulkDeleteBookings: async (req, res) => {
    try {
      const { bookingIds } = req.body || {};
      const response = await executeDelete(req, bookingIds, true);
      return res.status(response.status).json(response.body);
    } catch (error) {
      logger.error(`[AdminBulkDelete] Bulk delete failed: ${error.message}`, error);
      return res.status(error.code === 'OPERATION_TIMEOUT' ? 504 : 500).json({
        success: false,
        error: {
          code: error.code || 'BULK_DELETE_FAILED',
          message: error.code === 'OPERATION_TIMEOUT'
            ? 'The database did not respond in time. No endless spinner will be left running; refresh to verify state.'
            : error.message
        }
      });
    }
  },

  deleteBooking: async (req, res) => {
    try {
      const bookingId = req.params.id || req.params.bookingId;
      const response = await executeDelete(req, [bookingId], false);
      const item = response.body?.results?.[0];

      if (response.status !== 200) return res.status(response.status).json(response.body);
      if (item?.status === 'FAILED') {
        return res.status(409).json({ success: false, error: { code: item.errorCode || 'DELETE_FAILED', message: item.message }, details: item });
      }
      if (item?.status === 'PROTECTED') {
        return res.status(403).json({ success: false, error: { code: 'PROTECTED_BOOKING', message: item.message }, details: item });
      }

      return res.json({ success: true, ...item });
    } catch (error) {
      logger.error(`[AdminBulkDelete] Single delete failed: ${error.message}`, error);
      return res.status(error.code === 'OPERATION_TIMEOUT' ? 504 : 500).json({
        success: false,
        error: { code: error.code || 'DELETE_FAILED', message: error.message }
      });
    }
  }
};

export default adminBulkDeleteController;
