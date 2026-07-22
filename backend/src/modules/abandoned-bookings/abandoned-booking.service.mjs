import abandonedBookingRepository from './abandoned-booking.repository.mjs';

export const abandonedBookingService = {
  saveSession: async (sessionData) => {
    const { sessionKey } = sessionData;
    const existing = await abandonedBookingRepository.findSession(sessionKey);
    
    if (existing) {
      await abandonedBookingRepository.updateSession(sessionKey, sessionData);
      return { updated: true };
    }
    
    await abandonedBookingRepository.createSession(sessionData);
    return { created: true };
  },

  removeSession: async (sessionKey) => {
    if (!sessionKey) return;
    return abandonedBookingRepository.deleteSession(sessionKey);
  }
};

export default abandonedBookingService;
