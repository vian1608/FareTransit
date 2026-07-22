import travellerRepository from './traveller.repository.mjs';

export function calculateAge(dobString) {
  if (!dobString) return 0;
  const dob = new Date(dobString);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

export const travellerService = {
  validateTravellers: (travellers) => {
    const list = Array.isArray(travellers) ? travellers : [];
    
    for (const traveler of list) {
      if (!traveler.firstName || !traveler.lastName) {
        throw new Error('Passenger first and last name are required');
      }

      if (!traveler.dateOfBirth) {
        throw new Error(`Date of birth is required for passenger ${traveler.firstName} ${traveler.lastName}`);
      }

      const age = calculateAge(traveler.dateOfBirth);
      const role = (traveler.role || 'adult').toLowerCase();
      
      if (role === 'adult' && age < 18 && age > 0) {
        throw new Error(`Passenger ${traveler.firstName} ${traveler.lastName} is marked as Adult but is under 18.`);
      }
    }
    return true;
  },

  getTravellersForBooking: async (bookingId) => {
    return travellerRepository.findTravellersByBookingId(bookingId);
  },

  saveTravellers: async (bookingId, travellersList) => {
    return travellerRepository.createTravellers(bookingId, travellersList);
  }
};

export default travellerService;
