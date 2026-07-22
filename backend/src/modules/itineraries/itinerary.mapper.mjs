export const itineraryMapper = {
  toDatabaseRows: (bookingId, flight, leg, tripType) => {
    if (!flight) return [];
    
    // Check if the flight has connecting segments (nested stops/segments)
    // If we support multiple connecting segments, we map them.
    // For now, we write a flat row matching the schema, with support for JSONB fare/segments details.
    const row = {
      booking_id: bookingId,
      leg,
      trip_type: tripType,
      airline_name: flight.airline || flight.airlineName || null,
      flight_number: flight.flightNumber || flight.flight_number || null,
      departure_airport: flight.departure?.airport || flight.departureAirport || null,
      arrival_airport: flight.arrival?.airport || flight.arrivalAirport || null,
      departure_date: flight.departure?.date || flight.departureDate || null,
      arrival_date: flight.arrival?.date || flight.arrivalDate || null,
      departure_time_str: flight.departure?.time || flight.departureTime || null,
      arrival_time_str: flight.arrival?.time || flight.arrivalTime || null,
      duration: flight.duration || null,
      stops: typeof flight.stops === 'number' ? flight.stops : 0,
      cabin_class: flight.class || flight.cabinClass || 'Economy',
      fare_details: flight.price || flight.fareDetails || null,
    };

    // If there are sub-segments (e.g. connections), we store them in fare_details / segments property
    if (flight.segments) {
      row.fare_details = {
        ...row.fare_details,
        segments: flight.segments
      };
    }

    return [row];
  },

  toDomainModel: (flightsList) => {
    const outbound = flightsList.find(f => f.leg === 'outbound');
    const returnFlt = flightsList.find(f => f.leg === 'return');
    
    const buildLeg = (legRow) => {
      if (!legRow) return null;
      return {
        airline: legRow.airline_name,
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

    return {
      ...outboundModel,
      returnFlight: buildLeg(returnFlt)
    };
  }
};

export default itineraryMapper;
