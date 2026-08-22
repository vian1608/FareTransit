# Full Delivery Pipeline

FareTransit is a separate branded repository and deployment. It receives approved shared-core work from The Final Seat, but releases through its own development, staging and production branches.

## Environment and branch model

```text
local development
      ↓
feature/* | fix/* | sync/* | delivery/*
      ↓ PR
   develop
      ↓ PR
   staging
      ↓ PR
     main
      ↓
production
```

Vercel creates Preview Deployments for non-production branches. The long-lived `staging` branch is the pre-production code line; its Vercel Preview deployment is the staging deployment until a dedicated staging Vercel project/domain is introduced.

## Environment responsibilities

### Local / feature branch
- active code changes
- local component and API testing
- no real customer data

### Develop
- integration branch
- all normal FareTransit features, fixes and approved shared-core syncs enter here first
- Delivery Gates run full backend regression, syntax checks, frontend production build, migration safety, changed-code secret scanning, FareTransit identity checks and no-VGS checks

### Staging
- only receives promotion from `develop`
- Vercel builds the exact staging commit as a Preview Deployment
- Staging Quality reruns full regression/build checks and waits for Vercel success
- manual QA/UAT happens against this deployed candidate
- use synthetic/test records only

### Production
- `main` only receives normal releases from `staging`
- explicit `hotfix/*` PRs remain available for urgent incidents
- Vercel deploys `main` to `https://www.faretransit.com`
- Production Smoke verifies the exact merge deployment and checks important live routes
- the same smoke suite runs every six hours as lightweight monitoring

## Required normal release path

1. Branch from `develop`.
2. Implement and test the change.
3. Open a PR to `develop`.
4. Delivery Gates and Vercel Preview must succeed.
5. Merge to `develop`.
6. Open `develop -> staging` PR.
7. Delivery Gates must succeed; merge to `staging`.
8. Staging Quality waits for the Vercel staging Preview and reruns full regression/build checks.
9. Perform UAT against the staging Preview, including responsive UI and the changed business workflow.
10. Open `staging -> main` PR.
11. Reconfirm release notes, database compatibility, payment boundary, demo/RBAC behavior and rollback path.
12. Merge to `main`.
13. Vercel deploys production.
14. Production Smoke must pass before the release is considered complete.
15. Monitor scheduled smoke checks and runtime logs.

## Emergency hotfix path

`hotfix/* -> main` is permitted only for urgent production defects. The full Delivery Gates still run. After the hotfix, merge/cherry-pick the same fix back into `develop` and `staging` so the environment branches do not drift.

## Database migration policy

Use expand-and-contract migrations:
1. add backward-compatible schema first;
2. deploy code compatible with the transition;
3. verify staging;
4. remove legacy structures only in a later release.

Delivery Gates reject edits to existing migration files. New destructive SQL (`DROP`, `TRUNCATE`, destructive `ALTER`, bulk `DELETE`) is blocked unless the migration contains `-- ALLOW_DESTRUCTIVE_MIGRATION: <reason>`. This documents intent but does not replace review or a rollback plan.

## FareTransit payment boundary

Every environment must preserve these invariants:
- no VGS runtime/components/services
- no raw PAN/CVV persistence
- only the approved masked/manual reference model until the live gateway integration is explicitly implemented
- merchant demo remains read-only and isolated to synthetic demo records
- FareTransit legal/brand/support identity must not regress to The Final Seat

Delivery Gates and Staging Quality enforce the active no-VGS and identity checks.

## QA/UAT expectations

For any changed workflow, staging review should cover:
- desktop and mobile layout
- fonts, spacing, alignment and responsive behavior
- every changed button, link, form and loading/error state
- API response and backend persistence
- read-after-write state in admin/back office
- role/permission and OWN/TEAM/ALL scope behavior
- merchant demo boundaries when relevant
- email/ticket/authorization preview when relevant
- duplicate-click, timeout, retry and refresh behavior
- browser console/network failures

## Shared-core rule

The Final Seat is the canonical shared-product source. Approved generic changes are promoted into FareTransit only after TFS validation, then pass through FareTransit `develop -> staging -> main` like any other release.

Protected FareTransit boundaries include:
- branding, legal identity and support contacts
- payment/secure-payment implementation
- merchant IDs, gateway credentials or secrets
- Supabase project/data/migrations unless explicitly reconciled
- Vercel environment variables
- merchant demo functionality

`.sync/ownership.yml` is the source of truth for these boundaries.

## Production-data safety

Use synthetic records for staging/release verification. Never commit or log full card numbers, CVV/CVC values, production secrets, temporary passwords or real customer PII. Staging must not intentionally send real customer emails or create real charges/tickets.

## Monitoring and rollback

Production Smoke runs after every `main` push and every six hours. If it fails:
1. stop further releases;
2. identify whether the issue is deployment, runtime, integration or data related;
3. revert the offending Git commit or use Vercel rollback to the last healthy production deployment;
4. verify `/`, `/api/health`, `/admin/login`, public service/legal routes and canonical redirects;
5. fix forward through the normal branch path.

See `docs/ROLLBACK_RUNBOOK.md` for the operational rollback checklist.

## Dedicated staging database

The code pipeline is ready for an isolated FareTransit Supabase staging branch/project. Until it exists, do not run destructive or payment-affecting UAT against production data. Connect an isolated staging Supabase database to the Vercel staging environment before write-heavy end-to-end UAT is enabled.
