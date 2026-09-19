from pathlib import Path
import re


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'{label}: target not found')
    return text.replace(old, new, 1)


# GDS helper: central airline catalog and locally stored logo path.
p = Path('frontend/src/shared/utils/gdsItineraryHelper.js')
s = p.read_text()
if "from './airlineCatalog'" not in s:
    s = "import { getAirlineName as getCatalogAirlineName, getAirlineLogoUrl } from './airlineCatalog';\n\n" + s
s = re.sub(
    r"export function resolveAirlineName\(carrierCode, providedName\) \{.*?\n\}\n\nexport function getCarrierLogoUrl\(carrierCode\) \{.*?\n\}",
    """export function resolveAirlineName(carrierCode, providedName) {
  if (providedName && typeof providedName === 'string' && providedName.trim()) {
    const p = providedName.trim();
    if (!p.toLowerCase().includes('airline information unavailable') && !p.toLowerCase().includes('commercial airline')) return p;
  }
  const code = (carrierCode || '').trim().toUpperCase();
  return getCatalogAirlineName(code);
}

export function getCarrierLogoUrl(carrierCode) {
  return getAirlineLogoUrl(carrierCode);
}""",
    s,
    count=1,
    flags=re.S,
)
p.write_text(s)

# Import modal: admin choice is authoritative; journey != segment.
p = Path('frontend/src/shared/components/admin/AdminItineraryImportModal.js')
s = p.read_text()
s = replace_once(
    s,
    "import { parseGdsLine } from '../../utils/gdsItineraryHelper';\nimport AdminItineraryHelpModal from './AdminItineraryHelpModal';",
    "import { parseGdsLine, resolveAirlineName } from '../../utils/gdsItineraryHelper';\nimport { canonicalizeSegments, normalizeItineraryType, validateJourneyContinuity } from '../../utils/itineraryArchitecture';\nimport AirlineLogo from '../AirlineLogo';\nimport AdminItineraryHelpModal from './AdminItineraryHelpModal';",
    'modal imports',
)
s = replace_once(
    s,
    "outboundSegs = parseTextToSegments(outboundText, outboundYear).map(s => ({ ...s, journey_direction: 'outbound' }));",
    "outboundSegs = parseTextToSegments(outboundText, outboundYear).map((s, index) => ({ ...s, journey_direction: 'outbound', direction: 'outbound', journey_index: 1, journey_role: 'OUTBOUND', segment_sequence: index + 1 }));",
    'one way mapping',
)
s = replace_once(
    s,
    "outboundSegs = parseTextToSegments(outboundText, outboundYear).map(s => ({ ...s, journey_direction: 'outbound' }));",
    "outboundSegs = parseTextToSegments(outboundText, outboundYear).map((s, index) => ({ ...s, journey_direction: 'outbound', direction: 'outbound', journey_index: 1, journey_role: 'OUTBOUND', segment_sequence: index + 1 }));",
    'round outbound mapping',
)
s = replace_once(
    s,
    "returnSegs = parseTextToSegments(returnText, returnYear).map(s => ({ ...s, journey_direction: 'return' }));",
    "returnSegs = parseTextToSegments(returnText, returnYear).map((s, index) => ({ ...s, journey_direction: 'return', direction: 'return', journey_index: 2, journey_role: 'RETURN', segment_sequence: index + 1 }));",
    'round return mapping',
)
s = replace_once(
    s,
    "journey_direction: 'multi_city',\n              journey_index: idx + 1",
    "journey_direction: 'multi_city',\n              direction: 'multi_city',\n              journey_index: idx + 1,\n              journey_role: 'TRIP'",
    'multi city mapping',
)
old = """      if (combinedSegments.length === 0) {
        setErrorMsg('Could not parse any valid flight segments from the provided GDS text.');
        return;
      }

      setParsedPreview({
        tripType,
        outboundSegments: outboundSegs,
        returnSegments: returnSegs,
        multiCityJourneys: mcSegs,
        allSegments: combinedSegments
      });"""
