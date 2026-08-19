import { AIRLINE_DIRECTORY, getAirlineName, resolveAirlineName } from './airline-lookup.mjs';
import { GLOBAL_AIRPORTS } from '../../modules/flights/airport-ranker.mjs';

const MONTH_MAP = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12'
};

const CLASS_CABIN_MAP = {
  Y: 'Economy',
  M: 'Economy',
  B: 'Economy',
  H: 'Economy',
  K: 'Economy',
  L: 'Economy',
  Q: 'Economy',
  V: 'Economy',
  W: 'Premium Economy',
  E: 'Premium Economy',
  J: 'Business',
  C: 'Business',
  D: 'Business',
  I: 'Business',
  Z: 'Business',
  F: 'First',
  A: 'First',
  P: 'First'
};

/**
 * Standard ChatGPT prompt template for converting natural text into GDS format
 */
export const CHATGPT_PROMPT_TEMPLATE = `You are an expert airline reservation and GDS itinerary formatter.

I will paste an itinerary copied from Google Flights. Convert it into a structured flight itinerary that can be imported into a travel CRM.

Important rules:

1. Extract every flight segment, including all connections.
2. Do not remove or combine connecting flights.
3. Preserve the exact travel order.
4. Separate outbound and return journeys.
5. Use airport IATA codes where clearly available.
6. Preserve the operating airline and marketing airline when both are shown.
7. Preserve flight numbers exactly.
8. Convert dates to YYYY-MM-DD.
9. Use 24-hour local time in HH:mm format.
10. Do not convert local times to UTC.
11. Identify overnight arrivals and date changes correctly.
12. Include cabin/class only when provided.
13. Include aircraft type only when provided.
14. Include layover duration when provided.
15. Do not invent missing information.
16. Use null for information that cannot be determined.
17. Never invent availability, fare basis, booking class, PNR, ticket number, terminal, or confirmation status.
18. A Google Flights itinerary is not proof of live GDS availability or a confirmed booking.
19. Produce a GDS-style reference only as a formatting aid. Do not claim that it is an executable or confirmed GDS reservation.
20. Return valid JSON only, with no markdown explanation before or after it.

Use this exact JSON structure:

{
  "tripType": "one_way | round_trip | multi_city",
  "source": "google_flights",
  "currency": null,
  "displayedPrice": null,
  "passengerCount": null,
  "journeys": [
    {
      "journeyType": "outbound | return | additional",
      "segments": [
        {
          "segmentOrder": 1,
          "marketingAirlineName": null,
          "marketingAirlineCode": null,
          "operatingAirlineName": null,
          "operatingAirlineCode": null,
          "flightNumber": null,
          "departureAirport": null,
          "departureCity": null,
          "departureTerminal": null,
          "departureDate": "YYYY-MM-DD",
          "departureTime": "HH:mm",
          "arrivalAirport": null,
          "arrivalCity": null,
          "arrivalTerminal": null,
          "arrivalDate": "YYYY-MM-DD",
          "arrivalTime": "HH:mm",
          "cabin": null,
          "bookingClass": null,
          "aircraftType": null,
          "durationMinutes": null,
          "layoverAfterMinutes": null,
          "overnightArrival": false,
          "notes": null
        }
      ]
    }
  ],
  "gdsStyleDisplay": [
    "01 AIRLINE FLIGHT CLASS DATE ROUTE DEPARTURE ARRIVAL STATUS"
  ],
  "warnings": [
    "List any missing, unclear, conflicting, or inferred information here."
  ]
}`;

/**
 * Format GDS Reference lines for display
 */
export function buildGdsStyleReferenceLines(segments = []) {
  if (!Array.isArray(segments) || segments.length === 0) return [];
  return segments.map((seg, idx) => {
    const num = String(idx + 1).padStart(2, '0');
    const carrier = seg.carrier_code || seg.marketingAirlineCode || 'XX';
    const flight = seg.flight_number || seg.flightNumber || '0000';
    const cls = seg.bookingClass || seg.booking_class || 'Y';
    const depDateStr = seg.departureDate || seg.departure_date;
    
    let dateFmt = 'DDMMM';
    if (depDateStr) {
      const parts = depDateStr.split('-');
      if (parts.length === 3) {
        const mIdx = parseInt(parts[1], 10) - 1;
        const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        dateFmt = `${parts[2]}${months[mIdx] || 'MMM'}`;
      }
    }

    const from = seg.departureAirport || seg.origin_airport || 'XXX';
    const to = seg.arrivalAirport || seg.destination_airport || 'XXX';
    const depTime = (seg.departureTime || seg.departure_time || '00:00').replace(':', '');
    const arrTime = (seg.arrivalTime || seg.arrival_time || '00:00').replace(':', '');
    const status = 'NN1';

    return `${num} ${carrier} ${flight} ${cls} ${dateFmt} ${from}${to} ${depTime} ${arrTime} ${status}`;
  });
}

