from pathlib import Path

repo_path = Path('backend/src/modules/bookings/booking.repository.mjs')
repo = repo_path.read_text()
anchor = repo.find('  saveItinerarySegments: async')
if anchor < 0:
    raise SystemExit('saveItinerarySegments anchor not found')
target = '          leg: dir,\n          direction: dir,'
pos = repo.find(target, anchor)
if pos < 0:
    raise SystemExit('normalized itinerary leg field target not found')
repo = repo[:pos] + '          direction: dir,' + repo[pos + len(target):]

flights_anchor = repo.find('  _persistToFlightsTable: async', anchor)
carrier_target = "        airline_name: seg.carrier_name || seg.airline_name || '',\n        flight_number: seg.flight_number || '',"
carrier_repl = "        airline_name: seg.carrier_name || seg.airline_name || '',\n        carrier_code: seg.carrier_code || seg.marketing_carrier_code || '',\n        flight_number: seg.flight_number || '',"
carrier_pos = repo.find(carrier_target, flights_anchor)
if carrier_pos < 0:
    raise SystemExit('legacy flights carrier target not found')
repo = repo[:carrier_pos] + carrier_repl + repo[carrier_pos + len(carrier_target):]
repo_path.write_text(repo)

repair_path = Path('backend/src/modules/admin/admin.repair.controller.mjs')
repair = repair_path.read_text()
old_verify = '''async function getPersistedSegments(bookingId) {
  const result = await withTimeout(
    supabase
      .from('booking_itinerary_segments')
      .select('*')
      .eq('booking_id', bookingId)
      .order('segment_order', { ascending: true }),
    5000,
    'verify itinerary persistence'
  );

  if (result?.error) {
    throw new Error(result.error.message);
  }

  return result?.data || [];
}
'''
new_verify = '''async function getPersistedSegments(bookingId) {
  const normalized = await withTimeout(
    supabase
      .from('booking_itinerary_segments')
      .select('*')
      .eq('booking_id', bookingId)
      .order('segment_order', { ascending: true }),
    5000,
    'verify normalized itinerary persistence'
  );

  if (!normalized?.error && Array.isArray(normalized?.data) && normalized.data.length > 0) {
    return normalized.data;
  }

  // saveItinerarySegments intentionally falls back to the production `flights`
  // table if the normalized table is unavailable. Verification must recognize
  // that durable fallback, otherwise a successful multi-segment save is falsely
  // reported as ITINERARY_PERSISTENCE_MISMATCH.
  const fallback = await withTimeout(
    supabase
      .from('flights')
      .select('*')
      .eq('booking_id', bookingId)
      .order('departure_date', { ascending: true })
      .order('departure_time_str', { ascending: true }),
    5000,
    'verify legacy itinerary persistence'
  );

  if (fallback?.error) {
    const primaryMessage = normalized?.error?.message ? ` Normalized store: ${normalized.error.message}.` : '';
    throw new Error(`Unable to verify itinerary persistence.${primaryMessage} Legacy store: ${fallback.error.message}`);
  }

  return (fallback?.data || []).map((flight, index) => ({
    id: flight.id,
    booking_id: flight.booking_id,
    journey_direction: ['return', 'inbound'].includes(String(flight.leg || '').toLowerCase()) ? 'return' : 'outbound',
    direction: ['return', 'inbound'].includes(String(flight.leg || '').toLowerCase()) ? 'return' : 'outbound',
    segment_sequence: index + 1,
    segment_order: index + 1,
    carrier_name: flight.airline_name || '',
    carrier_code: flight.carrier_code || '',
    marketing_carrier_code: flight.carrier_code || '',
    flight_number: flight.flight_number || '',
    origin_airport: flight.departure_airport || '',
    destination_airport: flight.arrival_airport || '',
    departure_date: flight.departure_date || '',
    departure_time: flight.departure_time_str || '',
    arrival_date: flight.arrival_date || '',
    arrival_time: flight.arrival_time_str || '',
    cabin: flight.cabin_class || 'Economy',
    stop_count: Number.parseInt(flight.stops || 0, 10)
  }));
}
'''
if old_verify not in repair:
    raise SystemExit('getPersistedSegments block not found')
repair = repair.replace(old_verify, new_verify, 1)
repair_path.write_text(repair)