new = """      if (combinedSegments.length === 0) {
        setErrorMsg('Could not parse any valid flight segments from the provided GDS text.');
        return;
      }

      const itineraryType = normalizeItineraryType(tripType);
      combinedSegments = canonicalizeSegments(combinedSegments, itineraryType);
      const continuity = validateJourneyContinuity(combinedSegments, itineraryType);
      if (!continuity.valid) {
        setErrorMsg(continuity.message);
        return;
      }
      outboundSegs = combinedSegments.filter(segment => segment.journey_role === 'OUTBOUND');
      returnSegs = combinedSegments.filter(segment => segment.journey_role === 'RETURN');
      mcSegs = combinedSegments.filter(segment => segment.journey_role === 'TRIP');

      setParsedPreview({
        tripType,
        itineraryType,
        outboundSegments: outboundSegs,
        returnSegments: returnSegs,
        multiCityJourneys: mcSegs,
        allSegments: combinedSegments
      });"""
s = replace_once(s, old, new, 'modal canonical preview')
s = s.replace('Flight / Leg #{idx + 1}', 'Trip #{idx + 1}')
s = s.replace('+ Add Flight / Leg Box', '+ Add Trip')
old_badge = """                    <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', padding: '2px 6px', borderRadius: '4px', backgroundColor: seg.journey_direction === 'return' ? '#3b82f6' : '#8b1236', color: '#ffffff', marginRight: '8px' }}>
                      {seg.journey_direction || 'outbound'}
                    </span>
                    <strong style={{ fontSize: '14px', color: '#0f172a' }}>{seg.carrierCode} {seg.flightNumber}</strong>"""
new_badge = """                    <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', padding: '2px 6px', borderRadius: '4px', backgroundColor: seg.journey_role === 'RETURN' ? '#3b82f6' : '#8b1236', color: '#ffffff', marginRight: '8px' }}>
                      {parsedPreview.itineraryType === 'MULTI_CITY' ? `Trip ${seg.journey_index}` : (seg.journey_role === 'RETURN' ? 'Return' : (parsedPreview.itineraryType === 'ONE_WAY' ? 'One Way' : 'Outbound'))}
                    </span>
                    <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: '7px' }}><AirlineLogo carrierCode={seg.carrierCode || seg.carrier_code} airlineName={resolveAirlineName(seg.carrierCode || seg.carrier_code)} size={24} /></span>
                    <strong style={{ fontSize: '14px', color: '#0f172a' }}>{resolveAirlineName(seg.carrierCode || seg.carrier_code)} {seg.carrierCode || seg.carrier_code} {seg.flightNumber || seg.flight_number}</strong>"""
s = replace_once(s, old_badge, new_badge, 'modal preview badge')
p.write_text(s)

# Admin management editor: carry itinerary type through every save.
p = Path('frontend/src/features/admin/components/AdminBookingManagementPanel.js')
s = p.read_text()
s = replace_once(
    s,
    "import AdminGdsImportModalV2 from './AdminGdsImportModalV2';\nimport './AdminBookingManagementPanel.css';",
    "import AdminGdsImportModalV2 from './AdminGdsImportModalV2';\nimport { canonicalizeSegments, inferLegacyItineraryType, itineraryTypeLabel, normalizeItineraryType, validateJourneyContinuity } from '../../../shared/utils/itineraryArchitecture';\nimport './AdminBookingManagementPanel.css';",
    'management imports',
)
old_norm = """  const rawDirection = text(segment.journey_direction || segment.direction || segment.leg || 'outbound').toLowerCase();
  const direction = ['return', 'inbound'].includes(rawDirection) ? 'return' : 'outbound';
  return {
    ...segment,
    _key: segment.id || segment._key || `segment-${Date.now()}-${index}`,
    journey_direction: direction,
    direction,"""
