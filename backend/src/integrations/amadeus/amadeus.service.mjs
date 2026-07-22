import axios from 'axios';
import config from '../../../../config/api-config.mjs';

class AmadeusService {
  constructor() {
    this.apiKey = config.AMADEUS.API_KEY;
    this.apiSecret = config.AMADEUS.API_SECRET;
    this.baseURL = config.AMADEUS.ENVIRONMENT === 'production' 
      ? config.AMADEUS.BASE_URL_PROD 
      : config.AMADEUS.BASE_URL_TEST;
    this.endpoints = config.AMADEUS.ENDPOINTS;
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  // Get access token for API authentication
  async getAccessToken() {
    try {
      if (this.accessToken && Date.now() < this.tokenExpiry) {
        return this.accessToken;
      }

      const response = await axios.post(
        `${this.baseURL}${this.endpoints.TOKEN}`,
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.apiKey,
          client_secret: this.apiSecret
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          }
        }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);
      
      return this.accessToken;
    } catch (error) {
      console.error('Error getting access token:', error.response?.data || error.message);
      throw new Error('Failed to authenticate with Amadeus API');
    }
  }

  // Extract airport code from input (handles "City (CODE)" format)
  extractAirportCode(input) {
    if (!input) return '';
    const match = input.match(/\(([A-Z]{3})\)/);
    return match ? match[1] : input.trim().toUpperCase().substring(0, 3);
  }

  // Search for flights
  async searchFlights(searchParams) {
    try {
      const token = await this.getAccessToken();
      
      const fromCode = this.extractAirportCode(searchParams.from);
      const toCode = this.extractAirportCode(searchParams.to);

      const params = {
        originLocationCode: fromCode,
        destinationLocationCode: toCode,
        departureDate: searchParams.departure,
        adults: searchParams.passengers || 1,
        max: searchParams.maxResults || 10
      };

      if (searchParams.returnDate) {
        params.returnDate = searchParams.returnDate;
      }

      if (searchParams.travelClass) {
        params.travelClass = searchParams.travelClass;
      }

      const response = await axios.get(
        `${this.baseURL}${this.endpoints.FLIGHT_OFFERS}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          },
          params
        }
      );

      return this.formatFlightOffers(response.data);
    } catch (error) {
      console.warn('Amadeus API failed or not configured, falling back to simulated flight offers:', error.message);
      return this.getMockFlightOffers(searchParams);
    }
  }

  // Generate mock flight offers when API fails or keys are placeholder
  getMockFlightOffers(searchParams) {
    const fromCode = this.extractAirportCode(searchParams.from);
    const toCode = this.extractAirportCode(searchParams.to);
    const departureDate = searchParams.departure || new Date().toISOString().split('T')[0];
    const travelClass = (searchParams.travelClass || 'ECONOMY').toUpperCase();
    const passengers = parseInt(searchParams.passengers || 1, 10);

    const baseAirlines = [
      { name: 'Delta Air Lines', code: 'DL', basePrice: 280 },
      { name: 'United Airlines', code: 'UA', basePrice: 250 },
      { name: 'American Airlines', code: 'AA', basePrice: 260 },
      { name: 'JetBlue Airways', code: 'B6', basePrice: 220 }
    ];

    const flights = baseAirlines.map((airline, idx) => {
      // Calculate price multiplier based on travelClass
      let classMultiplier = 1.0;
      if (travelClass === 'BUSINESS') classMultiplier = 3.5;
      else if (travelClass === 'PREMIUM_ECONOMY') classMultiplier = 1.8;
      else if (travelClass === 'FIRST') classMultiplier = 8.0;

      // Adjust price for stops and index
      const baseTotal = (airline.basePrice + (idx * 35)) * classMultiplier * passengers;
      
      const departureTimes = ['06:15', '08:30', '12:45', '17:20'];
      const durations = ['2h 45m', '5h 15m', '6h 30m', '3h 10m'];
      const stopsCount = idx === 0 ? 0 : idx === 3 ? 2 : 1;

      const depTime = departureTimes[idx % departureTimes.length];
      const durationStr = durations[idx % durations.length];

      return {
        id: `mock-flight-${airline.code}-${idx}`,
        price: {
          total: baseTotal.toFixed(2),
          currency: 'USD',
          formatted: `$${baseTotal.toFixed(2)}`
        },
        airline: airline.name,
        flightNumber: `${airline.code}${Math.floor(100 + Math.random() * 899)}`,
        departure: {
          airport: fromCode,
          city: searchParams.from.split('(')[0].trim(),
          time: depTime,
          date: departureDate
        },
        arrival: {
          airport: toCode,
          city: searchParams.to.split('(')[0].trim(),
          time: '23:45',
          date: departureDate
        },
        duration: durationStr,
        stops: stopsCount,
        class: travelClass,
        aircraft: 'Boeing 737 / Airbus A320',
        segments: []
      };
    });

    return {
      flights,
      meta: { count: flights.length, isMock: true }
    };
  }

  // Format flight offers from Amadeus API
  formatFlightOffers(data) {
    if (!data || !data.data) {
      return { flights: [], meta: {} };
    }

    const flights = data.data.map((offer, offerIndex) => {
      const itineraries = offer.itineraries || [];
      
      return itineraries.map((itinerary, itineraryIndex) => {
        const segments = itinerary.segments || [];
        const firstSegment = segments[0];
        const lastSegment = segments[segments.length - 1];

        // Format price in USD
        const formatPrice = (priceObj) => {
          if (!priceObj || !priceObj.total) {
            return { total: '0.00', currency: 'USD', formatted: '$0.00' };
          }
          const total = parseFloat(priceObj.total);
          if (isNaN(total)) {
            return { ...priceObj, formatted: 'N/A' };
          }
          return {
            total: total.toFixed(2),
            currency: 'USD',
            formatted: `$${total.toFixed(2)}`
          };
        };

        return {
          id: offer.id || `flight-${offerIndex}-${itineraryIndex}`,
          price: formatPrice(offer.price),
          airline: firstSegment?.carrierCode || 'Unknown',
          flightNumber: segments.map(s => `${s.carrierCode}${s.number}`).join(', '),
          departure: {
            airport: firstSegment?.departure?.iataCode || '',
            city: firstSegment?.departure?.iataCode || '',
            time: firstSegment?.departure?.at?.split('T')[1]?.substring(0, 5) || '',
            date: firstSegment?.departure?.at?.split('T')[0] || ''
          },
          arrival: {
            airport: lastSegment?.arrival?.iataCode || '',
            city: lastSegment?.arrival?.iataCode || '',
            time: lastSegment?.arrival?.at?.split('T')[1]?.substring(0, 5) || '',
            date: lastSegment?.arrival?.at?.split('T')[0] || ''
          },
          duration: itinerary.duration || '',
          stops: segments.length - 1,
          class: offer.travelerPricings?.[0]?.fareDetailsBySegment?.[0]?.cabin || 'ECONOMY',
          aircraft: segments[0]?.aircraft?.code || 'Unknown',
          segments: segments.map(segment => ({
            departure: {
              airport: segment.departure?.iataCode,
              time: segment.departure?.at
            },
            arrival: {
              airport: segment.arrival?.iataCode,
              time: segment.arrival?.at
            },
            carrier: segment.carrierCode,
            number: segment.number,
            duration: segment.duration
          }))
        };
      });
    }).flat();

    return {
      flights,
      meta: data.meta || {}
    };
  }

  // Search for airports
  async searchAirports(query) {
    try {
      const token = await this.getAccessToken();
      
      const params = {
        subType: 'AIRPORT',
        keyword: query,
        'page[limit]': 10
      };

      const response = await axios.get(
        `${this.baseURL}${this.endpoints.AIRPORT_SEARCH}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          },
          params
        }
      );

      return this.formatAirportSuggestions(response.data);
    } catch (error) {
      console.error('Error searching airports:', error.response?.data || error.message);
      // Return mock data as fallback
      return this.getMockAirportSuggestions(query);
    }
  }

  // Format airport suggestions
  formatAirportSuggestions(data) {
    if (!data || !data.data) {
      return this.getMockAirportSuggestions('');
    }

    return data.data.map(airport => ({
      code: airport.iataCode,
      name: airport.name,
      city: airport.address?.cityName || '',
      country: airport.address?.countryName || '',
      display: `${airport.name} (${airport.iataCode})`
    }));
  }

  // Mock airport suggestions (fallback)
  getMockAirportSuggestions(query) {
    const mockAirports = [
      { code: 'JFK', name: 'John F. Kennedy International', city: 'New York', country: 'United States' },
      { code: 'LAX', name: 'Los Angeles International', city: 'Los Angeles', country: 'United States' },
      { code: 'LHR', name: 'London Heathrow', city: 'London', country: 'United Kingdom' },
      { code: 'CDG', name: 'Charles de Gaulle', city: 'Paris', country: 'France' },
      { code: 'DXB', name: 'Dubai International', city: 'Dubai', country: 'UAE' },
      { code: 'SIN', name: 'Singapore Changi', city: 'Singapore', country: 'Singapore' },
      { code: 'NRT', name: 'Narita International', city: 'Tokyo', country: 'Japan' },
      { code: 'SYD', name: 'Sydney Kingsford Smith', city: 'Sydney', country: 'Australia' }
    ];

    if (!query) return mockAirports;

    const queryLower = query.toLowerCase();
    return mockAirports.filter(airport => 
      airport.code.toLowerCase().includes(queryLower) ||
      airport.name.toLowerCase().includes(queryLower) ||
      airport.city.toLowerCase().includes(queryLower)
    ).map(airport => ({
      ...airport,
      display: `${airport.name} (${airport.code})`
    }));
  }
}

export default new AmadeusService();
