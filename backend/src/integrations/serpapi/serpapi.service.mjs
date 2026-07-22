import env from '../../config/env.mjs';

class SerpApiService {
  constructor() {
    this.apiKey = env.serpapiApiKey || '8df31a2da9a24a9565d2fa7d5dcd096a5f5542c1a42e42cf9f5d604e17871498';
  }

  extractAirportCode(input) {
    if (!input) return '';
    if (typeof input === 'object') {
      if (input.code) return input.code.toUpperCase();
      if (input.id) return input.id.toUpperCase();
    }
    const inputStr = String(input);
    const match = inputStr.match(/\(([A-Z]{3,4})\)/i);
    return match ? match[1].toUpperCase() : inputStr.trim().toUpperCase().substring(0, 3);
  }

  // Maps UI Cabin Class to SerpAPI travel_class code
  mapTravelClass(cabin) {
    const c = (cabin || 'economy').toLowerCase();
    if (c.includes('premium')) return '2';
    if (c.includes('business')) return '3';
    if (c.includes('first')) return '4';
    return '1'; // Economy default
  }

  // Autocomplete airports using SerpAPI google_flights_autocomplete engine
  async autocompleteAirports(query) {
    if (!query || query.length < 2) {
      return this.getMockAirportSuggestions(query || '');
    }

    const localResults = searchLocalAirports(query);

    let apiResults = [];
    try {
      const params = new URLSearchParams({
        engine: 'google_flights_autocomplete',
        q: query,
        api_key: this.apiKey,
        exclude_regions: 'true',
        hl: 'en',
        gl: 'us'
      });

      const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
      const data = await response.json();

      if (response.ok && data.suggestions) {
        data.suggestions.forEach(suggestion => {
          if (suggestion.type === 'airport' && suggestion.id) {
            const descInfo = parseDescription(suggestion.description);
            apiResults.push({
              code: suggestion.id.toUpperCase(),
              name: suggestion.name,
              city: descInfo.city,
              state: descInfo.state,
              country: descInfo.country
            });
          } else if (suggestion.type === 'city' && suggestion.airports) {
            suggestion.airports.forEach(airport => {
              if (airport.id) {
                const descInfo = parseDescription(suggestion.name);
                apiResults.push({
                  code: airport.id.toUpperCase(),
                  name: airport.name,
                  city: descInfo.city,
                  state: descInfo.state,
                  country: descInfo.country
                });
              }
            });
          }
        });
      }
    } catch (error) {
      console.warn('SerpAPI autocomplete failed:', error.message);
    }

    // Merge lists to avoid duplicates (prioritize local results because they have perfect names & state details)
    const mergedMap = new Map();
    
    // Add local results first
    localResults.forEach(item => {
      mergedMap.set(item.code, item);
    });

    // Add API results if not already present
    apiResults.forEach(item => {
      if (!mergedMap.has(item.code)) {
        const matchingLocal = LOCAL_AIRPORTS.find(la => la.code === item.code);
        if (matchingLocal) {
          mergedMap.set(item.code, matchingLocal);
        } else {
          mergedMap.set(item.code, item);
        }
      }
    });

    const finalResults = Array.from(mergedMap.values());
    return finalResults.length > 0 ? finalResults : this.getMockAirportSuggestions(query);
  }

  // Search flights using SerpAPI google_flights engine
  async searchFlights(searchParams) {
    try {
      const fromCode = this.extractAirportCode(searchParams.from);
      const toCode = this.extractAirportCode(searchParams.to);
      const departureDate = searchParams.departure;
      const returnDate = searchParams.returnDate;
      const isRoundTrip = !!returnDate;
      
      const cabinClass = this.mapTravelClass(searchParams.travelClass);
      
      // Parse passenger counts
      const adults = parseInt(searchParams.adults || 1, 10);
      const children = parseInt(searchParams.children || 0, 10);
      const infants = parseInt(searchParams.infants || 0, 10);

      const params = new URLSearchParams({
        engine: 'google_flights',
        departure_id: fromCode,
        arrival_id: toCode,
        outbound_date: departureDate,
        type: isRoundTrip ? '1' : '2', // 1 = roundtrip, 2 = oneway
        travel_class: cabinClass,
        adults: adults.toString(),
        api_key: this.apiKey,
        hl: 'en',
        gl: 'us',
        currency: searchParams.currency || 'USD'
      });

      if (isRoundTrip) {
        params.append('return_date', returnDate);
      }
      if (children > 0) {
        params.append('children', children.toString());
      }
      if (infants > 0) {
        // google_flights uses infants_on_lap by default
        params.append('infants_on_lap', infants.toString());
      }

      const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'SerpAPI flight search request failed');
      }