function normalizeJsonSegment(s, journeyType, seqOrder, warnings) {
  const carrierCode = (s.marketingAirlineCode || s.operatingAirlineCode || s.carrier_code || s.carrier || '').trim().toUpperCase();
  const carrierName = s.marketingAirlineName || s.operatingAirlineName || s.carrier_name || resolveAirlineName(carrierCode) || 'Airline';
  const flightNumber = String(s.flightNumber || s.flight_number || s.flight || '').trim();
  const depAirport = (s.departureAirport || s.origin_airport || s.from || '').trim().toUpperCase();
  const arrAirport = (s.arrivalAirport || s.destination_airport || s.to || '').trim().toUpperCase();

  if (!depAirport || depAirport.length !== 3) {
    warnings.push(`Segment ${seqOrder}: Departure airport code is missing or invalid.`);
  }
  if (!arrAirport || arrAirport.length !== 3) {
    warnings.push(`Segment ${seqOrder}: Arrival airport code is missing or invalid.`);
  }

  const depDate = parseDateString(s.departureDate || s.departure_date);
  const depTime = parseTimeString(s.departureTime || s.departure_time);
  const arrDate = parseDateString(s.arrivalDate || s.arrival_date) || depDate;
  const arrTime = parseTimeString(s.arrivalTime || s.arrival_time);

  if (!depDate) warnings.push(`Segment ${seqOrder}: Departure date is missing or incomplete.`);
  if (!depTime) warnings.push(`Segment ${seqOrder}: Departure time is missing.`);
  if (!arrTime) warnings.push(`Segment ${seqOrder}: Arrival time is missing.`);

  return {
    segmentOrder: s.segmentOrder || seqOrder,
    direction: journeyType === 'return' ? 'return' : 'outbound',
    journey_direction: journeyType === 'return' ? 'return' : 'outbound',
    segment_sequence: seqOrder,
    carrier_code: carrierCode,
    marketing_carrier_code: carrierCode,
    carrier_name: carrierName,
    marketingAirlineName: carrierName,
    marketingAirlineCode: carrierCode,
    operatingAirlineName: s.operatingAirlineName || carrierName,
    operatingAirlineCode: s.operatingAirlineCode || carrierCode,
    flight_number: flightNumber,
    flightNumber,
    booking_class: s.bookingClass || s.booking_class || 'Y',
    bookingClass: s.bookingClass || s.booking_class || 'Y',
    cabin: s.cabin || CLASS_CABIN_MAP[s.bookingClass] || 'Economy',
    origin_airport: depAirport,
    departureAirport: depAirport,
    origin_city: s.departureCity || resolveCityName(depAirport),
    departureCity: s.departureCity || resolveCityName(depAirport),
    departureTerminal: s.departureTerminal || s.dep_terminal || '',
    dep_terminal: s.departureTerminal || s.dep_terminal || '',
    destination_airport: arrAirport,
    arrivalAirport: arrAirport,
    destination_city: s.arrivalCity || resolveCityName(arrAirport),
    arrivalCity: s.arrivalCity || resolveCityName(arrAirport),
    arrivalTerminal: s.arrivalTerminal || s.arr_terminal || '',
    arr_terminal: s.arrivalTerminal || s.arr_terminal || '',
    departure_date: depDate,
    departureDate: depDate,
    departure_time: depTime,
    departureTime: depTime,
    arrival_date: arrDate,
    arrivalDate: arrDate,
    arrival_time: arrTime,
    arrivalTime: arrTime,
    aircraftType: s.aircraftType || s.aircraft || null,
    aircraft: s.aircraftType || s.aircraft || null,
    durationMinutes: s.durationMinutes || null,
    layoverAfterMinutes: s.layoverAfterMinutes || null,
    overnightArrival: Boolean(s.overnightArrival),
    notes: s.notes || null
  };
}

