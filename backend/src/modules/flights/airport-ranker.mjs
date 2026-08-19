/**
 * Canonical Airport Search & Ranking Module
 * Implements strict search priorities:
 * 1. Exact IATA code match (Score: 10000)
 * 2. IATA code prefix match (Score: 8000)
 * 3. Exact city match (Score: 6000)
 * 4. City prefix match (Score: 4000)
 * 5. City partial match (Score: 3000)
 * 6. Airport name prefix match (Score: 2000)
 * 7. Airport name partial match (Score: 1000)
 */

export const GLOBAL_AIRPORTS = [
  // Major US Airports
  { code: 'JFK', name: 'John F. Kennedy International Airport', city: 'New York', state: 'NY', country: 'United States' },
  { code: 'LGA', name: 'LaGuardia Airport', city: 'New York', state: 'NY', country: 'United States' },
  { code: 'EWR', name: 'Newark Liberty International Airport', city: 'New York', state: 'NJ', country: 'United States' },
  { code: 'GEG', name: 'Spokane International Airport', city: 'Spokane', state: 'WA', country: 'United States' },
  { code: 'LAX', name: 'Los Angeles International Airport', city: 'Los Angeles', state: 'CA', country: 'United States' },
  { code: 'SFO', name: 'San Francisco International Airport', city: 'San Francisco', state: 'CA', country: 'United States' },
  { code: 'SEA', name: 'Seattle-Tacoma International Airport', city: 'Seattle', state: 'WA', country: 'United States' },
  { code: 'ORD', name: 'O\'Hare International Airport', city: 'Chicago', state: 'IL', country: 'United States' },
  { code: 'MDW', name: 'Midway International Airport', city: 'Chicago', state: 'IL', country: 'United States' },
  { code: 'MIA', name: 'Miami International Airport', city: 'Miami', state: 'FL', country: 'United States' },
  { code: 'FLL', name: 'Fort Lauderdale-Hollywood International Airport', city: 'Fort Lauderdale', state: 'FL', country: 'United States' },
  { code: 'MCO', name: 'Orlando International Airport', city: 'Orlando', state: 'FL', country: 'United States' },
  { code: 'ATL', name: 'Hartsfield-Jackson Atlanta International Airport', city: 'Atlanta', state: 'GA', country: 'United States' },
  { code: 'DFW', name: 'Dallas/Fort Worth International Airport', city: 'Dallas/Fort Worth', state: 'TX', country: 'United States' },
  { code: 'DAL', name: 'Dallas Love Field', city: 'Dallas', state: 'TX', country: 'United States' },
  { code: 'IAH', name: 'George Bush Intercontinental Airport', city: 'Houston', state: 'TX', country: 'United States' },
  { code: 'HOU', name: 'William P. Hobby Airport', city: 'Houston', state: 'TX', country: 'United States' },
  { code: 'DEN', name: 'Denver International Airport', city: 'Denver', state: 'CO', country: 'United States' },
  { code: 'BOS', name: 'Logan International Airport', city: 'Boston', state: 'MA', country: 'United States' },
  { code: 'DCA', name: 'Ronald Reagan Washington National Airport', city: 'Washington', state: 'DC', country: 'United States' },
  { code: 'IAD', name: 'Washington Dulles International Airport', city: 'Washington', state: 'DC', country: 'United States' },
  { code: 'BWI', name: 'Baltimore/Washington International Airport', city: 'Baltimore', state: 'MD', country: 'United States' },
  { code: 'PHX', name: 'Phoenix Sky Harbor International Airport', city: 'Phoenix', state: 'AZ', country: 'United States' },
  { code: 'LAS', name: 'Harry Reid International Airport', city: 'Las Vegas', state: 'NV', country: 'United States' },
  { code: 'SAN', name: 'San Diego International Airport', city: 'San Diego', state: 'CA', country: 'United States' },
  { code: 'SLC', name: 'Salt Lake City International Airport', city: 'Salt Lake City', state: 'UT', country: 'United States' },
  { code: 'PDX', name: 'Portland International Airport', city: 'Portland', state: 'OR', country: 'United States' },
  { code: 'MSP', name: 'Minneapolis-Saint Paul International Airport', city: 'Minneapolis/St. Paul', state: 'MN', country: 'United States' },
  { code: 'DTW', name: 'Detroit Metro Wayne County Airport', city: 'Detroit', state: 'MI', country: 'United States' },
  { code: 'PHL', name: 'Philadelphia International Airport', city: 'Philadelphia', state: 'PA', country: 'United States' },
  { code: 'CLT', name: 'Charlotte Douglas International Airport', city: 'Charlotte', state: 'NC', country: 'United States' },
  { code: 'RDU', name: 'Raleigh-Durham International Airport', city: 'Raleigh/Durham', state: 'NC', country: 'United States' },
  { code: 'BNA', name: 'Nashville International Airport', city: 'Nashville', state: 'TN', country: 'United States' },
  { code: 'MSY', name: 'Louis Armstrong New Orleans International Airport', city: 'New Orleans', state: 'LA', country: 'United States' },
  { code: 'AUS', name: 'Austin-Bergstrom International Airport', city: 'Austin', state: 'TX', country: 'United States' },
  { code: 'SAT', name: 'San Antonio International Airport', city: 'San Antonio', state: 'TX', country: 'United States' },
  { code: 'SMF', name: 'Sacramento International Airport', city: 'Sacramento', state: 'CA', country: 'United States' },
  { code: 'SJC', name: 'San Jose Mineta International Airport', city: 'San Jose', state: 'CA', country: 'United States' },
  { code: 'SNA', name: 'John Wayne Airport', city: 'Orange County', state: 'CA', country: 'United States' },
  { code: 'OAK', name: 'San Francisco Bay Oakland International Airport', city: 'Oakland', state: 'CA', country: 'United States' },
  { code: 'HNL', name: 'Daniel K. Inouye International Airport', city: 'Honolulu', state: 'HI', country: 'United States' },
  { code: 'OGG', name: 'Kahului Airport', city: 'Maui', state: 'HI', country: 'United States' },
  { code: 'ANC', name: 'Ted Stevens Anchorage International Airport', city: 'Anchorage', state: 'AK', country: 'United States' },

  // Major International Airports (UK & Europe)
  { code: 'LHR', name: 'London Heathrow Airport', city: 'London', state: '', country: 'United Kingdom' },
  { code: 'LGW', name: 'London Gatwick Airport', city: 'London', state: '', country: 'United Kingdom' },
  { code: 'LCY', name: 'London City Airport', city: 'London', state: '', country: 'United Kingdom' },
  { code: 'STN', name: 'London Stansted Airport', city: 'London', state: '', country: 'United Kingdom' },
  { code: 'LTN', name: 'London Luton Airport', city: 'London', state: '', country: 'United Kingdom' },
  { code: 'MAN', name: 'Manchester Airport', city: 'Manchester', state: '', country: 'United Kingdom' },
  { code: 'EDI', name: 'Edinburgh Airport', city: 'Edinburgh', state: '', country: 'United Kingdom' },
  { code: 'CDG', name: 'Paris Charles de Gaulle Airport', city: 'Paris', state: '', country: 'France' },
  { code: 'ORY', name: 'Paris Orly Airport', city: 'Paris', state: '', country: 'France' },
  { code: 'FRA', name: 'Frankfurt Airport', city: 'Frankfurt', state: '', country: 'Germany' },
  { code: 'MUC', name: 'Munich Airport', city: 'Munich', state: '', country: 'Germany' },
  { code: 'AMS', name: 'Amsterdam Airport Schiphol', city: 'Amsterdam', state: '', country: 'Netherlands' },
  { code: 'MAD', name: 'Adolfo Suárez Madrid-Barajas Airport', city: 'Madrid', state: '', country: 'Spain' },
  { code: 'BCN', name: 'Josep Tarradellas Barcelona-El Prat Airport', city: 'Barcelona', state: '', country: 'Spain' },
  { code: 'FCO', name: 'Rome Fiumicino Leonardo da Vinci Airport', city: 'Rome', state: '', country: 'Italy' },
  { code: 'ZRH', name: 'Zurich Airport', city: 'Zurich', state: '', country: 'Switzerland' },
  { code: 'VIE', name: 'Vienna International Airport', city: 'Vienna', state: '', country: 'Austria' },
  { code: 'DUB', name: 'Dublin Airport', city: 'Dublin', state: '', country: 'Ireland' },

  // Canada & Americas
  { code: 'YYZ', name: 'Toronto Pearson International Airport', city: 'Toronto', state: 'ON', country: 'Canada' },
  { code: 'YVR', name: 'Vancouver International Airport', city: 'Vancouver', state: 'BC', country: 'Canada' },
  { code: 'YUL', name: 'Montréal-Trudeau International Airport', city: 'Montreal', state: 'QC', country: 'Canada' },
  { code: 'YYC', name: 'Calgary International Airport', city: 'Calgary', state: 'AB', country: 'Canada' },
  { code: 'MEX', name: 'Mexico City International Airport', city: 'Mexico City', state: '', country: 'Mexico' },
  { code: 'CUN', name: 'Cancún International Airport', city: 'Cancun', state: '', country: 'Mexico' },
  { code: 'GRU', name: 'São Paulo/Guarulhos International Airport', city: 'Sao Paulo', state: '', country: 'Brazil' },
  { code: 'EZE', name: 'Ministro Pistarini International Airport', city: 'Buenos Aires', state: '', country: 'Argentina' },
  { code: 'BOG', name: 'El Dorado International Airport', city: 'Bogota', state: '', country: 'Colombia' },

  // Middle East & Asia Pacific
  { code: 'DXB', name: 'Dubai International Airport', city: 'Dubai', state: '', country: 'United Arab Emirates' },
  { code: 'AUH', name: 'Zayed International Airport', city: 'Abu Dhabi', state: '', country: 'United Arab Emirates' },
  { code: 'DOH', name: 'Hamad International Airport', city: 'Doha', state: '', country: 'Qatar' },
  { code: 'HND', name: 'Tokyo Haneda Airport', city: 'Tokyo', state: '', country: 'Japan' },
  { code: 'NRT', name: 'Tokyo Narita Airport', city: 'Tokyo', state: '', country: 'Japan' },
  { code: 'KIX', name: 'Kansai International Airport', city: 'Osaka', state: '', country: 'Japan' },
  { code: 'ICN', name: 'Incheon International Airport', city: 'Seoul', state: '', country: 'South Korea' },
  { code: 'SIN', name: 'Singapore Changi Airport', city: 'Singapore', state: '', country: 'Singapore' },
  { code: 'HKG', name: 'Hong Kong International Airport', city: 'Hong Kong', state: '', country: 'Hong Kong' },
  { code: 'BKK', name: 'Suvarnabhumi Airport', city: 'Bangkok', state: '', country: 'Thailand' },
  { code: 'KUL', name: 'Kuala Lumpur International Airport', city: 'Kuala Lumpur', state: '', country: 'Malaysia' },
  { code: 'DEL', name: 'Indira Gandhi International Airport', city: 'New Delhi', state: '', country: 'India' },
  { code: 'BOM', name: 'Chhatrapati Shivaji Maharaj International Airport', city: 'Mumbai', state: '', country: 'India' },
  { code: 'BLR', name: 'Kempegowda International Airport', city: 'Bengaluru', state: '', country: 'India' },
  { code: 'SYD', name: 'Sydney Kingsford Smith Airport', city: 'Sydney', state: '', country: 'Australia' },
  { code: 'MEL', name: 'Melbourne Airport', city: 'Melbourne', state: '', country: 'Australia' },
  { code: 'AKL', name: 'Auckland Airport', city: 'Auckland', state: '', country: 'New Zealand' }
];

