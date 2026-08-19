export const CHATGPT_PROMPT_TEMPLATE = `You are an expert travel agent GDS itinerary assistant.

When given an itinerary, convert it ONLY into raw GDS-style lines format matching this exact syntax:

01 DL 106 Y 15SEP JFKLHR 1930 0745 NN1

Rules:
1. Return ONLY the raw GDS lines.
2. Do NOT output JSON, Markdown code blocks, explanations, titles, or headers.
3. Each flight segment (including all connecting flights) must be on a separate line.
4. Format: [SegNum] [Carrier] [FlightNum] [Class] [DDMMM] [OriginDest] [DepTime] [ArrTime] [Status]
Example for 3 connecting segments:
01 AA 1224 Y 12AUG EWRCLT 1920 2128 NN1
02 AA 770 Y 13AUG CLTMIA 0705 0912 NN1
03 AA 1127 Y 13AUG MIAMDE 1020 1248 NN1`;

const MONTH_MAP = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12'
};

const MONTH_NAMES = {
  '01': 'JAN', '02': 'FEB', '03': 'MAR', '04': 'APR', '05': 'MAY', '06': 'JUN',
  '07': 'JUL', '08': 'AUG', '09': 'SEP', '10': 'OCT', '11': 'NOV', '12': 'DEC'
};

export function parseGdsLine(rawLine, travelYear = new Date().getFullYear(), lineIndex = 1) {
  if (!rawLine || typeof rawLine !== 'string') return null;
  const trimmed = rawLine.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return null;

  // Extract optional leading segment number e.g. "01 " or "1. "
  let working = trimmed;
  let explicitSegNum = null;
  const segNumMatch = working.match(/^(\d{1,2})[\s.:]+/);
  if (segNumMatch) {
    explicitSegNum = parseInt(segNumMatch[1], 10);
    working = working.substring(segNumMatch[0].length).trim();
  }

  const tokens = working.split(/\s+/);
  if (tokens.length < 5) {
    return {
      error: `Line ${lineIndex}: Invalid format. Expected GDS format like "01 DL 106 Y 15SEP JFKLHR 1930 0745 NN1"`,
      rawLine: trimmed
    };
  }

  let carrier = '';
  let flightNumber = '';
  let tokenIdx = 0;

  // Check if token[0] is merged carrier+flight e.g. DL106
  const mergedMatch = tokens[0].match(/^([A-Z0-9]{2,3})(\d{1,4}[A-Z]?)$/i);
  if (mergedMatch) {
    carrier = mergedMatch[1].toUpperCase();
    flightNumber = mergedMatch[2].toUpperCase();
    tokenIdx = 1;
  } else {
    carrier = tokens[0].toUpperCase();
    flightNumber = (tokens[1] || '').toUpperCase();
    tokenIdx = 2;
  }

  const bookingClass = (tokens[tokenIdx] || 'Y').toUpperCase();
  tokenIdx++;

  const dateStr = (tokens[tokenIdx] || '').toUpperCase();
  tokenIdx++;

  const routeStr = (tokens[tokenIdx] || '').toUpperCase();
  tokenIdx++;

  const depTimeRaw = tokens[tokenIdx] || '0000';
  tokenIdx++;

  const arrTimeRaw = tokens[tokenIdx] || '0000';
  tokenIdx++;

  const status = (tokens[tokenIdx] || 'NN1').toUpperCase();

  // Validate carrier & flight number
  if (!/^[A-Z0-9]{2,3}$/.test(carrier)) {
    return { error: `Line ${lineIndex}: Invalid carrier code "${carrier}"`, rawLine: trimmed };
  }
  if (!/^\d{1,4}[A-Z]?$/i.test(flightNumber)) {
    return { error: `Line ${lineIndex}: Invalid flight number "${flightNumber}"`, rawLine: trimmed };
  }

  // Parse date DDMMM e.g. 15SEP
  const dateMatch = dateStr.match(/^(\d{1,2})([A-Z]{3})$/);
  let depDateIso = null;
  let depDateDisplay = null;
  if (dateMatch) {
    const day = dateMatch[1].padStart(2, '0');
    const month = MONTH_MAP[dateMatch[2]];
    if (month) {
      depDateIso = `${travelYear}-${month}-${day}`;
      depDateDisplay = `${month}/${day}/${travelYear}`;
    }
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    depDateIso = dateStr;
    const parts = dateStr.split('-');
    depDateDisplay = `${parts[1]}/${parts[2]}/${parts[0]}`;
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
    const parts = dateStr.split('/');
    depDateDisplay = dateStr;
    depDateIso = `${parts[2]}-${parts[0]}-${parts[1]}`;
  }

  if (!depDateIso) {
    return { error: `Line ${lineIndex}: Invalid date "${dateStr}". Use format like 15SEP or MM/DD/YYYY`, rawLine: trimmed };
  }

  // Parse Route e.g. JFKLHR
  let origin = '';
  let destination = '';
  if (routeStr.length === 6) {
    origin = routeStr.substring(0, 3);
    destination = routeStr.substring(3, 6);
  } else {
    return { error: `Line ${lineIndex}: Invalid route "${routeStr}". Must be 6-letter origin/destination pair (e.g. JFKLHR)`, rawLine: trimmed };
  }

  // Parse times
  const depTime = formatTime24(depTimeRaw);
  const arrTime = formatTime24(arrTimeRaw);

  return {
    success: true,
    lineIndex,
    explicitSegNum: explicitSegNum || lineIndex,
    rawLine: trimmed,
    carrier_code: carrier,
    marketing_carrier_code: carrier,
    flight_number: flightNumber,
    flightNumber,
    booking_class: bookingClass,
    bookingClass,
    origin_airport: origin,
    departureAirport: origin,
    destination_airport: destination,
    arrivalAirport: destination,
    departure_date: depDateIso,
    departureDate: depDateIso,
    departure_date_display: depDateDisplay,
    departure_time: depTime,
    departureTime: depTime,
    arrival_time: arrTime,
    arrivalTime: arrTime,
    status,
    notes: `Original GDS Line: ${trimmed}`
  };
}

