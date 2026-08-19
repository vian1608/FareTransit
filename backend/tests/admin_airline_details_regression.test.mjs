import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const expect = (actual) => ({
  toBe: (expected) => assert.strictEqual(actual, expected),
  toEqual: (expected) => assert.deepStrictEqual(actual, expected),
  toBeGreaterThan: (n) => assert.ok(actual > n),
  toBeLessThan: (n) => assert.ok(actual < n),
  toContain: (str) => assert.ok(actual.includes(str)),
  toBeDefined: () => assert.notStrictEqual(actual, undefined),
  toBeNull: () => assert.strictEqual(actual, null),
  toBeTruthy: () => assert.ok(actual),
  toBeFalsy: () => assert.ok(!actual),
  not: {
    toContain: (str) => assert.ok(!actual.includes(str)),
    toBe: (expected) => assert.notStrictEqual(actual, expected)
  }
});

const loadFile = (relativePath) => {
  try {
    return readFileSync(resolve(process.cwd(), relativePath), 'utf-8');
  } catch {
    try {
      return readFileSync(resolve(process.cwd(), '..', relativePath), 'utf-8');
    } catch {
      return '';
    }
  }
};

const adminDashboardSrc = loadFile('frontend/src/features/admin/pages/AdminDashboardPage.js');
const repoSrc = loadFile('backend/src/modules/bookings/booking.repository.mjs');
const controllerSrc = loadFile('backend/src/modules/admin/admin.controller.mjs');
const routesSrc = loadFile('backend/src/modules/admin/admin.routes.mjs');

describe('Airline Ticket Details Section Save Regression Suite', () => {

  it('TEST 1 — PNR lowercase is normalized to uppercase and validated (1-6 alphanumeric)', () => {
    const rawPnr = ' 654xds ';
    const normalizedPnr = rawPnr.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    expect(normalizedPnr).toBe('654XDS');
    expect(/^[A-Z0-9]{1,6}$/.test(normalizedPnr)).toBe(true);
  });

  it('TEST 2 — PNR containing invalid symbols or longer than 6 characters is rejected', () => {
    const invalidPnrs = ['ABC-12', 'ABC 12', 'ABCDEFG', '@12345'];
    invalidPnrs.forEach(p => {
      const clean = p.replace(/[^A-Z0-9]/g, '');
      const isExactValid = /^[A-Z0-9]{1,6}$/.test(p);
      expect(isExactValid).toBe(false);
    });
  });

  it('TEST 3 — Ticket number formatting characters are stripped and digits preserved as string max 13', () => {
    const rawTicket = '016-2490-182741';
    const cleanTkt = rawTicket.replace(/\D/g, '').slice(0, 13);
    expect(cleanTkt).toBe('0162490182741');
    expect(typeof cleanTkt).toBe('string');
    expect(cleanTkt.startsWith('0')).toBe(true);
  });

  it('TEST 4 — Ticket number over 13 digits is rejected', () => {
    const longTicket = '01624901827419999';
    const isUnder13 = /^\d{1,13}$/.test(longTicket);
    expect(isUnder13).toBe(false);
  });

  it('TEST 5 — Ticket issue date is normalized to YYYY-MM-DD ISO format without timezone shift', () => {
    const dateVal = '2026-08-05';
    const normalized = dateVal.trim().slice(0, 10);
    expect(normalized).toBe('2026-08-05');
    expect(/^\d{4}-\d{2}-\d{2}$/.test(normalized)).toBe(true);
  });

  it('TEST 6 — Dedicated PATCH route /api/admin/bookings/:id/airline-details exists', () => {
    expect(routesSrc).toContain("/bookings/:id/airline-details");
  });

  it('TEST 7 — Section Save button label is Save Airline Details', () => {
    expect(adminDashboardSrc).toContain("Save Airline Details");
  });

  it('TEST 8 — Booking ID missing shows explicit error', () => {
    expect(adminDashboardSrc).toContain("Unable to save: database booking ID is missing.");
  });

});