new_norm = """  const rawDirection = text(segment.journey_direction || segment.direction || segment.leg || 'outbound').toLowerCase();
  const direction = ['return', 'inbound'].includes(rawDirection) ? 'return' : (['multi_city', 'multi-city', 'trip'].includes(rawDirection) ? 'multi_city' : 'outbound');
  const journeyIndex = Number(segment.journey_index || segment.journeyIndex || (direction === 'return' ? 2 : 1));
  const journeyRole = text(segment.journey_role || segment.journeyRole || (direction === 'return' ? 'RETURN' : (direction === 'multi_city' ? 'TRIP' : 'OUTBOUND'))).toUpperCase();
  return {
    ...segment,
    _key: segment.id || segment._key || `segment-${Date.now()}-${index}`,
    journey_direction: direction,
    direction,
    journey_index: journeyIndex,
    journey_role: journeyRole,"""
s = replace_once(s, old_norm, new_norm, 'management normalize segment')
s = replace_once(s, "  const [segments, setSegments] = useState([]);", "  const [segments, setSegments] = useState([]);\n  const [itineraryType, setItineraryType] = useState('ONE_WAY');", 'management type state')
s = replace_once(s, "    setSegments(extractSegments(next).map(normalizeSegment));", "    const loadedSegments = extractSegments(next).map(normalizeSegment);\n    setSegments(loadedSegments);\n    setItineraryType(inferLegacyItineraryType(next, loadedSegments));", 'management hydrate type')
start = s.find('  const canonicalSegments = input =>')
end = s.find('\n\n  const savePricing =', start)
if start < 0 or end < 0:
    raise SystemExit('management itinerary functions block not found')
replacement = """  const canonicalSegments = (input, requestedType = itineraryType) => canonicalizeSegments(input, requestedType).map(segment => ({
    ...segment,
    origin_airport: text(segment.origin_airport).toUpperCase(),
    destination_airport: text(segment.destination_airport).toUpperCase(),
    carrier_code: text(segment.carrier_code).toUpperCase()
  }));

  const persistItinerary = async (sourceSegments, requestedType = itineraryType) => {
    const type = normalizeItineraryType(requestedType);
    const finalSegments = canonicalSegments(sourceSegments, type);
    if (!finalSegments.length) {
      setMessage('itinerary', 'error', 'Add or import at least one flight before saving.');
      return null;
    }
    if (finalSegments.some(segment => !/^[A-Z]{3}$/.test(segment.origin_airport) || !/^[A-Z]{3}$/.test(segment.destination_airport))) {
      setMessage('itinerary', 'error', 'Every flight needs valid 3-letter origin and destination airport codes.');
      return null;
    }
    const continuity = validateJourneyContinuity(finalSegments, type);
    if (!continuity.valid) {
      setMessage('itinerary', 'error', continuity.message);
      return null;
    }
    setItineraryType(type);
    return saveAndRefresh('itinerary', () => adminAPI.patchItinerary(booking.id, {
      segments: finalSegments,
      itineraryType: type,
      tripType: type,
      expectedVersion: booking.updated_at || booking.version
    }), 'Itinerary saved.');
  };

  const applyImportedItinerary = async ({ segments: importedSegments, itineraryType: importedType, tripType }) => {
    const type = normalizeItineraryType(importedType || tripType);
    const normalized = canonicalSegments((importedSegments || []).map(normalizeSegment), type).map(normalizeSegment);
    setSegments(normalized);
    setItineraryType(type);
    const result = await persistItinerary(normalized, type);
    if (!result) throw new Error('The imported itinerary could not be saved.');
    return result;
  };"""
