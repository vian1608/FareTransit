import Handlebars from 'handlebars';

/**
 * Canonical Airline Lookup Service & Itinerary Builder
 * Shared airline directory & normalized itinerary mapper across emails, PDF evidence, and UI.
 */
export const AIRLINE_DIRECTORY = [
  { name: 'United Airlines', iataCode: 'UA', icaoCode: 'UAL', logoUrl: '/airlines/ua.png' },
  { name: 'Delta Air Lines', iataCode: 'DL', icaoCode: 'DAL', logoUrl: '/airlines/dl.png' },
  { name: 'American Airlines', iataCode: 'AA', icaoCode: 'AAL', logoUrl: '/airlines/aa.png' },
  { name: 'Southwest Airlines', iataCode: 'WN', icaoCode: 'SWA', logoUrl: '/airlines/wn.png' },
  { name: 'Alaska Airlines', iataCode: 'AS', icaoCode: 'ASA', logoUrl: '/airlines/as.png' },
  { name: 'JetBlue', iataCode: 'B6', icaoCode: 'JBU', logoUrl: '/airlines/b6.png' },
  { name: 'Spirit Airlines', iataCode: 'NK', icaoCode: 'NKS', logoUrl: '/airlines/nk.png' },
  { name: 'Frontier Airlines', iataCode: 'F9', icaoCode: 'FFT', logoUrl: '/airlines/f9.png' },
  { name: 'Air Canada', iataCode: 'AC', icaoCode: 'ACA', logoUrl: '/airlines/ac.png' },
  { name: 'British Airways', iataCode: 'BA', icaoCode: 'BAW', logoUrl: '/airlines/ba.png' },
  { name: 'Virgin Atlantic', iataCode: 'VS', icaoCode: 'VIR', logoUrl: '/airlines/vs.png' },
  { name: 'Lufthansa', iataCode: 'LH', icaoCode: 'DLH', logoUrl: '/airlines/lh.png' },
  { name: 'Air France', iataCode: 'AF', icaoCode: 'AFR', logoUrl: '/airlines/af.png' },
  { name: 'KLM', iataCode: 'KL', icaoCode: 'KLM', logoUrl: '/airlines/kl.png' },
  { name: 'Emirates', iataCode: 'EK', icaoCode: 'UAE', logoUrl: '/airlines/ek.png' },
  { name: 'Qatar Airways', iataCode: 'QR', icaoCode: 'QTR', logoUrl: '/airlines/qr.png' },
  { name: 'Turkish Airlines', iataCode: 'TK', icaoCode: 'THY', logoUrl: '/airlines/tk.png' },
  { name: 'Singapore Airlines', iataCode: 'SQ', icaoCode: 'SIA', logoUrl: '/airlines/sq.png' },
  { name: 'Cathay Pacific', iataCode: 'CX', icaoCode: 'CPA', logoUrl: '/airlines/cx.png' },
  { name: 'Qantas', iataCode: 'QF', icaoCode: 'QFA', logoUrl: '/airlines/qf.png' },
  { name: 'ANA (All Nippon Airways)', iataCode: 'NH', icaoCode: 'ANA', logoUrl: '/airlines/nh.png' },
  { name: 'Japan Airlines', iataCode: 'JL', icaoCode: 'JAL', logoUrl: '/airlines/jl.png' },
  { name: 'Etihad Airways', iataCode: 'EY', icaoCode: 'ETD', logoUrl: '/airlines/ey.png' },
  { name: 'ITA Airways', iataCode: 'AZ', icaoCode: 'ITY', logoUrl: '/airlines/az.png' },
  { name: 'Iberia', iataCode: 'IB', icaoCode: 'IBE', logoUrl: '/airlines/ib.png' },
  { name: 'Finnair', iataCode: 'AY', icaoCode: 'FIN', logoUrl: '/airlines/ay.png' },
  { name: 'SAS Scandinavian Airlines', iataCode: 'SK', icaoCode: 'SAS', logoUrl: '/airlines/sk.png' },
  { name: 'Swiss International Air Lines', iataCode: 'LX', icaoCode: 'SWR', logoUrl: '/airlines/lx.png' },
  { name: 'Austrian Airlines', iataCode: 'OS', icaoCode: 'AUA', logoUrl: '/airlines/os.png' },
  { name: 'Brussels Airlines', iataCode: 'SN', icaoCode: 'BEL', logoUrl: '/airlines/sn.png' },
  { name: 'TAP Air Portugal', iataCode: 'TP', icaoCode: 'TAP', logoUrl: '/airlines/tp.png' },
  { name: 'Icelandair', iataCode: 'FI', icaoCode: 'ICE', logoUrl: '/airlines/fi.png' },
  { name: 'Aer Lingus', iataCode: 'EI', icaoCode: 'EIN', logoUrl: '/airlines/ei.png' },
  { name: 'LOT Polish Airlines', iataCode: 'LO', icaoCode: 'LOT', logoUrl: '/airlines/lo.png' },
  { name: 'Air India', iataCode: 'AI', icaoCode: 'AIC', logoUrl: '/airlines/ai.png' },
  { name: 'IndiGo', iataCode: '6E', icaoCode: 'IGO', logoUrl: '/airlines/6e.png' },
  { name: 'Vistara', iataCode: 'UK', icaoCode: 'VTI', logoUrl: '/airlines/uk.png' },
  { name: 'Malaysia Airlines', iataCode: 'MH', icaoCode: 'MAS', logoUrl: '/airlines/mh.png' },
  { name: 'AirAsia', iataCode: 'AK', icaoCode: 'AXM', logoUrl: '/airlines/ak.png' },
  { name: 'Philippine Airlines', iataCode: 'PR', icaoCode: 'PAL', logoUrl: '/airlines/pr.png' },
  { name: 'EVA Air', iataCode: 'BR', icaoCode: 'EVA', logoUrl: '/airlines/br.png' },
  { name: 'China Airlines', iataCode: 'CI', icaoCode: 'CAL', logoUrl: '/airlines/ci.png' },
  { name: 'Korean Air', iataCode: 'KE', icaoCode: 'KAL', logoUrl: '/airlines/ke.png' },
  { name: 'Asiana Airlines', iataCode: 'OZ', icaoCode: 'AAR', logoUrl: '/airlines/oz.png' },
  { name: 'Saudia', iataCode: 'SV', icaoCode: 'SVA', logoUrl: '/airlines/sv.png' },
  { name: 'Ethiopian Airlines', iataCode: 'ET', icaoCode: 'ETH', logoUrl: '/airlines/et.png' },
  { name: 'EgyptAir', iataCode: 'MS', icaoCode: 'MSR', logoUrl: '/airlines/ms.png' },
  { name: 'Royal Jordanian', iataCode: 'RJ', icaoCode: 'RJA', logoUrl: '/airlines/rj.png' },
  { name: 'Avianca', iataCode: 'AV', icaoCode: 'AVA', logoUrl: '/airlines/av.png' },
  { name: 'Copa Airlines', iataCode: 'CM', icaoCode: 'CMP', logoUrl: '/airlines/cm.png' },
  { name: 'LATAM Airlines', iataCode: 'LA', icaoCode: 'LAN', logoUrl: '/airlines/la.png' },
  { name: 'Aeromexico', iataCode: 'AM', icaoCode: 'AMX', logoUrl: '/airlines/am.png' },
  { name: 'Volaris', iataCode: 'Y4', icaoCode: 'VOI', logoUrl: '/airlines/y4.png' },
  { name: 'Viva Aerobus', iataCode: 'VB', icaoCode: 'VIV', logoUrl: '/airlines/vb.png' },
  { name: 'Azul Brazilian Airlines', iataCode: 'AD', icaoCode: 'AZU', logoUrl: '/airlines/ad.png' },
  { name: 'GOL Linhas Aereas', iataCode: 'G3', icaoCode: 'GLO', logoUrl: '/airlines/g3.png' }
];

