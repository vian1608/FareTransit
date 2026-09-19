# Google Ads car-rental call landing architecture

## Purpose

`/car-rental/call-now` is the focused Google Ads destination for car-rental campaigns whose primary conversion is a phone call to FareTransit. The existing `/car-rentals` route remains the normal SEO/browsing hub and continues to contain airport guides, rental information, search/navigation and broader site discovery.

This separation avoids turning the SEO hub into a thin paid-traffic funnel and avoids duplicating the SEO page for every branded ad group.

## Dynamic brand architecture

A single React page renders all paid-search variants. `brand` is read from the query string and resolved through a hard whitelist in `carRentalCallLandingConfig.js`. Unknown, missing or malformed brand values fall back to the generic USA rental message. The query value is never rendered directly.

Supported brand keys:

- `hertz`
- `avis`
- `budget`
- `enterprise`
- `national`
- `dollar`
- `alamo`
- `sixt`
- `thrifty`

Brand names are used only for descriptive message match. The paid landing page does not use competitor logos and does not imply affiliation.

## Recommended Google Ads final URLs

| Ad group | Final URL |
| --- | --- |
| Generic | `https://faretransit.com/car-rental/call-now` |
| Hertz | `https://faretransit.com/car-rental/call-now?brand=hertz` |
| Avis | `https://faretransit.com/car-rental/call-now?brand=avis` |
| Budget | `https://faretransit.com/car-rental/call-now?brand=budget` |
| Enterprise | `https://faretransit.com/car-rental/call-now?brand=enterprise` |
| National | `https://faretransit.com/car-rental/call-now?brand=national` |
| Dollar | `https://faretransit.com/car-rental/call-now?brand=dollar` |
| Alamo | `https://faretransit.com/car-rental/call-now?brand=alamo` |
| Sixt | `https://faretransit.com/car-rental/call-now?brand=sixt` |
| Thrifty | `https://faretransit.com/car-rental/call-now?brand=thrifty` |

Google Ads tracking parameters may be appended normally. The application reads but does not remove `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `gclid`, `gbraid`, or `wbraid`.

Example:

`https://faretransit.com/car-rental/call-now?brand=hertz&utm_source=google&utm_medium=cpc&utm_campaign=car-rental&utm_content=hertz`

## SEO behavior

All paid variants canonicalize to:

`https://www.faretransit.com/car-rental/call-now`

The page is intentionally `noindex, follow, noarchive`. Brand and tracking query strings therefore do not create indexable doorway or duplicate pages. The normal `/car-rentals` SEO hub remains indexable and unchanged.

## Phone conversion architecture

Destination number:

`+1 (888) 780-8855`

Canonical phone link:

`tel:+18887808855`

The paid page renders the number as ordinary DOM text. All paid-page call links are tagged with `data-faretransit-phone="true"` and phone text nodes use `data-phone-display="true"` so the existing Google website-call forwarding-number callback can replace the visible number and `tel:` destination without destroying nested icons or React markup.

The global forwarding-number MutationObserver remains responsible for re-applying the replacement after React hydration or SPA DOM updates. It does not add a second Google Ads tag.

## GA4 events

The page sends these engagement events to the existing GA4 property `G-TBWQGCGY6B`:

- `landing_page_view`
- `phone_click`
- `contact_click`

`landing_page_view` is guarded against React StrictMode duplicate firing for the same router location. `phone_click` is delegated at the document level so hero, header, repeated CTA, footer and mobile-sticky phone links share the same implementation.

Event context includes `page_location`, `page_path`, `brand`, plus available Google Ads/UTM attribution values. Attribution is also copied to `sessionStorage` so it survives normal same-session navigation without rewriting the URL.

A `phone_click` is an engagement event. It is **not** treated as proof of a connected phone call and should not replace Google Ads' website-call conversion action.

## Mobile conversion UX

The paid route uses a reduced header (FareTransit identity + call action), a reduced footer, and no Flights/Hotels/service-switcher navigation. The first viewport contains the rental-specific headline, independent-service disclosure, benefits, phone number and primary call CTA.

A fixed mobile bottom call bar is shown on the paid route with `env(safe-area-inset-bottom)` support. The normal global `SupportCallLayer` is explicitly disabled for this route to prevent two sticky call controls from overlapping.

## Content order

1. Conversion-focused hero
2. Why call FareTransit
3. How it works
4. Repeated call CTA
5. Trust/transparency band
6. Popular rental needs
7. Airport/SEO support links lower in the page
8. FAQ
9. Final call CTA

## Build-time regression checks

`frontend/scripts/verify-car-call-landing.js` runs as part of `npm run build` prebuild checks. It verifies the paid route, brand whitelist, phone constants, mobile sticky/safe-area behavior, analytics event names, attribution keys, no competitor-logo usage, Google forwarding-number integration, SEO noindex/canonical handling, and suppression of the generic support call layer.

## Manual Google Ads steps

1. Set each car-rental ad group's Final URL to the matching URL above.
2. Keep Google Ads auto-tagging enabled if currently used so `gclid`/`gbraid`/`wbraid` arrive on the landing page.
3. In the Google Ads conversion action for **Calls to a phone number on your website**, verify the destination number is `+1 (888) 780-8855` and the existing website-call conversion tag/action remains enabled.
4. Use Google Ads diagnostics or Tag Assistant from an actual eligible ad-click context to verify the visible FareTransit number is replaced by a Google Forwarding Number and the replaced `tel:` link is callable.
5. Keep GA4 `phone_click` separate from the connected-call conversion. If imported into Google Ads, treat it as a secondary engagement conversion unless campaign strategy deliberately says otherwise.
6. After changing final URLs, test generic, all nine brand values, one invalid brand, and mobile call behavior on a real phone.

## Environment/configuration

No new environment variable is required by this implementation. It reuses the existing FareTransit phone constants, existing GA4 property and existing Google Ads website-call conversion configuration in `frontend/public/index.html`.
