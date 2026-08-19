import bookingRepository from './booking.repository.mjs';
import logger from '../../config/logger.mjs';

/**
 * Booking Data Integrity Validator Service
 * Enforces: REAL DATA > ERROR MESSAGE > NO DATA
 * Missing Data -> Throws Error / Blocks Operation. Never returns fake data.
 */
export const bookingValidatorService = {
  /**
   * Validates structural and relational integrity of a booking record.
   * @param {string|object} bookingOrId - Booking ID string or booking object
   * @param {object} options - Validation requirements (requireItinerary, requirePassengers, requireAuthorization, requirePnr)
   * @returns {Promise<{valid: boolean, booking: object, errors: string[]}>}
   */
  validateBookingIntegrity: async (bookingOrId, options = {}) => {
    const {
      requireItinerary = true,
      requirePassengers = true,
      requirePayment = true,
      requireAuthorization = false,
      requirePnr = false,
      requireTicket = false,
      throwOnError = false
    } = options;

    let booking = typeof bookingOrId === 'object' ? bookingOrId : null;
    const bookingId = typeof bookingOrId === 'string' ? bookingOrId : (booking?.id || booking?.booking_id);

    if (!booking && bookingId) {
      booking = await bookingRepository.getCompleteBookingById(bookingId);
    }

    const errors = [];

    // 1. DOMAIN: BOOKING CORE DETAILS
    if (!booking) {
      const msg = `Booking '${bookingId || 'UNKNOWN'}' does not exist in database.`;
      if (throwOnError) throw new Error('BOOKING_NOT_FOUND');
      return { valid: false, reason: msg, errors: [msg], code: 'BOOKING_NOT_FOUND', booking: null };
    }

    const confirmationCode = booking.confirmation_code || booking.confirmationCode || booking.bookingReference;
    if (!confirmationCode) {
      errors.push(`Booking '${booking.id}' is missing a valid confirmation code.`);
    }

    const passengerName = booking.passenger_name || booking.customer?.name;
    const passengersList = booking.passengers || booking.travellers || booking.traveller_details || [];
    if (requirePassengers && !passengerName && passengersList.length === 0) {
      errors.push(`Booking ${confirmationCode || booking.id} is missing passenger details.`);
    }

    const email = booking.email || booking.customer?.email;
    if (!email || !email.includes('@')) {
      errors.push(`Booking ${confirmationCode || booking.id} is missing a valid customer email address.`);
    }

    // 2. DOMAIN: FLIGHT ITINERARY DETAILS
    if (requireItinerary) {
      let segments = [];
      if (Array.isArray(booking.itinerary_segments) && booking.itinerary_segments.length > 0) {
        segments = booking.itinerary_segments;
      } else if (Array.isArray(booking.outbound_segments) && booking.outbound_segments.length > 0) {
        segments = booking.outbound_segments;
      } else if (Array.isArray(booking.flights) && booking.flights.length > 0) {
        segments = booking.flights;
      } else {
        if (booking.itinerary?.outbound) segments.push(booking.itinerary.outbound);
        if (booking.itinerary?.return) segments.push(booking.itinerary.return);
        if (booking.flight) segments.push(booking.flight);
        if (booking.returnFlight) segments.push(booking.returnFlight);
      }

      const validSegments = segments.filter(s => {
        if (!s) return false;
        const origin = s.origin_airport || s.originCode || s.departure_airport || s.origin || s.origin_code || s.departure?.airport || s.departure?.code;
        const dest = s.destination_airport || s.destinationCode || s.arrival_airport || s.destination || s.destination_code || s.arrival?.airport || s.arrival?.code;
        return !!(origin && dest);
      });

      if (validSegments.length === 0) {
        errors.push(`Booking ${confirmationCode || booking.id} has no valid flight itinerary segments. Please complete the itinerary before continuing.`);
        logger.error(`[DataIntegrity] BOOKING_ITINERARY_MISSING for booking ${booking.id}`);
      } else {
        // Detailed Segment Attribute Checks
        validSegments.forEach((seg, idx) => {
          const airline = seg.carrier_name || seg.carrier_code || seg.airline || seg.airline_name || seg.airlineName;
          const flightNum = seg.flight_number || seg.flightNumber || seg.flight_no;
          const origin = seg.origin_airport || seg.originCode || seg.departure_airport || seg.origin || s.departure?.airport;
          const dest = seg.destination_airport || seg.destinationCode || seg.arrival_airport || seg.destination || s.arrival?.airport;

          if (!airline) errors.push(`Flight segment ${idx + 1} is missing airline name/code.`);
          if (!flightNum) errors.push(`Flight segment ${idx + 1} is missing flight number.`);
          if (!origin) errors.push(`Flight segment ${idx + 1} is missing origin airport.`);
          if (!dest) errors.push(`Flight segment ${idx + 1} is missing destination airport.`);
        });
      }
    }

    // 3. DOMAIN: PAYMENT DETAILS
    if (requirePayment) {
      const amount = parseFloat(booking.customer_price ?? booking.total_amount ?? booking.amount ?? 0);
      if (isNaN(amount) || amount <= 0) {
        errors.push(`Booking ${confirmationCode || booking.id} has invalid or zero total amount (${amount}).`);
      }

      const currency = booking.currency || booking.pricing?.currency;
      if (!currency) {
        errors.push(`Booking ${confirmationCode || booking.id} is missing currency code.`);
      }

      // Check Payment Splits Sum Match (if splits present)
      const splits = booking.payment_splits || booking.paymentSplits || [];
      if (Array.isArray(splits) && splits.length > 0) {
        const splitSumCents = splits.reduce((sum, s) => {
          const a = parseFloat(s.amount || 0);
          return sum + (Number.isFinite(a) ? Math.round(a * 100) : 0);
        }, 0);
        const splitSum = splitSumCents / 100;
        const totalCents = Math.round(amount * 100);

        if (Math.abs(splitSumCents - totalCents) > 1) {
          errors.push(`Payment split total ($${splitSum.toFixed(2)}) does not match booking total amount ($${amount.toFixed(2)}).`);
        }
      }
    }

    // 4. DOMAIN: AUTHORIZATION STATUS
    if (requireAuthorization) {
      const authStatus = booking.authorization_status || booking.authorization?.status;
      if (authStatus !== 'AUTHORIZED' && authStatus !== 'ACCEPTED' && authStatus !== 'accepted') {
        errors.push(`Passenger authorization is pending for booking ${confirmationCode || booking.id}. Status is '${authStatus || 'PENDING'}'.`);
      }
    }

    // 5. DOMAIN: TICKET DETAILS
    if (requirePnr || requireTicket) {
      const pnr = (booking.airline_confirmation_number || booking.airlineConfirmationNumber || booking.airline_pnr || booking.pnr || '').trim();
      if (!pnr || !/^[A-Z0-9]{6}$/i.test(pnr)) {
        errors.push(`Booking ${confirmationCode || booking.id} requires a valid 6-character airline PNR.`);
      }

      if (requireTicket) {
        const ticketNum = (booking.ticket_number || booking.ticketNumber || '').trim();
        if (!ticketNum) {
          errors.push(`Booking ${confirmationCode || booking.id} requires a valid airline ticket number.`);
        }
      }
    }

    const isValid = errors.length === 0;
    const firstReason = isValid ? null : errors[0];

    if (!isValid && throwOnError) {
      const err = new Error(firstReason);
      err.code = errors.some(e => e.includes('ITINERARY_MISSING') || e.includes('flight itinerary'))
        ? 'BOOKING_ITINERARY_MISSING'
        : (errors.some(e => e.includes('PNR')) ? 'INVALID_AIRLINE_PNR' : 'BOOKING_DATA_INCOMPLETE');
      err.errors = errors;
      throw err;
    }

    return {
      valid: isValid,
      reason: firstReason,
      errors,
      code: isValid ? null : 'BOOKING_DATA_INCOMPLETE',
      booking
    };
  },

  /**
   * Enforces complete booking transactional validation prior to returning success.
   */
  validateCompletedBooking: async (bookingId) => {
    const completeBooking = await bookingRepository.getCompleteBookingById(bookingId);
    if (!completeBooking) {
      const err = new Error(`BOOKING_CREATION_INCOMPLETE: Booking record '${bookingId}' was not found in database.`);
      err.code = 'BOOKING_CREATION_INCOMPLETE';
      throw err;
    }

    const confCode = completeBooking.confirmation_code || completeBooking.confirmationCode;
    if (!confCode) {
      const err = new Error(`BOOKING_CREATION_INCOMPLETE: Booking '${bookingId}' is missing a valid confirmation code.`);
      err.code = 'BOOKING_CREATION_INCOMPLETE';
      throw err;
    }

    const totalAmt = parseFloat(completeBooking.customer_price ?? completeBooking.total_amount ?? 0);
    if (isNaN(totalAmt) || totalAmt <= 0) {
      const err = new Error(`BOOKING_CREATION_INCOMPLETE: Reservation total amount must be greater than zero. Received: $${totalAmt}`);
      err.code = 'BOOKING_CREATION_INCOMPLETE';
      throw err;
    }

    const currency = completeBooking.currency;
    if (!currency) {
      const err = new Error(`BOOKING_CREATION_INCOMPLETE: Currency is missing for booking '${confCode}'.`);
      err.code = 'BOOKING_CREATION_INCOMPLETE';
      throw err;
    }

    const flights = completeBooking.flights || [];
    const segments = completeBooking.itinerary_segments || [];
    const allSegments = flights.length > 0 ? flights : segments;

    if (allSegments.length === 0) {
      const err = new Error(`BOOKING_CREATION_INCOMPLETE: Reservation '${confCode}' has zero valid flight itinerary segments in database.`);
      err.code = 'BOOKING_CREATION_INCOMPLETE';
      throw err;
    }

    for (let idx = 0; idx < allSegments.length; idx++) {
      const seg = allSegments[idx];
      const airline = seg.airline_name || seg.carrier_name || seg.airline || seg.carrier_code;
      const flightNum = seg.flight_number || seg.flightNumber;
      const orig = seg.departure_airport || seg.origin_airport || seg.originCode;
      const dest = seg.arrival_airport || seg.destination_airport || seg.destinationCode;
      const depDate = seg.departure_date || seg.departureDate;

      if (!airline || !flightNum || !orig || !dest || !depDate) {
        const err = new Error(`BOOKING_CREATION_INCOMPLETE: Flight segment #${idx + 1} for '${confCode}' is missing required route or date fields.`);
        err.code = 'BOOKING_CREATION_INCOMPLETE';
        throw err;
      }
    }

    const travellers = completeBooking.travellers || [];
    if (travellers.length === 0 && !completeBooking.passenger_name) {
      const err = new Error(`BOOKING_CREATION_INCOMPLETE: Passenger details are missing for booking '${confCode}'.`);
      err.code = 'BOOKING_CREATION_INCOMPLETE';
      throw err;
    }

    const email = completeBooking.email;
    if (!email || !email.includes('@')) {
      const err = new Error(`BOOKING_CREATION_INCOMPLETE: Contact email is missing or invalid for booking '${confCode}'.`);
      err.code = 'BOOKING_CREATION_INCOMPLETE';
      throw err;
    }

    return {
      valid: true,
      booking: completeBooking
    };
  },

  /**
   * Integrity Check 1: Verify booking has flight itinerary records attached
   */
  checkBookingWithoutFlights: async (bookingOrId) => {
    let booking = typeof bookingOrId === 'object' ? bookingOrId : null;
    const bookingId = typeof bookingOrId === 'string' ? bookingOrId : (booking?.id || booking?.booking_id);

    if (!booking && bookingId) {
      booking = await bookingRepository.getCompleteBookingById(bookingId);
    }

    if (!booking) {
      return { valid: false, issue: 'BOOKING_NOT_FOUND', details: `Booking '${bookingId}' does not exist.` };
    }

    let segments = [];
    if (Array.isArray(booking.itinerary_segments) && booking.itinerary_segments.length > 0) {
      segments = booking.itinerary_segments;
    } else if (Array.isArray(booking.outbound_segments) && booking.outbound_segments.length > 0) {
      segments = booking.outbound_segments;
    } else if (Array.isArray(booking.flights) && booking.flights.length > 0) {
      segments = booking.flights;
    } else {
      if (booking.itinerary?.outbound) segments.push(booking.itinerary.outbound);
      if (booking.itinerary?.return) segments.push(booking.itinerary.return);
      if (booking.flight) segments.push(booking.flight);
      if (booking.returnFlight) segments.push(booking.returnFlight);
    }

    const validSegments = segments.filter(s => {
      if (!s) return false;
      const hasOrigin = s.origin_airport || s.originCode || s.departure_airport || s.origin || s.origin_code || s.departure?.airport || s.departure?.code;
      const hasDest = s.destination_airport || s.destinationCode || s.arrival_airport || s.destination || s.destination_code || s.arrival?.airport || s.arrival?.code;
      return !!(hasOrigin && hasDest);
    });

    if (validSegments.length === 0) {
      return {
        valid: false,
        issue: 'BOOKING_WITHOUT_FLIGHTS',
        bookingId: booking.id,
        confirmationCode: booking.confirmation_code,
        details: `Booking ${booking.confirmation_code || booking.id} exists but has ZERO flight itinerary records.`
      };
    }

    return { valid: true, bookingId: booking.id, segmentCount: validSegments.length };
  },

  /**
   * Integrity Check 2: Verify payment record is linked to a valid booking
   */
  checkPaymentWithoutBooking: async (paymentRecord, existingBookingIds = null) => {
    const bookingId = paymentRecord?.booking_id || paymentRecord?.bookingId;
    if (!bookingId) {
      return {
        valid: false,
        issue: 'PAYMENT_WITHOUT_BOOKING',
        paymentId: paymentRecord?.id || 'UNKNOWN',
        details: 'Payment record has missing or null booking_id.'
      };
    }

    if (existingBookingIds && existingBookingIds.has(bookingId)) {
      return { valid: true, paymentId: paymentRecord.id, bookingId };
    }

    const booking = await bookingRepository.getById(bookingId);
    if (!booking) {
      return {
        valid: false,
        issue: 'PAYMENT_WITHOUT_BOOKING',
        paymentId: paymentRecord.id,
        bookingId,
        details: `Payment ${paymentRecord.id} refers to non-existent booking_id '${bookingId}'.`
      };
    }

    return { valid: true, paymentId: paymentRecord.id, bookingId };
  },

  /**
   * Integrity Check 3: Verify authorization record is linked to a valid booking
   */
  checkAuthorizationWithoutBooking: async (authRecord, existingBookingIds = null) => {
    const bookingId = authRecord?.booking_id || authRecord?.bookingId;
    if (!bookingId) {
      return {
        valid: false,
        issue: 'AUTHORIZATION_WITHOUT_BOOKING',
        authId: authRecord?.id || authRecord?.token || 'UNKNOWN',
        details: 'Passenger authorization record has missing or null booking_id.'
      };
    }

    if (existingBookingIds && existingBookingIds.has(bookingId)) {
      return { valid: true, authId: authRecord.id || authRecord.token, bookingId };
    }

    const booking = await bookingRepository.getById(bookingId);
    if (!booking) {
      return {
        valid: false,
        issue: 'AUTHORIZATION_WITHOUT_BOOKING',
        authId: authRecord.id || authRecord.token,
        bookingId,
        details: `Passenger authorization refers to non-existent booking_id '${bookingId}'.`
      };
    }

    return { valid: true, authId: authRecord.id || authRecord.token, bookingId };
  },

  /**
   * Integrity Check 4: Verify ticket detail record is linked to a valid booking
   */
  checkTicketWithoutBooking: async (ticketRecord, existingBookingIds = null) => {
    const bookingId = ticketRecord?.booking_id || ticketRecord?.bookingId;
    if (!bookingId) {
      return {
        valid: false,
        issue: 'TICKET_WITHOUT_BOOKING',
        ticketId: ticketRecord?.id || 'UNKNOWN',
        details: 'Airline ticket record has missing or null booking_id.'
      };
    }

    if (existingBookingIds && existingBookingIds.has(bookingId)) {
      return { valid: true, ticketId: ticketRecord.id, bookingId };
    }

    const booking = await bookingRepository.getById(bookingId);
    if (!booking) {
      return {
        valid: false,
        issue: 'TICKET_WITHOUT_BOOKING',
        ticketId: ticketRecord.id,
        bookingId,
        details: `Airline ticket detail refers to non-existent booking_id '${bookingId}'.`
      };
    }

    return { valid: true, ticketId: ticketRecord.id, bookingId };
  },

  /**
   * Full Database Relational Integrity Audit
   */
  runRelationalIntegrityAudit: async (options = {}) => {
    const { bookings = [], payments = [], authorizations = [], tickets = [] } = options;
    const issues = [];

    const bookingIdsSet = new Set(bookings.map(b => b.id));

    // 1. Check bookings without flights
    for (const b of bookings) {
      const check = await bookingValidatorService.checkBookingWithoutFlights(b);
      if (!check.valid) issues.push(check);
    }

    // 2. Check payments without bookings
    for (const p of payments) {
      const check = await bookingValidatorService.checkPaymentWithoutBooking(p, bookingIdsSet);
      if (!check.valid) issues.push(check);
    }

    // 3. Check authorizations without bookings
    for (const a of authorizations) {
      const check = await bookingValidatorService.checkAuthorizationWithoutBooking(a, bookingIdsSet);
      if (!check.valid) issues.push(check);
    }

    // 4. Check tickets without bookings
    for (const t of tickets) {
      const check = await bookingValidatorService.checkTicketWithoutBooking(t, bookingIdsSet);
      if (!check.valid) issues.push(check);
    }

    return {
      clean: issues.length === 0,
      totalAudited: {
        bookings: bookings.length,
        payments: payments.length,
        authorizations: authorizations.length,
        tickets: tickets.length
      },
      issueCount: issues.length,
      issues
    };
  }
};

export default bookingValidatorService;
