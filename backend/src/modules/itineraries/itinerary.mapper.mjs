import { getAirlineName, resolveAirlineName } from '../../shared/utils/airline-lookup.mjs';

function clean(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function inferCarrierCode(flight = {}) {
  const explicit = clean(
    flight.carrier_code || flight.carrierCode || flight.marketing_carrier_code ||
    flight.airline_code || flight.airlineCode || flight.iataCode
  ).toUpperCase();
  if (explicit) return explicit;

  const designator = clean(flight.flight_number || flight.flightNumber || flight.flightNo || flight.flight_no).toUpperCase().replace(/\s+/g, '');
  const match = designator.match(/^([A-Z0-9]{2})(?=\d{1,4}[A-Z]?$)/);
  return match?.[1] || '';
}

function stripCarrierFromFlightNumber(value, carrierCode) {
  const raw = clean(value);
  if (!carrierCode) return raw;
  return raw.replace(new RegExp(`^${carrierCode}\\s*`, 'i'), '').trim() || raw;
}

export const itineraryMapper = {
  toDatabaseRows: (bookingId, flight, leg, tripType) => {
    if (!flight) return [];

    const carrierCode = inferCarrierCode(flight);
    const providedAirline = clean(
      flight.airline_name || flight.airlineName || flight.airline ||
      flight.carrier_name || flight.carrierName
    );
    const airlineName = resolveAirlineName(carrierCode, providedAirline) || getAirlineName(carrierCode) || 'Airline details pending';

    const rawFlightNumber = clean(
      flight.flight_number || flight.flightNumber || flight.flightNo || flight.flight_no
    );
    const flightNumber = stripCarrierFromFlightNumber(rawFlightNumber, carrierCode) || 'N/A';

    const depAirport = clean(
      flight.departure?.airport || flight.departureAirport || flight.origin_airport ||
      flight.originCode || flight.origin_code ||
      (typeof flight.origin === 'object' ? flight.origin.code : flight.origin) ||
      flight.from || flight.fromCode
    ).toUpperCase();

    const arrAirport = clean(
      flight.arrival?.airport || flight.arrivalAirport || flight.destination_airport ||
      flight.destinationCode || flight.destination_code ||
      (typeof flight.destination === 'object' ? flight.destination.code : flight.destination) ||
      flight.to || flight.toCode
    ).toUpperCase();

    const depDate = clean(
      flight.departure?.date || flight.departureDate || flight.departure_date || flight.date
    );
    const arrDate = clean(
      flight.arrival?.date || flight.arrivalDate || flight.arrival_date || depDate
    );
    const depTimeStr = clean(
      flight.departure?.time || flight.departureTime || flight.departure_time_str || flight.departure_time
    );
    const arrTimeStr = clean(
      flight.arrival?.time || flight.arrivalTime || flight.arrival_time_str || flight.arrival_time
    );

    if (!depAirport || !arrAirport) {
      const err = new Error(`ITINERARY_NORMALIZATION_FAILED: Flight '${airlineName} ${carrierCode} ${flightNumber}' is missing departure or arrival airport codes (dep: '${depAirport}', arr: '${arrAirport}').`);
      err.code = 'ITINERARY_NORMALIZATION_FAILED';
      throw err;
    }

    const row = {
      booking_id: bookingId,
      leg,
      trip_type: tripType,
      airline_name: airlineName,
      carrier_code: carrierCode || null,
      flight_number: flightNumber,
      departure_airport: depAirport,
      arrival_airport: arrAirport,
      departure_date: depDate,
      arrival_date: arrDate,
      departure_time_str: depTimeStr,
      arrival_time_str: arrTimeStr,
      duration: flight.duration || null,
      stops: typeof flight.stops === 'number' ? flight.stops : 0,
      cabin_class: flight.class || flight.cabinClass || flight.cabin_class || 'Economy',
      fare_details: flight.price || flight.fareDetails || null,
    };

    if (flight.segments) {
      row.fare_details = { ...(row.fare_details || {}), segments: flight.segments };
    }

    return [row];
  },

  toDomainModel: (flightsList) => {
    const outbound = flightsList.find(f => f.leg === 'outbound');
    const returnFlt = flightsList.find(f => f.leg === 'return');

    const buildLeg = legRow => {
      if (!legRow) return null;
      return {
        airline: resolveAirlineName(legRow.carrier_code, legRow.airline_name) || 'Airline details pending',
        airlineName: resolveAirlineName(legRow.carrier_code, legRow.airline_name) || 'Airline details pending',
        carrierCode: legRow.carrier_code || '',
        flightNumber: legRow.flight_number,
        departure: {
          airport: legRow.departure_airport,
          date: legRow.departure_date,
          time: legRow.departure_time_str,
        },
        arrival: {
          airport: legRow.arrival_airport,
          date: legRow.arrival_date,
          time: legRow.arrival_time_str,
        },
        class: legRow.cabin_class,
        stops: legRow.stops,
        price: legRow.fare_details,
        segments: legRow.fare_details?.segments || null
      };
    };

    const outboundModel = buildLeg(outbound);
    if (!outboundModel) return null;
    return { ...outboundModel, returnFlight: buildLeg(returnFlt) };
  }
};

export default itineraryMapper;
