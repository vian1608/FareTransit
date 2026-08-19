import travellerRepository from './traveller.repository.mjs';
import {
  validateDateOfBirth,
  validatePassportNumber,
  validatePassportExpiry
} from '../../shared/utils/validationHelpers.mjs';

function travellerValidationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = 'INVALID_TRAVELLER_DATA';
  error.expose = true;
  return error;
}

export function calculateAge(dobString, departureDateString = '') {
  if (!dobString) return 0;
  const dob = new Date(dobString);
  const refDate = departureDateString ? new Date(departureDateString) : new Date();
  let age = refDate.getFullYear() - dob.getFullYear();
  const m = refDate.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && refDate.getDate() < dob.getDate())) age--;
  return age;
}

export const travellerService = {
  validateTravellers: (travellers, departureDate = '') => {
    const list = Array.isArray(travellers) ? travellers : [];
    if (list.length === 0) {
      throw travellerValidationError('At least one traveler is required for booking.');
    }

    for (let i = 0; i < list.length; i++) {
      const traveler = list[i];
      const name = `${traveler.firstName || ''} ${traveler.lastName || ''}`.trim() || `Passenger #${i + 1}`;

      if (!traveler.title || !String(traveler.title).trim()) {
        throw travellerValidationError(`Title is required for ${name}.`);
      }
      if (!traveler.firstName || !traveler.firstName.trim()) {
        throw travellerValidationError(`First name is required for ${name}.`);
      }
      if (!traveler.lastName || !traveler.lastName.trim()) {
        throw travellerValidationError(`Last name is required for ${name}.`);
      }
      if (!traveler.gender || !String(traveler.gender).trim()) {
        throw travellerValidationError(`Gender is required for ${name}.`);
      }

      const role = String(traveler.role || 'adult').toLowerCase();
      if (role === 'infant') {
        const infantType = String(traveler.infantType || traveler.infant_type || '').toUpperCase();
        if (infantType && !['IN_SEAT', 'ON_LAP'].includes(infantType)) {
          throw travellerValidationError(`Invalid infant travel type for ${name}.`);
        }
      }

      // Date of birth validation
      const dobCheck = validateDateOfBirth(traveler.dateOfBirth, traveler.role || 'adult', departureDate);
      if (!dobCheck.valid) {
        throw travellerValidationError(`${name}: ${dobCheck.message}`);
      }

      // Passport number validation (if present)
      if (traveler.passportNumber) {
        const passCheck = validatePassportNumber(traveler.passportNumber);
        if (!passCheck.valid) {
          throw travellerValidationError(`${name}: ${passCheck.message}`);
        }
      }

      // Passport expiry validation (if present)
      if (traveler.passportExpiry) {
        const expCheck = validatePassportExpiry(traveler.passportExpiry, departureDate);
        if (!expCheck.valid) {
          throw travellerValidationError(`${name}: ${expCheck.message}`);
        }
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
