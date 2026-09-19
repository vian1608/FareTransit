from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'{label}: target not found')
    return text.replace(old, new, 1)

p = Path('backend/src/shared/utils/airline-lookup.mjs')
s = p.read_text()

# Add canonical journey metadata to each normalized presentation segment.
s = replace_once(
    s,
    "function normalizeSegment(s, idx, totalInDir, bookingContext = {}) {",
    "function normalizeSegment(s, idx, totalInDir, bookingContext = {}, journeyIndex = 1, journeyRole = 'OUTBOUND', itineraryType = 'ONE_WAY') {",
    'normalizeSegment signature',
)
s = replace_once(
    s,
    "    sequence: s.segment_sequence !== undefined ? Number.parseInt(s.segment_sequence, 10) : idx + 1,\n    airlineName,",
    "    sequence: s.segment_sequence !== undefined ? Number.parseInt(s.segment_sequence, 10) : idx + 1,\n    journeyIndex: Number(s.journey_index || s.journeyIndex || journeyIndex || 1),\n    journeyRole: String(s.journey_role || s.journeyRole || journeyRole || 'OUTBOUND').toUpperCase(),\n    itineraryType,\n    airlineName,",
    'normalized journey metadata',
)

start = s.find('export function buildCanonicalItinerary(bookingOrSegments) {')
end = s.find('\n\nfunction passengerRowsHtml', start)
if start < 0 or end < 0:
    raise SystemExit('buildCanonicalItinerary block not found')
new_build = r'''function normalizeCanonicalItineraryType(value, rawSegments = []) {
  const raw = String(value || '').trim().toUpperCase().replace(/[-\s]+/g, '_');
  if (raw === 'MULTI_CITY' || raw === 'MULTICITY') return 'MULTI_CITY';
  if (raw === 'ROUND_TRIP' || raw === 'ROUNDTRIP') return 'ROUND_TRIP';
  if (raw === 'ONE_WAY' || raw === 'ONEWAY') return 'ONE_WAY';
  const hasReturn = rawSegments.some(segment => ['return', 'inbound'].includes(String(segment?.journey_role || segment?.journey_direction || segment?.direction || segment?.leg || '').toLowerCase()));
  return hasReturn ? 'ROUND_TRIP' : 'ONE_WAY';
}

export function buildCanonicalItinerary(bookingOrSegments) {
  const bookingContext = (!Array.isArray(bookingOrSegments) && bookingOrSegments && typeof bookingOrSegments === 'object') ? bookingOrSegments : {};
  const rawSegments = extractRawSegments(bookingOrSegments).filter(s => {
    if (!s || typeof s !== 'object') return false;
    return Boolean(s.origin_airport || s.origin_code || s.originCode || s.origin || s.departure?.airport || s.departure_airport || s.destination_airport || s.destination_code || s.destinationCode || s.destination || s.arrival?.airport || s.arrival_airport || s.flight_number || s.flightNumber || s.carrier_code || s.airline_name || s.airline);
  });

  const explicitType = bookingContext.itinerary_type || bookingContext.itineraryType || rawSegments.find(Boolean)?.trip_type || rawSegments.find(Boolean)?.itinerary_type;
  const tripType = normalizeCanonicalItineraryType(explicitType, rawSegments);
  let journeys = [];
  let outbound = [];
  let returnSegments = [];

  if (tripType === 'MULTI_CITY') {
    const grouped = new Map();
    rawSegments.forEach(segment => {
      const journeyIndex = Math.max(1, Number(segment.journey_index || segment.journeyIndex || 1));
      if (!grouped.has(journeyIndex)) grouped.set(journeyIndex, []);
      grouped.get(journeyIndex).push(segment);
    });
    journeys = [...grouped.entries()].sort(([a], [b]) => a - b).map(([journeyIndex, group]) => {
      group.sort((a, b) => Number(a.segment_sequence || a.sequence || 0) - Number(b.segment_sequence || b.sequence || 0));
      const segments = group.map((segment, index) => normalizeSegment(segment, index, group.length, bookingContext, journeyIndex, 'TRIP', tripType));
      return { journeyIndex, role: 'TRIP', label: `Trip ${journeyIndex}`, segments };
    });
    outbound = journeys.flatMap(journey => journey.segments);
  } else if (tripType === 'ROUND_TRIP') {
    const isReturn = segment => ['return', 'inbound'].includes(String(segment.journey_role || segment.journey_direction || segment.direction || segment.leg || '').toLowerCase());
    const outboundRaw = rawSegments.filter(segment => !isReturn(segment));
    const returnRaw = rawSegments.filter(isReturn);
    outbound = outboundRaw.map((segment, index) => normalizeSegment(segment, index, outboundRaw.length, bookingContext, 1, 'OUTBOUND', tripType));
    returnSegments = returnRaw.map((segment, index) => normalizeSegment(segment, index, returnRaw.length, bookingContext, 2, 'RETURN', tripType));
    if (outbound.length) journeys.push({ journeyIndex: 1, role: 'OUTBOUND', label: 'Outbound', segments: outbound });
    if (returnSegments.length) journeys.push({ journeyIndex: 2, role: 'RETURN', label: 'Return', segments: returnSegments });
  } else {
    outbound = rawSegments.map((segment, index) => normalizeSegment(segment, index, rawSegments.length, bookingContext, 1, 'OUTBOUND', tripType));
    if (outbound.length) journeys = [{ journeyIndex: 1, role: 'OUTBOUND', label: 'One Way', segments: outbound }];
  }

  const itinerary = { tripType, journeys, outbound, return: returnSegments };
  rememberPresentation(bookingContext, itinerary);
  return itinerary;
}'''
s = s[:start] + new_build + s[end:]

