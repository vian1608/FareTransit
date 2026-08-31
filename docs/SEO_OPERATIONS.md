# FareTransit SEO Operations Runbook

SEO is an operating process, not a one-time deployment. This document defines the work that should happen after the technical implementation ships.

## 1. Google Search Console

Create/maintain a **Domain property** for `faretransit.com` so all protocol and subdomain variants are covered.

After production deployment:

1. Verify ownership through DNS if the domain property is not already verified.
2. Submit `https://www.faretransit.com/sitemap.xml`.
3. Inspect these representative canonical URLs:
   - `https://www.faretransit.com/`
   - `https://www.faretransit.com/flights`
   - `https://www.faretransit.com/baggage`
   - `https://www.faretransit.com/fare-types`
   - `https://www.faretransit.com/routes/flight-nyc-to-lon`
4. Confirm transactional URLs are not intended for indexing:
   - `/search?...`
   - `/booking/*`
   - `/payment/*`
   - `/my-bookings`
   - `/admin/*`
5. Monitor the Page Indexing report for duplicate canonicals, crawled-not-indexed pages, soft 404s and server errors.

## 2. GA4 and Search Console integration

Primary GA4 measurement ID: `G-TBWQGCGY6B`.

Link the GA4 property with the Search Console property. Use GA4 to measure behavior/conversions and Search Console to measure impressions, rankings and organic clicks.

Recommended non-PII events:

- `seo_page_view`
- `organic_cta_click`
- `flight_search_started`
- `flight_search_submitted`
- `flight_selected`
- `booking_step_view`
- `flex_assist_selected`
- `baggage_requested`
- `reservation_completed`
- `call_cta_clicked`
- `lead_form_submitted`

Never transmit names, emails, phone numbers, passport details, card details or full billing addresses to analytics.

Recommended GA4 Key Events:

- reservation completed
- lead form submitted
- qualified call/contact action where measurement is reliable

## 3. Weekly Search Console review

Review once per week:

- queries gaining impressions but sitting in positions 5–20
- pages with high impressions and low CTR
- newly indexed pages
- pages Google discovered but did not index
- unexpected canonical or redirect issues
- mobile usability/Core Web Vitals warnings

For a page with impressions but weak CTR, test a clearer title/description. Do not change titles every few days; allow enough data to compare periods.

## 4. Monthly content review

For every indexable content/route page, classify it:

- **Winner** — growing clicks or conversions: keep and expand carefully.
- **Opportunity** — impressions but weak ranking/CTR: improve the page and internal links.
- **Overlap** — competing with another FareTransit page for the same intent: consolidate.
- **Stale** — changing information cannot be maintained: update or noindex/remove.
- **No value** — no useful intent, no traffic and no unique value after a meaningful test period: merge, redirect or remove.

Do not create large batches of airport-pair pages solely by replacing city names. New route pages should have unique useful planning content and pass the repository SEO audit before indexing.

## 5. Route-page quality gate

Before adding a route to `routesData.json` with `seoStatus: "index"`, require:

- unique route title and meta description
- reviewed date
- useful origin/destination context
- at least two route-specific planning insights
- links to relevant fare/baggage/planning hubs
- no fabricated airline schedule, fare, price or baggage data

If the route cannot meet that bar, use `seoStatus: "noindex"` until it can.

## 6. Content sourcing and editorial rules

For changing airline policies, baggage prices, schedules or fare terms:

1. Prefer official airline/provider sources or reliable live itinerary data.
2. Record the review date.
3. Clearly distinguish general education from itinerary-specific information.
4. Never fabricate reviews, ratings, airline affiliations, availability or prices.
5. Remove claims that cannot be maintained accurately.

See `/editorial-policy` and `/fees-and-disclosures` for the public-facing policy.

## 7. Core Web Vitals

Monitor field data in Search Console/CrUX and supplement with Lighthouse/PageSpeed lab tests.

Targets:

- LCP: <= 2.5 seconds at the 75th percentile
- INP: <= 200 ms at the 75th percentile
- CLS: <= 0.1 at the 75th percentile

Check separately for:

- homepage
- SEO content page
- route page
- search results
- booking flow

Avoid adding large third-party scripts or above-the-fold media without measuring the impact.

## 8. Internal links

Every indexable page should have contextual links to related useful pages. Prefer descriptive anchor text rather than generic `click here` links.

Examples:

- route -> origin hub -> flights hub
- route -> fare guide
- route -> baggage guide
- guide -> relevant service page
- baggage/fare guide -> live flight search

The footer is a discovery aid, not a replacement for contextual internal links.

## 9. Backlinks and digital PR

Do not use automated link spam, PBNs, paid dofollow networks or mass reciprocal-link programs.

Prefer link-worthy original assets such as:

- baggage-fee trend reports
- route/connection datasets
- fare-flexibility comparisons
- airport/connection planning research

Any data study should explain methodology and sources so journalists and travel publishers can cite it confidently.

## 10. Quarterly technical audit

Verify:

- sitemap contains only canonical indexable 200 URLs
- aliases redirect to canonicals
- transactional/private URLs carry noindex headers
- canonical pages do not point to redirected URLs
- no duplicate page titles/descriptions
- no broken internal links
- structured data validates
- organization/contact information is consistent
- unknown URLs do not create large-scale soft-404 indexation
- old or overlapping pages are consolidated intentionally

## 11. Deployment workflow

SEO changes use the same gated branch flow as the rest of FareTransit:

`feature -> develop -> staging -> main`

Before production promotion, verify the Vercel preview for metadata, canonicals, sitemap, redirects and visible content. Never bypass failed delivery gates for an SEO release.
