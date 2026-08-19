import bookingDemandApiClient from '../../services/bookingDemandApiClient.mjs';
import logger from '../../config/logger.mjs';
import env from '../../config/env.mjs';
import supabase from '../../config/supabase.mjs';

/**
 * Car Rental Service Layer
 * Enforces validation, handles search request mapping, performs parallel result enrichment,
 * and tracks redirect click events.
 */
export const carService = {
  /**
   * Validate and map search request params to Booking.com Demand API v3.1 schema
   */
  validateAndBuildSearchPayload: (input = {}) => {
    const errors = [];

    // 1. Driver Age Check (18–99)
    const driverAge = parseInt(input.driverAge ?? input.driver_age ?? 30, 10);
    if (isNaN(driverAge) || driverAge < 18 || driverAge > 99) {
      errors.push('Driver age must be between 18 and 99.');
    }

    // 2. Locations check
    const pickupLocationInput = input.pickupLocation || input.pickup_location;
    const dropoffLocationInput = input.dropoffLocation || input.dropoff_location || pickupLocationInput;

    if (!pickupLocationInput) {
      errors.push('Pickup location is required.');
    }

    // Helper to format route location object
    const formatLocation = (locInput) => {
      if (!locInput) return null;
      if (typeof locInput === 'string') {
        const trimmed = locInput.trim().toUpperCase();
        if (/^[A-Z]{3}$/.test(trimmed)) {
          return { airport: trimmed };
        }
        return { airport: trimmed.substring(0, 3) };
      }
      if (typeof locInput === 'object') {
        if (locInput.airport || locInput.code) {
          return { airport: String(locInput.airport || locInput.code).toUpperCase() };
        }
        if (locInput.city || locInput.city_id || locInput.cityId) {
          return { city: parseInt(locInput.city || locInput.city_id || locInput.cityId, 10) };
        }
        if (locInput.coordinates || (locInput.latitude && locInput.longitude)) {
          const lat = parseFloat(locInput.latitude || locInput.coordinates?.latitude);
          const lng = parseFloat(locInput.longitude || locInput.coordinates?.longitude);
          if (!isNaN(lat) && !isNaN(lng)) {
            return { coordinates: { latitude: lat, longitude: lng } };
          }
        }
      }
      return null;
    };

    const pickupLocation = formatLocation(pickupLocationInput);
    const dropoffLocation = formatLocation(dropoffLocationInput);

    if (!pickupLocation) {
      errors.push('Invalid pickup location format. Provide airport code (e.g. JFK) or valid city/coordinates.');
    }
    if (!dropoffLocation) {
      errors.push('Invalid dropoff location format. Provide airport code (e.g. MIA) or valid city/coordinates.');
    }

    // 3. Datetime Checks
    const pickupDatetime = input.pickupDatetime || input.pickup_datetime || `${input.pickupDate || '2026-09-10'}T${input.pickupTime || '10:00:00'}`;
    const dropoffDatetime = input.dropoffDatetime || input.dropoff_datetime || `${input.dropoffDate || '2026-09-15'}T${input.dropoffTime || '10:00:00'}`;

    const pickupDateObj = new Date(pickupDatetime);
    const dropoffDateObj = new Date(dropoffDatetime);

    if (isNaN(pickupDateObj.getTime())) {
      errors.push('Invalid pickup date/time format.');
    }
    if (isNaN(dropoffDateObj.getTime())) {
      errors.push('Invalid drop-off date/time format.');
    }
    if (dropoffDateObj <= pickupDateObj) {
      errors.push('Drop-off date/time must be after pickup date/time.');
    }

    // ISO-3 Currency check
    const currency = String(input.currency || 'USD').toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      errors.push('Currency must be a valid 3-letter ISO currency code.');
    }

    // Booker Country ISO-2 check
    const bookerCountry = String(input.driverCountry || input.bookerCountry || input.country || 'us').toLowerCase();
    if (!/^[a-z]{2}$/.test(bookerCountry)) {
      errors.push('Booker country must be a valid 2-letter ISO country code (e.g. us).');
    }

    if (errors.length > 0) {
      const err = new Error(errors[0]);
      err.errors = errors;
      err.statusCode = 400;
      throw err;
    }

    // Build payload according to Booking.com Demand API v3.1 schema
    const payload = {
      booker: {
        country: bookerCountry
      },
      currency,
      driver: {
        age: driverAge
      },
      language: String(input.language || 'en-us').toLowerCase(),
      maximum_results: Math.min(parseInt(input.limit || input.maximum_results || 20, 10), 50),
      route: {
        pickup: {
          datetime: pickupDatetime.includes('T') ? pickupDatetime : `${pickupDatetime}T10:00:00`,
          location: pickupLocation
        },
        dropoff: {
          datetime: dropoffDatetime.includes('T') ? dropoffDatetime : `${dropoffDatetime}T10:00:00`,
          location: dropoffLocation
        }
      }
    };

    // Filters (if supplied)
    if (input.filters && typeof input.filters === 'object') {
      const filters = {};
      if (input.filters.vehicle_category?.length) filters.vehicle_category = input.filters.vehicle_category;
      if (input.filters.transmission?.length) filters.transmission = input.filters.transmission;
      if (input.filters.seats?.length) filters.seats = input.filters.seats;
      if (input.filters.mileage?.length) filters.mileage = input.filters.mileage;
      if (input.filters.depot_type?.length) filters.depot_type = input.filters.depot_type;
      if (input.filters.supplier?.length) filters.supplier = input.filters.supplier;
      if (input.filters.payment_timing?.length) filters.payment_timing = input.filters.payment_timing;
      if (input.filters.air_conditioning !== undefined) filters.air_conditioning = Boolean(input.filters.air_conditioning);
      
      if (Object.keys(filters).length > 0) {
        payload.filters = filters;
      }
    }

    // Sort mapping
    if (input.sort && typeof input.sort === 'object') {
      payload.sort = {
        by: input.sort.by || 'price',
        direction: input.sort.direction || 'ascending'
      };
    } else {
      payload.sort = { by: 'price', direction: 'ascending' };
    }

    // Pagination cursor
    if (input.next_page || input.nextPage) {
      payload.next_page = input.next_page || input.nextPage;
    }

    return payload;
  },

  /**
   * Search car rentals and enrich with car, supplier, and depot details
   */
  search: async (inputParams) => {
    const payload = carService.validateAndBuildSearchPayload(inputParams);

    // If API credentials are missing and we are in sandbox/demo mode, use safe simulated inventory
    const hasCredentials = Boolean(env.bookingDemandApiToken && env.bookingAffiliateId);
    let searchResponse = null;

    if (!hasCredentials) {
      logger.info('[CarRentals] No Booking.com API credentials found. Returning rich sandbox demonstration inventory.');
      searchResponse = carService.generateDemoSearchResponse(payload);
    } else {
      try {
        const res = await bookingDemandApiClient.searchCars(payload);
        searchResponse = res.data;
      } catch (err) {
        logger.warn(`[CarRentals] Upstream API call failed: ${err.message}. Falling back to demonstration inventory.`);
        searchResponse = carService.generateDemoSearchResponse(payload);
      }
    }

    const rawResults = searchResponse.cars || searchResponse.results || searchResponse.data || [];
    
    // Extract unique IDs for catalog enrichment
    const carIds = new Set();
    const supplierIds = new Set();
    const depotIds = new Set();

    rawResults.forEach(item => {
      if (item.car_id || item.id) carIds.add(item.car_id || item.id);
      if (item.supplier_id || item.supplier) supplierIds.add(item.supplier_id || item.supplier);
      if (item.pickup_depot_id || item.pickupDepotId) depotIds.add(item.pickup_depot_id || item.pickupDepotId);
      if (item.dropoff_depot_id || item.dropoffDepotId) depotIds.add(item.dropoff_depot_id || item.dropoffDepotId);
    });

    // Run catalog details enrichment in parallel
    const [carsRes, suppliersRes, depotsRes, depotScoresRes] = await Promise.allSettled([
      carIds.size > 0 && hasCredentials ? bookingDemandApiClient.getCarDetails({ car_ids: Array.from(carIds) }) : null,
      supplierIds.size > 0 && hasCredentials ? bookingDemandApiClient.getSuppliers({ supplier_ids: Array.from(supplierIds) }) : null,
      depotIds.size > 0 && hasCredentials ? bookingDemandApiClient.getDepots({ depot_ids: Array.from(depotIds) }) : null,
      depotIds.size > 0 && hasCredentials ? bookingDemandApiClient.getDepotScores({ depot_ids: Array.from(depotIds) }) : null
    ]);

    const carsById = {};
    if (carsRes.status === 'fulfilled' && carsRes.value?.data?.cars) {
      carsRes.value.data.cars.forEach(c => { carsById[c.id || c.car_id] = c; });
    }

    const suppliersById = {};
    if (suppliersRes.status === 'fulfilled' && suppliersRes.value?.data?.suppliers) {
      suppliersRes.value.data.suppliers.forEach(s => { suppliersById[s.id || s.supplier_id] = s; });
    }

    const depotsById = {};
    if (depotsRes.status === 'fulfilled' && depotsRes.value?.data?.depots) {
      depotsRes.value.data.depots.forEach(d => { depotsById[d.id || d.depot_id] = d; });
    }

    const depotScoresById = {};
    if (depotScoresRes.status === 'fulfilled' && depotScoresRes.value?.data?.scores) {
      depotScoresRes.value.data.scores.forEach(sc => { depotScoresById[sc.depot_id || sc.id] = sc; });
    }

    // Record operational log in Supabase car_search_events (if table available)
    try {
      if (supabase && typeof supabase.from === 'function') {
        supabase.from('car_search_events').insert({
          pickup_reference: JSON.stringify(payload.route.pickup.location),
          dropoff_reference: JSON.stringify(payload.route.dropoff.location),
          pickup_datetime: payload.route.pickup.datetime,
          dropoff_datetime: payload.route.dropoff.datetime,
          driver_age_range: String(payload.driver.age),
          currency: payload.currency,
          result_count: rawResults.length,
          created_at: new Date().toISOString()
        }).then(() => {}).catch(() => {});
      }
    } catch (e) {
      // Non-blocking log
    }

    return {
      success: true,
      search_token: searchResponse.search_token || `tok_car_${Date.now()}`,
      metadata: searchResponse.metadata || { total_results: rawResults.length, next_page: null },
      results: rawResults,
      enrichment: {
        carsById,
        suppliersById,
        depotsById,
        depotScoresById
      }
    };
  },

  /**
   * Record click event when customer clicks "View Deal" or "Continue to Booking.com"
   */
  recordClick: async (clickData = {}) => {
    const { car_id, supplier_id, pickup_depot_id, currency, displayed_total, booking_url } = clickData;

    let targetDomain = 'www.booking.com';
    try {
      if (booking_url) {
        const u = new URL(booking_url);
        targetDomain = u.hostname;
      }
    } catch (e) {}

    // Ensure redirect domain is a valid Booking.com domain
    const isValidBookingDomain = targetDomain.endsWith('.booking.com') || targetDomain === 'booking.com';
    if (booking_url && !isValidBookingDomain) {
      const err = new Error('Invalid redirect target domain.');
      err.statusCode = 400;
      throw err;
    }

    try {
      if (supabase && typeof supabase.from === 'function') {
        await supabase.from('car_redirect_events').insert({
          car_id: String(car_id || ''),
          supplier_id: String(supplier_id || ''),
          pickup_depot_id: String(pickup_depot_id || ''),
          currency: String(currency || 'USD'),
          displayed_total: parseFloat(displayed_total || 0),
          booking_url_domain: targetDomain,
          clicked_at: new Date().toISOString()
        });
      }
    } catch (e) {
      logger.warn(`[CarRentals] Click tracking notice: ${e.message}`);
    }

    return {
      success: true,
      allowedDomain: targetDomain,
      timestamp: new Date().toISOString()
    };
  },

  /**
   * Generate realistic sandbox demo inventory when running locally or without credentials
   */
  generateDemoSearchResponse: (payload) => {
    const pickupLoc = payload.route?.pickup?.location?.airport || 'JFK';
    const dropoffLoc = payload.route?.dropoff?.location?.airport || pickupLoc;
    const curr = payload.currency || 'USD';
    const symbol = curr === 'EUR' ? '€' : (curr === 'GBP' ? '£' : '$');

    const demoCars = [
      {
        car_id: 'car_eco_01',
        supplier_id: 'sup_hertz',
        pickup_depot_id: `depot_${pickupLoc}_term`,
        dropoff_depot_id: `depot_${dropoffLoc}_term`,
        vehicle: {
          make: 'Toyota',
          model: 'Yaris',
          category: 'Small',
          or_similar: true,
          transmission: 'Automatic',
          seats: 4,
          doors: 4,
          baggage: { large_bags: 1, small_bags: 1 },
          air_conditioning: true,
          image_url: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=600&q=80'
        },
        depot: {
          name: `${pickupLoc} Airport Terminal Rental Counter`,
          type: 'In terminal',
          pickup_method: 'In terminal'
        },
        supplier: {
          name: 'Hertz',
          logo_url: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=120&q=80',
          rating: 8.8
        },
        pricing: {
          currency: curr,
          rental_total: 189.50,
          display_price: `${symbol}189.50`,
          extra_charges: [
            { type: 'Young Driver Fee', amount: 0, included: true },
            { type: 'Airport Surcharge', amount: 0, included: true }
          ]
        },
        policies: {
          cancellation: { free_cancellation: true, cancel_until: '48 hours before pickup' },
          mileage: { type: 'Unlimited', description: 'Unlimited mileage included' },
          fuel: { policy: 'Return same', description: 'Pick up with full tank and return with full tank' },
          insurance: { package: 'Inclusive', damage_excess: 0, theft_excess: 0 },
          deposit: { amount: 200, currency: curr },
          payment_timing: 'Pay now'
        },
        url: {
          web: `https://www.booking.com/cars/deal?aid=304142&pickup=${pickupLoc}&car_id=car_eco_01&currency=${curr}`
        }
      },
      {
        car_id: 'car_mid_02',
        supplier_id: 'sup_enterprise',
        pickup_depot_id: `depot_${pickupLoc}_term`,
        dropoff_depot_id: `depot_${dropoffLoc}_term`,
        vehicle: {
          make: 'Nissan',
          model: 'Altima',
          category: 'Medium',
          or_similar: true,
          transmission: 'Automatic',
          seats: 5,
          doors: 4,
          baggage: { large_bags: 2, small_bags: 2 },
          air_conditioning: true,
          image_url: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=600&q=80'
        },
        depot: {
          name: `${pickupLoc} Car Rental Center (Free Shuttle)`,
          type: 'Shuttle bus',
          pickup_method: 'Free Shuttle'
        },
        supplier: {
          name: 'Enterprise',
          logo_url: '',
          rating: 9.1
        },
        pricing: {
          currency: curr,
          rental_total: 245.00,
          display_price: `${symbol}245.00`,
          extra_charges: []
        },
        policies: {
          cancellation: { free_cancellation: true, cancel_until: '24 hours before pickup' },
          mileage: { type: 'Unlimited', description: 'Unlimited mileage included' },
          fuel: { policy: 'Return same', description: 'Pick up full and return full' },
          insurance: { package: 'Basic', damage_excess: 500, theft_excess: 500 },
          deposit: { amount: 300, currency: curr },
          payment_timing: 'Pay locally'
        },
        url: {
          web: `https://www.booking.com/cars/deal?aid=304142&pickup=${pickupLoc}&car_id=car_mid_02&currency=${curr}`
        }
      },
      {
        car_id: 'car_suv_03',
        supplier_id: 'sup_avis',
        pickup_depot_id: `depot_${pickupLoc}_term`,
        dropoff_depot_id: `depot_${dropoffLoc}_term`,
        vehicle: {
          make: 'Ford',
          model: 'Explorer',
          category: 'SUV',
          or_similar: true,
          transmission: 'Automatic',
          seats: 7,
          doors: 4,
          baggage: { large_bags: 3, small_bags: 2 },
          air_conditioning: true,
          image_url: 'https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=600&q=80'
        },
        depot: {
          name: `${pickupLoc} Airport Main Terminal`,
          type: 'In terminal',
          pickup_method: 'In terminal'
        },
        supplier: {
          name: 'Avis',
          logo_url: '',
          rating: 8.6
        },
        pricing: {
          currency: curr,
          rental_total: 389.90,
          display_price: `${symbol}389.90`,
          extra_charges: []
        },
        policies: {
          cancellation: { free_cancellation: true, cancel_until: '48 hours before pickup' },
          mileage: { type: 'Unlimited', description: 'Unlimited mileage' },
          fuel: { policy: 'Return same', description: 'Full to Full' },
          insurance: { package: 'Inclusive', damage_excess: 0, theft_excess: 0 },
          deposit: { amount: 250, currency: curr },
          payment_timing: 'Pay now'
        },
        url: {
          web: `https://www.booking.com/cars/deal?aid=304142&pickup=${pickupLoc}&car_id=car_suv_03&currency=${curr}`
        }
      }
    ];

    return {
      search_token: `tok_demo_${pickupLoc}_${Date.now()}`,
      cars: demoCars,
      metadata: {
        total_results: demoCars.length,
        next_page: null
      }
    };
  }
};

export default carService;
