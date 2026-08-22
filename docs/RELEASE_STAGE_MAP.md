# Release Stage Map

| Stage | Git ref | Deployment | Purpose | Data rule |
|---|---|---|---|---|
| Local | developer machine | localhost | active coding | test data only |
| Feature | feature/fix/sync branch | Vercel Preview | isolated change review | test data only |
| Develop | `develop` | Vercel Preview | integration | no destructive production-data testing |
| Staging | `staging` | Vercel Preview | full QA/UAT | synthetic data; isolated staging Supabase when provisioned |
| Production | `main` | www.faretransit.com | real users | production data |

Normal promotion is `feature/sync -> develop -> staging -> main`.
