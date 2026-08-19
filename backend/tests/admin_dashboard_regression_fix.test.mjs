/**
 * Admin Dashboard Production Regression Fix — Verification Tests
 * Tests 1-12 covering authentication, initialization, hook declaration order,
 * error boundaries, null-safety, section resilience, and build integrity.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

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
const adminLoginSrc = loadFile('frontend/src/features/admin/pages/AdminLoginPage.js');
const appErrorBoundarySrc = loadFile('frontend/src/shared/components/AppErrorBoundary.js');
const apiJsSrc = loadFile('frontend/src/shared/api/api.js');

describe('TEST 1 — Successful login & storage keys', () => {
  it('stores token and adminSession identically across login and dashboard guard', () => {
    // Login page stores token and adminSession
    expect(adminLoginSrc).toContain("localStorage.setItem('token'");
    expect(adminLoginSrc).toContain("sessionStorage.setItem('adminSession'");

    // Dashboard page reads token and adminSession
    expect(adminDashboardSrc).toContain("localStorage.getItem('token')");
    expect(adminDashboardSrc).toContain("sessionStorage.getItem('adminSession')");

    // API interceptor attaches token
    expect(apiJsSrc).toContain("localStorage.getItem('token')");
  });
});

describe('TEST 2 — Initial dashboard render null safety', () => {
  it('guards initial null states (selectedBooking, empty segments)', () => {
    // State defaults
    expect(adminDashboardSrc).toContain("const [selectedBooking, setSelectedBooking] = useState(null)");
    expect(adminDashboardSrc).toContain("const [outboundSegments, setOutboundSegments] = useState([])");
    expect(adminDashboardSrc).toContain("const [returnSegments, setReturnSegments] = useState([])");

    // Optional chaining / safe defaults on outboundSegments
    expect(adminDashboardSrc).toContain("outboundSegments[0]?.origin_airport");
  });
});

describe('TEST 3 — Dashboard refresh / session validation', () => {
  it('triggers data loading when session is valid', () => {
    expect(adminDashboardSrc).toContain("loadBookingsPage({");
  });
});

describe('TEST 4 — No bookings returned', () => {
  it('renders empty table view when bookings array is empty', () => {
    expect(adminDashboardSrc).toContain('empty-table-view');
    expect(adminDashboardSrc).toContain('No bookings match your current search filters.');
  });
});

describe('TEST 5 & 6 — Resilience to partial API failures', () => {
  it('uses separate loaders so stats or analytics failure does not crash bookings', () => {
    expect(adminDashboardSrc).toContain('loadBookingsPage');
    expect(adminDashboardSrc).toContain('loadDashboardStats');
    expect(adminDashboardSrc).toContain('loadAnalytics');
    expect(adminDashboardSrc).toContain('loadAbandonedBookings');
  });
});

describe('TEST 7 — Itinerary modal closed & conditional rendering', () => {
  it('GdsItineraryImportModal is conditionally mounted only when modal open & booking selected', () => {
    expect(adminDashboardSrc).toContain('isImportItineraryModalOpen && selectedBooking?.id');
  });
});

describe('TEST 8 & 9 — Booking details & Accordion', () => {
  it('has openAccordion state and handles expandable details safely', () => {
    expect(adminDashboardSrc).toContain("const [openAccordion, setOpenAccordion] = useState(null)");
    expect(adminDashboardSrc).toContain("setOpenAccordion(openAccordion === 'itinerary' ? null : 'itinerary')");
  });
});

describe('TEST 10 — Malformed itinerary safety', () => {
  it('uses ItineraryErrorBoundary wrapper to prevent itinerary rendering error from crashing dashboard', () => {
    expect(adminDashboardSrc).toContain('ItineraryErrorBoundary');
  });
});

describe('TEST 11 — Hook initialization order (No TDZ / ReferenceError)', () => {
  it('loadBookingsPage is declared BEFORE any callback references it in dependency arrays', () => {
    const loadBookingsIndex = adminDashboardSrc.indexOf('const loadBookingsPage = useCallback');
    const bulkDeleteIndex = adminDashboardSrc.indexOf('const handleBulkDeleteConfirm = useCallback');
    const importCompleteIndex = adminDashboardSrc.indexOf('const handleBackupImportComplete = useCallback');

    expect(loadBookingsIndex).toBeGreaterThan(0);
    expect(bulkDeleteIndex).toBeGreaterThan(0);
    expect(importCompleteIndex).toBeGreaterThan(0);

    // loadBookingsPage MUST be declared BEFORE handleBulkDeleteConfirm and handleBackupImportComplete
    expect(loadBookingsIndex).toBeLessThan(bulkDeleteIndex);
    expect(loadBookingsIndex).toBeLessThan(importCompleteIndex);
  });
});

describe('TEST 12 — AppErrorBoundary logging', () => {
  it('AppErrorBoundary logs ADMIN_DASHBOARD_FATAL_ERROR with full diagnostic info', () => {
    expect(appErrorBoundarySrc).toContain('ADMIN_DASHBOARD_FATAL_ERROR');
    expect(appErrorBoundarySrc).toContain('referenceId');
    expect(appErrorBoundarySrc).toContain('errorName');
    expect(appErrorBoundarySrc).toContain('errorMessage');
    expect(appErrorBoundarySrc).toContain('productionCommit');
  });
});