export function parseStructuredJsonItinerary(rawText) {
  let cleaned = String(rawText || '').trim();
  if (cleaned.includes('```')) {
    cleaned = cleaned.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  }
  
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed || typeof parsed !== 'object') return null;
    
    const journeys = Array.isArray(parsed.journeys) ? parsed.journeys : [];
    if (journeys.length === 0 && !Array.isArray(parsed.segments)) {
      return null;
    }

    const warnings = Array.isArray(parsed.warnings) ? [...parsed.warnings] : [];
    const formattedJourneys = [];
    const flatSegments = [];

    const tripTypeRaw = String(parsed.tripType || parsed.trip || 'round_trip').toLowerCase();
    const tripType = tripTypeRaw.includes('round') ? 'round_trip' : (tripTypeRaw.includes('multi') ? 'multi_city' : 'one_way');

    if (journeys.length > 0) {
      journeys.forEach((j, jIdx) => {
        const jType = String(j.journeyType || (jIdx === 0 ? 'outbound' : 'return')).toLowerCase();
        const rawSegs = Array.isArray(j.segments) ? j.segments : [];
        const normSegs = rawSegs.map((s, sIdx) => {
          const normSeg = normalizeJsonSegment(s, jType, sIdx + 1, warnings);
          flatSegments.push(normSeg);
          return normSeg;
        });
        formattedJourneys.push({
          journeyType: jType,
          segments: normSegs
        });
      });
    } else if (Array.isArray(parsed.segments)) {
      const normSegs = parsed.segments.map((s, sIdx) => {
        const jType = (s.direction || 'outbound').toLowerCase();
        const normSeg = normalizeJsonSegment(s, jType, sIdx + 1, warnings);
        flatSegments.push(normSeg);
        return normSeg;
      });
      formattedJourneys.push({
        journeyType: 'outbound',
        segments: normSegs
      });
    }

    const gdsStyleDisplay = Array.isArray(parsed.gdsStyleDisplay) && parsed.gdsStyleDisplay.length > 0
      ? parsed.gdsStyleDisplay
      : buildGdsStyleReferenceLines(flatSegments);

    return {
      success: true,
      data: {
        tripType,
        source: parsed.source || 'json',
        currency: parsed.currency || null,
        displayedPrice: parsed.displayedPrice || null,
        passengerCount: parsed.passengerCount || parsed.passengers || 1,
        journeys: formattedJourneys,
        gdsStyleDisplay
      },
      warnings,
      segments: flatSegments
    };
  } catch (err) {
    return null;
  }
}

/**
 * Parse date string (10SEP2026, 2026-09-10, 10/09/2026, 10-09-2026) to YYYY-MM-DD
 */
export function parseDateString(dateStr) {
  if (!dateStr) return null;
  const cleaned = String(dateStr).trim().toUpperCase();

  // DDMMMYYYY (e.g. 10SEP2026 or 10-SEP-2026)
  const ddmmyyyyMatch = cleaned.match(/^(\d{1,2})[-/]?([A-Z]{3})[-/]?(\d{2,4})$/);
  if (ddmmyyyyMatch) {
    const day = ddmmyyyyMatch[1].padStart(2, '0');
    const month = MONTH_MAP[ddmmyyyyMatch[2]];
    let year = ddmmyyyyMatch[3];
    if (year.length === 2) year = '20' + year;
    if (month) return `${year}-${month}-${day}`;
  }

  // YYYY-MM-DD
  const isoMatch = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return cleaned;

  // DD/MM/YYYY or DD-MM-YYYY
  const ddmmyyyyNumMatch = cleaned.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (ddmmyyyyNumMatch) {
    const day = ddmmyyyyNumMatch[1].padStart(2, '0');
    const month = ddmmyyyyNumMatch[2].padStart(2, '0');
    const year = ddmmyyyyNumMatch[3];
    return `${year}-${month}-${day}`;
  }

  return null;
}

/**
 * Parse time string (0825, 08:25) to HH:MM (24h)
 */