/**
 * Calculates match score for an airport based on query string
 */
export function scoreAirportMatch(airport, queryStr) {
  if (!queryStr || !airport) return 0;
  const q = String(queryStr).trim().toLowerCase();
  const qUpper = q.toUpperCase();
  if (!q) return 0;

  const code = (airport.code || '').toUpperCase();
  const city = (airport.city || '').toLowerCase();
  const name = (airport.name || '').toLowerCase();
  const country = (airport.country || '').toLowerCase();

  // 1. Exact IATA Code Match (Highest Priority)
  if (code === qUpper) return 10000;

  // 2. IATA Code Prefix Match
  if (code.startsWith(qUpper)) return 8000;

  // 3. Exact City Match
  if (city === q) return 6000;

  // 4. City Prefix Match
  if (city.startsWith(q)) return 4000;

  // 5. City Partial Match
  if (city.includes(q)) return 3000;

  // 6. Airport Name Prefix Match
  if (name.startsWith(q)) return 2000;

  // 7. Airport Name Substring Match
  if (name.includes(q)) return 1000;

  // 8. Country Match
  if (country.startsWith(q) || country.includes(q)) return 500;

  return 0;
}

/**
 * Rank array of airports by relevance score for query string
 */
export function rankAirportSuggestions(airports, queryStr) {
  if (!Array.isArray(airports)) return [];
  const qLower = (queryStr || '').trim().toLowerCase();

  const scored = airports.map(ap => ({
    airport: ap,
    score: scoreAirportMatch(ap, queryStr)
  })).filter(item => item.score > 0);

  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    // Secondary tie-breaker: exact city match precedence
    const cityA = (a.airport.city || '').toLowerCase();
    const cityB = (b.airport.city || '').toLowerCase();
    if (cityA === qLower && cityB !== qLower) return -1;
    if (cityB === qLower && cityA !== qLower) return 1;

    // Tertiary tie-breaker: alphabetical by IATA code
    return (a.airport.code || '').localeCompare(b.airport.code || '');
  });

  return scored.map(item => item.airport);
}

/**
 * Search local dictionary and rank results
 */
export function searchAndRankLocalAirports(queryStr) {
  return rankAirportSuggestions(GLOBAL_AIRPORTS, queryStr);
}
