import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(process.cwd(), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const migration = read('backend/migrations/123_car_rental_company_logos.sql');
const compose = read('backend/src/modules/reservations/car-authorization-compose.service.mjs');
const email = read('backend/src/modules/reservations/car-authorization-email.service.mjs');
const workspace = read('frontend/src/features/backoffice/CarReservationWorkspace.js');
const newDraft = read('frontend/src/features/backoffice/NewCarReservationDraftPage.js');
const enhanced = read('frontend/src/features/backoffice/CarReservationWorkspaceEnhanced.js');
const workspaceCss = read('frontend/src/features/backoffice/CarReservationWorkspace.css');

test('car rental company logos are canonical and automatic', async t => {
  await t.test('all supported rental companies receive one database-managed logo', () => {
    for (const code of ['ALAMO','AVIS','BUDGET','DOLLAR','ENTERPRISE','HERTZ','NATIONAL','SIXT','THRIFTY']) {
      assert.ok(migration.includes(`WHEN '${code}'`), `Missing canonical logo mapping for ${code}`);
    }
    assert.match(migration, /UPDATE public\.car_rental_companies/);
    assert.match(migration, /SET logo_url = CASE code/);
  });

  await t.test('company selection pulls logo from car_rental_companies instead of asking the admin', () => {
    assert.match(workspace, /rentalCompanyLogoUrl:\s*company\?\.logo_url/);
    assert.match(newDraft, /rentalCompanyLogoUrl:\s*company\?\.logo_url/);
    assert.match(workspaceCss, /Rental-company branding is canonical data/);
    assert.match(workspaceCss, /\.carws-tabs \+ \.carws-card > \.carws-form-grid > \.carws-field:nth-child\(3\)/);
    assert.match(workspaceCss, /\.carws-new-draft > \.carws-card:first-of-type > \.carws-form-grid > \.carws-field:nth-child\(3\)/);
  });

  await t.test('authorization preview resolves legacy bookings through the canonical company table', () => {
    assert.match(compose, /resolveRentalCompanyLogo/);
    assert.match(compose, /from\('car_rental_companies'\)/);
    assert.match(compose, /rentalCompanyLogoUrl/);
    assert.match(enhanced, /RentalCompanyBrand/);
    assert.match(enhanced, /preview\.rentalCompanyLogoUrl/);
  });

  await t.test('the actual authorization email renders only a safe HTTPS rental logo', () => {
    assert.match(email, /safeHttpsImageUrl/);
    assert.match(email, /url\.protocol === 'https:'/);
    assert.match(email, /rentalCompanyLogoUrl/);
    assert.match(email, /Rental provided by/);
    assert.match(email, /<img src=/);
  });

  await t.test('legacy bad-date rows are not touched merely to backfill branding', () => {
    assert.match(migration, /car\.dropoff_at > car\.pickup_at/);
    assert.match(compose, /car\.rental_company_id/);
  });
});
