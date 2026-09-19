from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path, old, new):
    p = ROOT / path
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"Expected patch target not found in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


service_path = 'backend/src/modules/authorizations/passenger-authorization.service.mjs'

# 1) Never issue a token from a snapshot whose revision is already stale compared
# with the authoritative booking row.
replace_once(
    service_path,
    "    const bookingId = snapshot.bookingId;\n    const revision = Number(snapshot.bookingRevision || 1);\n    const snapshotHash = authorizationSnapshotHash(snapshot);\n",
    "    const bookingId = snapshot.bookingId;\n    const revision = Number(snapshot.bookingRevision || 1);\n    const liveStateAtIssue = await getAuthoritativeBookingAuthorizationState(bookingId);\n    const liveRevisionAtIssue = Number(liveStateAtIssue?.booking_revision || 1);\n    if (revision !== liveRevisionAtIssue) {\n      throw new Error(`AUTHORIZATION_SNAPSHOT_REVISION_STALE: Snapshot revision ${revision} does not match live revision ${liveRevisionAtIssue}.`);\n    }\n    const snapshotHash = authorizationSnapshotHash(snapshot);\n"
)

# 2) Public GET validity is tied not only to the revision, but also to the current
# active token when the booking has one. This prevents an older accepted/pending
# link from remaining publicly reusable after a new token is issued for the same
# revision.
replace_once(
    service_path,
    "    const liveAuthorizationStatus = String(liveState?.authorization_status || '').toUpperCase();\n    if (authRevision !== bookingRevision || liveAuthorizationStatus === 'REAUTHORIZATION_REQUIRED') {\n",
    "    const liveAuthorizationStatus = String(liveState?.authorization_status || '').toUpperCase();\n    const liveToken = String(liveState?.authorization_token || '').trim();\n    const tokenMismatch = Boolean(liveToken && liveToken !== token);\n    if (authRevision !== bookingRevision || liveAuthorizationStatus === 'REAUTHORIZATION_REQUIRED' || tokenMismatch) {\n"
)

# 3) Apply the same token-lineage rule on POST/accept. Do not permit an old token
# to authorize merely because the booking revision happens to be unchanged.
replace_once(
    service_path,
    "    const liveAuthorizationStatus = String(liveState?.authorization_status || '').toUpperCase();\n\n    // Revision/lifecycle invalidation wins over idempotency: an accepted historical\n    // token from an older revision is evidence, not a reusable public authorization.\n    if (authRevision !== bookingRevision || liveAuthorizationStatus === 'REAUTHORIZATION_REQUIRED') {\n",
    "    const liveAuthorizationStatus = String(liveState?.authorization_status || '').toUpperCase();\n    const liveToken = String(liveState?.authorization_token || '').trim();\n    const tokenMismatch = Boolean(liveToken && liveToken !== token);\n\n    // Revision/lifecycle/token-lineage invalidation wins over idempotency: an\n    // accepted historical token is evidence, not a reusable public authorization.\n    if (authRevision !== bookingRevision || liveAuthorizationStatus === 'REAUTHORIZATION_REQUIRED' || tokenMismatch) {\n"
)

# 4) Strengthen regression contract and update the existing wording assertion.
test_path = ROOT / 'backend/tests/authorization_runtime_integrity.test.mjs'
text = test_path.read_text()
text = text.replace(
    "assert.match(service, /Revision\\/lifecycle invalidation wins over idempotency/);",
    "assert.match(service, /Revision\\/lifecycle\\/token-lineage invalidation wins over idempotency/);"
)
insert_before = "console.log('Authorization runtime integrity contract: PASS');"
if insert_before not in text:
    raise SystemExit('Authorization runtime test footer not found')
extra = """assert.match(service, /liveStateAtIssue/);
assert.match(service, /AUTHORIZATION_SNAPSHOT_REVISION_STALE/);
assert.match(service, /const tokenMismatch = Boolean\\(liveToken && liveToken !== token\\)/);
assert.match(service, /tokenMismatch/);
"""
if 'AUTHORIZATION_SNAPSHOT_REVISION_STALE' not in text:
    text = text.replace(insert_before, extra + insert_before, 1)
test_path.write_text(text)

print('Authorization token-lineage hardening patch applied successfully.')
