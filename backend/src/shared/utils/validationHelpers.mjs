/**
 * Shared Backend Validation Utilities for FareTransit
 */

export function validatePostalCode(postalCode = '', country = 'United States') {
  const code = String(postalCode || '').trim();
  const cName = String(country || '').trim().toLowerCase();

  if (!code) {
    return { valid: false, message: 'Postal or ZIP code is required.' };
  }

  // United States
  if (cName === 'united states' || cName === 'us' || cName === 'usa') {
    const isUsZip = /^\d{5}(-\d{4})?$/.test(code);
    if (!isUsZip) {
      return {
        valid: false,
        message: 'Enter a valid US ZIP code, such as 14214 or 14214-1234.'
      };
    }
    return { valid: true };
  }

  // Canada
  if (cName === 'canada' || cName === 'ca') {
    const isCaPostal = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/.test(code);
    if (!isCaPostal) {
      return {
        valid: false,
        message: 'Enter a valid Canadian postal code, such as M5V 2T6.'
      };
    }
    return { valid: true };
  }

  // United Kingdom & Other Countries
  const isGeneralPostal = /^[A-Za-z0-9\s-]{2,12}$/.test(code);
  if (!isGeneralPostal) {
    return {
      valid: false,
      message: 'Enter a valid postal code (2–12 letters, numbers, or hyphens).'
    };
  }

  return { valid: true };
}

export function validatePassportNumber(passportNumber = '') {
  const clean = String(passportNumber || '').trim().toUpperCase();
  if (!clean) {
    return { valid: true };
  }

  const isValid = /^[A-Z0-9]{5,20}$/.test(clean);
  if (!isValid) {
    return {
      valid: false,
      message: 'Enter a valid passport number using 5–20 letters or numbers.'
    };
  }

  return { valid: true, value: clean };
}

export function validateDateOfBirth(dobString = '', role = 'adult', departureDateString = '') {
  if (!dobString) {
    return { valid: false, message: 'Date of birth is required.' };
  }

  const dob = new Date(dobString);
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (isNaN(dob.getTime())) {
    return { valid: false, message: 'Enter a valid date of birth.' };
  }

  if (dob > now) {
    return { valid: false, message: 'Date of birth cannot be in the future.' };
  }

  const depDate = departureDateString ? new Date(departureDateString) : now;
  const refDate = isNaN(depDate.getTime()) ? now : depDate;

  let age = refDate.getFullYear() - dob.getFullYear();
  const mDiff = refDate.getMonth() - dob.getMonth();
  if (mDiff < 0 || (mDiff === 0 && refDate.getDate() < dob.getDate())) {
    age--;
  }

  const reqRole = String(role || 'adult').toLowerCase();
  if (reqRole === 'adult' && age < 12) {
    return {
      valid: false,
      message: 'This traveler does not meet the selected passenger age requirement (Adults must be 12+).'
    };
  }
  if (reqRole === 'child' && (age < 2 || age >= 12)) {
    return {
      valid: false,
      message: 'This traveler does not meet the selected passenger age requirement (Children must be ages 2–11).'
    };
  }
  if (reqRole === 'infant' && age >= 2) {
    return {
      valid: false,
      message: 'This traveler does not meet the selected passenger age requirement (Infants must be under 2 years old).'
    };
  }

  return { valid: true, age };
}

export function validatePassportExpiry(expiryString = '', departureDateString = '') {
  if (!expiryString) return { valid: true };

  const expDate = new Date(expiryString);
  if (isNaN(expDate.getTime())) {
    return { valid: false, message: 'Enter a valid passport expiration date.' };
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const depDate = departureDateString ? new Date(departureDateString) : now;
  const refDate = isNaN(depDate.getTime()) ? now : depDate;

  if (expDate <= refDate) {
    return {
      valid: false,
      message: 'Passport must remain valid through the selected travel date.'
    };
  }

  return { valid: true };
}
