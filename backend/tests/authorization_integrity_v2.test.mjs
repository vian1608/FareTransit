import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const auth = fs.readFileSync('backend/src/modules/authorizations/passenger-authorization.service.mjs', 'utf8');
const snap = fs.readFileSync('backend/src/modules/authorizations/authorization-snapshot.service.mjs', 'utf8');
const repo = fs.readFileSync('backend/src/modules/bookings/booking.repository.mjs', 'utf8');
const email = fs.readFileSync('backend/src/integrations/resend/resend.service.mjs', 'utf8');
const page = fs.readFileSync('frontend/src/features/authorizations/pages/PassengerAuthorizationPage.js', 'utf8');
const airline = fs.readFileSync('backend/src/shared/utils/airline-lookup.mjs', 'utf8');

test('authorization integrity v2 invariants', () => {
  assert.match(snap, /AUTHORIZATION_SNAPSHOT_V2/);
  assert.match(snap, /bookingRevision/);
  assert.match(auth, /request_snapshot_hash/);
  assert.match(auth, /AUTHORIZATION_SUPERSEDED/);
  assert.doesNotMatch(auth, /Fallback 2: Stateless Token Resolution/);
  assert.match(repo, /bumpAuthorizationRevision/);
  assert.match(repo, /status: 'superseded'/);
  assert.doesNotMatch(repo, /Could not create reauthorization request/);
  assert.match(email, /authResult\.snapshot/);
  assert.match(email, /booking revision/);
  assert.doesNotMatch(email, /THE FINAL SEAT/);
  assert.match(page, /Authorization Updated/);
  assert.match(page, /snapshotJourneys/);
  assert.match(airline, /codePlaceholder/);
});