modal_path = Path('frontend/src/shared/components/admin/AdminItineraryImportModal.js')
modal = modal_path.read_text()
old_airports = '''          originAirport: parsed.origin_airport || parsed.originAirport || '',
          destinationAirport: parsed.destination_airport || parsed.destinationAirport || '',
          origin_airport: parsed.origin_airport || parsed.originAirport || '',
          destination_airport: parsed.destination_airport || parsed.destinationAirport || '',
'''
new_airports = '''          originAirport: parsed.origin_airport || parsed.originAirport || parsed.departureAirport || '',
          destinationAirport: parsed.destination_airport || parsed.destinationAirport || parsed.arrivalAirport || '',
          departureAirport: parsed.departureAirport || parsed.origin_airport || parsed.originAirport || '',
          arrivalAirport: parsed.arrivalAirport || parsed.destination_airport || parsed.destinationAirport || '',
          origin_airport: parsed.origin_airport || parsed.originAirport || parsed.departureAirport || '',
          destination_airport: parsed.destination_airport || parsed.destinationAirport || parsed.arrivalAirport || '',
'''
if old_airports not in modal:
    raise SystemExit('GDS airport normalization block not found')
modal = modal.replace(old_airports, new_airports, 1)

parse_anchor = modal.find('  const parseTextToSegments = (text, year) => {')
if parse_anchor < 0:
    raise SystemExit('parseTextToSegments anchor not found')
return_target = '    return segs;\n  };'
return_pos = modal.find(return_target, parse_anchor)
if return_pos < 0:
    raise SystemExit('parseTextToSegments return target not found')
return_repl = '''    return segs.map((segment, index) => {
      const next = segs[index + 1];
      const sameConnection = next &&
        segment.destination_airport &&
        next.origin_airport &&
        segment.destination_airport === next.origin_airport;
      const nextDepartureIsLaterDay = sameConnection &&
        next.departureDate &&
        segment.departureDate &&
        next.departureDate > segment.departureDate;

      if (nextDepartureIsLaterDay && (!segment.arrivalDate || segment.arrivalDate === segment.departureDate)) {
        return {
          ...segment,
          arrivalDate: next.departureDate,
          arrival_date: next.departureDate
        };
      }
      return segment;
    });
  };'''
modal = modal[:return_pos] + return_repl + modal[return_pos + len(return_target):]

route_target = '{seg.departureAirport} → {seg.arrivalAirport}'
route_repl = "{seg.departureAirport || seg.originAirport || seg.origin_airport} → {seg.arrivalAirport || seg.destinationAirport || seg.destination_airport}"
if route_target not in modal:
    raise SystemExit('preview route target not found')
modal = modal.replace(route_target, route_repl, 1)
modal_path.write_text(modal)

helper_path = Path('frontend/src/shared/utils/gdsItineraryHelper.js')
helper = helper_path.read_text()
airline_target = "  QR: 'Qatar Airways',\n  SQ: 'Singapore Airlines',"
airline_repl = "  QR: 'Qatar Airways',\n  AT: 'Royal Air Maroc',\n  SQ: 'Singapore Airlines',"
if airline_target not in helper:
    raise SystemExit('frontend airline map insertion point not found')
helper = helper.replace(airline_target, airline_repl, 1)
helper_path.write_text(helper)

backend_airline_path = Path('backend/src/shared/utils/airline-lookup.mjs')
backend_airline = backend_airline_path.read_text()
backend_target = "  { name: 'Qatar Airways', iataCode: 'QR', icaoCode: 'QTR', logoUrl: '/airlines/qr.png' },\n  { name: 'Turkish Airlines',"
backend_repl = "  { name: 'Qatar Airways', iataCode: 'QR', icaoCode: 'QTR', logoUrl: '/airlines/qr.png' },\n  { name: 'Royal Air Maroc', iataCode: 'AT', icaoCode: 'RAM', logoUrl: '/airlines/at.png' },\n  { name: 'Turkish Airlines',"
if backend_target not in backend_airline:
    raise SystemExit('backend airline directory insertion point not found')
backend_airline = backend_airline.replace(backend_target, backend_repl, 1)
backend_airline_path.write_text(backend_airline)

checks = {
    repo_path: ["carrier_code: seg.carrier_code || seg.marketing_carrier_code || ''"],
    repair_path: ['verify legacy itinerary persistence', "from('flights')"],
    modal_path: ['departureAirport: parsed.departureAirport', 'nextDepartureIsLaterDay', 'seg.originAirport || seg.origin_airport'],
    helper_path: ["AT: 'Royal Air Maroc'"],
    backend_airline_path: ["iataCode: 'AT'", "icaoCode: 'RAM'"]
}
for path, needles in checks.items():
    content = path.read_text()
    for needle in needles:
        if needle not in content:
            raise SystemExit(f'{path}: missing verification marker {needle}')
