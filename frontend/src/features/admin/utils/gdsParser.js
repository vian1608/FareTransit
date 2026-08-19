export const MONTH_MAP = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12'
};

export const CLASS_CABIN_MAP = {
  Y: 'Economy', M: 'Economy', B: 'Economy', H: 'Economy', K: 'Economy', L: 'Economy', Q: 'Economy', V: 'Economy',
  W: 'Premium Economy', E: 'Premium Economy',
  J: 'Business', C: 'Business', D: 'Business', I: 'Business', Z: 'Business',
  F: 'First', A: 'First', P: 'First'
};

export const CHATGPT_PROMPT_TEMPLATE = `Convert the flight details I provide into FareTransit itinerary import format.

Use exactly this structure:

TRIP: ONE_WAY, ROUND_TRIP or MULTI_CITY
PASSENGERS: number
CABIN: ECONOMY, PREMIUM_ECONOMY, BUSINESS or FIRST

OUTBOUND
SS CARRIER FLIGHT CLASS DDMMMYYYY FROM TO DEPARTURE ARRIVAL

RETURN
SS CARRIER FLIGHT CLASS DDMMMYYYY FROM TO DEPARTURE ARRIVAL

For connecting trips, output one SS line per flight segment.

Rules:
- Use IATA airport codes.
- Use 24-hour time in HHMM format.
- Use one carrier code and numeric flight number separately.
- Include +1 after arrival time for next-day arrival.
- Do not invent missing details.
- Write UNKNOWN for missing values.
- Output only the import text, without explanation.`;

export const FORMAT_A_EXAMPLE = `TRIP: ROUND_TRIP
PASSENGERS: 1
CABIN: ECONOMY

OUTBOUND

SEGMENT 1
CARRIER: F9
FLIGHT: 1496
CLASS: Y
DATE: 10SEP2026
FROM: IAH
TO: FLL
DEPARTURE: 08:25
ARRIVAL: 12:12
STOPS: 0

RETURN

SEGMENT 1
CARRIER: UA
FLIGHT: 470
CLASS: Y
DATE: 17SEP2026
FROM: MIA
TO: IAH
DEPARTURE: 11:30
ARRIVAL: 13:22
STOPS: 0`;

export const FORMAT_B_EXAMPLE = `TRIP ROUND_TRIP
PAX 1
CABIN ECONOMY

OUTBOUND
SS F9 1496 Y 10SEP2026 IAH FLL 0825 1212

RETURN
SS UA 470 Y 17SEP2026 MIA IAH 1130 1322`;

const KNOWN_AIRLINES = {
  F9: 'Frontier Airlines', UA: 'United Airlines', AA: 'American Airlines', DL: 'Delta Air Lines',
  BA: 'British Airways', WN: 'Southwest Airlines', AS: 'Alaska Airlines', B6: 'JetBlue Airways',
  NK: 'Spirit Airlines', AC: 'Air Canada', VS: 'Virgin Atlantic', LH: 'Lufthansa', AF: 'Air France',
  KL: 'KLM Royal Dutch Airlines', EK: 'Emirates', QR: 'Qatar Airways', TK: 'Turkish Airlines',
  SQ: 'Singapore Airlines', AI: 'Air India', CX: 'Cathay Pacific', QF: 'Qantas Airways'
};

const KNOWN_AIRPORTS = {
  IAH: 'Houston', FLL: 'Fort Lauderdale', MIA: 'Miami', DEN: 'Denver', JFK: 'New York',
  LGA: 'New York', EWR: 'Newark', LAX: 'Los Angeles', SFO: 'San Francisco', ORD: 'Chicago',
  ATL: 'Atlanta', DFW: 'Dallas', LHR: 'London', LGW: 'London', CDG: 'Paris', DEL: 'Delhi',
  BOS: 'Boston', SEA: 'Seattle', MCO: 'Orlando', LAS: 'Las Vegas', SAN: 'San Diego'
};

export function parseDateString(dateStr) {
  if (!dateStr) return null;
  const cleaned = String(dateStr).trim().toUpperCase();

  const ddmmyyyyMatch = cleaned.match(/^(\d{1,2})[-/]?([A-Z]{3})[-/]?(\d{2,4})$/);
  if (ddmmyyyyMatch) {
    const day = ddmmyyyyMatch[1].padStart(2, '0');
    const month = MONTH_MAP[ddmmyyyyMatch[2]];
    let year = ddmmyyyyMatch[3];
    if (year.length === 2) year = '20' + year;
    if (month) return `${year}-${month}-${day}`;
  }

  const isoMatch = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return cleaned;

  const ddmmyyyyNumMatch = cleaned.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (ddmmyyyyNumMatch) {
    const day = ddmmyyyyNumMatch[1].padStart(2, '0');
    const month = ddmmyyyyNumMatch[2].padStart(2, '0');
    const year = ddmmyyyyNumMatch[3];
    return `${year}-${month}-${day}`;
  }

  return null;
}

