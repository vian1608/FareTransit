## What changed

<!-- Briefly describe the user-visible or operational change. -->

## Release checklist

- [ ] Change is on a non-production branch; `main` was not used for active development.
- [ ] Relevant automated tests were added/updated where behavior changed.
- [ ] FareTransit Hardening CI is green.
- [ ] FareTransit Production Parity Sync is green.
- [ ] Vercel Preview is green and the changed workflow was manually checked.
- [ ] Mobile/responsive behavior was checked when UI changed.
- [ ] FareTransit branding/legal/payment/demo protected boundaries remain correct.
- [ ] No production secrets, passwords, full card numbers, CVV/CVC values, or customer PII were added to source/logs.
- [ ] Database changes are backward-compatible/additive or have an explicit migration/rollback plan.
- [ ] Shared-core changes comply with `.sync/ownership.yml`.

## Production verification

After merge, verify the **Production Smoke** workflow succeeds for the merge commit before treating the release as complete.
