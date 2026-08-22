# Staging UAT Checklist

Use this before promoting `staging` to `main`. Use synthetic data only.

## Public UX
- [ ] Homepage/header/footer/navigation
- [ ] Mobile and desktop layout
- [ ] Font/spacing/alignment/overflow
- [ ] Hotels and car-rentals entry pages
- [ ] Contact/legal/my-bookings routes

## Flight booking
- [ ] Airport autocomplete
- [ ] One-way search
- [ ] Round-trip search
- [ ] Multi-passenger pricing
- [ ] Passenger/contact validation
- [ ] Booking create/read-after-write
- [ ] Confirmation data

## Operations
- [ ] Admin login
- [ ] Booking list/detail
- [ ] Draft/create/edit booking
- [ ] Passenger/contact/itinerary save
- [ ] Pricing/status save
- [ ] Authorization preview
- [ ] Email preview
- [ ] Ticket/PNR preview

## FareTransit-specific
- [ ] Merchant demo login works
- [ ] Merchant demo remains read-only and demo-only
- [ ] Manual payment metadata remains masked/non-sensitive
- [ ] No VGS runtime is present
- [ ] No The Final Seat customer-facing identity leakage

## Reliability/security
- [ ] Duplicate-click protection
- [ ] Visible timeout/error handling
- [ ] RBAC/OWN-TEAM-ALL access rejection/allowance is correct
- [ ] No sensitive payment/secret data in UI/logs
- [ ] Browser console/network checked on changed flows

## Release readiness
- [ ] Delivery Gates green
- [ ] FareTransit hardening/parity checks green where applicable
- [ ] Staging Quality green
- [ ] Vercel staging Preview green
- [ ] No P0/P1 defects
- [ ] Rollback path understood