function formatTime24(timeRaw) {
  const clean = String(timeRaw || '').replace(':', '').trim();
  if (clean.length === 4) {
    return `${clean.substring(0, 2)}:${clean.substring(2, 4)}`;
  }
  return timeRaw || '00:00';
}

export function buildGdsStyleReferenceLines(segments = []) {
  if (!Array.isArray(segments) || segments.length === 0) return [];
  return segments.map((seg, idx) => {
    const num = String(idx + 1).padStart(2, '0');
    const carrier = seg.carrier_code || seg.marketing_carrier_code || 'XX';
    const flight = seg.flight_number || seg.flightNumber || '0000';
    const cls = seg.booking_class || seg.bookingClass || 'Y';
    const depDateStr = seg.departure_date || seg.departureDate;

    let dateFmt = 'DDMMM';
    if (depDateStr) {
      const parts = depDateStr.split('-');
      if (parts.length === 3) {
        const day = parts[2].padStart(2, '0');
        const monthCode = MONTH_NAMES[parts[1]] || 'MMM';
        dateFmt = `${day}${monthCode}`;
      }
    }

    const from = seg.origin_airport || seg.departureAirport || 'XXX';
    const to = seg.destination_airport || seg.arrivalAirport || 'XXX';
    const depTime = (seg.departure_time || seg.departureTime || '00:00').replace(':', '');
    const arrTime = (seg.arrival_time || seg.arrivalTime || '00:00').replace(':', '');
    const status = seg.status || 'NN1';

    return `${num} ${carrier} ${flight} ${cls} ${dateFmt} ${from}${to} ${depTime} ${arrTime} ${status}`;
  });
}