export function parseTimeString(timeStr) {
  if (!timeStr) return null;
  const cleaned = String(timeStr).trim();

  const colonMatch = cleaned.match(/^(\d{1,2}):(\d{2})$/);
  if (colonMatch) {
    const h = parseInt(colonMatch[1], 10);
    const m = parseInt(colonMatch[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    return null;
  }

  const digitsMatch = cleaned.match(/^(\d{2})(\d{2})$/);
  if (digitsMatch) {
    const h = parseInt(digitsMatch[1], 10);
    const m = parseInt(digitsMatch[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    return null;
  }

  return null;
}

function formatDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function calculateArrivalDate(departureDateStr, offsetDays = 0, explicitArrivalDateStr = null) {
  if (explicitArrivalDateStr) {
    const parsed = parseDateString(explicitArrivalDateStr);
    if (parsed) return parsed;
  }
  if (!departureDateStr) return null;
  const parsedDep = parseDateString(departureDateStr);
  if (!parsedDep) return null;

  if (offsetDays === 0) return parsedDep;

  const [y, m, d] = parsedDep.split('-').map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d));
  dateObj.setUTCDate(dateObj.getUTCDate() + offsetDays);
  return formatDate(dateObj);
}

export function resolveAirline(code) {
  if (!code) return '';
  const c = String(code).trim().toUpperCase();
  return KNOWN_AIRLINES[c] || `${c} Airlines`;
}

export function resolveCity(code) {
  if (!code) return '';
  const c = String(code).trim().toUpperCase();
  return KNOWN_AIRPORTS[c] || c;
}

export function parseGdsTextClient(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return {
      success: false,
      errors: ['Please paste itinerary text to parse.'],
      warnings: [],
      segments: [],
      tripType: 'ONE_WAY',
      passengers: 1,
      cabin: 'ECONOMY'
    };
  }

  const lines = rawText.split(/\r?\n/);
  const errors = [];
  const warnings = [];
  const segments = [];

  let tripType = 'ONE_WAY';
  let passengers = 1;
  let defaultCabin = 'ECONOMY';
  let currentSection = 'outbound';
  let hasReturnSection = false;
  let hasMultiJourney = false;
  let outboundSeq = 1;
  let returnSeq = 1;
  let currentJourneyNum = 1;
  let hasArnukPending = false;

  let currentLabeledSegment = null;
  let labeledSegmentLineStart = null;

  function flushLabeledSegment() {
    if (!currentLabeledSegment) return;

    const seg = currentLabeledSegment;
    const lineNum = labeledSegmentLineStart || 1;

    const carrier = (seg.carrier || seg.carrier_code || '').trim().toUpperCase();
    const flight = (seg.flight || seg.flight_number || '').trim();
    const cls = (seg.class || seg.booking_class || 'Y').trim().toUpperCase();
    const depDateRaw = seg.date || seg.departure_date;
    const from = (seg.from || seg.origin || seg.origin_airport || '').trim().toUpperCase();
    const to = (seg.to || seg.destination || seg.destination_airport || '').trim().toUpperCase();
    const depTimeRaw = seg.departure || seg.departure_time;
    const arrTimeRaw = seg.arrival || seg.arrival_time;

    const depDate = parseDateString(depDateRaw);
    const depTime = parseTimeString(depTimeRaw);
    const arrTime = parseTimeString(arrTimeRaw);

    let offsetDays = 0;
    if (seg.plus_days) offsetDays = parseInt(seg.plus_days, 10) || 0;
    const arrDate = calculateArrivalDate(depDate, offsetDays, seg.arrival_date);

    if (!carrier || !/^[A-Z0-9]{2,3}$/.test(carrier)) {
      errors.push(`Line ${lineNum}: Invalid carrier code "${seg.carrier || ''}". Must be 2-3 alphanumeric characters.`);
    }
    if (!flight || !/^\d{1,4}[A-Z]?$/i.test(flight)) {
      errors.push(`Line ${lineNum}: Invalid flight number "${seg.flight || ''}". Must be 1-4 digits.`);
    }
    if (!from || !/^[A-Z]{3}$/.test(from)) {
      errors.push(`Line ${lineNum}: Invalid origin airport code "${seg.from || ''}". Must be 3-letter IATA code.`);
    }
    if (!to || !/^[A-Z]{3}$/.test(to)) {
      errors.push(`Line ${lineNum}: Invalid destination airport code "${seg.to || ''}". Must be 3-letter IATA code.`);
    }
    if (!depDate) {
      errors.push(`Line ${lineNum}: Invalid departure date "${depDateRaw || ''}". Use DDMMMYYYY (e.g. 10SEP2026) or YYYY-MM-DD.`);
    }
    if (!depTime) {
      errors.push(`Line ${lineNum}: Invalid departure time "${depTimeRaw || ''}". Use HHMM or HH:MM.`);
    }
    if (!arrTime) {
      errors.push(`Line ${lineNum}: Invalid arrival time "${arrTimeRaw || ''}". Use HHMM or HH:MM.`);
    }

    const airlineName = resolveAirline(carrier);
    if (!KNOWN_AIRLINES[carrier]) {
      warnings.push(`Line ${lineNum}: Unknown carrier code "${carrier}". Please review airline name.`);
    }

    if (!KNOWN_AIRPORTS[from]) {
      warnings.push(`Line ${lineNum}: Unknown origin airport code "${from}". Please review city name.`);
    }
    if (!KNOWN_AIRPORTS[to]) {
      warnings.push(`Line ${lineNum}: Unknown destination airport code "${to}". Please review city name.`);
    }

    const cabinMapped = seg.cabin || CLASS_CABIN_MAP[cls] || defaultCabin;
    const direction = currentSection === 'return' ? 'return' : 'outbound';
    const seq = direction === 'outbound' ? outboundSeq++ : returnSeq++;

    segments.push({
      id: `seg_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      lineNum,
      direction,
      journey_direction: direction,
      segment_sequence: seq,
      carrier_code: carrier,
      carrier_name: airlineName,
      flight_number: flight,
      booking_class: cls,
      cabin: cabinMapped,
      origin_airport: from,
      origin_city: resolveCity(from),
      destination_airport: to,
      destination_city: resolveCity(to),
      departure_date: depDate || depDateRaw,
      departure_time: depTime || depTimeRaw,
      arrival_date: arrDate || depDate || depDateRaw,
      arrival_time: arrTime || arrTimeRaw,
      stop_count: parseInt(seg.stops || 0, 10),
      operated_by: seg.operated_by || '',
      aircraft: seg.aircraft || '',
      dep_terminal: seg.dep_terminal || seg.terminal || '',
      arr_terminal: seg.arr_terminal || '',
      has_arnuk_before: hasArnukPending
    });

    hasArnukPending = false;
    currentLabeledSegment = null;
    labeledSegmentLineStart = null;
  }

  for (let idx = 0; idx < lines.length; idx++) {
    const lineNum = idx + 1;
    const trimmed = lines[idx].trim();

    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//') || /^[-=]{3,}$/.test(trimmed)) {
      continue;
    }

    const upper = trimmed.toUpperCase();

    if (upper.startsWith('TRIP:') || upper.startsWith('TRIP ')) {
      const val = upper.replace(/^TRIP:?/, '').trim();
      if (val.includes('ROUND') || val.includes('ROUND_TRIP')) tripType = 'ROUND_TRIP';
      else if (val.includes('MULTI') || val.includes('MULTI_CITY')) tripType = 'MULTI_CITY';
      else if (val.includes('ONE') || val.includes('ONE_WAY')) tripType = 'ONE_WAY';
      continue;
    }

    if (upper.startsWith('PASSENGERS:') || upper.startsWith('PASSENGERS ') || upper.startsWith('PAX:') || upper.startsWith('PAX ')) {
      const match = upper.match(/\d+/);
      if (match) passengers = parseInt(match[0], 10);
      continue;
    }

    if (upper.startsWith('CABIN:') || upper.startsWith('CABIN ')) {
      const val = upper.replace(/^CABIN:?/, '').trim();
      if (val.includes('FIRST')) defaultCabin = 'FIRST';
      else if (val.includes('BUSINESS')) defaultCabin = 'BUSINESS';
      else if (val.includes('PREMIUM')) defaultCabin = 'PREMIUM_ECONOMY';
      else defaultCabin = 'ECONOMY';
      continue;
    }

    if (upper === 'OUTBOUND' || upper.startsWith('OUTBOUND ')) {
      flushLabeledSegment();
      currentSection = 'outbound';
      continue;
    }

    if (upper === 'RETURN' || upper === 'INBOUND' || upper.startsWith('RETURN ') || upper.startsWith('INBOUND ')) {
      flushLabeledSegment();
      currentSection = 'return';
      hasReturnSection = true;
      if (tripType === 'ONE_WAY') tripType = 'ROUND_TRIP';
      continue;
    }

    const journeyMatch = upper.match(/^JOURNEY\s*(\d+)/);
    if (journeyMatch) {
      flushLabeledSegment();
      currentJourneyNum = parseInt(journeyMatch[1], 10);
      currentSection = currentJourneyNum === 2 ? 'return' : `journey_${currentJourneyNum}`;
      hasMultiJourney = true;
      if (tripType !== 'MULTI_CITY') tripType = 'MULTI_CITY';
      continue;
    }

    if (upper.startsWith('ARNK')) {
      flushLabeledSegment();
      hasArnukPending = true;
      continue;
    }

    if (upper.startsWith('SS ')) {
      flushLabeledSegment();

      const tokens = trimmed.split(/\s+/);
      if (tokens.length < 9) {
        errors.push(`Line ${lineNum}: Incomplete SS compact line. Format: "SS CARRIER FLIGHT CLASS DATE FROM TO DEPARTURE ARRIVAL"`);
        continue;
      }

      const carrier = tokens[1].toUpperCase();
      const flight = tokens[2].toUpperCase();
      const cls = tokens[3].toUpperCase();
      const dateRaw = tokens[4];
      const from = tokens[5].toUpperCase();
      const to = tokens[6].toUpperCase();
      const depTimeRaw = tokens[7];

      let arrTimeRaw = tokens[8];
      let offsetDays = 0;
      let explicitArrDateRaw = null;
      let nextTokenIdx = 9;

      if (parseDateString(tokens[8]) && tokens[9]) {
        explicitArrDateRaw = tokens[8];
        arrTimeRaw = tokens[9];
        nextTokenIdx = 10;
        if (tokens[10] && tokens[10].match(/^\+(\d+)$/)) {
          offsetDays = parseInt(tokens[10].match(/^\+(\d+)$/)[1], 10);
          nextTokenIdx = 11;
        }
      } else if (tokens[9] && tokens[9].match(/^\+(\d+)$/)) {
        offsetDays = parseInt(tokens[9].match(/^\+(\d+)$/)[1], 10);
        nextTokenIdx = 10;
      }

      const depDate = parseDateString(dateRaw);
      const depTime = parseTimeString(depTimeRaw);
      const arrTime = parseTimeString(arrTimeRaw);
      const arrDate = calculateArrivalDate(depDate, offsetDays, explicitArrDateRaw);

      if (!carrier || !/^[A-Z0-9]{2,3}$/.test(carrier)) {
        errors.push(`Line ${lineNum}: Invalid carrier code "${carrier}". Must be 2-3 alphanumeric characters.`);
      }
      if (!flight || !/^\d{1,4}[A-Z]?$/i.test(flight)) {
        errors.push(`Line ${lineNum}: Invalid flight number "${flight}". Must be 1-4 digits.`);
      }
      if (!from || !/^[A-Z]{3}$/.test(from)) {
        errors.push(`Line ${lineNum}: Invalid origin airport code "${from}". Must be 3-letter IATA code.`);
      }
      if (!to || !/^[A-Z]{3}$/.test(to)) {
        errors.push(`Line ${lineNum}: Invalid destination airport code "${to}". Must be 3-letter IATA code.`);
      }
      if (!depDate) {
        errors.push(`Line ${lineNum}: Invalid departure date "${dateRaw}". Use DDMMMYYYY (e.g. 10SEP2026) or YYYY-MM-DD.`);
      }
      if (!depTime) {
        errors.push(`Line ${lineNum}: Invalid departure time "${depTimeRaw}". Use HHMM or HH:MM.`);
      }
      if (!arrTime) {
        errors.push(`Line ${lineNum}: Invalid arrival time "${arrTimeRaw}". Use HHMM or HH:MM.`);
      }

      const airlineName = resolveAirline(carrier);
      if (!KNOWN_AIRLINES[carrier]) {
        warnings.push(`Line ${lineNum}: Unknown carrier code "${carrier}". Please review airline name.`);
      }

      if (!KNOWN_AIRPORTS[from]) {
        warnings.push(`Line ${lineNum}: Unknown origin airport code "${from}". Please review city name.`);
      }
      if (!KNOWN_AIRPORTS[to]) {
        warnings.push(`Line ${lineNum}: Unknown destination airport code "${to}". Please review city name.`);
      }

      let stops = 0;
      let cabinOverride = null;
      let operatedBy = '';
      let aircraft = '';
      let depTerminal = '';
      let arrTerminal = '';

      for (let i = nextTokenIdx; i < tokens.length; i++) {
        const param = tokens[i].trim();
        if (!param) continue;
        const eqIdx = param.indexOf('=');
        if (eqIdx > 0) {
          const key = param.substring(0, eqIdx).toUpperCase();
          const val = param.substring(eqIdx + 1).toUpperCase();
          if (key === 'STOPS') stops = parseInt(val, 10) || 0;
          else if (key === 'CABIN') cabinOverride = val;
          else if (key === 'OPERATED_BY' || key === 'OPERATEDBY') operatedBy = val;
          else if (key === 'AIRCRAFT') aircraft = val;
          else if (key === 'DEP_TERMINAL' || key === 'TERMINAL') depTerminal = val;
          else if (key === 'ARR_TERMINAL') arrTerminal = val;
          else {
            warnings.push(`Line ${lineNum}: Unknown optional parameter "${param}".`);
          }
        } else {
          warnings.push(`Line ${lineNum}: Unrecognized token "${param}".`);
        }
      }

      const cabinMapped = cabinOverride || CLASS_CABIN_MAP[cls] || defaultCabin;
      const direction = currentSection === 'return' ? 'return' : 'outbound';
      const seq = direction === 'outbound' ? outboundSeq++ : returnSeq++;

      segments.push({
        id: `seg_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        lineNum,
        direction,
        journey_direction: direction,
        segment_sequence: seq,
        carrier_code: carrier,
        carrier_name: airlineName,
        flight_number: flight,
        booking_class: cls,
        cabin: cabinMapped,
        origin_airport: from,
        origin_city: resolveCity(from),
        destination_airport: to,
        destination_city: resolveCity(to),
        departure_date: depDate || dateRaw,
        departure_time: depTime || depTimeRaw,
        arrival_date: arrDate || depDate || dateRaw,
        arrival_time: arrTime || arrTimeRaw,
        stop_count: stops,
        operated_by: operatedBy,
        aircraft,
        dep_terminal: depTerminal,
        arr_terminal: arrTerminal,
        has_arnuk_before: hasArnukPending
      });

      hasArnukPending = false;
      continue;
    }

    if (upper.startsWith('SEGMENT ') || upper.startsWith('SEG ')) {
      flushLabeledSegment();
      currentLabeledSegment = {};
      labeledSegmentLineStart = lineNum;
      continue;
    }

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx > 0) {
      const key = trimmed.substring(0, colonIdx).trim().toUpperCase();
      const val = trimmed.substring(colonIdx + 1).trim();

      const LABELED_KEYS = ['CARRIER', 'FLIGHT', 'CLASS', 'DATE', 'FROM', 'TO', 'DEPARTURE', 'ARRIVAL', 'STOPS', 'CABIN', 'OPERATED_BY', 'AIRCRAFT', 'DEP_TERMINAL', 'ARR_TERMINAL'];
      if (LABELED_KEYS.includes(key)) {
        if (!currentLabeledSegment) {
          currentLabeledSegment = {};
          labeledSegmentLineStart = lineNum;
        }
        currentLabeledSegment[key.toLowerCase()] = val;
        continue;
      }
    }
  }

  flushLabeledSegment();

  if (hasReturnSection && tripType === 'ONE_WAY') tripType = 'ROUND_TRIP';
  if (hasMultiJourney) tripType = 'MULTI_CITY';

  const routeWarnings = checkRouteContinuityClient(segments);
  warnings.push(...routeWarnings);

  return {
    success: errors.length === 0 && segments.length > 0,
    errors,
    warnings,
    segments,
    tripType,
    passengers,
    cabin: defaultCabin,
    totalSegments: segments.length
  };
}

export function checkRouteContinuityClient(segments = []) {
  const warnings = [];
  if (!Array.isArray(segments) || segments.length <= 1) return warnings;

  for (let i = 0; i < segments.length - 1; i++) {
    const curr = segments[i];
    const next = segments[i + 1];

    if (curr.direction === next.direction) {
      if (curr.destination_airport && next.origin_airport && curr.destination_airport !== next.origin_airport) {
        if (!next.has_arnuk_before) {
          warnings.push(`Route gap detected between ${curr.destination_airport} and ${next.origin_airport}.`);
        }
      }
    }
  }

  return warnings;
}
