# Branch Promotion Policy

Normal releases use this one-way path:

`feature/fix/sync/delivery -> develop -> staging -> main`

The Delivery Gates workflow enforces the expected source branch for each pull-request target. `hotfix/* -> main` is reserved for emergency production fixes and must be reconciled back to `develop` and `staging` afterward.

Direct pushes cannot currently be technically blocked by repository rules through the connected automation, so maintainers should treat pull-request promotion as mandatory operational policy.
