export const ITINERARY_TYPES = Object.freeze({
  ONE_WAY: 'ONE_WAY',
  ROUND_TRIP: 'ROUND_TRIP',
  MULTI_CITY: 'MULTI_CITY'
});

export const normalizeItineraryType = value => {
  const raw = String(value || '').trim().toUpperCase().replace(/[-\s]+/g, '_');
  if (raw === 'ROUND_TRIP' || raw === 'ROUNDTRIP') return ITINERARY_TYPES.ROUND_TRIP;
  if (raw === 'MULTI_CITY' || raw === 'MULTICITY') return ITINERARY_TYPES.MULTI_CITY;
  return ITINERARY_TYPES.ONE_WAY;
};

export const itineraryTypeLabel = value => {
  const type = normalizeItineraryType(value);
  if (type === ITINERARY_TYPES.ROUND_TRIP) return 'Round Trip';
  if (type === ITINERARY_TYPES.MULTI_CITY) return 'Multi-City';
  return 'One Way';
};

const rawDirection = segment => String(segment?.journey_role || segment?.journeyRole || segment?.journey_direction || segment?.direction || segment?.leg || '').trim().toUpperCase();

export const inferLegacyItineraryType = (booking, segments = []) => {
  const explicit = booking?.itinerary_type || booking?.itineraryType || segments.find(Boolean)?.trip_type || segments.find(Boolean)?.tripType;
  if (explicit) return normalizeItineraryType(explicit);
  const hasReturn = segments.some(segment => ['RETURN', 'INBOUND'].includes(rawDirection(segment)));
  return hasReturn ? ITINERARY_TYPES.ROUND_TRIP : ITINERARY_TYPES.ONE_WAY;
};

export const canonicalizeSegments = (segments = [], itineraryType) => {
  const type = normalizeItineraryType(itineraryType);
  const counters = new Map();

  return (segments || []).map((segment, index) => {
    let journeyIndex = Number(segment?.journey_index || segment?.journeyIndex || 0);
    let journeyRole = rawDirection(segment);

    if (type === ITINERARY_TYPES.ONE_WAY) {
      journeyIndex = 1;
      journeyRole = 'OUTBOUND';
    } else if (type === ITINERARY_TYPES.ROUND_TRIP) {
      const isReturn = ['RETURN', 'INBOUND'].includes(journeyRole);
      journeyIndex = isReturn ? 2 : 1;
      journeyRole = isReturn ? 'RETURN' : 'OUTBOUND';
    } else {
      journeyIndex = journeyIndex > 0 ? journeyIndex : 1;
      journeyRole = 'TRIP';
    }

    const nextSequence = (counters.get(journeyIndex) || 0) + 1;
    counters.set(journeyIndex, nextSequence);
    const direction = type === ITINERARY_TYPES.MULTI_CITY ? 'multi_city' : (journeyRole === 'RETURN' ? 'return' : 'outbound');

    return {
      ...segment,
      itinerary_type: type,
      trip_type: type,
      journey_index: journeyIndex,
      journeyIndex,
      journey_role: journeyRole,
      journeyRole,
      journey_direction: direction,
      direction,
      segment_sequence: nextSequence,
      segment_order: index + 1
    };
  });
};

export const groupSegmentsIntoJourneys = (segments = [], itineraryType) => {
  const type = normalizeItineraryType(itineraryType);
  const canonical = canonicalizeSegments(segments, type);
  const groups = new Map();

  canonical.forEach(segment => {
    const key = Number(segment.journey_index || 1);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(segment);
  });

  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([journeyIndex, journeySegments]) => {
      const role = type === ITINERARY_TYPES.MULTI_CITY
        ? 'TRIP'
        : (journeyIndex === 2 && type === ITINERARY_TYPES.ROUND_TRIP ? 'RETURN' : 'OUTBOUND');
      const label = type === ITINERARY_TYPES.MULTI_CITY
        ? `Trip ${journeyIndex}`
        : (role === 'RETURN' ? 'Return' : (type === ITINERARY_TYPES.ONE_WAY ? 'One Way' : 'Outbound'));
      return {
        journeyIndex,
        role,
        label,
        segments: journeySegments.sort((a, b) => Number(a.segment_sequence || 0) - Number(b.segment_sequence || 0))
      };
    });
};

export const validateJourneyContinuity = (segments = [], itineraryType) => {
  const journeys = groupSegmentsIntoJourneys(segments, itineraryType);
  for (const journey of journeys) {
    for (let i = 0; i < journey.segments.length - 1; i += 1) {
      const current = journey.segments[i];
      const next = journey.segments[i + 1];
      const destination = String(current.destination_airport || current.destinationAirport || current.arrivalAirport || '').trim().toUpperCase();
      const nextOrigin = String(next.origin_airport || next.originAirport || next.departureAirport || '').trim().toUpperCase();
      if (destination && nextOrigin && destination !== nextOrigin) {
        return {
          valid: false,
          journeyIndex: journey.journeyIndex,
          message: `${journey.label}: segment ${i + 1} ends at ${destination}, but segment ${i + 2} starts at ${nextOrigin}. Keep connecting flights in the same trip only when the airports connect.`
        };
      }
    }
  }
  return { valid: true, message: '' };
};
