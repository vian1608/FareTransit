import serpapiService from '../../integrations/serpapi/serpapi.service.mjs';

export const flightService = {
  searchFlights: async (searchParams) => {
    return serpapiService.searchFlights(searchParams);
  },

  autocompleteAirports: async (query) => {
    return serpapiService.autocompleteAirports(query);
  }
};

export default flightService;
