# FareTransit shared-core reconciliation

FareTransit remains an independent branded repository and deployment. The Final Seat is the canonical source for shared travel-product logic after the 2026-08-22 reconciliation.

This reconciliation imports only selected generic improvements from the canonical product core. FareTransit-specific payment handling, merchant demo, branding, legal content, Supabase data, Vercel configuration and secrets are protected and must not be overwritten by shared-core synchronization.

Current downstream additions from The Final Seat:
- Medellin/MDE local airport support.
- Local-first airport autocomplete to reduce paid SerpAPI usage.
- Short-fragment provider suppression.
- Short-lived flight result caching and duplicate in-flight request suppression.

Generic improvements originally built in FareTransit were promoted back to the canonical branch separately, including truthful booking DTOs, improved car location autocomplete, Booking.com POST location catalogs and airport geography normalization.

See `.sync/ownership.yml` for the synchronization boundary.
