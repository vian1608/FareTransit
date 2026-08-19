/**
 * Itinerary Normalizer Utility
 * Standardizes provider-specific flight objects into a canonical normalized structure
 * for safe consumption by Checkout / BookingPage components without runtime errors.
 */

/**
 * Safe upper-case string conversion helper with fallback.
 */
export function safeUpper(value, fallback = "") {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }
  return value.trim().toUpperCase();
}

/**
 * Robust airport code extraction helper.
 */
export function getAirportCode(value) {
  if (typeof value === "string") {
    const codeMatch = value.match(/\(([A-Z]{3,4})\)/i);
    if (codeMatch) return codeMatch[1].toUpperCase();
    const clean = value.trim().toUpperCase();
    if (/^[A-Z]{3,4}$/.test(clean)) return clean;
    return clean.slice(0, 3);
  }

  if (value && typeof value === "object") {
    const code = value.code || value.iata || value.airportCode || value.airport || value.id;
    if (typeof code === "string" && code.trim()) {
      return code.trim().toUpperCase();
    }
  }

  return null;
}

/**
 * Airline name resolution helper.
 */
export function resolveAirlineName(segment = {}, fallbackAirline = "") {
  if (typeof segment.airlineName === "string" && segment.airlineName.trim()) {
    return segment.airlineName.trim();
  }
  if (typeof segment.airline === "string" && segment.airline.trim()) {
    return segment.airline.trim();
  }
  if (segment.marketingCarrier && typeof segment.marketingCarrier.name === "string" && segment.marketingCarrier.name.trim()) {
    return segment.marketingCarrier.name.trim();
  }
  if (segment.operatingCarrier && typeof segment.operatingCarrier.name === "string" && segment.operatingCarrier.name.trim()) {
    return segment.operatingCarrier.name.trim();
  }
  if (segment.carrier && typeof segment.carrier.name === "string" && segment.carrier.name.trim()) {
    return segment.carrier.name.trim();
  }
  if (fallbackAirline && typeof fallbackAirline === "string" && fallbackAirline.trim()) {
    return fallbackAirline.trim();
  }
  return "Airline information unavailable";
}

/**
 * Airline code resolution helper.
 */
export function resolveAirlineCode(segment = {}, fallbackCode = "") {
  if (typeof segment.airlineCode === "string" && segment.airlineCode.trim()) {
    return segment.airlineCode.trim().toUpperCase();
  }
  if (segment.marketingCarrier && typeof segment.marketingCarrier.code === "string" && segment.marketingCarrier.code.trim()) {
    return segment.marketingCarrier.code.trim().toUpperCase();
  }
  if (segment.operatingCarrier && typeof segment.operatingCarrier.code === "string" && segment.operatingCarrier.code.trim()) {
    return segment.operatingCarrier.code.trim().toUpperCase();
  }
  if (segment.carrier && typeof segment.carrier.code === "string" && segment.carrier.code.trim()) {
    return segment.carrier.code.trim().toUpperCase();
  }
  if (fallbackCode && typeof fallbackCode === "string" && fallbackCode.trim()) {
    return fallbackCode.trim().toUpperCase();
  }
  return "";
}

/**
 * Cabin class normalization helper.
 */
export function normalizeCabinClass(rawCabin = "Economy") {
  const c = safeUpper(rawCabin, "ECONOMY");
  if (c === "Y" || c === "F" || c === "J" || c === "C" || c === "ECONOMY" || c === "COACH") {
    if (c === "F" || c === "FIRST") return "First";
    if (c === "J" || c === "C" || c === "BUSINESS") return "Business";
    if (c === "PREMIUM" || c === "PREMIUM_ECONOMY" || c === "PREMIUM ECONOMY") return "Premium Economy";
    return "Economy";
  }
  if (c.includes("FIRST")) return "First";
  if (c.includes("BUSINESS")) return "Business";
  if (c.includes("PREMIUM")) return "Premium Economy";
  return "Economy";
}

/**
 * Trip type normalization helper.
 */
export function normalizeTripType(rawType = "ONE_WAY") {
  const t = safeUpper(rawType, "ONE_WAY").replace(/[-_]/g, "");
  if (t === "ROUNDTRIP" || t === "ROUND") return "ROUND_TRIP";
  return "ONE_WAY";
}