s = s[:start] + replacement + s[end:]
s = replace_once(
    s,
    "  const addSegment = () => setSegments(current => [...current, normalizeSegment({ journey_direction: 'outbound', cabin: 'Economy' }, current.length)]);",
    "  const addSegment = () => setSegments(current => [...current, normalizeSegment({ journey_direction: itineraryType === 'MULTI_CITY' ? 'multi_city' : 'outbound', journey_index: 1, journey_role: itineraryType === 'MULTI_CITY' ? 'TRIP' : 'OUTBOUND', cabin: 'Economy' }, current.length)]);",
    'management add segment',
)
s = replace_once(
    s,
    "          <button className=\"abm-button abm-button--secondary\" type=\"button\" onClick={addSegment}>+ Add Flight Manually</button>",
    "          <button className=\"abm-button abm-button--secondary\" type=\"button\" onClick={addSegment}>+ Add Flight Manually</button>\n          <span className=\"abm-note\">Trip type: <strong>{itineraryTypeLabel(itineraryType)}</strong></span>",
    'management toolbar type',
)
old_dir = """                <label><span>Direction</span><select value={segment.journey_direction || 'outbound'} onChange={event => updateSegment(index, 'journey_direction', event.target.value)}><option value="outbound">Outbound</option><option value="return">Return</option></select></label>"""
new_dir = """                {itineraryType === 'MULTI_CITY' ? (
                  <label><span>Trip #</span><input type="number" min="1" value={segment.journey_index || 1} onChange={event => updateSegment(index, 'journey_index', Math.max(1, Number(event.target.value) || 1))} /></label>
                ) : itineraryType === 'ROUND_TRIP' ? (
                  <label><span>Journey</span><select value={segment.journey_direction || 'outbound'} onChange={event => updateSegment(index, 'journey_direction', event.target.value)}><option value="outbound">Outbound</option><option value="return">Return</option></select></label>
                ) : (
                  <label><span>Journey</span><input value="One Way" disabled /></label>
                )}"""
s = replace_once(s, old_dir, new_dir, 'management direction editor')
s = s.replace('onClick={() => persistItinerary(segments)}', 'onClick={() => persistItinerary(segments, itineraryType)}', 1)
p.write_text(s)

# Workspace summary: render journeys based only on authoritative type.
p = Path('frontend/src/features/admin/components/AdminBookingWorkspace.js')
s = p.read_text()
s = replace_once(
    s,
    "import { adminAPI, getApiErrorMessage } from '../../../shared/api/api';\nimport './AdminBookingWorkspace.css';",
    "import { adminAPI, getApiErrorMessage } from '../../../shared/api/api';\nimport AirlineLogo from '../../../shared/components/AirlineLogo';\nimport { getAirlineName } from '../../../shared/utils/airlineCatalog';\nimport { groupSegmentsIntoJourneys, inferLegacyItineraryType } from '../../../shared/utils/itineraryArchitecture';\nimport './AdminBookingWorkspace.css';",
    'workspace imports',
)
s = replace_once(
    s,
    "    direction: ['return', 'inbound'].includes(text(segment.journey_direction || segment.direction || segment.leg).toLowerCase()) ? 'return' : 'outbound',\n    sequence: Number(segment.segment_sequence || segment.sequence || 1),\n    airline: segment.carrier_name || segment.airline_name || segment.airlineName || segment.airline || 'Airline',",
    "    direction: ['return', 'inbound'].includes(text(segment.journey_direction || segment.direction || segment.leg).toLowerCase()) ? 'return' : (['multi_city', 'multi-city', 'trip'].includes(text(segment.journey_direction || segment.direction || segment.leg).toLowerCase()) ? 'multi_city' : 'outbound'),\n    journeyIndex: Number(segment.journey_index || segment.journeyIndex || (['return', 'inbound'].includes(text(segment.journey_direction || segment.direction || segment.leg).toLowerCase()) ? 2 : 1)),\n    journeyRole: text(segment.journey_role || segment.journeyRole).toUpperCase(),\n    sequence: Number(segment.segment_sequence || segment.sequence || 1),\n    airline: segment.carrier_name || segment.airline_name || segment.airlineName || segment.airline || getAirlineName(segment.carrier_code || segment.marketing_carrier_code || segment.airlineCode),",
    'workspace segment view',
)
s = replace_once(s, "                    {segment.logo ? <img src={segment.logo} alt=\"\" /> : <span>✈</span>}", "                    <AirlineLogo carrierCode={segment.carrierCode} airlineName={segment.airline} src={segment.logo} size={24} />", 'workspace airline logo')
s = replace_once(
    s,
    "        <strong>{segments[0].origin} → {segments[segments.length - 1].destination}</strong>\n      </div>",
    "        <strong>{segments[0].origin} → {segments[segments.length - 1].destination}</strong>\n        <small>{segments.length} flight segment{segments.length === 1 ? '' : 's'} · {segments.length === 1 ? 'Non-stop' : `${segments.length - 1} stop${segments.length - 1 === 1 ? '' : 's'}`}</small>\n      </div>",
    'workspace journey metadata',
)
old_compute = """  const segments = useMemo(() => normalizeSegments(booking).map(segmentView).sort((a, b) => {
    if (a.direction !== b.direction) return a.direction === 'outbound' ? -1 : 1;
    return a.sequence - b.sequence;
  }), [booking]);
  const outbound = segments.filter(segment => segment.direction === 'outbound');
  const inbound = segments.filter(segment => segment.direction === 'return');"""
