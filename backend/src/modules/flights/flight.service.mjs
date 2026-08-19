import serpapiService from '../../integrations/serpapi/serpapi.service.mjs';

function toCount(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export const flightService = {
  searchFlights: async (searchParams) => {
    const results = await serpapiService.searchFlights(searchParams);
    const adults = Math.max(1, toCount(searchParams.adults, 1));
    const children = toCount(searchParams.children, 0);
    const infantsInSeat = toCount(searchParams.infantsInSeat, 0);
    const infantsOnLap = toCount(
      searchParams.infantsOnLap ?? searchParams.infants,
      0,
    );
    const passengerMix = {
      adults,
      children,
      infantsInSeat,
      infantsOnLap,
      infants: infantsInSeat + infantsOnLap,
    };

    return {
      ...results,
      flights: (results.flights || []).map((flight) => ({
        ...flight,
        // Keep the searched passenger mix on the selected itinerary so booking,
        // admin and support flows can distinguish seated infants from lap infants.
        passengerMix,
      })),
    };
  },

  autocompleteAirports: async (query) => {
    return serpapiService.autocompleteAirports(query);
  }
};

export default flightService;