function positiveMoney(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Resolve the actual supplier/search total used for itinerary integrity.
 *
 * prepareFlightForBooking() deliberately changes a selected round-trip outbound
 * fare to a $0 booking contribution until the return leg is chosen. The original
 * whole-party quote is preserved as partyFinalPrice. Integrity validation must
 * validate that preserved quote, not the intentionally deferred contribution.
 */
export function resolveItineraryTotalAmount(rawResult = {}) {
  const price = rawResult?.price;

  if (price && typeof price === "object") {
    const preservedPartyTotal = positiveMoney(price.partyFinalPrice);
    if (preservedPartyTotal > 0) return preservedPartyTotal;

    const finalPrice = positiveMoney(price.finalPrice);
    if (finalPrice > 0) return finalPrice;

    const total = positiveMoney(price.total);
    if (total > 0) return total;

    const amount = positiveMoney(price.amount);
    if (amount > 0) return amount;
  }

  return positiveMoney(price);
}

/**
 * Normalize provider-specific raw search result into canonical normalized itinerary.
 */
export function normalizeSelectedItinerary(rawResult, searchContext = {}) {
  if (!rawResult || typeof rawResult !== "object") {
    return null;
  }

  const departureAirport = getAirportCode(rawResult.departureAirport || rawResult.departure?.airport || rawResult.origin || searchContext.from);
  const arrivalAirport = getAirportCode(rawResult.arrivalAirport || rawResult.arrival?.airport || rawResult.destination || searchContext.to);

  const rawSegments = Array.isArray(rawResult.segments) && rawResult.segments.length > 0
    ? rawResult.segments
    : [{
        airlineName: resolveAirlineName(rawResult, rawResult.airline),
        airlineCode: resolveAirlineCode(rawResult, rawResult.airlineCode),
        flightNumber: rawResult.flightNumber || rawResult.flight_number || "",
        departureAirport: departureAirport || "",
        arrivalAirport: arrivalAirport || "",
        departureTime: rawResult.departureTime || rawResult.departure?.time || "--:--",
        arrivalTime: rawResult.arrivalTime || rawResult.arrival?.time || "--:--",
        cabinClass: normalizeCabinClass(rawResult.cabinClass || rawResult.class)
      }];

  const normalizedSegments = rawSegments.map((seg) => ({
    airlineName: resolveAirlineName(seg, rawResult.airline),
    airlineCode: resolveAirlineCode(seg, rawResult.airlineCode),
    flightNumber: seg.flightNumber || seg.flight_number || rawResult.flightNumber || "",
    departureAirport: getAirportCode(seg.departureAirport || seg.departure?.airport || departureAirport) || "",
    arrivalAirport: getAirportCode(seg.arrivalAirport || seg.arrival?.airport || arrivalAirport) || "",
    departureTime: seg.departureTime || seg.departure?.time || rawResult.departure?.time || "--:--",
    arrivalTime: seg.arrivalTime || seg.arrival?.time || rawResult.arrival?.time || "--:--",
    cabinClass: normalizeCabinClass(seg.cabinClass || seg.class || rawResult.cabinClass || rawResult.class)
  }));

  const totalAmount = resolveItineraryTotalAmount(rawResult);

  return {
    id: rawResult.id || `fl_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    tripType: normalizeTripType(searchContext.tripType || rawResult.tripType || (searchContext.returnDate ? "ROUND_TRIP" : "ONE_WAY")),
    currency: safeUpper(rawResult.price?.currency || rawResult.currency, "USD"),
    totalAmount,
    passengerCount: parseInt(searchContext.adults || 1, 10) + parseInt(searchContext.children || 0, 10) + parseInt(searchContext.infants || 0, 10),
    outbound: {
      origin: {
        code: departureAirport || "",
        city: rawResult.departure?.city || searchContext.fromCity || departureAirport || ""
      },
      destination: {
        code: arrivalAirport || "",
        city: rawResult.arrival?.city || searchContext.toCity || arrivalAirport || ""
      },
      segments: normalizedSegments,
      departureDate: rawResult.departureDate || rawResult.departure?.date || searchContext.departureDate || "",
      arrivalDate: rawResult.arrivalDate || rawResult.arrival?.date || "",
      duration: rawResult.duration || "N/A",
      stops: typeof rawResult.stops === "number" ? rawResult.stops : 0
    },
    raw: rawResult
  };
}

/**
 * Validate normalized itinerary integrity before navigation to /booking.
 */
export function validateItineraryIntegrity(itinerary) {
  if (!itinerary || typeof itinerary !== "object") {
    return { valid: false, message: "We could not prepare this flight for checkout. Please choose another option or search again." };
  }

  if (!itinerary.outbound || !Array.isArray(itinerary.outbound.segments) || itinerary.outbound.segments.length === 0) {
    return { valid: false, message: "We could not prepare this flight for checkout. Please choose another option or search again." };
  }

  const origin = itinerary.outbound.origin?.code;
  const destination = itinerary.outbound.destination?.code;

  if (!origin || !destination) {
    return { valid: false, message: "We could not prepare this flight for checkout. Please choose another option or search again." };
  }

  if (itinerary.totalAmount <= 0) {
    return { valid: false, message: "We could not prepare this flight for checkout due to pricing data. Please choose another option or search again." };
  }

  return { valid: true, message: "" };
}
