from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path, old, new):
    p = ROOT / path
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"Expected target not found in {path}: {old[:140]!r}")
    p.write_text(text.replace(old, new, 1))


# 1) Redact contact data from public reservation payloads.
path = 'backend/src/modules/bookings/booking-public-reservation.controller.mjs'
replace_once(
    path,
    "import { resolveCanonicalReservation } from '../reservations/canonical-reservation.service.mjs';\n\nexport async function resolvePublicReservation(reference) {\n  return resolveCanonicalReservation(reference);\n}\n",
    "import { resolveCanonicalReservation } from '../reservations/canonical-reservation.service.mjs';\n\nfunction maskEmail(value) {\n  const email = String(value || '').trim();\n  const at = email.indexOf('@');\n  if (at <= 0) return null;\n  const local = email.slice(0, at);\n  const domain = email.slice(at + 1);\n  return `${local.slice(0, 1)}${'*'.repeat(Math.max(3, Math.min(8, local.length - 1)))}@${domain}`;\n}\n\nfunction maskPhone(value) {\n  const digits = String(value || '').replace(/\\D/g, '');\n  return digits.length >= 4 ? `••••${digits.slice(-4)}` : null;\n}\n\nexport function sanitizePublicReservation(data) {\n  if (!data || typeof data !== 'object') return data;\n  const customer = data.customer && typeof data.customer === 'object'\n    ? {\n        name: data.customer.name || null,\n        email: maskEmail(data.customer.email),\n        phone: maskPhone(data.customer.phone)\n      }\n    : null;\n  return {\n    ...data,\n    ...(customer ? { customer } : {})\n  };\n}\n\nexport async function resolvePublicReservation(reference) {\n  const reservation = await resolveCanonicalReservation(reference);\n  return sanitizePublicReservation(reservation);\n}\n"
)

# 2) Public search is exact-reference-only and never exposes email/phone.
path = 'backend/src/modules/bookings/booking-current-search.controller.mjs'
replace_once(
    path,
    "import { searchCanonicalReservations } from '../reservations/canonical-reservation.service.mjs';\n",
    "import { resolveCanonicalReservation, searchCanonicalReservations } from '../reservations/canonical-reservation.service.mjs';\n"
)
replace_once(path, "    email: row.email || null,\n    phone: row.phone || null,\n", "    email: null,\n    phone: null,\n")
replace_once(
    path,
    "export async function searchCurrentBookings(query) {\n  const rows = await searchCanonicalReservations(query, { limit: 40 });\n  return rows.map(toSearchResult);\n}\n",
    "export async function searchCurrentBookings(query) {\n  const rows = await searchCanonicalReservations(query, { limit: 40 });\n  return rows.map(toSearchResult);\n}\n\nexport async function findPublicBookingByExactReference(query) {\n  const reference = String(query || '').trim();\n  if (!reference) return [];\n  const reservation = await resolveCanonicalReservation(reference);\n  if (!reservation) return [];\n  return [toSearchResult({\n    id: null,\n    reference: reservation.reference,\n    serviceType: reservation.serviceType,\n    status: reservation.status,\n    authorizationStatus: reservation.authorizationStatus,\n    paymentStatus: reservation.paymentStatus,\n    customerName: reservation.customer?.name || null,\n    email: null,\n    phone: null,\n    total: reservation.pricing?.total || 0,\n    currency: reservation.pricing?.currency || 'USD',\n    createdAt: reservation.createdAt || null,\n    updatedAt: null,\n    travelDate: reservation.flight?.flights?.[0]?.departureDate || reservation.car?.pickupAt || reservation.hotel?.checkIn || null,\n    airlineName: reservation.flight?.airlineName || null,\n    origin: reservation.flight?.flights?.[0]?.departureAirport || null,\n    destination: reservation.flight?.flights?.at(-1)?.arrivalAirport || reservation.hotel?.destination || null,\n    rentalCompanyName: reservation.car?.rentalCompanyName || null,\n    vehicleName: reservation.car?.vehicleName || null,\n    vehicleCategory: reservation.car?.vehicleCategory || null,\n    pickupLocation: reservation.car?.pickupLocation || null,\n    pickupAt: reservation.car?.pickupAt || null,\n    dropoffLocation: reservation.car?.dropoffLocation || null,\n    dropoffAt: reservation.car?.dropoffAt || null,\n    supplierConfirmation: reservation.car?.supplierConfirmation || reservation.hotel?.supplierConfirmation || null,\n    propertyName: reservation.hotel?.propertyName || null,\n    checkIn: reservation.hotel?.checkIn || null,\n    checkOut: reservation.hotel?.checkOut || null,\n    supplierName: reservation.hotel?.supplierName || null\n  })];\n}\n"
)
replace_once(
    path,
    "      if (!query) {\n        return res.status(400).json({ success: false, error: { code: 'SEARCH_QUERY_REQUIRED', message: 'Confirmation code, customer name, or email is required.' } });\n      }\n      const data = await searchCurrentBookings(query);\n",
    "      if (!query) {\n        return res.status(400).json({ success: false, error: { code: 'SEARCH_QUERY_REQUIRED', message: 'Confirmation code is required.' } });\n      }\n      // Anonymous search intentionally supports an exact reservation reference only.\n      // Customer-name/email search allowed enumeration of other customers' bookings.\n      const data = await findPublicBookingByExactReference(query);\n"
)

