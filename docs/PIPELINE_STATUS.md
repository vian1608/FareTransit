# Pipeline Status Reference

Environment branches:
- integration: `develop`
- pre-production: `staging`
- production: `main`

Primary automated gates:
- `Delivery Gates` on PRs into develop/staging/main
- `Staging Quality` on staging pushes
- FareTransit hardening/parity checks
- `Production Smoke` on production pushes and scheduled monitoring

Vercel Preview is the deployed review/staging surface for non-production branches.
