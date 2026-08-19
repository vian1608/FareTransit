# Booking Confirmation Data Contract

Booking confirmation output must be generated from the persisted booking record, not from browser/session state.

## Passenger block

For every saved traveller show:
- passenger number/type
- title and full name
- date of birth
- gender
- nationality
- masked passport/document number
- document expiry

The primary saved contact email and phone must be visible below the passenger list.

## Itinerary block

Use `buildCanonicalItinerary()` for all booking confirmation rendering. Show every outbound and return segment, including:
- resolved airline name
- carrier code and flight number
- origin/destination airports
- departure/arrival dates and times
- cabin
- connection/layover information

`Commercial Airline` is not a valid customer-facing carrier name. The canonical mapper must recover a carrier from saved carrier code, flight designator, known airline name, or booking-level carrier data. If it cannot be determined, display `Airline details pending` rather than inventing a carrier.

## Security

Do not expose a full passport/document number in customer email/print output. Only the last four characters are shown. Admin passenger editing may retain the full saved value in the protected CRM.