const AIRLINE_MAP = new Map(AIRLINE_DIRECTORY.map(a => [a.iataCode, a.name]));
const AIRLINE_NAME_TO_CODE = new Map(AIRLINE_DIRECTORY.map(a => [a.name.toLowerCase(), a.iataCode]));
const presentationCache = new Map();
const MAX_PRESENTATION_CACHE = 300;

const genericAirlineName = value => {
  const text = String(value || '').trim().toLowerCase();
  return !text || text === 'airline' || text === 'mixed' || text.includes('commercial airline') || text.includes('information unavailable') || text.includes('unknown airline');
};

const escapeHtml = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

function formatDisplayDate(value) {
  if (!value) return 'Not provided';
  const raw = String(value).slice(0, 10);
  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function formatDisplayTime(value) {
  if (!value) return '—';
  const raw = String(value).trim();
  const match = raw.match(/^(\d{1,2}):?(\d{2})/);
  if (!match) return escapeHtml(raw);
  const hour = Number(match[1]);
  const minute = match[2];
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${minute} ${suffix}`;
}

function displayGender(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (['M', 'MALE'].includes(normalized)) return 'Male';
  if (['F', 'FEMALE'].includes(normalized)) return 'Female';
  if (['X', 'OTHER', 'NON-BINARY', 'NONBINARY'].includes(normalized)) return 'Other';
  return value ? String(value) : 'Not provided';
}

function displayRole(value) {
  const normalized = String(value || 'adult').trim().toLowerCase();
  if (normalized === 'child') return 'Child';
  if (normalized === 'infant') return 'Infant';
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : 'Adult';
}

function maskDocument(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'Not provided';
  return raw.length <= 4 ? `•••• ${escapeHtml(raw)}` : `•••• ${escapeHtml(raw.slice(-4))}`;
}

function inferCodeFromFlightNumber(value) {
  const raw = String(value || '').trim().toUpperCase();
  const compact = raw.replace(/\s+/g, '');
  const match = compact.match(/^([A-Z0-9]{2})(?=\d{1,4}[A-Z]?$)/);
  return match ? match[1] : '';
}

function inferCodeFromAirlineName(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || genericAirlineName(raw)) return '';
  if (AIRLINE_NAME_TO_CODE.has(raw)) return AIRLINE_NAME_TO_CODE.get(raw);
  const match = AIRLINE_DIRECTORY.find(a => raw.includes(a.name.toLowerCase()) || a.name.toLowerCase().includes(raw));
  return match?.iataCode || '';
}

export function searchAirlines(query) {
  if (!query || typeof query !== 'string') return AIRLINE_DIRECTORY;
  const q = query.trim().toLowerCase();
  if (!q) return AIRLINE_DIRECTORY;
  return AIRLINE_DIRECTORY.filter(a => a.name.toLowerCase().includes(q) || a.iataCode.toLowerCase().includes(q) || (a.icaoCode || '').toLowerCase().includes(q));
}

export function getAirlineName(carrierCode) {
  if (!carrierCode) return null;
  return AIRLINE_MAP.get(String(carrierCode).trim().toUpperCase()) || null;
}

export function resolveAirlineName(carrierCode, providedName) {
  const code = String(carrierCode || '').trim().toUpperCase();
  if (!genericAirlineName(providedName)) return String(providedName).trim();
  const found = getAirlineName(code);
  if (found) return found;
  return code ? `${code} Airlines` : '';
}

export function getCarrierLogoUrl(carrierCode) {
  const code = String(carrierCode || '').trim().toUpperCase();
  if (!code) return '';
  const match = AIRLINE_DIRECTORY.find(a => a.iataCode === code);
  return match?.logoUrl || `https://assets.duffel.com/img/airlines/for-floor/sq/${code}.png`;
}

function extractRawSegments(bookingOrSegments) {
  if (Array.isArray(bookingOrSegments)) return bookingOrSegments;
  if (!bookingOrSegments || typeof bookingOrSegments !== 'object') return [];
  const b = bookingOrSegments;
  let rawSegments = Array.isArray(b.itinerary_segments) ? b.itinerary_segments : [];

  if (!rawSegments.length) {
    const out = Array.isArray(b.outbound_segments) ? b.outbound_segments : (Array.isArray(b.itinerary?.outbound) ? b.itinerary.outbound : []);
    const ret = Array.isArray(b.return_segments) ? b.return_segments : (Array.isArray(b.itinerary?.return) ? b.itinerary.return : []);
    if (out.length || ret.length) {
      rawSegments = [
        ...out.map(s => ({ ...s, journey_direction: s.journey_direction || s.direction || 'outbound' })),
        ...ret.map(s => ({ ...s, journey_direction: s.journey_direction || s.direction || 'return' }))
      ];
    }
  }

  if (!rawSegments.length && Array.isArray(b.flights) && b.flights.length) {
    rawSegments = b.flights.map(f => ({
      ...f,
      journey_direction: ['return', 'inbound'].includes(String(f.leg || f.direction || '').toLowerCase()) ? 'return' : 'outbound',
      origin_airport: f.departure_airport || f.origin_airport || f.origin || '',
      destination_airport: f.arrival_airport || f.destination_airport || f.destination || '',
      airline_name: genericAirlineName(f.airline_name || f.carrier_name) ? (b.airline_name || b.airline || b.carrier_name || '') : (f.airline_name || f.carrier_name || ''),
      carrier_code: f.carrier_code || f.marketing_carrier_code || b.carrier_code || b.airline_code || '',
      departure_time: f.departure_time_str || f.departure_time || '',
      arrival_time: f.arrival_time_str || f.arrival_time || '',
      cabin: f.cabin_class || f.cabin || 'Economy',
      stop_count: Number.parseInt(f.stops || 0, 10)
    }));
  }

  if (!rawSegments.length && (b.flight_details || b.outbound_flight)) {
    const candidate = b.flight_details || b.outbound_flight;
    if (candidate && typeof candidate === 'object') rawSegments = [candidate];
  }
  return rawSegments;
}

function normalizeSegment(s, idx, totalInDir, bookingContext = {}) {
  const rawFlightNumber = s.flight_number || s.flightNumber || s.number || '';
  const providedName = s.airline_name || s.carrier_name || s.airline || bookingContext.airline_name || bookingContext.airline || bookingContext.carrier_name || '';
  let code = String(s.marketing_carrier_code || s.carrier_code || s.carrier || s.airline_code || bookingContext.carrier_code || bookingContext.airline_code || '').trim().toUpperCase();
  if (!code) code = inferCodeFromFlightNumber(rawFlightNumber);
  if (!code) code = inferCodeFromAirlineName(providedName);

  const airlineName = resolveAirlineName(code, providedName) || 'Airline details pending';
  const originCode = String(s.origin_airport || s.departure_airport || s.origin_code || s.originCode || s.origin || s.departure?.airport || '').trim().toUpperCase();
  const destinationCode = String(s.destination_airport || s.arrival_airport || s.destination_code || s.destinationCode || s.destination || s.arrival?.airport || '').trim().toUpperCase();
  const flightNumber = String(rawFlightNumber).replace(new RegExp(`^${code}\\s*`, 'i'), '').trim() || String(rawFlightNumber).trim();

  return {
    id: s.id || `seg_${idx}`,
    sequence: s.segment_sequence !== undefined ? Number.parseInt(s.segment_sequence, 10) : idx + 1,
    airlineName,
    carrierCode: code,
    operatingCarrier: s.operating_carrier || s.operatingCarrier || '',
    flightNumber,
    airlineLogoUrl: getCarrierLogoUrl(code),
    originCode,
    originName: s.origin_city || s.originCity || s.departure?.city || originCode,
    destinationCode,
    destinationName: s.destination_city || s.destinationCity || s.arrival?.city || destinationCode,
    departureAt: s.departure_date || s.departure_time || s.departure_time_str || s.departure?.date || '',
    arrivalAt: s.arrival_date || s.arrival_time || s.arrival_time_str || s.arrival?.date || '',
    departureDate: s.departure_date || s.departureDate || s.departure?.date || '',
    departureTime: s.departure_time || s.departure_time_str || s.departureTime || s.departure?.time || '',
    arrivalDate: s.arrival_date || s.arrivalDate || s.arrival?.date || s.departure_date || s.departureDate || '',
    arrivalTime: s.arrival_time || s.arrival_time_str || s.arrivalTime || s.arrival?.time || '',
    cabinClass: s.cabin || s.cabin_class || s.class || s.cabinClass || 'Economy',
    aircraft: s.aircraft || s.aircraft_type || s.equipment || '',
    stops: s.stops !== undefined ? Number.parseInt(s.stops, 10) : (s.stop_count !== undefined ? Number.parseInt(s.stop_count, 10) : Math.max(0, totalInDir - 1))
  };
}

function rememberPresentation(booking, itinerary) {
  if (!booking || Array.isArray(booking) || typeof booking !== 'object') return;
  const key = String(booking.confirmation_code || booking.confirmationCode || booking.id || '').trim();
  if (!key) return;
  presentationCache.set(key, {
    passengers: Array.isArray(booking.travellers) ? booking.travellers : (Array.isArray(booking.passengers) ? booking.passengers : []),
    contacts: Array.isArray(booking.contacts) ? booking.contacts : [],
    email: booking.email || booking.customerEmail || '',
    phone: booking.phone || booking.customerPhone || '',
    passengerName: booking.passenger_name || booking.passengerName || '',
    itinerary
  });
  if (presentationCache.size > MAX_PRESENTATION_CACHE) {
    presentationCache.delete(presentationCache.keys().next().value);
  }
}

export function buildCanonicalItinerary(bookingOrSegments) {
  const bookingContext = (!Array.isArray(bookingOrSegments) && bookingOrSegments && typeof bookingOrSegments === 'object') ? bookingOrSegments : {};
  let rawSegments = extractRawSegments(bookingOrSegments).filter(s => {
    if (!s || typeof s !== 'object') return false;
    return Boolean(s.origin_airport || s.origin_code || s.originCode || s.origin || s.departure?.airport || s.departure_airport || s.destination_airport || s.destination_code || s.destinationCode || s.destination || s.arrival?.airport || s.arrival_airport || s.flight_number || s.flightNumber || s.carrier_code || s.airline_name || s.airline);
  });

  const outboundRaw = rawSegments.filter(s => !['return', 'inbound'].includes(String(s.journey_direction || s.direction || s.leg || '').toLowerCase()));
  const returnRaw = rawSegments.filter(s => ['return', 'inbound'].includes(String(s.journey_direction || s.direction || s.leg || '').toLowerCase()));
  const effectiveOutbound = outboundRaw.length ? outboundRaw : (returnRaw.length ? [] : rawSegments);

  const itinerary = {
    outbound: effectiveOutbound.map((s, i) => normalizeSegment(s, i, effectiveOutbound.length, bookingContext)),
    return: returnRaw.map((s, i) => normalizeSegment(s, i, returnRaw.length, bookingContext))
  };
  rememberPresentation(bookingContext, itinerary);
  return itinerary;
}

function passengerRowsHtml(data) {
  const passengers = Array.isArray(data?.passengers) && data.passengers.length
    ? data.passengers
    : [{ first_name: String(data?.passengerName || '').split(' ')[0] || 'Passenger', last_name: String(data?.passengerName || '').split(' ').slice(1).join(' ') }];
  return passengers.map((p, index) => {
    const name = [p.title, p.first_name || p.firstName, p.middle_name || p.middleName, p.last_name || p.lastName].filter(Boolean).join(' ') || `Passenger ${index + 1}`;
    const dob = p.date_of_birth || p.dateOfBirth || '';
    const gender = p.gender || '';
    const nationality = p.nationality || '';
    const role = p.role || p.passenger_type || p.passengerType || 'adult';
    const passport = p.passport_number || p.passportNumber || '';
    const expiry = p.passport_expiry || p.passportExpiry || '';
    return `
      <div style="border:1px solid #eadfe3;border-radius:10px;padding:13px 14px;margin-top:${index ? '10px' : '0'};background:#fff;">
        <div style="font-size:12px;color:#9f1239;font-weight:800;text-transform:uppercase;letter-spacing:.6px;">Passenger ${index + 1} · ${escapeHtml(displayRole(role))}</div>
        <div style="font-size:17px;color:#1f2937;font-weight:800;margin:5px 0 9px;">${escapeHtml(name)}</div>
        <table role="presentation" width="100%" style="border-collapse:collapse;font-size:13px;">
          <tr><td style="padding:4px 0;color:#667085;">Date of Birth</td><td style="padding:4px 0;text-align:right;color:#1f2937;font-weight:700;">${escapeHtml(formatDisplayDate(dob))}</td></tr>
          <tr><td style="padding:4px 0;color:#667085;">Gender</td><td style="padding:4px 0;text-align:right;color:#1f2937;font-weight:700;">${escapeHtml(displayGender(gender))}</td></tr>
          <tr><td style="padding:4px 0;color:#667085;">Nationality</td><td style="padding:4px 0;text-align:right;color:#1f2937;font-weight:700;">${escapeHtml(nationality || 'Not provided')}</td></tr>
          <tr><td style="padding:4px 0;color:#667085;">Passport / Document</td><td style="padding:4px 0;text-align:right;color:#1f2937;font-weight:700;">${maskDocument(passport)}</td></tr>
          <tr><td style="padding:4px 0;color:#667085;">Document Expiry</td><td style="padding:4px 0;text-align:right;color:#1f2937;font-weight:700;">${escapeHtml(formatDisplayDate(expiry))}</td></tr>
        </table>
      </div>`;
  }).join('');
}

function contactHtml(data) {
  const primary = data?.contacts?.[0] || {};
  const email = primary.email || data?.email || '';
  const phone = primary.phone_number || primary.phone || data?.phone || '';
  return `
    <div style="margin-top:12px;border-top:1px solid #f0e8eb;padding-top:10px;">
      <table role="presentation" width="100%" style="border-collapse:collapse;font-size:13px;">
        <tr><td style="padding:5px 0;color:#667085;">Contact Email</td><td style="padding:5px 0;text-align:right;color:#1f2937;font-weight:700;word-break:break-all;">${escapeHtml(email || 'Not provided')}</td></tr>
        <tr><td style="padding:5px 0;color:#667085;">Contact Phone</td><td style="padding:5px 0;text-align:right;color:#1f2937;font-weight:700;">${escapeHtml(phone || 'Not provided')}</td></tr>
      </table>
    </div>`;
}

function renderItineraryGroupHtml(label, segments) {
  if (!segments.length) return '';
  const first = segments[0];
  const last = segments[segments.length - 1];
  const cards = segments.map((seg, index) => {
    const flight = [seg.carrierCode, seg.flightNumber].filter(Boolean).join(' ') || 'Flight number pending';
    const layover = index < segments.length - 1
      ? calculateLayoverDuration(seg.arrivalDate, seg.arrivalTime, segments[index + 1].departureDate, segments[index + 1].departureTime)
      : null;
    return `
      <div style="border:1px solid #e2e8f0;border-radius:10px;padding:13px 14px;margin-top:10px;background:#fff;">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
          <div><div style="font-size:14px;font-weight:800;color:#1f2937;">${escapeHtml(seg.airlineName || 'Airline details pending')}</div><div style="font-size:12px;color:#64748b;margin-top:2px;">${escapeHtml(flight)} · ${escapeHtml(seg.cabinClass || 'Economy')}</div></div>
          <div style="font-size:12px;color:#64748b;text-align:right;">${escapeHtml(formatDisplayDate(seg.departureDate))}</div>
        </div>
        <table role="presentation" width="100%" style="border-collapse:collapse;margin-top:12px;">
          <tr>
            <td style="width:42%;vertical-align:top;"><div style="font-size:20px;font-weight:900;color:#173a63;">${escapeHtml(seg.originCode || '—')}</div><div style="font-size:13px;font-weight:700;color:#1f2937;">${escapeHtml(formatDisplayTime(seg.departureTime))}</div><div style="font-size:11px;color:#64748b;">${escapeHtml(seg.originName || '')}</div></td>
            <td style="width:16%;text-align:center;color:#9f1239;font-size:20px;font-weight:900;">→</td>
            <td style="width:42%;vertical-align:top;text-align:right;"><div style="font-size:20px;font-weight:900;color:#173a63;">${escapeHtml(seg.destinationCode || '—')}</div><div style="font-size:13px;font-weight:700;color:#1f2937;">${escapeHtml(formatDisplayTime(seg.arrivalTime))}</div><div style="font-size:11px;color:#64748b;">${escapeHtml(seg.destinationName || '')}</div></td>
          </tr>
        </table>
        ${seg.aircraft ? `<div style="margin-top:8px;font-size:11px;color:#64748b;">Aircraft: ${escapeHtml(seg.aircraft)}</div>` : ''}
      </div>
      ${layover ? `<div style="text-align:center;color:#8a5a00;font-size:12px;font-weight:700;padding:7px 0 0;">${escapeHtml(layover)} at ${escapeHtml(seg.destinationCode || '')}</div>` : ''}`;
  }).join('');

  return `<div style="margin-top:14px;"><div style="font-size:12px;color:#9f1239;font-weight:800;text-transform:uppercase;letter-spacing:.7px;">${escapeHtml(label)}</div><div style="font-size:14px;color:#173a63;font-weight:800;margin-top:3px;">${escapeHtml(first.originCode)} → ${escapeHtml(last.destinationCode)}</div>${cards}</div>`;
}

if (!Handlebars.helpers.bookingPassengerDetails) {
  Handlebars.registerHelper('bookingPassengerDetails', confirmationCode => {
    const data = presentationCache.get(String(confirmationCode || '').trim());
    if (!data) return new Handlebars.SafeString('<div style="color:#64748b;font-size:13px;">Passenger details are unavailable.</div>');
    return new Handlebars.SafeString(`${passengerRowsHtml(data)}${contactHtml(data)}`);
  });
}

if (!Handlebars.helpers.bookingItineraryDetails) {
  Handlebars.registerHelper('bookingItineraryDetails', confirmationCode => {
    const data = presentationCache.get(String(confirmationCode || '').trim());
    const itinerary = data?.itinerary || { outbound: [], return: [] };
    if (!itinerary.outbound.length && !itinerary.return.length) {
      return new Handlebars.SafeString('<div style="padding:12px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;color:#64748b;font-size:13px;">No saved flight itinerary segments were found for this booking.</div>');
    }
    return new Handlebars.SafeString(`${renderItineraryGroupHtml('Outbound Journey', itinerary.outbound)}${renderItineraryGroupHtml('Return Journey', itinerary.return)}`);
  });
}

export function calculateTripSummary(bookingOrItinerary) {
  const itinerary = buildCanonicalItinerary(bookingOrItinerary);
  const outbound = itinerary.outbound || [];
  const returnSegs = itinerary.return || [];
  let tripType = 'One Way';
  let isRoundTrip = false;
  let isOpenJaw = false;
  if (outbound.length && returnSegs.length) {
    const firstOutboundOrigin = outbound[0].originCode;
    const lastReturnDest = returnSegs[returnSegs.length - 1].destinationCode;
    if (firstOutboundOrigin && lastReturnDest && firstOutboundOrigin !== lastReturnDest) {
      tripType = 'Open Jaw';
      isOpenJaw = true;
    } else {
      tripType = 'Round Trip';
      isRoundTrip = true;
    }
  }
  let stopsSummary = '';
  if (isRoundTrip || isOpenJaw) {
    const outboundStops = Math.max(0, outbound.length - 1);
    const returnStops = Math.max(0, returnSegs.length - 1);
    if (!outboundStops && !returnStops) stopsSummary = 'Nonstop both ways';
    else stopsSummary = `${outboundStops ? `${outboundStops} stop${outboundStops > 1 ? 's' : ''} outbound` : 'Nonstop outbound'} · ${returnStops ? `${returnStops} stop${returnStops > 1 ? 's' : ''} return` : 'Nonstop return'}`;
  } else {
    const outboundStops = Math.max(0, outbound.length - 1);
    stopsSummary = outboundStops === 0 ? 'Nonstop' : `${outbound.length} flights · ${outboundStops} connection${outboundStops > 1 ? 's' : ''}`;
  }
  let routeSummary = '';
  if (outbound.length) {
    const outAirports = [outbound[0].originCode, ...outbound.map(s => s.destinationCode)].filter(Boolean);
    routeSummary = outAirports.join(' → ');
    if (returnSegs.length) routeSummary += ` → ${returnSegs.map(s => s.destinationCode).filter(Boolean).join(' → ')}`;
  }
  let passengerCount = 1;
  if (bookingOrItinerary && typeof bookingOrItinerary === 'object') {
    if (Array.isArray(bookingOrItinerary.travellers) && bookingOrItinerary.travellers.length) passengerCount = bookingOrItinerary.travellers.length;
    else passengerCount = Number.parseInt(bookingOrItinerary.passenger_count || bookingOrItinerary.passengerCount || 1, 10) || 1;
  }
  const pnr = String(bookingOrItinerary?.airline_confirmation_number || bookingOrItinerary?.airlineConfirmationNumber || bookingOrItinerary?.airline_pnr || bookingOrItinerary?.pnr || '').trim().toUpperCase();
  const isTicketed = /^[A-Z0-9]{6}$/.test(pnr);
  return { tripType, routeSummary, stopsSummary, bannerText: `${tripType} · ${stopsSummary}`, passengerCount, passengerText: `${passengerCount} Passenger${passengerCount > 1 ? 's' : ''}`, isTicketed, pnr: isTicketed ? pnr : null };
}

export function getArrivalDayShiftLabel(depDateStr, arrDateStr) {
  if (!depDateStr || !arrDateStr) return 'ARRIVAL';
  const parseToIso = dStr => {
    const clean = String(dStr || '').split('T')[0].trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(clean)) {
      const [month, day, year] = clean.split('/');
      return `${year}-${month}-${day}`;
    }
    return null;
  };
  const dep = parseToIso(depDateStr);
  const arr = parseToIso(arrDateStr);
  if (!dep || !arr) return 'ARRIVAL';
  const diffDays = Math.round((new Date(arr).getTime() - new Date(dep).getTime()) / 86400000);
  return diffDays > 0 ? `ARRIVAL +${diffDays}` : 'ARRIVAL';
}

