# Whole-Site Production Test Blueprint

This is the release QA map for FareTransit. It verifies the complete system, not just page rendering.

## Traceability rule

For every important operation verify:

`screen -> control -> frontend handler -> API client -> HTTP route -> auth/RBAC -> controller -> service -> repository -> database -> audit/integration -> response -> frontend state -> user feedback`

A button is only considered working when its intended downstream effect is correct.

## Coverage areas

### UI/UX
- typography, spacing, alignment, hierarchy and responsive behavior
- overflow/truncation/touch targets
- loading/empty/success/error states
- keyboard/focus/accessibility labels

### Public workflow
- navigation/footer/redirects
- flight, hotel and car search
- airport/location autocomplete
- forms and validation boundaries
- refresh/back/forward/duplicate submit/timeout recovery

### Flight and pricing integrity
- airline, flight number, airports, times, duration, stops, cabin, currency and total
- no fabricated taxes, fees, provider or pre-authorization amounts
- voucher/discount/rounding/party-total correctness
- search -> booking -> confirmation -> authorization -> ticketing

### Hotels/cars/CRM
- search, filters/sort, details, pagination/load-more
- booking/request creation
- CRM lead/customer/task/note linkage
- duplicate request and supplier-failure handling

### Admin/back office
- login/logout/session expiry
- booking create/draft/edit/read-after-write
- passenger/contact/itinerary/pricing/status/GDS import
- authorization/email/ticket/PNR/PDF/export
- CRM/trips/finance/suppliers/refunds/disputes where enabled

### RBAC and merchant demo
- frontend visibility plus backend enforcement
- OWN/TEAM/ALL scope
- merchant demo limited to staged demo records
- merchant demo remains read-only
- no access to real customer bookings or write operations

### Payment boundary
- manual/masked metadata only until explicit gateway integration
- no raw PAN/CVV persistence, logs or frontend bundle leakage
- no VGS runtime/components/services
- exact booking amount/currency ownership validation
- authorization evidence/snapshot/audit correctness

### Email/ticketing
- recipient/subject/rendered HTML/text
- passenger/contact/itinerary/pricing correctness
- no placeholder airline or blank final ticket
- delivery activity and ticket snapshot correctness

### Backend/API/database
- route inventory and UI/API contract alignment
- validation, status codes, timeouts, normalized errors
- FK/index/unique/RLS/status/soft-delete integrity
- migration additivity and rollback compatibility
- Supabase security/performance advisor review after DDL

### Security/reliability
- authentication/authorization/IDOR/rate-limit/token-expiry checks
- XSS/injection/sensitive error/secret checks
- slow/offline/429/500/timeout behavior
- caching/debounce/duplicate supplier-request protection
- no infinite spinners

### SEO/legal/brand
- titles/meta/canonical/robots/sitemap/structured data
- legal/support identity
- no The Final Seat customer-facing identity leakage

## Severity
- P0 security/payment/data catastrophe — block/revert
- P1 core booking/admin workflow broken — block release
- P2 important functional defect — fix before normal release unless explicitly accepted
- P3 UX/UI defect
- P4 cosmetic cleanup

## Environment execution
- feature/develop: automated regression + focused changed-workflow QA
- staging: full regression/build + deployed UAT with synthetic data
- production: non-destructive smoke + scheduled monitoring

Production is considered healthy only after the exact deployed commit passes smoke checks.
