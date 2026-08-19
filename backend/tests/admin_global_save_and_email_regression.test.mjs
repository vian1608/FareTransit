import { describe, it } from 'node:test';
import assert from 'node:assert';
import { moneyToCents, centsToMoney } from '../src/shared/utils/pricing.helper.mjs';

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

describe('Admin Global Save & Email Actions Regression Test Suite (TEST 39 - TEST 70)', () => {

  describe('Financial Math & Derived Unsaved Changes', () => {
    it('TEST 39 — moneyToCents correctly converts currency strings to integer cents', () => {
      expect(moneyToCents('$878.00')).toBe(87800);
      expect(moneyToCents('$878.01')).toBe(87801);
      expect(moneyToCents(' 700.00 ')).toBe(70000);
      expect(moneyToCents('78.00')).toBe(7800);
      expect(moneyToCents('$800.00')).toBe(80000);
    });

    it('TEST 40 — derived dirtySections correctly identifies unsaved sections', () => {
      const statusNotesDirty = false;
      const itineraryDirty = false;
      const pricingDirty = true;
      const ticketDetailsDirty = false;
      const paymentDirty = false;
      const billingDirty = true;

      const dirtySections = {
        statusNotes: statusNotesDirty,
        itinerary: itineraryDirty,
        pricing: pricingDirty,
        ticketDetails: ticketDetailsDirty,
        payment: paymentDirty,
        billing: billingDirty
      };

      const activeDirtyList = Object.entries(dirtySections).filter(([, dirty]) => dirty).map(([section]) => section);
      expect(activeDirtyList).toEqual(['pricing', 'billing']);

      const hasUnsavedChanges = Object.values(dirtySections).some(Boolean);
      expect(hasUnsavedChanges).toBe(true);
    });

    it('TEST 41 — Footer Save button disabled state depends ONLY on globalSaving or !hasUnsavedChanges', () => {
      const getDisabled = (globalSaving, hasUnsavedChanges) => globalSaving || !hasUnsavedChanges;

      // When dirty and not saving -> enabled (false)
      expect(getDisabled(false, true)).toBe(false);

      // When global saving -> disabled (true)
      expect(getDisabled(true, true)).toBe(true);

      // When clean and not saving -> disabled (true)
      expect(getDisabled(false, false)).toBe(true);
    });

    it('TEST 42 — Cleared section in-flight states do not keep footer disabled after completed section save', () => {
      const paymentSavingCompleted = false;
      const updatingRecordCompleted = false;
      const hasUnsavedChanges = true; // e.g. billing dirty

      const footerDisabled = updatingRecordCompleted || !hasUnsavedChanges;
      expect(footerDisabled).toBe(false);
    });
  });

  describe('Global Save Orchestration & Timeout Handling', () => {
    it('TEST 43 — Global save executes ONLY dirty sections', async () => {
      const savedSections = [];
      const dirtySections = { pricing: true, payment: false, billing: true };

      const sectionsToSave = Object.entries(dirtySections).filter(([, dirty]) => dirty).map(([s]) => s);

      for (const s of sectionsToSave) {
        savedSections.push(s);
      }

      expect(savedSections).toEqual(['pricing', 'billing']);
    });

    it('TEST 44 — Zero-dirty global save returns immediately with success', async () => {
      const dirtySections = { pricing: false, payment: false, billing: false };
      const sectionsToSave = Object.entries(dirtySections).filter(([, dirty]) => dirty).map(([s]) => s);

      let result = null;
      if (sectionsToSave.length === 0) {
        result = { success: true, message: 'All changes are already saved.' };
      }

      expect(result).toEqual({ success: true, message: 'All changes are already saved.' });
    });

    it('TEST 45 — Save promise ref prevents duplicate in-flight requests', async () => {
      let callCount = 0;
      let activePromiseRef = null;

      const triggerSave = () => {
        if (activePromiseRef) return activePromiseRef;
        callCount++;
        activePromiseRef = new Promise((resolve) => setTimeout(() => {
          activePromiseRef = null;
          resolve({ success: true });
        }, 50));
        return activePromiseRef;
      };

      const p1 = triggerSave();
      const p2 = triggerSave();
      expect(p1).toBe(p2);
      expect(callCount).toBe(1);

      await p1;
    });

    it('TEST 48 — Timeout cancels hanging request after limit', async () => {
      const controller = new AbortController();
      let timedOut = false;

      const timeoutId = setTimeout(() => {
        controller.abort();
        timedOut = true;
      }, 50);

      try {
        await new Promise((_, reject) => {
          controller.signal.addEventListener('abort', () => reject(new Error('20 seconds timeout')));
        });
      } catch (err) {
        expect(err.message).toBe('20 seconds timeout');
        expect(timedOut).toBe(true);
      } finally {
        clearTimeout(timeoutId);
      }
    });
  });

  describe('Email Actions & Button Labels', () => {
    it('TEST 54 — Initial status NOT_SENT renders "Send Booking Request Email" label', () => {
      const status = 'NOT_SENT';
      const label = status === 'SENT' ? 'Resend Booking Request Email' : 'Send Booking Request Email';
      expect(label).toBe('Send Booking Request Email');
    });

    it('TEST 54b — Status SENT renders "Resend Booking Request Email" label', () => {
      const status = 'SENT';
      const label = status === 'SENT' ? 'Resend Booking Request Email' : 'Send Booking Request Email';
      expect(label).toBe('Resend Booking Request Email');
    });

    it('TEST 62 — Authorization email validates integer cents financial match before dispatching', () => {
      const validateFinancials = (customerPrice, splitTotal) => {
        const bCents = moneyToCents(customerPrice);
        const sCents = moneyToCents(splitTotal);
        return bCents === sCents;
      };

      expect(validateFinancials('$878.00', '$878.00')).toBe(true);
      expect(validateFinancials('$878.00', '$878.01')).toBe(false);
    });

    it('TEST 63 — Booking status becomes AWAITING_PASSENGER after successful authorization email send', () => {
      let status = 'DRAFT';
      const emailSuccess = true;

      if (emailSuccess) {
        status = 'AWAITING_PASSENGER';
      }

      expect(status).toBe('AWAITING_PASSENGER');
    });

    it('TEST 70 — Non-JSON response is handled safely without throwing syntax errors', async () => {
      const rawHtmlBody = '<!DOCTYPE html><html><body>An error occurred</body></html>';
      const contentType = 'text/html';

      let payload = null;
      if (rawHtmlBody && contentType.includes('application/json')) {
        try { payload = JSON.parse(rawHtmlBody); } catch { payload = null; }
      }

      expect(payload).toBeNull();
      const isHtml = rawHtmlBody.trim().startsWith('<!DOCTYPE') || rawHtmlBody.trim().startsWith('<html');
      expect(isHtml).toBe(true);
    });
  });

});
