# Staging Policy

The `staging` branch is the pre-production release candidate. Vercel Preview for that branch is the current staging deployment.

Only `develop` should promote into `staging`. Staging is for full regression and UAT, not active feature development.

Until an isolated staging Supabase database is connected, use only non-destructive or synthetic-data tests. Do not intentionally create real charges, send real customer emails, issue real tickets, or run destructive database tests from staging. Preserve the read-only merchant-demo and masked payment-data boundaries.
