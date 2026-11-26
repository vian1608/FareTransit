# Independent ticket sender — owner pilot

The existing five-item sidebar is preserved; open **Bookings > Independent E-Ticket Sender** after enabling the frontend flag. No existing booking mutations or payment operations are used. Only owners with the legacy admin role may use this pilot. Staff RBAC, verified delivery webhooks, exact per-attempt audit history, multi-city and non-USD documents are future work. Flight itineraries and issued ticket receipts are distinct; GDS lines do not establish ticket issuance.

## Staging first

1. Back up staging data and apply backend/migrations/130_independent_tickets.sql with the repository's existing migration procedure. Do not apply it to production until approved. Verify RLS and service-role grants.
2. Build frontend with REACT_APP_INDEPENDENT_TICKETS_ENABLED=true and start backend with INDEPENDENT_TICKETS_ENABLED=true. Keep INDEPENDENT_TICKET_EMAIL_ENABLED=false for editor and draft review. Rebuild frontend after changing its flag.
3. Test the existing CRM regression suite, and run from backend: node --test tests/independent_ticket_model.test.mjs. Confirm that no original booking or payment records change.
4. To enable a controlled test, configure a staging Resend sender and recipient, set INDEPENDENT_TICKET_EMAIL_ENABLED=true and INDEPENDENT_TICKET_WORKER_ENABLED=true on a separate worker process with the same staging database. Do not reuse live recipients. Run node src/workers/independent-ticket.worker.mjs (or --once for a single job). The worker needs the frontend/public assets directory packaged alongside backend, or it will use textual fallback. No serverless request handler starts an in-process worker.
5. Start with one worker. Confirm queue claims, archived PDFs, sent status, retry eligibility, interrupted-worker recovery, and provider acceptance under load before adding workers. PDF attachment max 5 MB. History filter/search currently covers the loaded page.
6. Disable the email flag and worker immediately to pause dispatch. Disable the frontend flag and backend feature flag to hide the module. Preserve tables and storage for recovery; do not delete records during rollback.

## Known pilot limitations

- Linked booking facts must match the existing booking at send time, and existing integrity and authorization checks apply. To correct facts, update the genuine booking and fetch it again. Authorization/payment allocations are not evidence of capture, so the pilot refuses to label linked merchant splits as charged. External ticket data requires explicit agent attestation.
- No actual GDS provider connection is added: parsing reuses the existing GDS line helper, with stricter checks and arrival date review.
- The worker conservatively marks ambiguous outcomes as uncertain instead of resending. Provider acceptance is Sent, not Delivered. An operator must reconcile uncertain deliveries through the provider; no blind resend.
- Same ticket and document content is deduplicated; an intentional same-version resend UI is not yet enabled. No webhook, staff permission migration, persistent provider-wide rate limiter, or automatic background supervisor is included in this pilot.
- PDF is archived before email and can be recovered from delivery history. Draft-only PDF export, full historical draft versions, global server-side search, and per-attempt append-only log are follow-up work. The PDF and email share canonical fields but use different layouts.
- Provider quota, asset rights and production hosting capacity must be verified before enabling. Existing CRM still shares infrastructure, so load testing is mandatory.

## Read-only production review mode

To make the option available before applying the migration, set `REACT_APP_INDEPENDENT_TICKETS_ENABLED=true` and `INDEPENDENT_TICKETS_ENABLED=true`, leave `REACT_APP_INDEPENDENT_TICKET_PERSISTENCE_ENABLED`, `INDEPENDENT_TICKET_PERSISTENCE_ENABLED`, `REACT_APP_INDEPENDENT_TICKET_EMAIL_ENABLED`, `INDEPENDENT_TICKET_EMAIL_ENABLED`, and `INDEPENDENT_TICKET_WORKER_ENABLED` disabled. This allows booking lookups and draft preview only; no ticket records are stored or email sent. After staging validation and migration, explicitly enable both persistence flags; only enable both email flags after worker and delivery validation. The UI and API independently enforce review mode.

## Owner one-shot delivery on Vercel
Migration 130 was never applied and contains an invalid dollar-quoted trigger delimiter. **Apply 131_independent_ticket_delivery_activation.sql instead of 130**. This is a complete additive replacement, not a rewrite of a promoted migration. Verify private storage and service-role grants before activation.

The first Vercel rollout uses an authenticated owner-triggered, bounded one-shot request after enqueue. It does not run an infinite polling loop within Vercel or hold a database transaction open during PDF creation or delivery. The claim RPC enforces one active ticket globally. If the request is interrupted, the saved delivery remains recoverable; processing/queued history has a Process / check delivery action. Ambiguous or expired leases are marked uncertain, never blindly resent. Automatic due-job processing when no owner is present requires a separately supervised worker or a future secured scheduler. Rate-limited retries remain queued and can be processed after their retry time. Do not enable email flags until the new RPC, archive, PDF test and provider configuration are verified. No customer email should be sent during release checks.


## Multiple recipients and historical forwarding

Apply additive migration 132 before releasing the multiple-recipient UI. The primary email remains part of the verified booking/customer snapshot. Additional recipients are authorized separately (up to five addresses total for initial send, up to five new addresses per forwarding action). Each gets its own email and delivery record. Batch enqueue is atomic and deduplicates recipients against the original document group, including legacy primary deliveries. Forward only from a sent delivery with an archived PDF; the source PDF is reused exactly and never regenerated. The history shows recipient, status, original version and source delivery. No payment, booking, or original contact changes. If the browser closes during the sequence, pending recipient deliveries can be processed from history. No new background scheduler is added.

## Optional passenger seat assignments

Seat entry is off by default. Enable in the editor to enter actual supplier-assigned seats in a passenger-by-flight matrix. Only nonempty valid assigned seats appear beneath each passenger in HTML, plain text and PDF. No placeholders or seat heading when empty/disabled. Seats are stored in ticket JSON snapshots, keyed by stable flight identity; changing a flight identity or passenger name clears affected assignments for review. The owner must confirm assignments against supplier records; there is no verified seat-allocation source in the existing booking adapter. No seat purchasing or airline API is called. Existing snapshots without seats keep their previous structure and deduplication key. The original booking is read-only.
