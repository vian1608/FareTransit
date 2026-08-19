# Supabase egress guardrails

## Why this exists

The July 18, 2026 billing-cycle `pg_stat_statements` snapshot showed a runaway read pattern: about 7.5 million PostgREST request-context executions, including roughly 1.48-1.50 million reads each of bookings, flights, travellers, payments and contacts. The database itself was small, so request amplification and oversized `select=*` payloads were the primary risk.

## Non-negotiable rules

1. **Never mount a hidden React component that still fetches data.** If a page is not being shown, do not render its data-loading component and hide it with CSS.
2. **No `select('*')` on high-volume booking/admin paths.** Select only the columns the caller renders or uses.
3. **List endpoints return summaries, not complete bookings.** A booking table must not download passports, payment metadata, audit history, email history or `flights.fare_details` for every row.
4. **Load a complete booking once per page action.** Reuse an in-flight request rather than allowing multiple sibling components to create independent Supabase fan-outs.
5. **Do not query optional/nonexistent tables on every request.** Use one canonical production table or a compatibility view/migration.
6. **`flights` is the durable itinerary source for normal reads.** Do not require `booking_itinerary_segments` merely to render an itinerary when `flights` already contains it.
7. **Abandoned checkout writes are one UPSERT.** Do not read to see if the row exists, and do not `.select()` the full row after the write.
8. **Keep abandoned snapshots compact.** Never persist raw supplier responses when normalized route/date/carrier/price data is enough for recovery.
9. **Mutation endpoints return only what the caller needs.** Generated IDs may be selected explicitly; do not return whole inserted rows by default.
10. **A booking must have a real Supabase UUID before related rows are inserted.** Never continue with a memory-only/fake booking ID after a failed database insert.
11. **Payment status is one domain:** `PENDING`, `PROCESSING`, `PAID`, `FAILED`, `REFUNDED`. Passenger authorization belongs to booking authorization state, not `payment_status`.
12. **Expensive public/admin reads are rate-limited.** Rate-limit buckets are isolated per limiter/route class.
13. **Watch payload size as well as query count.** The API logs warnings at 256 KB and critical egress warnings at 1 MB.

## Current read architecture

### Admin booking list

Uses `admin-booking-read.repository.mjs` and returns a lightweight booking summary plus a minimal route summary. It does not batch-load travellers, contacts, payments, email logs or audit history merely to populate the list.

### Admin booking detail

The booking-detail route does not mount the dashboard. Simultaneous identical booking-detail reads are coalesced. The bounded reader loads explicit fields for the booking and the relations the editor needs.

### Public/complete booking read

`booking.repository.egress-hardening.mjs` overrides the high-volume legacy repository methods with explicit-column reads and canonical sources. It intentionally avoids `select('*')` and does not depend on failed legacy itinerary/email table probes.

### Abandoned checkout

`abandoned-booking.repository.mjs` stores a compact snapshot via a single UPSERT keyed by `session_key`, returns no row body, and applies a 30-day stale-session cleanup policy.

## Database migration required

Migration `033_egress_hardening_and_schema_contract.sql` is the database-side half of this contract. It adds idempotency columns/indexes, the abandoned-session uniqueness constraint, canonical status constraints, compatibility relations, targeted varchar widening and required lookup indexes. Code is schema-tolerant while rolling out, but the migration should be applied to production.

## How to review a future change

Before merging any booking/admin data change, ask:

- Does this page really need a complete booking?
- How many Supabase operations does one user action create?
- Is any relation fetched twice?
- Is any `select('*')` returning JSON/text columns that are not rendered?
- Could the component mount while hidden?
- Is there a polling/effect loop?
- Does a write return a full row unnecessarily?
- Does the code probe a table that may not exist?

The regression test `backend/tests/supabase_egress_hardening_contract.test.mjs` locks the most important source-level guarantees into the normal test and `verify:production-ready` commands.

## Post-deploy measurement

Do not reset `pg_stat_statements` without an explicit decision. Either record the current counters or intentionally reset them, then compare:

- total PostgREST calls,
- booking/flights/travellers/payments/contacts calls,
- REST 404 count,
- `select=*` count,
- `abandoned_bookings` calls,
- response-size warnings,
- booking-detail request bursts.

The target is a small, predictable number of reads per real user action, not merely faster SQL execution.
