import env from '../../config/env.mjs';
import { calculateFlightDiscount } from '../../shared/utils/pricing.helper.mjs';
import { GLOBAL_AIRPORTS, rankAirportSuggestions, searchAndRankLocalAirports } from '../../modules/flights/airport-ranker.mjs';

const PROVIDER_TIMEOUT_MS = 20000;
const FLIGHT_SEARCH_CACHE_TTL_MS = 60000;
const FLIGHT_SEARCH_CACHE_MAX = 100;

function isIataCode(value) {
  return /^[A-Z]{3}$/.test(String(value || '').trim().toUpperCase());
}

function splitSupplierDateTime(value, fallbackDate = '') {
  const text = String(value || '').trim();
  if (!text) return { date: fallbackDate, time: '' };
  const [date = fallbackDate, time = ''] = text.split(/\s+/);
  return { date, time };
}

function durationFromMinutes(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return '';
  const hours = Math.floor(minutes / 60);
  const remainder = Math.round(minutes % 60);
  if (!hours) return `${remainder}m`;
  if (!remainder) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

class SerpApiService {
  constructor() {
    this.apiKey = env.serpapiApiKey || '';
    this.flightSearchCache = new Map();
    this.flightSearchInFlight = new Map();
  }

  extractAirportCode(input) {
    if (!input) return '';
    if (typeof input === 'object') {
      const code = String(input.code || input.iata || input.id || '').trim().toUpperCase();
      return isIataCode(code) ? code : '';
    }

    const text = String(input).trim();
    if (isIataCode(text)) return text.toUpperCase();
    const parenthetical = text.match(/\(([A-Z]{3})\)/i);
    return parenthetical ? parenthetical[1].toUpperCase() : '';
  }

  mapTravelClass(cabinClass) {
    if (!cabinClass) return '1';
    const value = String(cabinClass).toLowerCase();
    if (value.includes('premium')) return '2';
    if (value.includes('business')) return '3';
    if (value.includes('first')) return '4';
    return '1';
  }

  async autocompleteAirports(query) {
    if (!query || String(query).trim().length < 1) {
      return GLOBAL_AIRPORTS.filter((airport) => isIataCode(airport.code)).slice(0, 10);
    }

    const normalizedQuery = String(query).trim();
    const localResults = searchAndRankLocalAirports(normalizedQuery)
      .filter((airport) => isIataCode(airport.code));

    if (localResults.length > 0) {
      return localResults.slice(0, 12);
    }

    if (normalizedQuery.length < 3 || !this.apiKey) {
      return [];
    }

    const apiResults = [];
    try {
      const params = new URLSearchParams({
        engine: 'google_flights_autocomplete',
        q: normalizedQuery,
        api_key: this.apiKey,
        exclude_regions: 'true',
        hl: 'en',
        gl: 'us',
      });

      const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`, {
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      });
      const data = await response.json();

      if (response.ok && Array.isArray(data.suggestions)) {
        data.suggestions.forEach((suggestion) => {
          if (suggestion.type === 'airport' && isIataCode(suggestion.id)) {
            const descInfo = parseDescription(suggestion.description);
            apiResults.push({
              code: suggestion.id.toUpperCase(),
              name: suggestion.name,
              city: descInfo.city,
              state: descInfo.state,
              country: descInfo.country,
            });
          } else if (suggestion.type === 'city' && Array.isArray(suggestion.airports)) {
            suggestion.airports.forEach((airport) => {
              if (!isIataCode(airport.id)) return;
              const descInfo = parseDescription(suggestion.name);
              apiResults.push({
                code: airport.id.toUpperCase(),
                name: airport.name,
                city: descInfo.city,
                state: descInfo.state,
                country: descInfo.country,
              });
            });
          }
        });
      }
    } catch (error) {
      console.warn('SerpAPI autocomplete failed:', error.message);
    }

    const merged = new Map();
    apiResults.forEach((item) => {
      const code = String(item?.code || '').toUpperCase();
      if (!isIataCode(code)) return;
      const matchingLocal = GLOBAL_AIRPORTS.find((airport) => airport.code === code);
      if (!merged.has(code)) merged.set(code, matchingLocal || { ...item, code });
    });

    const candidates = [...merged.values()];
    return rankAirportSuggestions(candidates, normalizedQuery)
      .filter((airport) => isIataCode(airport.code))
      .slice(0, 12);
  }

  async searchFlights(searchParams) {
    const isProduction = (process.env.NODE_ENV || 'development') === 'production';
    const demoAllowed = process.env.DEMO_FLIGHTS === 'true' || !isProduction;
    const fromCode = this.extractAirportCode(searchParams.from);
    const toCode = this.extractAirportCode(searchParams.to);
    const departureToken = String(searchParams.departureToken || '').trim();
    const isReturnSelection = Boolean(departureToken);

    if (!fromCode || !toCode || fromCode === toCode) {
      const err = new Error('Flight search requires two different valid 3-letter IATA airport codes.');
      err.code = 'INVALID_AIRPORT_CODE';
      err.status = 400;
      throw err;
    }

    const departureDate = searchParams.departure;
    const returnDate = searchParams.returnDate;
    const isRoundTrip = Boolean(returnDate);

    if (isReturnSelection && !isRoundTrip) {
      const err = new Error('A return date is required to continue the selected round-trip itinerary.');
      err.code = 'RETURN_DATE_REQUIRED';
      err.status = 400;
      throw err;
    }

    const formatSearchParams = isReturnSelection
      ? {
          ...searchParams,
          from: toCode,
          to: fromCode,
          departure: returnDate || departureDate,
          resultStage: 'return',
          tripScope: 'roundtrip_total',
        }
      : {
          ...searchParams,
          from: fromCode,
          to: toCode,
          resultStage: isRoundTrip ? 'outbound' : 'oneway',
          tripScope: isRoundTrip ? 'roundtrip_total' : 'oneway_total',
        };

    if (!this.apiKey) {
      if (isProduction) {
        const err = new Error('Flight search is temporarily unavailable. Please try again or contact support.');
        err.code = 'FLIGHT_SEARCH_UNAVAILABLE';
        err.status = 503;
        throw err;
      }
      if (demoAllowed) {
        console.warn('[SerpAPI] SERPAPI_API_KEY not configured — serving demo flights (non-production only).');
        return this.getMockFlightOffers(formatSearchParams);
      }
      const err = new Error('Flight search API key not configured.');
      err.code = 'FLIGHT_SEARCH_UNAVAILABLE';
      err.status = 503;
      throw err;
    }

    try {
      const adults = Number.parseInt(searchParams.adults || 1, 10);
      const children = Number.parseInt(searchParams.children || 0, 10);
      const infantsInSeat = Number.parseInt(searchParams.infantsInSeat || 0, 10);
      const infantsOnLap = Number.parseInt(
        searchParams.infantsOnLap ?? searchParams.infants ?? 0,
        10,
      );

      const params = new URLSearchParams({
        engine: 'google_flights',
        departure_id: fromCode,
        arrival_id: toCode,
        outbound_date: departureDate,
        type: isRoundTrip ? '1' : '2',
        travel_class: this.mapTravelClass(searchParams.travelClass),
        adults: adults.toString(),
        api_key: this.apiKey,
        hl: 'en',
        gl: 'us',
        currency: searchParams.currency || 'USD',
      });

      if (isRoundTrip) params.append('return_date', returnDate);
      if (departureToken) params.append('departure_token', departureToken);
      if (children > 0) params.append('children', children.toString());
      if (infantsInSeat > 0) params.append('infants_in_seat', infantsInSeat.toString());
      if (infantsOnLap > 0) params.append('infants_on_lap', infantsOnLap.toString());

      const cacheKey = [...params.entries()]
        .filter(([key]) => key !== 'api_key')
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');

      const cached = this.flightSearchCache.get(cacheKey);
      if (cached && (Date.now() - cached.createdAt) < FLIGHT_SEARCH_CACHE_TTL_MS) {
        return cached.value;
      }
      if (cached) this.flightSearchCache.delete(cacheKey);

      if (this.flightSearchInFlight.has(cacheKey)) {
        return await this.flightSearchInFlight.get(cacheKey);
      }

      const providerRequest = (async () => {
        const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`, {
          signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'SerpAPI flight search request failed');

        const formatted = this.formatSerpFlightOffers(data, formatSearchParams);
        if (this.flightSearchCache.size >= FLIGHT_SEARCH_CACHE_MAX) {
          const oldestKey = this.flightSearchCache.keys().next().value;
          if (oldestKey) this.flightSearchCache.delete(oldestKey);
        }
        this.flightSearchCache.set(cacheKey, { createdAt: Date.now(), value: formatted });
        return formatted;
      })();

      this.flightSearchInFlight.set(cacheKey, providerRequest);
      try {
        return await providerRequest;
      } finally {
        this.flightSearchInFlight.delete(cacheKey);
      }
    } catch (error) {
      if (isProduction) {
        const err = new Error('Live flight search is temporarily unavailable. Please try again shortly.');
        err.code = 'FLIGHT_SEARCH_UNAVAILABLE';
        err.status = 503;
        err.cause = error;
        throw err;
      }
      console.warn('[SerpAPI] Live flight search notice (non-production):', error.message);
      return this.getMockFlightOffers(formatSearchParams);
    }
  }

  formatSerpFlightOffers(data, searchParams) {
    const allItineraries = [...(data.best_flights || []), ...(data.other_flights || [])];
    if (allItineraries.length === 0) return { flights: [], meta: { isMock: false, count: 0 } };

    const requestedFrom = this.extractAirportCode(searchParams.from);
    const requestedTo = this.extractAirportCode(searchParams.to);
    const passengerCount = Math.max(
      1,
      Number.parseInt(searchParams.adults || 1, 10)
        + Number.parseInt(searchParams.children || 0, 10)
        + Number.parseInt(searchParams.infants || 0, 10),
    );
    const tripScope = searchParams.tripScope || (searchParams.returnDate ? 'roundtrip_total' : 'oneway_total');
    const selectionStage = searchParams.resultStage || (searchParams.returnDate ? 'outbound' : 'oneway');

    const formattedFlights = allItineraries.map((itinerary, index) => {
      const supplierSegments = Array.isArray(itinerary.flights) ? itinerary.flights : [];
      if (supplierSegments.length === 0) return null;

      const firstSeg = supplierSegments[0];
      const lastSeg = supplierSegments[supplierSegments.length - 1];
      const actualFrom = this.extractAirportCode(firstSeg.departure_airport?.id);
      const actualTo = this.extractAirportCode(lastSeg.arrival_airport?.id);

      if (!actualFrom || !actualTo || actualFrom !== requestedFrom || actualTo !== requestedTo) {
        console.warn('[SerpAPI] Dropping mismatched itinerary', {
          requested: `${requestedFrom}-${requestedTo}`,
          received: `${actualFrom || '???'}-${actualTo || '???'}`,
        });
        return null;
      }

      const layovers = (itinerary.layovers || [])
        .map((layover) => ({
          airportCode: this.extractAirportCode(layover.id),
          airportName: layover.name || '',
          duration: Number.isFinite(Number(layover.duration)) ? Number(layover.duration) : layover.duration,
        }))
        .filter((layover) => layover.airportCode);

      const rawOriginalPrice = Number.parseFloat(itinerary.price || 0);
      const priceCalc = calculateFlightDiscount({
        originalPrice: rawOriginalPrice,
        isMock: false,
        currency: searchParams.currency || 'USD',
      });

      const totalDurationMinutes = Number(itinerary.total_duration)
        || supplierSegments.reduce((sum, segment) => sum + (Number(segment.duration) || 0), 0);
      const duration = durationFromMinutes(totalDurationMinutes) || 'N/A';
      const airlineName = firstSeg.airline || 'Unknown Airline';
      const flightNumber = supplierSegments.map((segment) => segment.flight_number || '').filter(Boolean).join(', ');
      const dep = splitSupplierDateTime(firstSeg.departure_airport?.time, searchParams.departure);
      const arr = splitSupplierDateTime(lastSeg.arrival_airport?.time, searchParams.departure);

      const segments = supplierSegments.map((segment, segmentIndex) => {
        const segmentDep = splitSupplierDateTime(segment.departure_airport?.time, searchParams.departure);
        const segmentArr = splitSupplierDateTime(segment.arrival_airport?.time, searchParams.departure);
        const layoverAfter = layovers[segmentIndex] || null;

        return {
          departure: {
            airport: this.extractAirportCode(segment.departure_airport?.id),
            city: segment.departure_airport?.name || '',
            time: segmentDep.time,
            date: segmentDep.date,
          },
          arrival: {
            airport: this.extractAirportCode(segment.arrival_airport?.id),
            city: segment.arrival_airport?.name || '',
            time: segmentArr.time,
            date: segmentArr.date,
          },
          duration: durationFromMinutes(segment.duration),
          airline: segment.airline || airlineName,
          flightNumber: segment.flight_number || '',
          class: segment.travel_class || firstSeg.travel_class || searchParams.travelClass || 'Economy',
          aircraft: segment.airplane || '',
          layoverAfter: segmentIndex < supplierSegments.length - 1 && layoverAfter
            ? {
                airport: layoverAfter.airportCode,
                name: layoverAfter.airportName,
                duration: durationFromMinutes(layoverAfter.duration) || String(layoverAfter.duration || ''),
                durationMinutes: Number.isFinite(Number(layoverAfter.duration)) ? Number(layoverAfter.duration) : null,
              }
            : null,
        };
      }).filter((segment) => segment.departure.airport && segment.arrival.airport);

      return {
        id: itinerary.booking_token || itinerary.departure_token || `serp-flight-${index}`,
        isMock: false,
        departureToken: itinerary.departure_token || null,
        bookingToken: itinerary.booking_token || null,
        price: {
          total: priceCalc.finalPrice,
          originalApiPrice: priceCalc.originalPrice,
          discountPercent: priceCalc.discountPercent,
          discountAmount: priceCalc.discountAmount,
          finalPrice: priceCalc.finalPrice,
          currency: priceCalc.currency,
          formatted: priceCalc.formattedFinal,
          formattedOriginal: priceCalc.formattedOriginal,
          formattedDiscount: priceCalc.formattedDiscount,
          priceScope: 'party_total',
          passengerCount,
          tripScope,
          selectionStage,
        },
        airline: airlineName,
        airline_logo: firstSeg.airline_logo || 'https://www.gstatic.com/flights/airline_logos/70px/airline.png',
        flightNumber,
        departure: {
          airport: actualFrom,
          city: firstSeg.departure_airport?.name || actualFrom,
          time: dep.time || 'N/A',
          date: dep.date || searchParams.departure,
        },
        arrival: {
          airport: actualTo,
          city: lastSeg.arrival_airport?.name || actualTo,
          time: arr.time || 'N/A',
          date: arr.date || searchParams.departure,
        },
        duration,
        stops: Math.max(0, supplierSegments.length - 1),
        layovers,
        segments,
        class: firstSeg.travel_class || searchParams.travelClass || 'Economy',
        aircraft: firstSeg.airplane || '',
        fareType: 'Standard Cabin Select',
        refundableStatus: itinerary.extensions?.join(', ').toLowerCase().includes('refundable') ? 'Refundable (Fees Apply)' : 'Non-Refundable',
        baggageAllowance: itinerary.extensions?.join(', ').toLowerCase().includes('carry-on') ? 'Carry-on Included' : 'Standard Baggage Rules Apply',
      };
    }).filter(Boolean);

    return {
      flights: formattedFlights,
      meta: { count: formattedFlights.length, isMock: false },
    };
  }

  getMockFlightOffers(searchParams) {
    const fromCode = this.extractAirportCode(searchParams.from);
    const toCode = this.extractAirportCode(searchParams.to);
    const departureDate = searchParams.departure || new Date().toISOString().split('T')[0];
    const travelClass = searchParams.travelClass || 'Economy';
    const passengerCount = Math.max(
      1,
      Number.parseInt(searchParams.adults || 1, 10)
        + Number.parseInt(searchParams.children || 0, 10)
        + Number.parseInt(searchParams.infants || 0, 10),
    );
    const tripScope = searchParams.tripScope || (searchParams.returnDate ? 'roundtrip_total' : 'oneway_total');
    const selectionStage = searchParams.resultStage || (searchParams.returnDate ? 'outbound' : 'oneway');
    const isRoundTripTotal = tripScope === 'roundtrip_total';

    const baseAirlines = [
      { name: 'Delta Air Lines', code: 'DL', basePrice: 280, logo: 'https://www.gstatic.com/flights/airline_logos/70px/DL.png' },
      { name: 'United Airlines', code: 'UA', basePrice: 250, logo: 'https://www.gstatic.com/flights/airline_logos/70px/UA.png' },
      { name: 'American Airlines', code: 'AA', basePrice: 260, logo: 'https://www.gstatic.com/flights/airline_logos/70px/AA.png' },
      { name: 'JetBlue Airways', code: 'B6', basePrice: 220, logo: 'https://www.gstatic.com/flights/airline_logos/70px/B6.png' },
    ];

    const flights = baseAirlines.map((airline, index) => {
      let multiplier = 1;
      const cabin = String(travelClass).toLowerCase();
      if (cabin.includes('business')) multiplier = 3.5;
      else if (cabin.includes('premium')) multiplier = 1.8;
      else if (cabin.includes('first')) multiplier = 8;

      const tripMultiplier = isRoundTripTotal ? 2 : 1;
      const rawPrice = (airline.basePrice + (index * 30)) * multiplier * passengerCount * tripMultiplier;
      const priceCalc = calculateFlightDiscount({ originalPrice: rawPrice, isMock: true, currency: 'USD' });
      const depTimes = ['06:00', '08:45', '13:15', '17:30'];
      const arrTimes = ['09:15', '12:00', '16:30', '20:45'];
      const stops = index === 0 ? 0 : 1;
      const departureToken = selectionStage === 'outbound' ? `mock-departure-${airline.code}-${index}` : null;
      const bookingToken = selectionStage === 'return' ? `mock-booking-${airline.code}-${index}` : null;

      return {
        id: bookingToken || departureToken || `mock-flight-${airline.code}-${index}`,
        isMock: true,
        departureToken,
        bookingToken,
        price: {
          total: priceCalc.finalPrice,
          originalApiPrice: priceCalc.originalPrice,
          discountPercent: 0,
          discountAmount: '0.00',
          finalPrice: priceCalc.finalPrice,
          currency: priceCalc.currency,
          formatted: priceCalc.formattedFinal,
          formattedOriginal: priceCalc.formattedOriginal,
          formattedDiscount: '$0.00',
          priceScope: 'party_total',
          passengerCount,
          tripScope,
          selectionStage,
        },
        airline: airline.name,
        airline_logo: airline.logo,
        flightNumber: `${airline.code}${100 + index}`,
        departure: { airport: fromCode, city: fromCode, time: depTimes[index], date: departureDate },
        arrival: { airport: toCode, city: toCode, time: arrTimes[index], date: departureDate },
        duration: '3h 15m',
        stops,
        layovers: stops ? [{ airportCode: 'ORD', airportName: "Chicago O'Hare International", duration: 45 }] : [],
        segments: [],
        class: travelClass,
        aircraft: index % 2 === 0 ? 'Boeing 737-800' : 'Airbus A320',
        fareType: 'Standard Cabin',
        refundableStatus: 'Unavailable Online / Call Desk',
        baggageAllowance: '1 Carry-on Included',
      };
    });

    return { flights, meta: { count: flights.length, isMock: true } };
  }

  getMockAirportSuggestions(query) {
    const q = String(query || '').toLowerCase();
    return LOCAL_AIRPORTS.filter((item) =>
      item.code.toLowerCase().includes(q)
      || item.name.toLowerCase().includes(q)
      || item.city.toLowerCase().includes(q));
  }
}

