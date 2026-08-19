import supabase from '../../integrations/supabase/supabase.client.mjs';
import logger from '../../config/logger.mjs';
import bookingRepository from './booking.repository.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`${label} timed out after ${ms}ms`);
      error.code = 'REPOSITORY_QUERY_TIMEOUT';
      reject(error);
    }, ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

function isOptionalTableError(error) {
  const text = String(error?.message || error || '').toLowerCase();
  return text.includes('schema cache') || text.includes('does not exist') || text.includes('relation') || text.includes('not found');
}

async function resolveBookingKeys(input) {
  const raw = String(input || '').trim();
  if (!raw) return { realId: null, refCode: null };

  if (UUID_RE.test(raw)) {
    return { realId: raw, refCode: raw };
  }

  try {
    const result = await withTimeout(
      supabase.from('bookings').select('id, confirmation_code').eq('confirmation_code', raw).maybeSingle(),
      3500,
      'resolve booking reference for payment splits'
    );
    if (!result?.error && result?.data?.id) {
      return {
        realId: result.data.id,
        refCode: result.data.confirmation_code || raw
      };
    }
  } catch (error) {
    logger.warn(`[RepositoryRepair] Could not resolve booking reference '${raw}': ${error.message}`);
  }

  return { realId: raw, refCode: raw };
}

async function querySplitsTable(table, identifiers) {
  if (!identifiers.length) return [];
  try {
    const result = await withTimeout(
      supabase.from(table).select('*').in('booking_id', identifiers),
      4000,
      `load ${table}`
    );
    if (result?.error) {
      if (!isOptionalTableError(result.error)) {
        logger.warn(`[RepositoryRepair] ${table} lookup failed: ${result.error.message}`);
      }
      return [];
    }
    return Array.isArray(result?.data) ? result.data : [];
  } catch (error) {
    logger.warn(`[RepositoryRepair] ${table} lookup failed: ${error.message}`);
    return [];
  }
}

export function installBookingRepositoryRuntimeRepairs() {
  if (bookingRepository.__runtimeRepairInstalled) return bookingRepository;

  /*
   * Critical recursion fix:
   *
   * OLD PATH
   * getRelations -> getPaymentSplits -> getById -> getRelations -> ...
   *
   * getPaymentSplits must never hydrate a complete booking. It only needs the
   * booking UUID/reference and the split rows, so resolve those directly.
   */
  bookingRepository.getPaymentSplits = async (bookingIdInput) => {
    if (!bookingIdInput) return [];

    const { realId, refCode } = await resolveBookingKeys(bookingIdInput);
    const identifiers = [...new Set([realId, refCode].filter(Boolean))];

    const canonicalRows = await querySplitsTable('payment_authorization_splits', identifiers);
    if (canonicalRows.length > 0) return canonicalRows;

    // Legacy fallback kept for existing records created before the canonical table.
    return querySplitsTable('payment_splits', identifiers);
  };

  Object.defineProperty(bookingRepository, '__runtimeRepairInstalled', {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false
  });

  logger.info('[RepositoryRepair] Installed non-recursive payment split lookup.');
  return bookingRepository;
}

installBookingRepositoryRuntimeRepairs();

export default bookingRepository;