old_helper = """    const data = presentationCache.get(String(confirmationCode || '').trim());
    const itinerary = data?.itinerary || { outbound: [], return: [] };
    if (!itinerary.outbound.length && !itinerary.return.length) {
      return new Handlebars.SafeString('<div style=\"padding:12px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;color:#64748b;font-size:13px;\">No saved flight itinerary segments were found for this booking.</div>');
    }
    return new Handlebars.SafeString(`${renderItineraryGroupHtml('Outbound Journey', itinerary.outbound)}${renderItineraryGroupHtml('Return Journey', itinerary.return)}`);"""
new_helper = """    const data = presentationCache.get(String(confirmationCode || '').trim());
    const itinerary = data?.itinerary || { tripType: 'ONE_WAY', journeys: [], outbound: [], return: [] };
    const journeys = Array.isArray(itinerary.journeys) && itinerary.journeys.length
      ? itinerary.journeys
      : [
          ...(itinerary.outbound?.length ? [{ label: itinerary.return?.length ? 'Outbound' : 'One Way', segments: itinerary.outbound }] : []),
          ...(itinerary.return?.length ? [{ label: 'Return', segments: itinerary.return }] : [])
        ];
    if (!journeys.length) {
      return new Handlebars.SafeString('<div style=\"padding:12px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;color:#64748b;font-size:13px;\">No saved flight itinerary segments were found for this booking.</div>');
    }
    return new Handlebars.SafeString(journeys.map(journey => renderItineraryGroupHtml(journey.label, journey.segments || [])).join(''));"""
s = replace_once(s, old_helper, new_helper, 'Handlebars itinerary helper')

start = s.find('export function calculateTripSummary(bookingOrItinerary) {')
end = s.find('\n\nexport function getArrivalDayShiftLabel', start)
if start < 0 or end < 0:
    raise SystemExit('calculateTripSummary block not found')
new_summary = r'''export function calculateTripSummary(bookingOrItinerary) {
  const itinerary = buildCanonicalItinerary(bookingOrItinerary);
  const outbound = itinerary.outbound || [];
  const returnSegs = itinerary.return || [];
  const journeys = itinerary.journeys || [];
  const canonicalType = itinerary.tripType || 'ONE_WAY';
  const tripType = canonicalType === 'MULTI_CITY' ? 'Multi-City' : (canonicalType === 'ROUND_TRIP' ? 'Round Trip' : 'One Way');
  const isRoundTrip = canonicalType === 'ROUND_TRIP';
  const isOpenJaw = false;

  let stopsSummary = '';
  if (canonicalType === 'MULTI_CITY') {
    const flightCount = journeys.reduce((sum, journey) => sum + (journey.segments?.length || 0), 0);
    const connections = journeys.reduce((sum, journey) => sum + Math.max(0, (journey.segments?.length || 0) - 1), 0);
    stopsSummary = `${journeys.length} trip${journeys.length === 1 ? '' : 's'} · ${flightCount} flight${flightCount === 1 ? '' : 's'}${connections ? ` · ${connections} connection${connections === 1 ? '' : 's'}` : ''}`;
  } else if (canonicalType === 'ROUND_TRIP') {
    const outboundStops = Math.max(0, outbound.length - 1);
    const returnStops = Math.max(0, returnSegs.length - 1);
    if (!outboundStops && !returnStops) stopsSummary = 'Nonstop both ways';
    else stopsSummary = `${outboundStops ? `${outboundStops} stop${outboundStops > 1 ? 's' : ''} outbound` : 'Nonstop outbound'} · ${returnStops ? `${returnStops} stop${returnStops > 1 ? 's' : ''} return` : 'Nonstop return'}`;
  } else {
    const outboundStops = Math.max(0, outbound.length - 1);
    stopsSummary = outboundStops === 0 ? 'Nonstop' : `${outbound.length} flights · ${outboundStops} connection${outboundStops > 1 ? 's' : ''}`;
  }

  let routeSummary = '';
  if (canonicalType === 'MULTI_CITY') {
    routeSummary = journeys.map(journey => {
      const segments = journey.segments || [];
      return segments.length ? `${segments[0].originCode} → ${segments[segments.length - 1].destinationCode}` : '';
    }).filter(Boolean).join(' · ');
  } else if (outbound.length) {
    const outAirports = [outbound[0].originCode, ...outbound.map(segment => segment.destinationCode)].filter(Boolean);
    routeSummary = outAirports.join(' → ');
    if (returnSegs.length) routeSummary += ` → ${returnSegs.map(segment => segment.destinationCode).filter(Boolean).join(' → ')}`;
  }

  let passengerCount = 1;
  if (bookingOrItinerary && typeof bookingOrItinerary === 'object') {
    if (Array.isArray(bookingOrItinerary.travellers) && bookingOrItinerary.travellers.length) passengerCount = bookingOrItinerary.travellers.length;
    else passengerCount = Number.parseInt(bookingOrItinerary.passenger_count || bookingOrItinerary.passengerCount || 1, 10) || 1;
  }
  const pnr = String(bookingOrItinerary?.airline_confirmation_number || bookingOrItinerary?.airlineConfirmationNumber || bookingOrItinerary?.airline_pnr || bookingOrItinerary?.pnr || '').trim().toUpperCase();
  const isTicketed = /^[A-Z0-9]{6}$/.test(pnr);
  return { tripType, canonicalTripType: canonicalType, routeSummary, stopsSummary, bannerText: `${tripType} · ${stopsSummary}`, passengerCount, passengerText: `${passengerCount} Passenger${passengerCount > 1 ? 's' : ''}`, isRoundTrip, isOpenJaw, isTicketed, pnr: isTicketed ? pnr : null };
}'''
s = s[:start] + new_summary + s[end:]

p.write_text(s)
