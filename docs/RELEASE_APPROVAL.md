# Release Approval

For normal releases, merging `staging -> main` is the explicit production approval action.

Before merge confirm:
- staging build/deployment is green
- staging UAT is acceptable
- no unresolved P0/P1 defects
- database changes are backward compatible or have a tested rollback plan
- FareTransit brand/payment/demo protected boundaries remain intact
- production rollback path is understood

After merge, Production Smoke must pass before the release is marked complete.
