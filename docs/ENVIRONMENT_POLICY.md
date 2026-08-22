# Environment Safety Policy

## Production
- real traffic and real customer/business data
- no experimental writes or destructive QA
- live payment credentials are production-only
- non-destructive smoke checks only after release

## Staging
- production-like code candidate
- synthetic data only until isolated staging Supabase is connected
- no real charges, ticket issuance or real-customer email sends during QA
- merchant demo remains read-only/demo-only

## Preview/develop
- integration and feature validation
- no reliance on production credentials for destructive workflows

## Payment data
- never store full PAN/CVV in application database, source or logs
- preserve masked/manual payment-reference behavior until an approved tokenized gateway flow is introduced
- no VGS runtime

## Secrets
Payment gateway keys, Supabase server secrets, email credentials, JWT secrets and merchant credentials remain in managed environment configuration and must never be committed.

## Database
Prefer additive/backward-compatible migrations. Existing applied migrations are immutable. Destructive schema/data changes require explicit documented intent and rollback planning.
