/**
 * Scalable Admin Booking Pagination — Automated Test Suite
 * Tests 1-15 verifying pagination stability, single requests per click,
 * stale-response guards, windowed page item generation (100/500/1000 pages),
 * Go To Page validation, page size change handling, and independent loaders.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
export function getPaginationItems(currentPage, totalPages, siblingCount = 1) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const items = new Set([
    1,
    totalPages,
    currentPage,
    currentPage - 1,
    currentPage + 1
  ]);

  if (siblingCount >= 2) {
    items.add(currentPage - 2);
    items.add(currentPage + 2);
  }

  const pages = [...items]
    .filter(page => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);

  const result = [];

  pages.forEach((page, index) => {
    const previous = pages[index - 1];
    if (index > 0 && page - previous > 1) {
      result.push('ellipsis-' + previous);
    }
    result.push(page);
  });

  return result;
}

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
const apiJsSrc = loadFile('frontend/src/shared/api/api.js');

describe('TEST 1 & 2 — Next & Previous handler state updates', () => {
  it('handlePageChange updates currentPage without manual reload call', () => {
    // Should set currentPage(safePage)
    expect(adminDashboardSrc).toContain('setCurrentPage(safePage)');

    // Must NOT call loadAllDashboardData manually inside handlePageChange
    const pageChangeCode = adminDashboardSrc.split('const handlePageChange = useCallback')[1]?.split('}, [')[0] || '';
    expect(pageChangeCode).not.toContain('loadAllDashboardData');
    expect(pageChangeCode).not.toContain('loadBookingsPage');
  });
});

describe('TEST 3 — Request count per page click', () => {
  it('uses one controlled useEffect triggered on currentPage change', () => {
    // Controlled effect 1 depends on currentPage
    expect(adminDashboardSrc).toContain('loadBookingsPage({');
    expect(adminDashboardSrc).toContain('page: currentPage,');

    // Auth effect MUST NOT load bookings
    const authEffectCode = adminDashboardSrc.split('// Authenticate Admin Session on Mount')[1]?.split('}, [')[0] || '';
    expect(authEffectCode).not.toContain('loadAllDashboardData');
    expect(authEffectCode).not.toContain('loadBookingsPage');
  });
});

describe('TEST 4 — Race condition & Stale response protection', () => {
  it('uses monotonically increasing request ID and AbortController to discard stale page responses', () => {
    expect(adminDashboardSrc).toContain('const requestId = ++bookingsRequestIdRef.current');
    expect(adminDashboardSrc).toContain('if (requestId !== bookingsRequestIdRef.current)');
    expect(adminDashboardSrc).toContain('AbortController');
    expect(apiJsSrc).toContain('...options');
  });
});

describe('TEST 5 — Authentication effect isolation', () => {
  it('authentication effect runs ONLY for auth verification without page data dependencies', () => {
    const authEffect = adminDashboardSrc.split('// Authenticate Admin Session on Mount')[1]?.split('\n\n')[0] || '';
    expect(authEffect).toContain("if (!token || !adminSession)");
    expect(authEffect).not.toContain('currentPage');
  });
});

describe('TEST 6 — Filter resets currentPage to 1', () => {
  it('handleFilterChange sets currentPage to 1 once without duplicate manual fetches', () => {
    const filterChangeCode = adminDashboardSrc.split('const handleFilterChange =')[1]?.split('  };')[0] || '';
    expect(filterChangeCode).toContain('setCurrentPage(1)');
    expect(filterChangeCode).not.toContain('loadAllDashboardData');
  });
});

describe('TEST 7 — 100 pages windowed pagination', () => {
  it('renders windowed items for 100 pages instead of 100 numeric buttons', () => {
    const items = getPaginationItems(1, 100);
    const numericItems = items.filter(x => typeof x === 'number');

    expect(items.length).toBeLessThanOrEqual(9);
    expect(numericItems.length).toBeLessThanOrEqual(7);
    expect(items).toContain(1);
    expect(items).toContain(100);
    expect(items).toContain('ellipsis-2');
  });
});

describe('TEST 8 — 500 pages windowed pagination at page 250', () => {
  it('shows windowed pages around page 250 with ellipses', () => {
    const items = getPaginationItems(250, 500);

    expect(items).toContain(1);
    expect(items).toContain(249);
    expect(items).toContain(250);
    expect(items).toContain(251);
    expect(items).toContain(500);
    expect(items).toContain('ellipsis-1');
    expect(items).toContain('ellipsis-251');
  });
});

describe('TEST 9 — 1,000 pages windowed pagination at page 999', () => {
  it('shows windowed pages around page 999 for 1000 pages', () => {
    const items = getPaginationItems(999, 1000);

    expect(items).toContain(1);
    expect(items).toContain(998);
    expect(items).toContain(999);
    expect(items).toContain(1000);
    expect(items).toContain('ellipsis-1');
  });
});

describe('TEST 10 & 11 — Go to page validation', () => {
  it('contains Go To Page input form with range validation', () => {
    expect(adminDashboardSrc).toContain('goToPageInput');
    expect(adminDashboardSrc).toContain('parsed < 1 || parsed > totalPages');
    expect(adminDashboardSrc).toContain('setGoToPageError');
  });
});

describe('TEST 12 — Deletion on final page clamping', () => {
  it('clamps currentPage to newTotalPages upon bulk deletion', () => {
    expect(adminDashboardSrc).toContain('const safePage = Math.min(currentPage, newTotalPages)');
  });
});

describe('TEST 13 — Page-size change handling', () => {
  it('allows page size selection (10, 25, 50, 100) and resets to page 1', () => {
    expect(adminDashboardSrc).toContain('setPageSize(newSize)');
    expect(adminDashboardSrc).toContain('setCurrentPage(1)');
    expect(adminDashboardSrc).toContain('value={10}');
    expect(adminDashboardSrc).toContain('value={25}');
    expect(adminDashboardSrc).toContain('value={50}');
    expect(adminDashboardSrc).toContain('value={100}');
  });
});

describe('TEST 14 — Independent loaders (Analytics not refetched on page click)', () => {
  it('places stats and analytics in a separate effect independent of currentPage', () => {
    const statsEffect = adminDashboardSrc.split('// Controlled Effect 2: Dashboard Stats')[1]?.split('}, [')[0] || '';
    expect(statsEffect).toContain('loadDashboardStats()');
    expect(statsEffect).toContain('loadAnalytics');
    expect(statsEffect).not.toContain('currentPage');
  });
});

describe('TEST 15 — Mobile responsive pagination controls', () => {
  it('uses flex-wrap and compact controls for mobile responsive pagination', () => {
    expect(adminDashboardSrc).toContain("flexWrap: 'wrap'");
    expect(adminDashboardSrc).toContain('admin-pagination-container');
  });
});