# 3) Protect user/email lookup and send the generic reference route through the sanitized public DTO.
path = 'backend/src/modules/bookings/booking.routes.mjs'
replace_once(path, "router.get('/user/:email', bookingReadRateLimiter, bookingController.getByUserEmail);", "router.get('/user/:email', bookingReadRateLimiter, authenticate, bookingController.getByUserEmail);")
replace_once(path, "router.get('/:reference', bookingReadRateLimiter, bookingController.getByReference);", "router.get('/:reference', bookingReadRateLimiter, bookingPublicReservationController.get);")

# 4) Ownership-check authenticated customer history; return narrow canonical search DTOs.
path = 'backend/src/modules/bookings/booking.controller.mjs'
replace_once(
    path,
    "import logger from '../../config/logger.mjs';\n",
    "import logger from '../../config/logger.mjs';\nimport { searchCurrentBookings } from './booking-current-search.controller.mjs';\n"
)
replace_once(
    path,
    "  getByUserEmail: async (req, res, next) => {\n    try {\n      const { email } = req.params;\n      const bookings = await bookingService.getBookingsForEmail(email);\n      res.json({\n        success: true,\n        data: bookings\n      });\n    } catch (error) {\n      next(error);\n    }\n  },\n",
    "  getByUserEmail: async (req, res, next) => {\n    try {\n      const requestedEmail = String(req.params.email || '').trim().toLowerCase();\n      const authenticatedEmail = String(req.user?.email || '').trim().toLowerCase();\n      if (!requestedEmail || !authenticatedEmail || requestedEmail !== authenticatedEmail) {\n        return res.status(403).json({\n          success: false,\n          error: { code: 'BOOKING_OWNER_MISMATCH', message: 'You can only retrieve bookings for your own account.' }\n        });\n      }\n      const bookings = (await searchCurrentBookings(requestedEmail))\n        .filter(row => {\n          // searchCurrentBookings intentionally strips contact output, so verify ownership\n          // from the authenticated request rather than trusting a client-provided identity.\n          return row && row.confirmation_code;\n        });\n      res.json({\n        success: true,\n        data: bookings\n      });\n    } catch (error) {\n      next(error);\n    }\n  },\n"
)

# 5) Confirmation DTO: preserve rendering keys but remove sensitive traveller/card/contact material.
replace_once(
    path,
    "      const cardReference = {\n        cardholderName: pmRecord?.cardholder_name || pmRecord?.cardholderName || completeBooking.passenger_name || null,\n        cardBrand: pmRecord?.card_brand || pmRecord?.cardBrand || null,\n        last4: validLast4,\n        expMonth: pmRecord?.card_exp_month || pmRecord?.cardExpMonth || null,\n        expYear: pmRecord?.card_exp_year || pmRecord?.cardExpYear || null,\n        billingAddress: [\n          pmRecord?.billing_address_line1 || pmRecord?.billingAddressLine1 || pmRecord?.billingAddress,\n          pmRecord?.billing_address_line2 || pmRecord?.billingAddressLine2,\n          pmRecord?.billing_city || pmRecord?.billingCity,\n          pmRecord?.billing_state || pmRecord?.billingState,\n          pmRecord?.billing_postal_code || pmRecord?.billingPostalCode,\n          pmRecord?.billing_country || pmRecord?.billingCountry\n        ].filter(Boolean).join(', ') || null,\n        billingPhone: pmRecord?.billing_phone || pmRecord?.billingPhone || completeBooking.phone || null\n      };\n",
    "      // Public confirmation pages only need a masked payment reference. Never\n      // expose expiration metadata, billing address, or billing phone here.\n      const cardReference = {\n        cardholderName: null,\n        cardBrand: pmRecord?.card_brand || pmRecord?.cardBrand || null,\n        last4: validLast4,\n        expMonth: null,\n        expYear: null,\n        billingAddress: null,\n        billingPhone: null\n      };\n\n      const maskEmail = value => {\n        const email = String(value || '').trim();\n        const at = email.indexOf('@');\n        if (at <= 0) return null;\n        const local = email.slice(0, at);\n        return `${local.slice(0, 1)}${'*'.repeat(Math.max(3, Math.min(8, local.length - 1)))}@${email.slice(at + 1)}`;\n      };\n      const maskPhone = value => {\n        const digits = String(value || '').replace(/\\D/g, '');\n        return digits.length >= 4 ? `••••${digits.slice(-4)}` : null;\n      };\n      const publicTravellers = (completeBooking.travellers || []).map(t => ({\n        title: t.title || null,\n        first_name: t.first_name || t.firstName || '',\n        middle_name: t.middle_name || t.middleName || null,\n        last_name: t.last_name || t.lastName || '',\n        passenger_type: t.passenger_type || t.passengerType || null\n      }));\n      const publicContact = {\n        email: maskEmail(completeBooking.email || completeBooking.contacts?.[0]?.email),\n        phone: maskPhone(completeBooking.phone || completeBooking.contacts?.[0]?.phone_number || completeBooking.contacts?.[0]?.phone)\n      };\n"
)
replace_once(path, "          email: completeBooking.email,\n          phone: completeBooking.phone,\n", "          email: maskEmail(completeBooking.email),\n          phone: maskPhone(completeBooking.phone),\n")
replace_once(path, "        travellers: completeBooking.travellers || [],\n        contact: completeBooking.contacts?.[0] || { email: completeBooking.email, phone: completeBooking.phone },\n", "        travellers: publicTravellers,\n        contact: publicContact,\n")
replace_once(
    path,
    "            providerMessageId: completeBooking.booking_request_email_id || null,\n            errorMessage: completeBooking.booking_request_email_error || null,\n",
    "            providerMessageId: null,\n            errorMessage: null,\n"
)
replace_once(
    path,
    "            providerMessageId: confirmationEmailDeliveryRecord?.provider_message_id || completeBooking.authorization_email_message_id || null,\n            errorMessage: confirmationEmailDeliveryRecord?.error_message || null,\n",
    "            providerMessageId: null,\n            errorMessage: null,\n"
)

