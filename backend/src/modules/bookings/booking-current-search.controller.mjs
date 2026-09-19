import { resolveCanonicalReservation, searchCanonicalReservations } from '../reservations/canonical-reservation.service.mjs';

function toSearchResult(row) {
  const common = {
    id: row.id,
    confirmation_code: row.reference,
    confirmationCode: row.reference,
    booking_reference: row.reference,
    service_type: row.serviceType,
    booking_type: String(row.serviceType || '').toLowerCase(),
    status: row.status,
    reservation_status: row.status,
    authorization_status: row.authorizationStatus,
    payment_status: row.paymentStatus,
    paymentStatus: row.paymentStatus,
    passenger_name: row.customerName || 'Customer',
    customer_name: row.customerName || null,
    customerName: row.customerName || null,
    email: null,
    phone: null,
    total_amount: Number(row.total || 0),
    amount: Number(row.total || 0),
    currency: row.currency || 'USD',
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    departure_date: row.travelDate || null
  };

  if (row.serviceType === 'CAR') {
    return {
      ...common,
      rental_company_name: row.rentalCompanyName || null,
      vehicle_name: row.vehicleName || null,
      vehicle_category: row.vehicleCategory || null,
      pickup_location: row.pickupLocation || null,
      pickup_at: row.pickupAt || null,
      dropoff_location: row.dropoffLocation || null,
      dropoff_at: row.dropoffAt || null,
      supplier_confirmation: row.supplierConfirmation || null,
      carrier: row.rentalCompanyName || 'Car Rental',
      airline: row.rentalCompanyName || 'Car Rental',
      origin_code: row.pickupLocation || null,
      destination_code: row.dropoffLocation || null
    };
  }

  if (row.serviceType === 'HOTEL') {
    return {
      ...common,
      property_name: row.propertyName || null,
      destination: row.destination || null,
      check_in: row.checkIn || row.travelDate || null,
      check_out: row.checkOut || null,
      supplier_name: row.supplierName || null,
      carrier: row.propertyName || 'Hotel',
      airline: row.propertyName || 'Hotel',
      origin_code: row.destination || null,
      destination_code: row.destination || null
    };
  }

  return {
    ...common,
    carrier: row.airlineName || null,
    airline: row.airlineName || null,
    origin_code: row.origin || null,
    destination_code: row.destination || null
  };
}

export async function searchCurrentBookings(query) {
  const rows = await searchCanonicalReservations(query, { limit: 40 });
  return rows.map(toSearchResult);
}

export async function findPublicBookingByExactReference(query) {
  const reference = String(query || '').trim();
  if (!reference) return [];
  const reservation = await resolveCanonicalReservation(reference);
  if (!reservation) return [];
  return [toSearchResult({
    id: null,
    reference: reservation.reference,
    serviceType: reservation.serviceType,
    status: reservation.status,
    authorizationStatus: reservation.authorizationStatus,
    paymentStatus: reservation.paymentStatus,
    customerName: reservation.customer?.name || null,
    email: null,
    phone: null,
    total: reservation.pricing?.total || 0,
    currency: reservation.pricing?.currency || 'USD',
    createdAt: reservation.createdAt || null,
    updatedAt: null,
    travelDate: reservation.flight?.flights?.[0]?.departureDate || reservation.car?.pickupAt || reservation.hotel?.checkIn || null,
    airlineName: reservation.flight?.airlineName || null,
    origin: reservation.flight?.flights?.[0]?.departureAirport || null,
    destination: reservation.flight?.flights?.at(-1)?.arrivalAirport || reservation.hotel?.destination || null,
    rentalCompanyName: reservation.car?.rentalCompanyName || null,
    vehicleName: reservation.car?.vehicleName || null,
    vehicleCategory: reservation.car?.vehicleCategory || null,
    pickupLocation: reservation.car?.pickupLocation || null,
    pickupAt: reservation.car?.pickupAt || null,
    dropoffLocation: reservation.car?.dropoffLocation || null,
    dropoffAt: reservation.car?.dropoffAt || null,
    supplierConfirmation: reservation.car?.supplierConfirmation || reservation.hotel?.supplierConfirmation || null,
    propertyName: reservation.hotel?.propertyName || null,
    checkIn: reservation.hotel?.checkIn || null,
    checkOut: reservation.hotel?.checkOut || null,
    supplierName: reservation.hotel?.supplierName || null
  })];
}

export const bookingCurrentSearchController = {
  search: async (req, res, next) => {
    try {
      const query = String(req.query?.query || '').trim();
      if (!query) {
        return res.status(400).json({ success: false, error: { code: 'SEARCH_QUERY_REQUIRED', message: 'Confirmation code is required.' } });
      }
      // Anonymous search intentionally supports an exact reservation reference only.
      // Customer-name/email search allowed enumeration of other customers' bookings.
      const data = await findPublicBookingByExactReference(query);
      return res.json({ success: true, data, count: data.length });
    } catch (error) {
      return next(error);
    }
  }
};

export default bookingCurrentSearchController;
