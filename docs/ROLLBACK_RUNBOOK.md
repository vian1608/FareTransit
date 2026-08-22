# Production Rollback Runbook

Use this when a FareTransit production release is unhealthy after deployment.

## Trigger conditions

Rollback or revert should be considered when any of these are true:
- Production Smoke fails after a release.
- `/api/health` is unavailable or returns the wrong service identity.
- booking creation, authorization, payment, ticketing, merchant demo or admin access is materially broken.
- a security, RBAC or data-integrity regression is discovered.
- error rates increase immediately after the release.

## Immediate actions

1. Stop merging unrelated changes.
2. Record the production commit SHA and previous known-good SHA.
3. Check Vercel deployment/build/runtime logs.
4. Determine whether the defect is code-only or requires database/data recovery.
5. Do not improvise a destructive database rollback.
6. Do not switch back to VGS/raw-card handling as an emergency workaround.

## Preferred rollback order

### Option A — Vercel deployment rollback
Promote the most recent known-good deployment when the database remains backward compatible.

### Option B — Git revert
Create a revert commit for the offending release and promote it through the emergency hotfix path. This keeps source history explicit and aligns repository state with production.

## Verification after rollback

Verify at minimum:
- homepage
- `/api/health`
- `/hotels`
- `/car-rentals`
- `/my-bookings`
- `/admin/login`
- `/contact`
- legal pages
- canonical non-www -> www redirect

For booking/back-office incidents also verify using synthetic/test data only:
- flight search
- booking create/read
- authorization preview
- masked/manual payment metadata behavior
- email preview
- ticket preview
- admin booking detail
- merchant demo remains read-only and restricted to demo records

## Database and payment rules

Production migrations should be additive first so code rollback remains possible without destructive schema rollback. Never restore full PAN/CVV collection or persistence during incident handling. Gateway/payment credentials must remain environment-managed secrets.

## After recovery

1. Open a root-cause fix from `develop` or an emergency `hotfix/*` branch.
2. Add or strengthen a regression test that would have caught the incident.
3. Reconcile `develop`, `staging`, and `main` so environment branches do not drift.
4. Re-run staging QA/UAT before the next normal release.
