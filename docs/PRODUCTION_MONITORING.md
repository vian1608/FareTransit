# Production Monitoring

`Production Smoke` runs after every production push and every six hours.

It verifies:
- the exact Vercel deployment on production pushes
- homepage
- hotels
- car rentals
- My Bookings entry
- contact and legal routes
- admin login entry
- API health endpoint and FareTransit service identity
- robots.txt and sitemap.xml
- FareTransit homepage identity
- canonical non-www -> www redirect

A failing scheduled smoke check should be treated as an operational incident and investigated before the next release.
