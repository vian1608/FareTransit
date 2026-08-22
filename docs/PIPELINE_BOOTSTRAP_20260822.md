# Pipeline Bootstrap — 2026-08-22

The repository now defines long-lived `develop` and `staging` branches in addition to production `main`.

Normal delivery path:

`feature/fix/sync -> develop -> staging -> main`

Automated controls introduced with this bootstrap:
- branch promotion policy
- full backend regression on release PRs
- backend syntax validation
- frontend production build
- FareTransit identity/no-VGS checks
- migration immutability/destructive-SQL guard
- changed-runtime secret scan
- staging Vercel status gate
- production smoke plus six-hour monitoring

Operational documents added:
- `DELIVERY_PIPELINE.md`
- `WEBSITE_TEST_BLUEPRINT.md`
- `UAT_CHECKLIST.md`
- `ROLLBACK_RUNBOOK.md`
- `ENVIRONMENT_POLICY.md`
- `RELEASE_STAGE_MAP.md`
