import abandonedBookingRepository from './abandoned-booking.repository.mjs';

let lastCleanupAt = 0;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const RETENTION_DAYS = 30;

async function maybeCleanupOldSessions() {
  const now = Date.now();
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;
  const cutoff = new Date(now - (RETENTION_DAYS * 24 * 60 * 60 * 1000)).toISOString();
  try {
    await abandonedBookingRepository.deleteOlderThan(cutoff);
  } catch {
    // Cleanup must never block a passenger autosave.
  }
}

export const abandonedBookingService = {
  saveSession: async (sessionData) => {
    await maybeCleanupOldSessions();
    await abandonedBookingRepository.saveSession(sessionData || {});
    return { saved: true };
  },

  removeSession: async (sessionKey) => {
    if (!sessionKey) return { deleted: false };
    return abandonedBookingRepository.deleteSession(sessionKey);
  }
};

export default abandonedBookingService;