export function parseTimeString(timeStr) {
  if (!timeStr) return null;
  const cleaned = String(timeStr).trim();

  // HH:MM
  const colonMatch = cleaned.match(/^(\d{1,2}):(\d{2})$/);
  if (colonMatch) {
    const h = parseInt(colonMatch[1], 10);
    const m = parseInt(colonMatch[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    return null;
  }

  // HHMM
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

/**
 * Format date object to YYYY-MM-DD
 */
function formatDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calculate arrival date adding offset days or explicit date
 */
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

/**
 * Resolve city name from airport code using GLOBAL_AIRPORTS database
 */
export function resolveCityName(iataCode) {
  if (!iataCode) return '';
  const code = String(iataCode).trim().toUpperCase();
  const match = GLOBAL_AIRPORTS.find(a => a.code === code);
  return match ? match.city : code;
}

/**
 * Core GDS itinerary text parser
 */
export function parseGdsItineraryText(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return {
      success: false,
      errors: ['No itinerary text provided.'],
      warnings: [],
      segments: [],
      data: null,
      tripType: 'one_way',
      passengers: 1,
      cabin: 'ECONOMY'
    };
  }

  // 1. Try Structured JSON Parser first
  const jsonResult = parseStructuredJsonItinerary(rawText);
  if (jsonResult) {
    return jsonResult;
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

  // Temporary accumulator for Format A (labeled key-value blocks)
  let currentLabeledSegment = null;
  let labeledSegmentLineStart = null;

  function flushLabeledSegment() {
    if (!currentLabeledSegment) return;

    const seg = currentLabeledSegment;
    const lineNum = labeledSegmentLineStart || 1;

    // Validate labeled fields
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
    if (seg.plus_days) {
      offsetDays = parseInt(seg.plus_days, 10) || 0;
    }
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

    const airlineName = resolveAirlineName(carrier);
    if (!getAirlineName(carrier)) {
      warnings.push(`Line ${lineNum}: Unknown carrier code "${carrier}". Please review airline name.`);
    }

    if (!GLOBAL_AIRPORTS.some(a => a.code === from)) {
      warnings.push(`Line ${lineNum}: Unknown origin airport code "${from}". Please review city/airport name.`);
    }
    if (!GLOBAL_AIRPORTS.some(a => a.code === to)) {
      warnings.push(`Line ${lineNum}: Unknown destination airport code "${to}". Please review city/airport name.`);
    }

    const cabinMapped = seg.cabin || CLASS_CABIN_MAP[cls] || defaultCabin;
    const direction = currentSection === 'return' ? 'return' : 'outbound';
    const seq = direction === 'outbound' ? outboundSeq++ : returnSeq++;

    segments.push({
      lineNum,
      direction,
      journey_direction: direction,
      segment_sequence: seq,
      carrier_code: carrier,
      marketing_carrier_code: carrier,
      carrier_name: airlineName,
      flight_number: flight,
      booking_class: cls,
      cabin: cabinMapped,
      origin_airport: from,
      origin_city: resolveCityName(from),
      destination_airport: to,
      destination_city: resolveCityName(to),
      departure_date: depDate || depDateRaw,
      departure_time: depTime || depTimeRaw,
      arrival_date: arrDate || depDate || depDateRaw,
      arrival_time: arrTime || arrTimeRaw,
      stop_count: parseInt(seg.stops || 0, 10),
      operated_by: seg.operated_by || null,
      aircraft: seg.aircraft || null,
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
    const rawLine = lines[idx];
    const trimmed = rawLine.trim();

    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//') || /^[-=]{3,}$/.test(trimmed)) {
      continue;
    }

    const upper = trimmed.toUpperCase();

    // 1. Headers parsing
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

    // 2. Section Dividers
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

    // 3. Surface Transfer ARNK prefix
    if (upper.startsWith('ARNK')) {
      flushLabeledSegment();
      hasArnukPending = true;
      continue;
    }

    // 4. Format B — Compact Segment Line (`SS ...`)
    if (upper.startsWith('SS ')) {
      flushLabeledSegment();

      const tokens = trimmed.split(/\s+/);
      // Expected tokens: SS [CARRIER] [FLIGHT] [CLASS] [DATE] [FROM] [TO] [DEPARTURE] [ARRIVAL] ...
      if (tokens.length < 9) {
        errors.push(`Line ${lineNum}: Incomplete SS compact line. Expected format: "SS CARRIER FLIGHT CLASS DATE FROM TO DEPARTURE ARRIVAL"`);
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

      // Check if tokens[8] is an explicit arrival date (e.g. SS AI 101 Y 10SEP2026 DEL JFK 2300 11SEP2026 0630)
      if (parseDateString(tokens[8]) && tokens[9]) {
        explicitArrDateRaw = tokens[8];
        arrTimeRaw = tokens[9];
        nextTokenIdx = 10;
        if (tokens[10] && tokens[10].match(/^\+(\d+)$/)) {
          offsetDays = parseInt(tokens[10].match(/^\+(\d+)$/)[1], 10);
          nextTokenIdx = 11;
        }
      } else if (tokens[9] && tokens[9].match(/^\+(\d+)$/)) {
        // Check if +1 / +2 follows arrival time
        offsetDays = parseInt(tokens[9].match(/^\+(\d+)$/)[1], 10);
        nextTokenIdx = 10;
      }

      // Parse dates & times
      const depDate = parseDateString(dateRaw);
      const depTime = parseTimeString(depTimeRaw);
      const arrTime = parseTimeString(arrTimeRaw);
      const arrDate = calculateArrivalDate(depDate, offsetDays, explicitArrDateRaw);

      // Validations
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

      // Lookups
      const airlineName = resolveAirlineName(carrier);
      if (!getAirlineName(carrier)) {
        warnings.push(`Line ${lineNum}: Unknown carrier code "${carrier}". Please review airline name.`);
      }

      if (!GLOBAL_AIRPORTS.some(a => a.code === from)) {
        warnings.push(`Line ${lineNum}: Unknown origin airport code "${from}". Please review city/airport name.`);
      }
      if (!GLOBAL_AIRPORTS.some(a => a.code === to)) {
        warnings.push(`Line ${lineNum}: Unknown destination airport code "${to}". Please review city/airport name.`);
      }

      // Optional Key=Value params
      let stops = 0;
      let cabinOverride = null;
      let operatedBy = null;
      let aircraft = null;
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
        lineNum,
        direction,
        journey_direction: direction,
        segment_sequence: seq,
        carrier_code: carrier,
        marketing_carrier_code: carrier,
        carrier_name: airlineName,
        flight_number: flight,
        booking_class: cls,
        cabin: cabinMapped,
        origin_airport: from,
        origin_city: resolveCityName(from),
        destination_airport: to,
        destination_city: resolveCityName(to),
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

    // 5. Format A — Labeled Format Key-Value lines (`CARRIER: F9`, `FLIGHT: 1496`, etc.)
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

  if (hasReturnSection && tripType === 'ONE_WAY') {
    tripType = 'ROUND_TRIP';
  }
  if (hasMultiJourney) {
    tripType = 'MULTI_CITY';
  }

  const outboundSegments = segments.filter(s => s.direction === 'outbound');
  const returnSegments = segments.filter(s => s.direction === 'return');
  const journeys = [];
  if (outboundSegments.length > 0) {
    journeys.push({ journeyType: 'outbound', segments: outboundSegments });
  }
  if (returnSegments.length > 0) {
    journeys.push({ journeyType: 'return', segments: returnSegments });
  }

  // Check route continuity between sequential segments
  const routeWarnings = checkRouteContinuity(segments);
  warnings.push(...routeWarnings);

  const isSuccess = errors.length === 0 && segments.length > 0;
  const gdsStyleDisplay = buildGdsStyleReferenceLines(segments);

  return {
    success: isSuccess,
    errors,
    warnings,
    segments,
    tripType: tripType.toLowerCase(),
    passengers,
    cabin: defaultCabin,
    totalSegments: segments.length,
    data: {
      tripType: tripType.toLowerCase(),
      passengerCount: passengers,
      journeys,
      gdsStyleDisplay
    }
  };
}

/**
 * Validate route continuity between sequential connecting segments
 */
export function checkRouteContinuity(segments = []) {
  const warnings = [];
  if (!Array.isArray(segments) || segments.length <= 1) return warnings;

  for (let i = 0; i < segments.length - 1; i++) {
    const curr = segments[i];
    const next = segments[i + 1];

    // Route continuity check applies within the same journey/direction
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