const LOCAL_AIRPORTS = [
  { code: 'JFK', name: 'John F. Kennedy International', city: 'New York', state: 'NY', country: 'United States' },
  { code: 'LGA', name: 'LaGuardia Airport', city: 'New York', state: 'NY', country: 'United States' },
  { code: 'EWR', name: 'Newark Liberty International', city: 'Newark', state: 'NJ', country: 'United States' },
  { code: 'LAX', name: 'Los Angeles International', city: 'Los Angeles', state: 'CA', country: 'United States' },
  { code: 'SFO', name: 'San Francisco International', city: 'San Francisco', state: 'CA', country: 'United States' },
  { code: 'MIA', name: 'Miami International', city: 'Miami', state: 'FL', country: 'United States' },
  { code: 'SEA', name: 'Seattle-Tacoma International', city: 'Seattle', state: 'WA', country: 'United States' },
  { code: 'ORD', name: "Chicago O'Hare International", city: 'Chicago', state: 'IL', country: 'United States' },
  { code: 'BOS', name: 'Boston Logan International', city: 'Boston', state: 'MA', country: 'United States' },
  { code: 'IAD', name: 'Washington Dulles International', city: 'Washington', state: 'DC', country: 'United States' },
  { code: 'DCA', name: 'Ronald Reagan Washington National', city: 'Washington', state: 'DC', country: 'United States' },
  { code: 'DFW', name: 'Dallas/Fort Worth International', city: 'Dallas', state: 'TX', country: 'United States' },
  { code: 'ATL', name: 'Hartsfield-Jackson Atlanta International', city: 'Atlanta', state: 'GA', country: 'United States' },
];

function parseDescription(description) {
  if (!description) return { city: '', state: '', country: 'United States' };
  const parts = description.split(',').map((part) => part.trim());
  if (parts.length >= 2) return { city: parts[0], state: parts[1], country: parts[2] || 'United States' };
  return { city: description, state: '', country: 'United States' };
}

export const serpapiService = new SerpApiService();
export default serpapiService;