new_compute = """  const rawSegments = useMemo(() => normalizeSegments(booking), [booking]);
  const itineraryType = useMemo(() => inferLegacyItineraryType(booking, rawSegments), [booking, rawSegments]);
  const journeyGroups = useMemo(() => groupSegmentsIntoJourneys(rawSegments, itineraryType).map(journey => ({
    ...journey,
    segments: journey.segments.map(segmentView)
  })), [rawSegments, itineraryType]);
  const segments = useMemo(() => journeyGroups.flatMap(journey => journey.segments), [journeyGroups]);"""
s = replace_once(s, old_compute, new_compute, 'workspace group computation')
old_render = """                <Journey label={inbound.length ? 'Outbound' : (outbound.length > 1 ? 'Trip / Multi-city' : 'Flight')} segments={outbound} />
                <Journey label="Return" segments={inbound} />"""
new_render = """                {journeyGroups.map(journey => (
                  <Journey key={`${itineraryType}-${journey.journeyIndex}`} label={journey.label} segments={journey.segments} />
                ))}"""
s = replace_once(s, old_render, new_render, 'workspace journey rendering')
p.write_text(s)

p = Path('frontend/src/features/admin/components/AdminBookingWorkspace.css')
s = p.read_text()
s = replace_once(s, ".abx-journey-title strong { font-size: 13px; }", ".abx-journey-title strong { font-size: 13px; }\n.abx-journey-title small { margin-left: auto; color: #718096; font-size: 9px; font-weight: 750; white-space: nowrap; }", 'workspace CSS journey metadata')
p.write_text(s)

# Backend admin endpoint: trip type explicit, continuity validated per journey.
p = Path('backend/src/modules/admin/admin.repair.controller.mjs')
s = p.read_text()
start = s.find('function normalizeSegments(rawSegments = []) {')
end = s.find('\n\nasync function getPersistedSegments', start)
if start < 0 or end < 0:
    raise SystemExit('backend normalizeSegments block not found')
