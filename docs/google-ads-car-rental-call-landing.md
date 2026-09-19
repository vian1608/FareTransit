# FareTransit Google Ads Car Rental Call Landing

## Purpose

`/car-rental/call-now` is the focused paid-search landing experience for U.S. car-rental call campaigns. It is separate from `/car-rentals`, which remains the normal browsing and SEO car-rental hub.

The paid page has one dominant conversion action: call FareTransit at **+1 (888) 780-8855** (`tel:+18887808855`). It intentionally suppresses the normal flights/hotels/navigation/footer chrome while the route is active.

## Final URL mapping

| Ad group | Recommended final URL |
| --- | --- |
| Generic car rental | `https://faretransit.com/car-rental/call-now` |
| Hertz | `https://faretransit.com/car-rental/call-now?brand=hertz` |
| Avis | `https://faretransit.com/car-rental/call-now?brand=avis` |
| Budget | `https://faretransit.com/car-rental/call-now?brand=budget` |
| Enterprise | `https://faretransit.com/car-rental/call-now?brand=enterprise` |
| National | `https://faretransit.com/car-rental/call-now?brand=national` |
| Dollar | `https://faretransit.com/car-rental/call-now?brand=dollar` |
| Alamo | `https://faretransit.com/car-rental/call-now?brand=alamo` |
| Sixt | `https://faretransit.com/car-rental/call-now?brand=sixt` |
| Thrifty | `https://faretransit.com/car-rental/call-now?brand=thrifty` |

Google Ads tracking parameters can be appended normally, for example:

`https://faretransit.com/car-rental/call-now?brand=hertz&utm_source=google&utm_medium=cpc&utm_campaign=car-rental&utm_content=hertz`

The page reads the `brand` value only from an allowlisted configuration. Unknown values fall back to generic FareTransit copy and are never injected directly into page text or metadata.

## Canonical and indexing behavior

All query-parameter variants declare the same canonical URL:

`https://www.faretransit.com/car-rental/call-now`

The paid page is intentionally `noindex, follow, noarchive`. SEO location/airport pages remain separate and unchanged. Query parameters such as `brand`, UTMs, `gclid`, `gbraid`, and `wbraid` therefore do not create indexable duplicate pages.

## Brand message matching

Supported brand parameters are:

- `hertz`
- `avis`
- `budget`
- `enterprise`
- `national`
- `dollar`
- `alamo`
- `sixt`
- `thrifty`

Brand names are used descriptively only. The paid page does not use competitor logos and displays a brand-specific non-affiliation disclosure.

## Analytics

The landing page reuses the site's existing `window.gtag` installation and does not add another Google tag.

Events:

- `landing_page_view` — once per landing-route/brand view.
- `phone_click` — on every phone CTA; includes CTA `placement`.
- `contact_click` — on the low-priority support email link.

Context passed where available:

- `page_location`
- `brand`
- `utm_campaign`
- `utm_content`
- `utm_term`
- `gclid`
- `gbraid`
- `wbraid`

A `phone_click` is an engagement event only. It must not be configured as a substitute for Google's connected website-call conversion.

## Google forwarding number compatibility

The destination number remains `+1 (888) 780-8855`. Phone links are regular DOM anchors and the visible number is regular DOM text.

The existing Google Ads website-call configuration remains responsible for replacing the number for eligible ad visitors. The replacement helper updates the marked phone-number text node without replacing an entire CTA's `textContent`, so icons, labels and layout remain intact after Google swaps the displayed number.

## Mobile conversion experience

The landing page includes a persistent mobile bottom call CTA. It uses `env(safe-area-inset-bottom)` and reserves body space while active so the CTA does not cover page content.

Normal site navigation and footer remain unchanged on every other route.

## Manual Google Ads configuration

For each branded ad group, set the corresponding final URL from the table above. Keep auto-tagging enabled so `gclid` is retained, and keep campaign UTMs if they are part of the current reporting setup.

For the Google Ads conversion action **Someone calls a number shown on my website**, confirm the destination number is `+1 (888) 780-8855` and that the existing website-call conversion action/snippet remains active for `faretransit.com`.

Do not configure `phone_click` as the same primary conversion as the connected Google forwarding-number call. Use it as a diagnostic/engagement event in GA4.

## Verification

`frontend/scripts/verify-car-call-landing.js` runs during `npm run build` and checks the route, brand allowlist, canonical URL, phone constants, call-tracking compatibility, analytics event names, sticky CTA, independent-service disclosures, removal of competing navigation/Contact Us CTA, and absence of competitor logos/unsupported claims.
