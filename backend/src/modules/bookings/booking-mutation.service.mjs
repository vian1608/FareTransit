import supabase from '../../integrations/supabase/supabase.client.mjs';
import bookingRepository from './booking.repository.mjs';
import bookingService from './booking.service.mjs';

function mutationError(message, code, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

async function resolveBooking(reference) {
  const booking = await bookingRepository.getById(reference);
  if (!booking) {
    throw mutationError(`Booking '${reference}' not found.`, 'BOOKING_NOT_FOUND', 404);
  }
  return booking;
}

async function loadCurrentBooking(bookingId) {
  const current = await bookingService.getDetailsByCodeOrId(bookingId);
  if (!current) {
    throw mutationError(`Booking '${bookingId}' could not be reloaded after mutation.`, 'BOOKING_RELOAD_FAILED', 500);
  }
  return current;
}

function assertExpectedVersion(booking, expectedVersion) {
  if (expectedVersion === undefined || expectedVersion === null || expectedVersion === '') return;

  const expected = Number(expectedVersion);
  const current = Number(booking.version);
  if (Number.isFinite(expected) && Number.isFinite(current) && expected !== current) {
    throw mutationError(
      `Booking version conflict: expected ${expected}, current ${current}. Refresh before saving.`,
      'BOOKING_VERSION_CONFLICT',
      409,
    );
  }
}

async function persistPrimaryContact(bookingId, contact = {}, fallback = {}) {
  const email = String(contact.email ?? contact.contactEmail ?? fallback.email ?? '').trim().toLowerCase();
  const phone = String(contact.phone ?? contact.phone_number ?? contact.phoneNumber ?? fallback.phone ?? '').trim();

  if (!email || !email.includes('@')) {
    throw mutationError('A valid contact email is required.', 'INVALID_CONTACT_EMAIL');
  }
  if (!phone) {
    throw mutationError('A valid contact phone number is required.', 'INVALID_CONTACT_PHONE');
  }

  const row = {
    email,
    phone_number: phone,
  };
  if (contact.country_code !== undefined || contact.countryCode !== undefined) {
    row.country_code = contact.country_code ?? contact.countryCode ?? null;
  }

  const { data: existing, error: lookupError } = await supabase
    .from('contacts')
    .select('id')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    throw mutationError(`Unable to load current contact: ${lookupError.message}`, 'CONTACT_LOOKUP_FAILED', 500);
  }

  const write = existing?.id
    ? supabase.from('contacts').update(row).eq('id', existing.id).select().single()
    : supabase.from('contacts').insert({ booking_id: bookingId, ...row }).select().single();

  const { error: writeError } = await write;
  if (writeError) {
    throw mutationError(`Unable to save contact details: ${writeError.message}`, 'CONTACT_UPDATE_FAILED', 500);
  }
}

/**
 * Single backend gateway for Admin mutations that do not already use a
 * transactional repository RPC. Database triggers remain the final integrity
 * boundary for projections/version/reauthorization; this gateway guarantees
 * that every successful mutation returns a freshly assembled current booking.
 */
async function execute(reference, { expectedVersion, mutate }) {
  const before = await resolveBooking(reference);
  assertExpectedVersion(before, expectedVersion);
  await mutate(before);
  return loadCurrentBooking(before.id);
}

const bookingMutationService = {
  execute,
  loadCurrentBooking,

  updateContact: (reference, contact = {}, context = {}) => execute(reference, {
    expectedVersion: context.expectedVersion,
    mutate: (booking) => persistPrimaryContact(booking.id, contact, booking),
  }),

  updateStatusAndNotes: (reference, payload = {}, context = {}) => execute(reference, {
    expectedVersion: context.expectedVersion,
    mutate: async (booking) => {
      const status = payload.newStatus || payload.status;
      const internalNotes = payload.internalNotes !== undefined ? payload.internalNotes : payload.internal_notes;

      if (status) {
        await bookingService.updateStatus(booking.id, {
          status,
          internalNotes,
          adminId: context.adminId || 'admin',
          reason: payload.reason || 'Status/notes updated via Admin Dashboard',
        });
      } else if (internalNotes !== undefined) {
        await bookingService.updateNotes(booking.id, {
          internalNotes: String(internalNotes),
          adminId: context.adminId || 'admin',
          reason: payload.reason || 'Internal notes updated via Admin Dashboard',
        });
      } else {
        throw mutationError('No status or internal notes were supplied.', 'NO_BOOKING_CHANGES');
      }
    },
  }),

  updateAuthorizationSettings: (reference, payload = {}, context = {}) => execute(reference, {
    expectedVersion: context.expectedVersion,
    mutate: async (booking) => {
      const update = {};
      if (payload.authorizedAmount !== undefined || payload.authorized_amount !== undefined) {
        const amount = Number(payload.authorizedAmount ?? payload.authorized_amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          throw mutationError('Authorized amount must be a positive number.', 'INVALID_AUTHORIZED_AMOUNT');
        }
        update.authorized_amount = amount;
      }
      if (payload.currency) update.currency = String(payload.currency).toUpperCase();
      if (payload.authorizationNote !== undefined) update.authorization_notes = payload.authorizationNote;
      if (payload.authorization_notes !== undefined) update.authorization_notes = payload.authorization_notes;
      if (Object.keys(update).length === 0) {
        throw mutationError('No authorization settings were supplied.', 'NO_AUTHORIZATION_CHANGES');
      }
      await bookingRepository.updateBookingStatus(booking.id, update);
    },
  }),

  updatePaymentSplits: (reference, splits, context = {}) => execute(reference, {
    expectedVersion: context.expectedVersion,
    mutate: async (booking) => {
      if (!Array.isArray(splits) || splits.length === 0) {
        throw mutationError('At least one payment split is required.', 'SPLITS_REQUIRED');
      }
      await bookingService.updatePaymentSplits(
        booking.id,
        splits,
        context.adminId || 'admin',
        context.reason || 'Payment splits updated via Admin Dashboard',
      );
    },
  }),

  updateTicket: (reference, ticketData = {}, context = {}) => execute(reference, {
    expectedVersion: context.expectedVersion,
    mutate: (booking) => bookingService.updateTicket(booking.id, ticketData, context.adminId || 'admin'),
  }),
};

export default bookingMutationService;