export function calculateLayoverDuration(arrDateStr, arrTimeStr, depDateStr, depTimeStr) {
  if (!arrDateStr || !depDateStr || !arrTimeStr || !depTimeStr) return 'Connection';
  try {
    const normalizeDate = value => {
      const clean = String(value).split('T')[0].trim();
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(clean)) {
        const [month, day, year] = clean.split('/');
        return `${year}-${month}-${day}`;
      }
      return clean;
    };
    const timeParts = value => {
      const match = String(value).match(/^(\d{1,2}):?(\d{2})/);
      return match ? [Number(match[1]), Number(match[2])] : [0, 0];
    };
    const [arrH, arrM] = timeParts(arrTimeStr);
    const [depH, depM] = timeParts(depTimeStr);
    const arrival = new Date(`${normalizeDate(arrDateStr)}T${String(arrH).padStart(2, '0')}:${String(arrM).padStart(2, '0')}:00`);
    const departure = new Date(`${normalizeDate(depDateStr)}T${String(depH).padStart(2, '0')}:${String(depM).padStart(2, '0')}:00`);
    const minutes = Math.round((departure.getTime() - arrival.getTime()) / 60000);
    if (!Number.isFinite(minutes) || minutes <= 0) return 'Connection';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours && mins) return `Layover ${hours}h ${mins}m`;
    if (hours) return `Layover ${hours}h`;
    return `Layover ${mins}m`;
  } catch {
    return 'Connection';
  }
}
