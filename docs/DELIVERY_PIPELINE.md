# Lightweight Delivery Pipeline

FareTransit is maintained as a separate repository and production deployment, while approved generic product changes are normally promoted from The Final Seat's canonical shared core.

The current small-team delivery model is intentionally simple: **feature/sync branch -> pull request -> automated CI + Vercel Preview -> merge -> production -> smoke check**.

## Environments

1. **Local / feature or sync branch** — code may change freely. No customer traffic.
2. **Vercel Preview** — every pull request is deployed to a temporary preview URL by the existing Vercel Git integration. Use this as the current test/pre-production environment.
3. **Production** — `main` deploys to `https://www.faretransit.com`.

A permanent staging environment is intentionally deferred until traffic/team size makes it worthwhile.

## Required release path

1. Create a `feature/*`, `fix/*`, `delivery/*`, or `sync/*` branch from current `main`.
2. Make the change on that branch. Do not intentionally develop directly on `main`.
3. Open a pull request into `main`.
4. Wait for **FareTransit Hardening CI**, **FareTransit Production Parity Sync**, and the **Vercel Preview** status to succeed.
5. Review the preview for the changed workflow, including responsive UI when relevant.
6. Merge only after all required checks are green.
7. Vercel deploys the merge commit to production.
8. **Production Smoke** waits for Vercel to report success for that exact commit, then verifies the live home page, health endpoint, admin login route, and canonical-domain redirect.
9. If the deployment or smoke check fails, stop further rollout, investigate, and roll back/revert before unrelated changes are added.

## Shared-core rule

For generic features, The Final Seat is canonical. FareTransit receives those changes through a dedicated downstream sync PR after TFS is healthy in production.

FareTransit-specific work may originate here, but if it is broadly useful it should be promoted to The Final Seat first and then returned through the normal downstream sync path.

Never overwrite protected FareTransit boundaries during a core sync:

- FareTransit branding, legal identity and support contacts
- manual/secure-payment implementation and the no-VGS invariant
- merchant-test/demo workflow
- Maverick/NMI or other merchant/gateway credentials
- Supabase project/data/migrations unless explicitly reconciled
- Vercel environment variables and secrets

The repository ownership rules under `.sync/ownership.yml` are the source of truth for this boundary.

## Production-data safety

Use synthetic records for release verification. Never place full card numbers, CVV/CVC values, production secrets, temporary passwords, or customer PII in source, PR descriptions, test fixtures, logs, or screenshots committed to GitHub.

## Later upgrade path

When needed, insert a dedicated staging environment between Preview and Production:

`feature/sync -> PR/CI -> Preview -> Staging -> E2E/UAT -> Production`

The current pipeline is designed so staging can be added later without changing the branch-first release discipline.