      return this.formatSerpFlightOffers(data, searchParams);
    } catch (error) {
      console.error('[Supplier Error] SerpAPI flight search failed:', error.stack || error.message);
      if (env.nodeEnv === 'production') {
        throw new Error('Supplier search failed: live connections offline.');
      }
      return this.getMockFlightOffers(searchParams);
    }
  }

  // Format SerpAPI response to our frontend expected schema, applying the 0.90 discount rule
  formatSerpFlightOffers(data, searchParams) {
    const bestFlights = data.best_flights || [];
    const otherFlights = data.other_flights || [];
    const allItineraries = [...bestFlights, ...otherFlights];

    if (allItineraries.length === 0) {
      return { flights: [], meta: { isMock: false } };
    }

    const formattedFlights = allItineraries.map((itinerary, index) => {
      const segments = itinerary.flights || [];
      if (segments.length === 0) return null;

      const firstSeg = segments[0];
      const lastSeg = segments[segments.length - 1];
      
      // Calculatestops and layovers
      const stopsCount = segments.length - 1;
      const layovers = (itinerary.layovers || []).map(layover => ({
        airportCode: layover.id,
        airportName: layover.name,
        duration: layover.duration // in minutes
      }));

      // Price logic: Website Price = Original Price * 0.90
      const originalPrice = parseFloat(itinerary.price || 0);
      const websitePrice = Math.round(originalPrice * 0.90);

      // Extract duration in minutes and format to "Xh Ym"
      const totalDurationMin = itinerary.total_duration || segments.reduce((sum, s) => sum + (s.duration || 0), 0);
      const hours = Math.floor(totalDurationMin / 60);
      const minutes = totalDurationMin % 60;
      const durationStr = `${hours}h ${minutes}m`;

      // Extract airline details from first segment
      const airlineName = firstSeg.airline || 'Unknown Airline';
      const flightNumber = segments.map(s => s.flight_number || '').filter(Boolean).join(', ') || 'N/A';
      
      // Format dates & times
      const depDate = firstSeg.departure_airport?.time?.split(' ')[0] || searchParams.departure;
      const depTime = firstSeg.departure_airport?.time?.split(' ')[1] || 'N/A';
      const arrDate = lastSeg.arrival_airport?.time?.split(' ')[0] || searchParams.departure;
      const arrTime = lastSeg.arrival_airport?.time?.split(' ')[1] || 'N/A';

      return {
        id: itinerary.booking_token || `serp-flight-${index}`,
        price: {
          total: websitePrice.toFixed(2),
          originalApiPrice: originalPrice.toFixed(2),
          currency: searchParams.currency || 'USD',
          formatted: `$${websitePrice.toFixed(2)}`
        },
        airline: airlineName,
        airline_logo: firstSeg.airline_logo || 'https://www.gstatic.com/flights/airline_logos/70px/airline.png',
        flightNumber: flightNumber,
        departure: {
          airport: firstSeg.departure_airport?.id || 'Origin',
          city: firstSeg.departure_airport?.name || 'Origin City',
          time: depTime,
          date: depDate
        },
        arrival: {
          airport: lastSeg.arrival_airport?.id || 'Destination',
          city: lastSeg.arrival_airport?.name || 'Destination City',
          time: arrTime,
          date: arrDate
        },
        duration: durationStr,
        stops: stopsCount,
        layovers: layovers,
        class: firstSeg.travel_class || searchParams.travelClass || 'Economy',
        aircraft: firstSeg.airplane || 'Boeing / Airbus',
        fareType: 'Standard Cabin Select',
        refundableStatus: itinerary.extensions?.join(', ').toLowerCase().includes('refundable') ? 'Refundable (Fees Apply)' : 'Non-Refundable',
        baggageAllowance: itinerary.extensions?.join(', ').toLowerCase().includes('carry-on') ? 'Carry-on Included' : 'Standard Baggage Rules Apply'
      };
    }).filter(Boolean);

    return {
      flights: formattedFlights,
      meta: { count: formattedFlights.length, isMock: false }
    };
  }

  // Mock Flight offers fallback generator
  getMockFlightOffers(searchParams) {
    const fromCode = this.extractAirportCode(searchParams.from);
    const toCode = this.extractAirportCode(searchParams.to);
    const departureDate = searchParams.departure || new Date().toISOString().split('T')[0];
    const travelClass = searchParams.travelClass || 'Economy';
    const passengers = parseInt(searchParams.adults || 1, 10) + parseInt(searchParams.children || 0, 10);

    const baseAirlines = [
      { name: 'Delta Air Lines', code: 'DL', basePrice: 280, logo: 'https://www.gstatic.com/flights/airline_logos/70px/DL.png' },
      { name: 'United Airlines', code: 'UA', basePrice: 250, logo: 'https://www.gstatic.com/flights/airline_logos/70px/UA.png' },
      { name: 'American Airlines', code: 'AA', basePrice: 260, logo: 'https://www.gstatic.com/flights/airline_logos/70px/AA.png' },
      { name: 'JetBlue Airways', code: 'B6', basePrice: 220, logo: 'https://www.gstatic.com/flights/airline_logos/70px/B6.png' }
    ];

    const flights = baseAirlines.map((airline, idx) => {
      let multiplier = 1.0;
      const c = travelClass.toLowerCase();
      if (c.includes('business')) multiplier = 3.5;
      else if (c.includes('premium')) multiplier = 1.8;
      else if (c.includes('first')) multiplier = 8.0;

      const originalPrice = (airline.basePrice + (idx * 30)) * multiplier * passengers;
      const websitePrice = Math.round(originalPrice * 0.90);

      const depTimes = ['06:00', '08:45', '13:15', '17:30'];
      const arrTimes = ['09:15', '12:00', '16:30', '20:45'];
      const durations = ['3h 15m', '3h 15m', '3h 15m', '3h 15m'];
      const stops = idx === 0 ? 0 : 1;

      return {
        id: `mock-flight-${airline.code}-${idx}`,
        price: {
          total: websitePrice.toFixed(2),
          originalApiPrice: originalPrice.toFixed(2),
          currency: 'USD',
          formatted: `$${websitePrice.toFixed(2)}`
        },
        airline: airline.name,
        airline_logo: airline.logo,
        flightNumber: `${airline.code}${100 + Math.floor(Math.random() * 899)}`,
        departure: {
          airport: fromCode,
          city: searchParams.from.split('(')[0].trim(),
          time: depTimes[idx % depTimes.length],
          date: departureDate
        },
        arrival: {
          airport: toCode,
          city: searchParams.to.split('(')[0].trim(),
          time: arrTimes[idx % arrTimes.length],
          date: departureDate
        },
        duration: durations[idx % durations.length],
        stops: stops,
        layovers: stops > 0 ? [{ airportCode: 'ORD', airportName: 'Chicago O\'Hare International', duration: 45 }] : [],
        class: travelClass,
        aircraft: 'Boeing 737-800',
        fareType: 'ESTIMATED FARE (Offline Fallback)',
        refundableStatus: 'Offline Sample (Not Bookable)',
        baggageAllowance: 'Offline Sample (Not Bookable)',
        isMock: true
      };
    });

    return {
      flights,
      meta: { count: flights.length, isMock: true }
    };
  }

  // Fallback airport suggestions
  getMockAirportSuggestions(query) {
    if (!query) {
      return LOCAL_AIRPORTS.slice(0, 10);
    }
    return searchLocalAirports(query);
  }
}

