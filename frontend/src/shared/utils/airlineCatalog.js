const LEGACY_LOCAL_LOGOS = {
  AA: '/assets/logos/american-airlines.png', AS: '/assets/logos/alaska-airlines.png', BA: '/assets/logos/british-airways.png',
  CX: '/assets/logos/cathay-pacific.png', DL: '/assets/logos/delta.png', EK: '/assets/logos/emirates.png', AF: '/assets/logos/air-france.png',
  HA: '/assets/logos/hawaiian.png', KL: '/assets/logos/klm.png', LH: '/assets/logos/lufthansa.png', QF: '/assets/logos/Qantas-Logo-1536x966.png',
  SQ: '/assets/logos/singapore-airlines.png', WN: '/assets/logos/southwest.png', TK: '/assets/logos/Turkish_Airlines_logo-1536x864.png', UA: '/assets/logos/united.png'
};

export const MAJOR_AIRLINES = {
  AA: 'American Airlines', DL: 'Delta Air Lines', UA: 'United Airlines', WN: 'Southwest Airlines', AS: 'Alaska Airlines',
  B6: 'JetBlue', NK: 'Spirit Airlines', F9: 'Frontier Airlines', HA: 'Hawaiian Airlines', AC: 'Air Canada', WS: 'WestJet',
  BA: 'British Airways', VS: 'Virgin Atlantic', LH: 'Lufthansa', LX: 'SWISS', OS: 'Austrian Airlines', SN: 'Brussels Airlines',
  AF: 'Air France', KL: 'KLM', IB: 'Iberia', AY: 'Finnair', SK: 'SAS', TP: 'TAP Air Portugal', EI: 'Aer Lingus', FI: 'Icelandair',
  LO: 'LOT Polish Airlines', AZ: 'ITA Airways', A3: 'Aegean Airlines', FR: 'Ryanair', U2: 'easyJet', W6: 'Wizz Air', VY: 'Vueling',
  EK: 'Emirates', QR: 'Qatar Airways', EY: 'Etihad Airways', TK: 'Turkish Airlines', SV: 'Saudia', RJ: 'Royal Jordanian',
  GF: 'Gulf Air', WY: 'Oman Air', KU: 'Kuwait Airways', FZ: 'flydubai', G9: 'Air Arabia', AT: 'Royal Air Maroc',
  ET: 'Ethiopian Airlines', MS: 'EgyptAir', KQ: 'Kenya Airways', SA: 'South African Airways',
  SQ: 'Singapore Airlines', CX: 'Cathay Pacific', NH: 'ANA', JL: 'Japan Airlines', KE: 'Korean Air', OZ: 'Asiana Airlines',
  BR: 'EVA Air', CI: 'China Airlines', AI: 'Air India', '6E': 'IndiGo', MH: 'Malaysia Airlines', AK: 'AirAsia',
  TG: 'Thai Airways', VN: 'Vietnam Airlines', PR: 'Philippine Airlines', GA: 'Garuda Indonesia', TR: 'Scoot', '5J': 'Cebu Pacific',
  UL: 'SriLankan Airlines', PK: 'Pakistan International Airlines', BG: 'Biman Bangladesh Airlines',
  CA: 'Air China', MU: 'China Eastern Airlines', CZ: 'China Southern Airlines', HU: 'Hainan Airlines', MF: 'XiamenAir',
  ZH: 'Shenzhen Airlines', '3U': 'Sichuan Airlines', SC: 'Shandong Airlines', HO: 'Juneyao Air', '9C': 'Spring Airlines',
  QF: 'Qantas', NZ: 'Air New Zealand', VA: 'Virgin Australia', JQ: 'Jetstar',
  LA: 'LATAM Airlines', AV: 'Avianca', CM: 'Copa Airlines', AM: 'Aeromexico', G3: 'GOL', AD: 'Azul', AR: 'Aerolineas Argentinas',
  Y4: 'Volaris', VB: 'Viva Aerobus', LY: 'El Al', ME: 'Middle East Airlines', SU: 'Aeroflot', JU: 'Air Serbia',
  RO: 'TAROM', BT: 'airBaltic', DY: 'Norwegian', UX: 'Air Europa', PC: 'Pegasus Airlines', XQ: 'SunExpress',
  D7: 'AirAsia X', FD: 'Thai AirAsia', QZ: 'Indonesia AirAsia', UO: 'HK Express', HX: 'Hong Kong Airlines'
};

export const getAirlineName = carrierCode => {
  const code = String(carrierCode || '').trim().toUpperCase();
  return MAJOR_AIRLINES[code] || (code ? `${code} Airlines` : 'Airline');
};

export const getAirlineLogoCandidates = carrierCode => {
  const code = String(carrierCode || '').trim().toUpperCase();
  if (!code) return [];
  const candidates = [`/assets/airlines/${code.toLowerCase()}.png`];
  if (LEGACY_LOCAL_LOGOS[code]) candidates.push(LEGACY_LOCAL_LOGOS[code]);
  candidates.push(`https://assets.duffel.com/img/airlines/for-floor/sq/${encodeURIComponent(code)}.png`);
  candidates.push(`https://images.kiwi.com/airlines/64/${encodeURIComponent(code)}.png`);
  return [...new Set(candidates)];
};

export const getAirlineLogoUrl = carrierCode => getAirlineLogoCandidates(carrierCode)[0] || '';
export default MAJOR_AIRLINES;