# 6) Update the customer-facing lookup UX: manual lookup is code-only; signed-in users load their own bookings via authenticated endpoint.
path = 'frontend/src/features/bookings/pages/MyBookingsPage.js'
replace_once(path, "      setError('Please enter a confirmation code, customer name, or email address.');", "      setError('Please enter your confirmation code.');")
replace_once(
    path,
    "    const userStr = localStorage.getItem('user');\n    if (!userStr) return;\n    try {\n      const userObj = JSON.parse(userStr);\n      if (userObj?.email) {\n        setSearchQuery(userObj.email);\n        performSearch(userObj.email);\n      }\n    } catch {\n      // Ignore stale local user data. Manual booking lookup remains available.\n    }\n",
    "    const userStr = localStorage.getItem('user');\n    const token = localStorage.getItem('token');\n    if (!userStr || !token) return;\n    try {\n      const userObj = JSON.parse(userStr);\n      if (userObj?.email) {\n        setLoading(true);\n        setError('');\n        setSearched(true);\n        bookingAPI.getByUser(userObj.email)\n          .then((response) => {\n            if (response?.success) setBookings(Array.isArray(response.data) ? response.data : []);\n            else setBookings([]);\n          })\n          .catch(() => {\n            setBookings([]);\n            setError('Unable to load your saved bookings. You can still retrieve a reservation using its confirmation code.');\n          })\n          .finally(() => setLoading(false));\n      }\n    } catch {\n      // Ignore stale local user data. Manual booking lookup remains available.\n    }\n"
)
replace_once(path, "          <p>Retrieve and view reservation details using your confirmation code, customer name, or email address.</p>", "          <p>Retrieve a reservation with its confirmation code. Signed-in customers also see bookings linked to their account.</p>")
replace_once(path, "                  placeholder=\"Enter confirmation code, name, or email...\"", "                  placeholder=\"Enter confirmation code...\"")
replace_once(path, "                  aria-label=\"Booking confirmation code, customer name, or email\"", "                  aria-label=\"Booking confirmation code\"")

# 7) Add a regression contract for the public API boundary.
test = ROOT / 'backend/tests/public_booking_privacy_contract.test.mjs'
test.write_text("""import assert from 'node:assert/strict';
import fs from 'node:fs';

const routes = fs.readFileSync(new URL('../src/modules/bookings/booking.routes.mjs', import.meta.url), 'utf8');
const controller = fs.readFileSync(new URL('../src/modules/bookings/booking.controller.mjs', import.meta.url), 'utf8');
const publicController = fs.readFileSync(new URL('../src/modules/bookings/booking-public-reservation.controller.mjs', import.meta.url), 'utf8');
const search = fs.readFileSync(new URL('../src/modules/bookings/booking-current-search.controller.mjs', import.meta.url), 'utf8');

assert.match(routes, /router\.get\('\/user\/:email', bookingReadRateLimiter, authenticate, bookingController\.getByUserEmail\)/);
assert.match(routes, /router\.get\('\/:reference', bookingReadRateLimiter, bookingPublicReservationController\.get\)/);
assert.match(controller, /BOOKING_OWNER_MISMATCH/);
assert.match(controller, /billingAddress: null/);
assert.match(controller, /expMonth: null/);
assert.match(controller, /publicTravellers/);
assert.doesNotMatch(controller.match(/const publicTravellers[\\s\\S]*?const publicContact/)?.[0] || '', /passport|date_of_birth|dateOfBirth|nationality|redress|known_traveler/i);
assert.match(publicController, /maskEmail/);
assert.match(publicController, /maskPhone/);
assert.match(search, /findPublicBookingByExactReference/);
assert.match(search, /email: null/);
assert.match(search, /phone: null/);
console.log('Public booking privacy contract: PASS');
""")

print('Public booking privacy hardening patch applied successfully.')