function parseDescription(description) {
  if (!description) return { city: '', state: '', country: '' };
  const parts = description.split(',').map(s => s.trim());
  if (parts.length === 2) {
    const isState = parts[1].length === 2 && parts[1] === parts[1].toUpperCase();
    if (isState) {
      return { city: parts[0], state: parts[1], country: 'United States' };
    } else {
      return { city: parts[0], state: '', country: parts[1] };
    }
  } else if (parts.length > 2) {
    // Check if the last part is US and second last is state
    const lastPart = parts[parts.length - 1];
    const secondLast = parts[parts.length - 2];
    if (lastPart === 'United States' || lastPart === 'USA') {
      return { city: parts[0], state: secondLast, country: 'United States' };
    }
    return { city: parts[0], state: secondLast.length <= 3 ? secondLast : '', country: lastPart };
  }
  return { city: description, state: '', country: '' };
}

function searchLocalAirports(query) {
  if (!query) return [];
  const q = query.toLowerCase().trim();
  return LOCAL_AIRPORTS.filter(airport => {
    return (
      airport.code.toLowerCase().includes(q) ||
      airport.name.toLowerCase().includes(q) ||
      airport.city.toLowerCase().includes(q) ||
      (airport.state && airport.state.toLowerCase().includes(q)) ||
      airport.country.toLowerCase().includes(q)
    );
  });
}