export function getArrivalDayShiftLabel(depDateStr, arrDateStr) {
  if (!depDateStr || !arrDateStr) return 'ARRIVAL';

  const parseToIso = (dStr) => {
    if (!dStr) return null;
    const clean = String(dStr).split('T')[0].trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(clean)) {
      const p = clean.split('/');
      return `${p[2]}-${p[0]}-${p[1]}`;
    }
    return null;
  };

  const isoDep = parseToIso(depDateStr);
  const isoArr = parseToIso(arrDateStr);

  if (!isoDep || !isoArr) return 'ARRIVAL';

  const dDep = new Date(isoDep);
  const dArr = new Date(isoArr);

  const diffTime = dArr.getTime() - dDep.getTime();
  const diffDays = Math.round(diffTime / (1000 * 3600 * 24));

  if (diffDays <= 0) return 'ARRIVAL';
  return `ARRIVAL +${diffDays}`;
}

export function calculateLayoverDuration(arrDateStr, arrTimeStr, depDateStr, depTimeStr) {
  if (!arrDateStr || !depDateStr || !arrTimeStr || !depTimeStr) return 'Connection';

  try {
    const parseToIso = (dStr) => {
      const clean = String(dStr).split('T')[0].trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(clean)) {
        const p = clean.split('/');
        return `${p[2]}-${p[0]}-${p[1]}`;
      }
      return clean;
    };

    const isoArr = parseToIso(arrDateStr);
    const isoDep = parseToIso(depDateStr);

    const [arrH, arrM] = (arrTimeStr || '00:00').split(':').map(Number);
    const [depH, depM] = (depTimeStr || '00:00').split(':').map(Number);

    const dateArr = new Date(`${isoArr}T${String(arrH).padStart(2, '0')}:${String(arrM).padStart(2, '0')}:00`);
    const dateDep = new Date(`${isoDep}T${String(depH).padStart(2, '0')}:${String(depM).padStart(2, '0')}:00`);

    const diffMinutes = Math.round((dateDep.getTime() - dateArr.getTime()) / (1000 * 60));
    if (diffMinutes <= 0 || isNaN(diffMinutes)) return 'Connection';

    const hours = Math.floor(diffMinutes / 60);
    const mins = diffMinutes % 60;

    if (hours > 0 && mins > 0) return `Layover ${hours}h ${mins}m`;
    if (hours > 0) return `Layover ${hours}h`;
    return `Layover ${mins}m`;
  } catch (e) {
    return 'Connection';
  }
}

const AIRLINE_NAMES = {
  AA: 'American Airlines',
  DL: 'Delta Air Lines',
  UA: 'United Airlines',
  BA: 'British Airways',
  LH: 'Lufthansa',
  AF: 'Air France',
  KL: 'KLM Royal Dutch Airlines',
  EK: 'Emirates',
  QR: 'Qatar Airways',
  SQ: 'Singapore Airlines',
  CX: 'Cathay Pacific',
  TK: 'Turkish Airlines',
  AC: 'Air Canada',
  B6: 'JetBlue Airways',
  AS: 'Alaska Airlines',
  NK: 'Spirit Airlines',
  F9: 'Frontier Airlines',
  WN: 'Southwest Airlines',
  '6E': 'IndiGo'
};

export function resolveAirlineName(carrierCode, providedName) {
  if (providedName && typeof providedName === 'string' && providedName.trim()) {
    const p = providedName.trim();
    if (!p.toLowerCase().includes('airline information unavailable') && !p.toLowerCase().includes('commercial airline')) {
      return p;
    }
  }
  const code = (carrierCode || '').trim().toUpperCase();
  if (AIRLINE_NAMES[code]) return AIRLINE_NAMES[code];
  if (code) return `${code} Airlines`;
  return 'Airline';
}

export function getCarrierLogoUrl(carrierCode) {
  const code = (carrierCode || '').trim().toUpperCase();
  if (!code) return '';
  return `https://assets.duffel.com/img/airlines/for-floor/sq/${code}.png`;
}