new_block = r'''function normalizeItineraryType(value, rawSegments = []) {
  const raw = String(value || '').trim().toUpperCase().replace(/[-\s]+/g, '_');
  if (raw === 'MULTI_CITY' || raw === 'MULTICITY') return 'MULTI_CITY';
  if (raw === 'ROUND_TRIP' || raw === 'ROUNDTRIP') return 'ROUND_TRIP';
  if (raw === 'ONE_WAY' || raw === 'ONEWAY') return 'ONE_WAY';
  const hasReturn = rawSegments.some(segment => ['return', 'inbound'].includes(String(segment?.journey_direction || segment?.direction || segment?.leg || '').toLowerCase()));
  return hasReturn ? 'ROUND_TRIP' : 'ONE_WAY';
}

function normalizeSegments(rawSegments = [], itineraryType = 'ONE_WAY') {
  const type = normalizeItineraryType(itineraryType, rawSegments);
  const counters = new Map();

  return rawSegments.map((segment, index) => {
    const rawDirection = String(segment.journey_role || segment.journeyRole || segment.journey_direction || segment.direction || segment.leg || '').toUpperCase();
    let journeyIndex = Number(segment.journey_index || segment.journeyIndex || 0);
    let journeyRole;
    let direction;
    if (type === 'ONE_WAY') {
      journeyIndex = 1; journeyRole = 'OUTBOUND'; direction = 'outbound';
    } else if (type === 'ROUND_TRIP') {
      const isReturn = ['RETURN', 'INBOUND'].includes(rawDirection);
      journeyIndex = isReturn ? 2 : 1; journeyRole = isReturn ? 'RETURN' : 'OUTBOUND'; direction = isReturn ? 'return' : 'outbound';
    } else {
      journeyIndex = journeyIndex > 0 ? journeyIndex : 1; journeyRole = 'TRIP'; direction = 'multi_city';
    }
    const sequence = (counters.get(journeyIndex) || 0) + 1;
    counters.set(journeyIndex, sequence);
    const origin = String(segment.origin_airport || segment.originCode || segment.origin_code || segment.departureAirport || segment.departure_airport || '').trim().toUpperCase();
    const destination = String(segment.destination_airport || segment.destinationCode || segment.destination_code || segment.arrivalAirport || segment.arrival_airport || '').trim().toUpperCase();
    return {
      ...segment, itinerary_type: type, trip_type: type, journey_index: journeyIndex, journey_role: journeyRole,
      journey_direction: direction, direction, segment_sequence: sequence, segment_order: index + 1,
      origin_airport: origin, destination_airport: destination,
      carrier_code: String(segment.carrier_code || segment.marketing_carrier_code || segment.marketingAirlineCode || segment.airlineCode || '').trim().toUpperCase(),
      carrier_name: segment.carrier_name || segment.airline_name || segment.marketingAirlineName || segment.airlineName || '',
      flight_number: String(segment.flight_number || segment.flightNumber || '').trim(),
      departure_date: segment.departure_date || segment.departureDate || '', departure_time: segment.departure_time || segment.departureTime || '',
      arrival_date: segment.arrival_date || segment.arrivalDate || segment.departure_date || segment.departureDate || '', arrival_time: segment.arrival_time || segment.arrivalTime || '',
      cabin: segment.cabin || segment.cabin_class || segment.cabinClass || 'Economy'
    };
  }).filter(segment => segment.origin_airport && segment.destination_airport);
}

function validateJourneyContinuity(segments = []) {
  const groups = new Map();
  for (const segment of segments) {
    const index = Number(segment.journey_index || 1);
    if (!groups.has(index)) groups.set(index, []);
    groups.get(index).push(segment);
  }
  for (const [journeyIndex, group] of groups) {
    group.sort((a, b) => Number(a.segment_sequence || 0) - Number(b.segment_sequence || 0));
    for (let i = 0; i < group.length - 1; i += 1) {
      if (group[i].destination_airport !== group[i + 1].origin_airport) {
        return { valid: false, message: `Trip ${journeyIndex}: segment ${i + 1} ends at ${group[i].destination_airport}, but segment ${i + 2} starts at ${group[i + 1].origin_airport}.` };
      }
    }
  }
  return { valid: true };
}'''
s = s[:start] + new_block + s[end:]
s = replace_once(s, "      const segments = normalizeSegments(extractSegments(body));", "      const rawSegments = extractSegments(body);\n      const itineraryType = normalizeItineraryType(body.itineraryType || body.tripType || existing.itinerary_type, rawSegments);\n      const segments = normalizeSegments(rawSegments, itineraryType);", 'backend itinerary type selection')
marker = """      const invalid = segments.find(segment =>
        !/^[A-Z]{3}$/.test(segment.origin_airport) ||
        !/^[A-Z]{3}$/.test(segment.destination_airport)
      );"""
