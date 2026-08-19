# Sitewide UI + Address Modernization Pass — 2026-08-09

## Scope

This pass is intentionally implemented through shared components and global interaction tokens so the visual behavior stays consistent across the public/customer routes and the admin routes listed in `frontend/src/app/App.js`.

## Address workflow

- Customer checkout continues to use the shared `AddressAutocompleteInput`.
- The selected-booking admin workspace now exposes a dedicated **Passenger / Contact Address** panel near the top of the page.
- Typing at least 3 characters queries `/api/address-autocomplete` with a bounded request.
- Stale autocomplete requests are cancelled/ignored so an older response cannot overwrite a newer query.
- Selecting a suggestion fills:
  - Street address
  - Apartment / Unit / Suite (when supplied)
  - City
  - State / Province
  - ZIP / Postal Code
  - Country
- Admin saves go through `/api/admin/bookings/:id/billing-details`, which is field-isolated and does not mutate itinerary, passenger rows, pricing, payment splits, authorization amounts or booking status.
- Failures are visible and the Save Address loading state is always released.

## Sitewide interaction system

`ModernInteractionSystem.css` is loaded after the legacy styles and provides shared:

- button geometry and press/hover states;
- form-control radii, focus rings and field depth;
- card/panel borders and subtle shadows;
- admin-specific surface treatment;
- modern tab/button styling;
- modal backdrop and entrance motion;
- alert/dropdown sheet styling;
- progressive admin collapse transitions;
- mobile touch targets;
- `prefers-reduced-motion` handling.

`ModernDetailsMotion.css` progressively enhances native `<details>` disclosure motion in browsers that support animating intrinsic sizes.

`PageTransition.js` now applies route-aware `theme-admin`, `theme-cars`, `theme-rail`, and `theme-flights` body classes plus a short route-entry transition.

## Safety / regression coverage

`backend/tests/sitewide_ui_address_modernization.test.mjs` protects the shared UI/address contract in CI. Frontend production build remains the compile-time gate for the complete route tree.

## Intentionally unchanged

This pass does not change booking prices, payment state, passenger identity, itinerary data, email dispatch rules, authorization status, or destructive admin actions. It is a UI/address-data-entry pass.