const LOCAL_AIRPORTS = [
  { code: 'ATL', name: 'Hartsfield-Jackson Atlanta International Airport', city: 'Atlanta', state: 'GA', country: 'United States' },
  { code: 'AUS', name: 'Austin-Bergstrom International Airport', city: 'Austin', state: 'TX', country: 'United States' },
  { code: 'BWI', name: 'Baltimore/Washington International Airport', city: 'Baltimore', state: 'MD', country: 'United States' },
  { code: 'BOS', name: 'Logan International Airport', city: 'Boston', state: 'MA', country: 'United States' },
  { code: 'CLT', name: 'Charlotte Douglas International Airport', city: 'Charlotte', state: 'NC', country: 'United States' },
  { code: 'ORD', name: 'O\'Hare International Airport', city: 'Chicago', state: 'IL', country: 'United States' },
  { code: 'MDW', name: 'Midway International Airport', city: 'Chicago', state: 'IL', country: 'United States' },
  { code: 'CVG', name: 'Cincinnati/Northern Kentucky International Airport', city: 'Cincinnati', state: 'OH', country: 'United States' },
  { code: 'CLE', name: 'Cleveland Hopkins International Airport', city: 'Cleveland', state: 'OH', country: 'United States' },
  { code: 'CMH', name: 'John Glenn Columbus International Airport', city: 'Columbus', state: 'OH', country: 'United States' },
  { code: 'DFW', name: 'Dallas/Fort Worth International Airport', city: 'Dallas/Fort Worth', state: 'TX', country: 'United States' },
  { code: 'DAL', name: 'Dallas Love Field', city: 'Dallas', state: 'TX', country: 'United States' },
  { code: 'DEN', name: 'Denver International Airport', city: 'Denver', state: 'CO', country: 'United States' },
  { code: 'DTW', name: 'Detroit Metro Wayne County Airport', city: 'Detroit', state: 'MI', country: 'United States' },
  { code: 'FLL', name: 'Fort Lauderdale-Hollywood International Airport', city: 'Fort Lauderdale', state: 'FL', country: 'United States' },
  { code: 'RSW', name: 'Southwest Florida International Airport', city: 'Fort Myers', state: 'FL', country: 'United States' },
  { code: 'HNL', name: 'Daniel K. Inouye International Airport', city: 'Honolulu', state: 'HI', country: 'United States' },
  { code: 'IAH', name: 'George Bush Intercontinental Airport', city: 'Houston', state: 'TX', country: 'United States' },
  { code: 'HOU', name: 'William P. Hobby Airport', city: 'Houston', state: 'TX', country: 'United States' },
  { code: 'IND', name: 'Indianapolis International Airport', city: 'Indianapolis', state: 'IN', country: 'United States' },
  { code: 'JAX', name: 'Jacksonville International Airport', city: 'Jacksonville', state: 'FL', country: 'United States' },
  { code: 'MCI', name: 'Kansas City International Airport', city: 'Kansas City', state: 'MO', country: 'United States' },
  { code: 'LAS', name: 'Harry Reid International Airport', city: 'Las Vegas', state: 'NV', country: 'United States' },
  { code: 'LAX', name: 'Los Angeles International Airport', city: 'Los Angeles', state: 'CA', country: 'United States' },
  { code: 'SNA', name: 'John Wayne Airport', city: 'Orange County', state: 'CA', country: 'United States' },
  { code: 'SDF', name: 'Louisville Muhammad Ali International Airport', city: 'Louisville', state: 'KY', country: 'United States' },
  { code: 'MEM', name: 'Memphis International Airport', city: 'Memphis', state: 'TN', country: 'United States' },
  { code: 'MIA', name: 'Miami International Airport', city: 'Miami', state: 'FL', country: 'United States' },
  { code: 'MKE', name: 'Milwaukee Mitchell International Airport', city: 'Milwaukee', state: 'WI', country: 'United States' },
  { code: 'MSP', name: 'Minneapolis-Saint Paul International Airport', city: 'Minneapolis/St. Paul', state: 'MN', country: 'United States' },
  { code: 'BNA', name: 'Nashville International Airport', city: 'Nashville', state: 'TN', country: 'United States' },
  { code: 'MSY', name: 'Louis Armstrong New Orleans International Airport', city: 'New Orleans', state: 'LA', country: 'United States' },
  { code: 'JFK', name: 'John F. Kennedy International Airport', city: 'New York', state: 'NY', country: 'United States' },
  { code: 'LGA', name: 'LaGuardia Airport', city: 'New York', state: 'NY', country: 'United States' },
  { code: 'EWR', name: 'Newark Liberty International Airport', city: 'Newark', state: 'NJ', country: 'United States' },
  { code: 'OAK', name: 'San Francisco Bay Oakland International Airport', city: 'Oakland', state: 'CA', country: 'United States' },
  { code: 'MCO', name: 'Orlando International Airport', city: 'Orlando', state: 'FL', country: 'United States' },
  { code: 'PHL', name: 'Philadelphia International Airport', city: 'Philadelphia', state: 'PA', country: 'United States' },
  { code: 'PHX', name: 'Phoenix Sky Harbor International Airport', city: 'Phoenix', state: 'AZ', country: 'United States' },
  { code: 'PIT', name: 'Pittsburgh International Airport', city: 'Pittsburgh', state: 'PA', country: 'United States' },
  { code: 'PDX', name: 'Portland International Airport', city: 'Portland', state: 'OR', country: 'United States' },
  { code: 'RDU', name: 'Raleigh-Durham International Airport', city: 'Raleigh/Durham', state: 'NC', country: 'United States' },
  { code: 'RIC', name: 'Richmond International Airport', city: 'Richmond', state: 'VA', country: 'United States' },
  { code: 'SMF', name: 'Sacramento International Airport', city: 'Sacramento', state: 'CA', country: 'United States' },
  { code: 'SLC', name: 'Salt Lake City International Airport', city: 'Salt Lake City', state: 'UT', country: 'United States' },
  { code: 'SAN', name: 'San Diego International Airport', city: 'San Diego', state: 'CA', country: 'United States' },
  { code: 'SFO', name: 'San Francisco International Airport', city: 'San Francisco', state: 'CA', country: 'United States' },
  { code: 'SJC', name: 'San Jose Mineta International Airport', city: 'San Jose', state: 'CA', country: 'United States' },
  { code: 'SEA', name: 'Seattle-Tacoma International Airport', city: 'Seattle', state: 'WA', country: 'United States' },
  { code: 'STL', name: 'St. Louis Lambert International Airport', city: 'St. Louis', state: 'MO', country: 'United States' },
  { code: 'TPA', name: 'Tampa International Airport', city: 'Tampa', state: 'FL', country: 'United States' },
  { code: 'DCA', name: 'Ronald Reagan Washington National Airport', city: 'Washington', state: 'DC', country: 'United States' },
  { code: 'IAD', name: 'Washington Dulles International Airport', city: 'Washington', state: 'DC', country: 'United States' },
  { code: 'YYZ', name: 'Toronto Pearson International Airport', city: 'Toronto', state: 'ON', country: 'Canada' },
  { code: 'YVR', name: 'Vancouver International Airport', city: 'Vancouver', state: 'BC', country: 'Canada' },
  { code: 'YUL', name: 'Montréal-Trudeau International Airport', city: 'Montreal', state: 'QC', country: 'Canada' },
  { code: 'YYC', name: 'Calgary International Airport', city: 'Calgary', state: 'AB', country: 'Canada' },
  { code: 'MEX', name: 'Aeropuerto Internacional Benito Juárez', city: 'Mexico City', state: '', country: 'Mexico' },
  { code: 'CUN', name: 'Cancún International Airport', city: 'Cancún', state: '', country: 'Mexico' },
  { code: 'GDL', name: 'Miguel Hidalgo y Costilla Guadalajara International Airport', city: 'Guadalajara', state: '', country: 'Mexico' },
  { code: 'AMS', name: 'Amsterdam Airport Schiphol', city: 'Amsterdam', state: '', country: 'Netherlands' },
  { code: 'ATH', name: 'Athens International Airport', city: 'Athens', state: '', country: 'Greece' },
  { code: 'BCN', name: 'Josep Tarradellas Barcelona-El Prat Airport', city: 'Barcelona', state: '', country: 'Spain' },
  { code: 'BER', name: 'Berlin Brandenburg Airport', city: 'Berlin', state: '', country: 'Germany' },
  { code: 'BRU', name: 'Brussels Airport', city: 'Brussels', state: '', country: 'Belgium' },
  { code: 'CDG', name: 'Charles de Gaulle Airport', city: 'Paris', state: '', country: 'France' },
  { code: 'ORY', name: 'Paris Orly Airport', city: 'Paris', state: '', country: 'France' },
  { code: 'DUB', name: 'Dublin Airport', city: 'Dublin', state: '', country: 'Ireland' },
  { code: 'EDI', name: 'Edinburgh Airport', city: 'Edinburgh', state: '', country: 'United Kingdom' },
  { code: 'FRA', name: 'Frankfurt Airport', city: 'Frankfurt', state: '', country: 'Germany' },
  { code: 'GVA', name: 'Geneva Airport', city: 'Geneva', state: '', country: 'Switzerland' },
  { code: 'IST', name: 'Istanbul Airport', city: 'Istanbul', state: '', country: 'Turkey' },
  { code: 'LCY', name: 'London City Airport', city: 'London', state: '', country: 'United Kingdom' },
  { code: 'LGW', name: 'London Gatwick Airport', city: 'London', state: '', country: 'United Kingdom' },
  { code: 'LHR', name: 'London Heathrow Airport', city: 'London', state: '', country: 'United Kingdom' },
  { code: 'STN', name: 'London Stansted Airport', city: 'London', state: '', country: 'United Kingdom' },
  { code: 'MAD', name: 'Adolfo Suárez Madrid-Barajas Airport', city: 'Madrid', state: '', country: 'Spain' },
  { code: 'MUC', name: 'Munich Airport', city: 'Munich', state: '', country: 'Germany' },
  { code: 'FCO', name: 'Rome Fiumicino Airport', city: 'Rome', state: '', country: 'Italy' },
  { code: 'ZRH', name: 'Zurich Airport', city: 'Zurich', state: '', country: 'Switzerland' },
  { code: 'VIE', name: 'Vienna International Airport', city: 'Vienna', state: '', country: 'Austria' },
  { code: 'WAW', name: 'Warsaw Chopin Airport', city: 'Warsaw', state: '', country: 'Poland' },
  { code: 'BKK', name: 'Suvarnabhumi Airport', city: 'Bangkok', state: '', country: 'Thailand' },
  { code: 'PEK', name: 'Beijing Capital International Airport', city: 'Beijing', state: '', country: 'China' },
  { code: 'PVG', name: 'Shanghai Pudong International Airport', city: 'Shanghai', state: '', country: 'China' },
  { code: 'HKG', name: 'Hong Kong International Airport', city: 'Hong Kong', state: '', country: 'Hong Kong' },
  { code: 'DEL', name: 'Indira Gandhi International Airport', city: 'New Delhi', state: '', country: 'India' },
  { code: 'BOM', name: 'Chhatrapati Shivaji Maharaj International Airport', city: 'Mumbai', state: '', country: 'India' },
  { code: 'CGK', name: 'Soekarno-Hatta International Airport', city: 'Jakarta', state: '', country: 'Indonesia' },
  { code: 'KUL', name: 'Kuala Lumpur International Airport', city: 'Kuala Lumpur', state: '', country: 'Malaysia' },
  { code: 'MNL', name: 'Ninoy Aquino International Airport', city: 'Manila', state: '', country: 'Philippines' },
  { code: 'ICN', name: 'Seoul Incheon International Airport', city: 'Seoul', state: '', country: 'South Korea' },
  { code: 'SIN', name: 'Singapore Changi Airport', city: 'Singapore', state: '', country: 'Singapore' },
  { code: 'TPE', name: 'Taiwan Taoyuan International Airport', city: 'Taipei', state: '', country: 'Taiwan' },
  { code: 'NRT', name: 'Narita International Airport', city: 'Tokyo', state: '', country: 'Japan' },
  { code: 'HND', name: 'Haneda Airport', city: 'Tokyo', state: '', country: 'Japan' },
  { code: 'DXB', name: 'Dubai International Airport', city: 'Dubai', state: '', country: 'United Arab Emirates' },
  { code: 'DOH', name: 'Hamad International Airport', city: 'Doha', state: '', country: 'Qatar' },
  { code: 'AUH', name: 'Zayed International Airport', city: 'Abu Dhabi', state: '', country: 'United Arab Emirates' },
  { code: 'TLV', name: 'Ben Gurion Airport', city: 'Tel Aviv', state: '', country: 'Israel' },
  { code: 'RUH', name: 'King Khalid International Airport', city: 'Riyadh', state: '', country: 'Saudi Arabia' },
  { code: 'JED', name: 'King Abdulaziz International Airport', city: 'Jeddah', state: '', country: 'Saudi Arabia' },
  { code: 'CAI', name: 'Cairo International Airport', city: 'Cairo', state: '', country: 'Egypt' },
  { code: 'CPT', name: 'Cape Town International Airport', city: 'Cape Town', state: '', country: 'South Africa' },
  { code: 'ADD', name: 'Addis Ababa Bole International Airport', city: 'Addis Ababa', state: '', country: 'Ethiopia' },
  { code: 'NBO', name: 'Jomo Kenyatta International Airport', city: 'Nairobi', state: '', country: 'Kenya' },
  { code: 'LOS', name: 'Murtala Muhammed International Airport', city: 'Lagos', state: '', country: 'Nigeria' },
  { code: 'JNB', name: 'O. R. Tambo International Airport', city: 'Johannesburg', state: '', country: 'South Africa' },
  { code: 'CMN', name: 'Mohammed V International Airport', city: 'Casablanca', state: '', country: 'Morocco' },
  { code: 'EZE', name: 'Ministro Pistarini International Airport', city: 'Buenos Aires', state: '', country: 'Argentina' },
  { code: 'GRU', name: 'São Paulo/Guarulhos International Airport', city: 'São Paulo', state: '', country: 'Brazil' },
  { code: 'GIG', name: 'Rio de Janeiro/Galeão International Airport', city: 'Rio de Janeiro', state: '', country: 'Brazil' },
  { code: 'SCL', name: 'Arturo Merino Benítez International Airport', city: 'Santiago', state: '', country: 'Chile' },
  { code: 'BOG', name: 'El Dorado International Airport', city: 'Bogotá', state: '', country: 'Colombia' },
  { code: 'LIM', name: 'Jorge Chávez International Airport', city: 'Lima', state: '', country: 'Peru' },
  { code: 'SJU', name: 'Luis Muñoz Marín International Airport', city: 'San Juan', state: '', country: 'Puerto Rico' },
  { code: 'NAS', name: 'Lynden Pindling International Airport', city: 'Nassau', state: '', country: 'Bahamas' },
  { code: 'MBJ', name: 'Sangster International Airport', city: 'Montego Bay', state: '', country: 'Jamaica' },
  { code: 'PTY', name: 'Tocumen International Airport', city: 'Panama City', state: '', country: 'Panama' },
  { code: 'SYD', name: 'Sydney Kingsford Smith Airport', city: 'Sydney', state: '', country: 'Australia' },
  { code: 'MEL', name: 'Melbourne Airport', city: 'Melbourne', state: '', country: 'Australia' },
  { code: 'BNE', name: 'Brisbane Airport', city: 'Brisbane', state: '', country: 'Australia' },
  { code: 'AKL', name: 'Auckland Airport', city: 'Auckland', state: '', country: 'New Zealand' },
  { code: 'PPT', name: 'Fa\'a\'ā International Airport', city: 'Papeete', state: '', country: 'French Polynesia' }
];

export default new SerpApiService();