continuity = """      const continuity = validateJourneyContinuity(segments);
      if (!continuity.valid) {
        return res.status(400).json({ success: false, error: { code: 'DISCONNECTED_ITINERARY_JOURNEY', message: continuity.message } });
      }

""" + marker
s = replace_once(s, marker, continuity, 'backend continuity validation')
old_auth = """      if (shouldRequireReauthorization) {
        await withTimeout(
          bookingRepository.updateStatus(existing.id, {
            status: 'REAUTHORIZATION_REQUIRED',
            authorization_status: 'REAUTHORIZATION_REQUIRED',
            updated_at: new Date().toISOString()
          }),
          6000,
          'invalidate authorization after itinerary change'
        );
      }"""
new_auth = """      const bookingUpdate = { itinerary_type: itineraryType, updated_at: new Date().toISOString() };
      if (shouldRequireReauthorization) {
        bookingUpdate.status = 'REAUTHORIZATION_REQUIRED';
        bookingUpdate.authorization_status = 'REAUTHORIZATION_REQUIRED';
      }
      await withTimeout(
        bookingRepository.updateStatus(existing.id, bookingUpdate),
        6000,
        shouldRequireReauthorization ? 'invalidate authorization after itinerary change' : 'save itinerary type'
      );"""
s = replace_once(s, old_auth, new_auth, 'backend itinerary type persistence')
s = replace_once(s, "        segments: persisted,\n        reauthorizationRequired: shouldRequireReauthorization,", "        segments: persisted,\n        itineraryType,\n        reauthorizationRequired: shouldRequireReauthorization,", 'backend itinerary type response')
p.write_text(s)

# Repository: persist journey identity; legacy flights remain redundant fallback.
p = Path('backend/src/modules/bookings/booking.repository.mjs')
s = p.read_text()
old_rows = """          booking_id: bookingId,
          trip_type: seg.trip_type || 'one_way',
          direction: dir,
          journey_direction: dir,
          segment_sequence: seq,"""
new_rows = """          booking_id: bookingId,
          trip_type: String(seg.trip_type || seg.itinerary_type || 'ONE_WAY').toUpperCase(),
          direction: dir,
          journey_direction: dir,
          journey_index: Number(seg.journey_index || seg.journeyIndex || (dir === 'return' ? 2 : 1)),
          journey_role: String(seg.journey_role || seg.journeyRole || (dir === 'return' ? 'RETURN' : (dir === 'multi_city' ? 'TRIP' : 'OUTBOUND'))).toUpperCase(),
          segment_sequence: seq,"""
s = replace_once(s, old_rows, new_rows, 'repository journey columns')
s = replace_once(s, "        trip_type: seg.direction === 'return' ? 'round-trip' : 'one-way',", "        trip_type: String(seg.trip_type || seg.itinerary_type || '').toUpperCase() === 'MULTI_CITY' ? 'multi-city' : (String(seg.trip_type || seg.itinerary_type || '').toUpperCase() === 'ROUND_TRIP' ? 'round-trip' : 'one-way'),", 'repository legacy trip type')
s = s.replace(".eq('booking_id', realId).order('segment_sequence', { ascending: true })", ".eq('booking_id', realId).order('journey_index', { ascending: true }).order('segment_sequence', { ascending: true })")
p.write_text(s)

# Backend airline presentation uses locally stored assets on FareTransit.
p = Path('backend/src/shared/utils/airline-lookup.mjs')
s = p.read_text()
old_logo = """export function getCarrierLogoUrl(carrierCode) {
  const code = String(carrierCode || '').trim().toUpperCase();
  if (!code) return '';
  const match = AIRLINE_DIRECTORY.find(a => a.iataCode === code);
  return match?.logoUrl || `https://assets.duffel.com/img/airlines/for-floor/sq/${code}.png`;
}"""
new_logo = """export function getCarrierLogoUrl(carrierCode) {
  const code = String(carrierCode || '').trim().toUpperCase();
  if (!code) return '';
  return `https://www.faretransit.com/assets/airlines/${code.toLowerCase()}.png`;
}"""
s = replace_once(s, old_logo, new_logo, 'backend airline logo URL')
p.write_text(s)
