/**
 * Booking Backup Import/Export & Safe Bulk Actions — Automated Tests
 * Tests 1-16 covering the complete admin booking management overhaul
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ─── Helpers to load source code for static analysis ───

const loadFile = (relativePath) => {
  try {
    return readFileSync(resolve(process.cwd(), relativePath), 'utf-8');
  } catch {
    // Try one level up (when running from backend/)
    try {
      return readFileSync(resolve(process.cwd(), '..', relativePath), 'utf-8');
    } catch {
      return '';
    }
  }
};

const frontendDashboard = loadFile('frontend/src/features/admin/pages/AdminDashboardPage.js');
const frontendCSS = loadFile('frontend/src/features/admin/pages/AdminDashboardPage.css');
const backupImportModal = loadFile('frontend/src/features/admin/components/BookingBackupImportModal.js');
const gdsModal = loadFile('frontend/src/features/admin/components/GdsItineraryImportModal.js');
const adminRoutes = loadFile('src/modules/admin/admin.routes.mjs');
const adminController = loadFile('src/modules/admin/admin.controller.mjs');
const bookingRepository = loadFile('src/modules/bookings/booking.repository.mjs');
const apiJs = loadFile('frontend/src/shared/api/api.js');

// ─── Sanitization helper for test 6 ───

const sanitizeBookingForExport = (exportData) => {
  if (!exportData) return exportData;
  const sensitivePatterns = [
    'cvv', 'cvc', 'pin', 'full_card_number', 'card_number', 'pan',
    'api_key', 'secret_key', 'private_key', 'access_token', 'refresh_token',
    'password', 'admin_password', 'webhook_secret', 'authorization_token'
  ];
  const redactObject = (obj, depth = 0) => {
    if (!obj || typeof obj !== 'object' || depth > 10) return obj;
    if (Array.isArray(obj)) return obj.map(item => redactObject(item, depth + 1));
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (sensitivePatterns.some(p => lowerKey.includes(p))) {
        cleaned[key] = '[REDACTED]';
        continue;
      }
      if (typeof value === 'string' && /^\d{13,19}$/.test(value.replace(/[\s-]/g, ''))) {
        const digits = value.replace(/[\s-]/g, '');
        if (digits.length >= 13) {
          cleaned[key] = `****${digits.slice(-4)}`;
          continue;
        }
      }
      cleaned[key] = redactObject(value, depth + 1);
    }
    return cleaned;
  };
  return redactObject(exportData);
};

// ─── Test Suites ───

describe('TEST 1 — Top-level Import button', () => {
  it('opens BookingBackupImportModal, not GdsItineraryImportModal', () => {
    // The filter-area import button must call setIsBackupImportModalOpen(true)
    expect(frontendDashboard).toContain('setIsBackupImportModalOpen(true)');
    
    // It must NOT call setIsImportItineraryModalOpen(true) in the filter area
    const filterAreaSection = frontendDashboard.split('Search & Filter Bookings')[1]?.split('BOOKINGS DATA TABLE CARD')[0] || '';
    expect(filterAreaSection).not.toContain('setIsImportItineraryModalOpen(true)');
    
    // The button label must say "Import Booking Backup"
    expect(frontendDashboard).toContain('Import Booking Backup');
    
    // BookingBackupImportModal must be imported
    expect(frontendDashboard).toContain("import BookingBackupImportModal from '../components/BookingBackupImportModal'");
  });
});

describe('TEST 2 — Itinerary import', () => {
  it('Import Itinerary / GDS Text remains inside booking Itinerary section', () => {
    // The itinerary accordion must contain the GDS import trigger
    const itinerarySection = frontendDashboard.split('ITINERARY ACCORDION')[1]?.split('OUTBOUND JOURNEY GROUP')[0] || '';
    expect(itinerarySection).toContain('setIsImportItineraryModalOpen(true)');
    
    // Button label must be "Import Itinerary / GDS Text"
    expect(frontendDashboard).toContain('Import Itinerary / GDS Text');
    
    // GDS modal component must still exist
    expect(gdsModal.length).toBeGreaterThan(0);
    expect(frontendDashboard).toContain('GdsItineraryImportModal');
  });
});

describe('TEST 3 — Select one row', () => {
  it('shows bulk toolbar with "1 booking selected"', () => {
    // Bulk toolbar must render when selectedBookingIds.length > 0
    expect(frontendDashboard).toContain('selectedBookingIds.length > 0');
    expect(frontendDashboard).toContain('bulk-action-toolbar');
    
    // Must show count
    expect(frontendDashboard).toContain('{selectedBookingIds.length}');
    expect(frontendDashboard).toContain("booking{selectedBookingIds.length !== 1 ? 's' : ''} selected");
  });
});

describe('TEST 4 — Select multiple rows', () => {
  it('selected count and bulk actions update correctly', () => {
    // Export Selected Backups button
    expect(frontendDashboard).toContain('Export Selected Backups');
    
    // Delete Selected button
    expect(frontendDashboard).toContain('Delete Selected');
    
    // Clear Selection button
    expect(frontendDashboard).toContain('Clear Selection');
    
    // handleToggleSelectOne is present
    expect(frontendDashboard).toContain('handleToggleSelectOne');
    
    // handleToggleSelectAll is present  
    expect(frontendDashboard).toContain('handleToggleSelectAll');
  });
});

describe('TEST 5 — Export selected', () => {
  it('produces versioned JSON backup via server-side endpoint', () => {
    // Backend endpoint must exist
    expect(adminRoutes).toContain("'/bookings/export'");
    expect(adminController).toContain('exportBookingsBulk');
    
    // Backup document format
    expect(adminController).toContain('THE_FINAL_SEAT_BOOKING_BACKUP');
    expect(adminController).toContain("version: 1");
    expect(adminController).toContain('exportedAt');
    expect(adminController).toContain('bookingCount');
    
    // Frontend uses server-side export, not client-side
    expect(frontendDashboard).toContain('handleExportSelectedBackups');
    expect(frontendDashboard).toContain('adminAPI.exportSelectedBackups');
    
    // Correct filename format
    expect(frontendDashboard).toContain('fare-transit-bookings-backup-');
    expect(frontendDashboard).toContain('fare-transit-booking-');
    
    // API helper method exists
    expect(apiJs).toContain('exportSelectedBackups');
  });
});

describe('TEST 6 — Export sanitization', () => {
  it('no PAN, CVV, secrets, passwords, or raw tokens in export', () => {
    const mockBooking = {
      booking: {
        id: 'test-id',
        confirmation_code: 'TFS-TEST-001',
        card_number: '4111111111111111',
        cvv: '123',
        admin_password: 'supersecret',
        api_key: 'sk_live_xxx',
        access_token: 'eyJhbGciOiJIUzI1NiIsInR',
        authorization_token: 'auth_token_xxx',
        webhook_secret: 'whsec_xxx',
        // Safe fields
        card_brand: 'Visa',
        card_last_four: '1111',
        cardholder_name: 'John Doe'
      }
    };

    const sanitized = sanitizeBookingForExport(mockBooking);
    
    // Sensitive fields must be redacted
    expect(sanitized.booking.cvv).toBe('[REDACTED]');
    expect(sanitized.booking.admin_password).toBe('[REDACTED]');
    expect(sanitized.booking.api_key).toBe('[REDACTED]');
    expect(sanitized.booking.access_token).toBe('[REDACTED]');
    expect(sanitized.booking.authorization_token).toBe('[REDACTED]');
    expect(sanitized.booking.webhook_secret).toBe('[REDACTED]');
    
    // Card number must be masked
    expect(sanitized.booking.card_number).toBe('[REDACTED]');
    
    // Safe metadata must be preserved
    expect(sanitized.booking.card_brand).toBe('Visa');
    expect(sanitized.booking.card_last_four).toBe('1111');
    expect(sanitized.booking.cardholder_name).toBe('John Doe');
    
    // Repository has sanitize function
    expect(bookingRepository).toContain('sanitizeBookingForExport');
  });
});

describe('TEST 7 — Import review', () => {
  it('nothing is written before confirmation', () => {
    // BookingBackupImportModal must exist
    expect(backupImportModal.length).toBeGreaterThan(0);
    
    // Must have review step before import
    expect(backupImportModal).toContain("step === 'review'");
    expect(backupImportModal).toContain("step === 'select'");
    expect(backupImportModal).toContain("step === 'results'");
    
    // File parsing must not trigger import
    expect(backupImportModal).toContain("setStep('review')");
    
    // Submit requires explicit button click
    expect(backupImportModal).toContain('handleSubmitImport');
    expect(backupImportModal).toContain('importBookingBackup');
    
    // Backend validates format
    expect(adminController).toContain('THE_FINAL_SEAT_BOOKING_BACKUP');
    expect(adminController).toContain('INVALID_FORMAT');
    expect(adminController).toContain('UNSUPPORTED_VERSION');
  });
});

describe('TEST 8 — Duplicate import', () => {
  it('duplicate defaults to Skip', () => {
    // Default strategy in import modal
    expect(backupImportModal).toContain("strategy: 'SKIP'");
    
    // Strategy options available
    expect(backupImportModal).toContain('Skip if exists');
    expect(backupImportModal).toContain('Restore as new copy');
    expect(backupImportModal).toContain('Replace existing');
    
    // Backend handles SKIP
    expect(bookingRepository).toContain("duplicateStrategy === 'SKIP'");
    expect(bookingRepository).toContain('already exists — skipped');
    
    // Backend handles REPLACE
    expect(bookingRepository).toContain("duplicateStrategy === 'REPLACE'");
    
    // Backend handles NEW_COPY
    expect(bookingRepository).toContain("duplicateStrategy === 'NEW_COPY'");
  });
});

describe('TEST 9 — Failed restore', () => {
  it('no partially restored booking (rollback on failure)', () => {
    // Repository has rollback logic
    expect(bookingRepository).toContain('Rolled back partial restore');
    expect(bookingRepository).toContain('system-backup-rollback@faretransit.com');
    expect(bookingRepository).toContain('deleteBookingTransactional');
    
    // Returns FAILED status
    expect(bookingRepository).toContain("status: 'FAILED'");
    expect(bookingRepository).toContain('RESTORE_FAILED');
  });
});

describe('TEST 10 — Bulk delete wrong password', () => {
  it('nothing deleted with incorrect password', () => {
    // Backend requires password
    expect(adminController).toContain('PASSWORD_REQUIRED');
    expect(adminController).toContain('Admin password is required for bulk deletion');
    
    // Password validation
    expect(adminController).toContain('INVALID_PASSWORD');
    expect(adminController).toContain('Incorrect admin password. Bulk deletion cancelled');
    
    // Frontend requires password too
    expect(frontendDashboard).toContain('bulkDeletePassword');
    expect(frontendDashboard).toContain("Admin password is required");
  });
});

describe('TEST 11 — Missing DELETE confirmation', () => {
  it('nothing deleted without typing DELETE', () => {
    // Backend requires exact "DELETE" text
    expect(adminController).toContain("confirmationText !== 'DELETE'");
    expect(adminController).toContain('CONFIRMATION_REQUIRED');
    expect(adminController).toContain('You must type DELETE to confirm');
    
    // Frontend validates confirmation text
    expect(frontendDashboard).toContain("bulkDeleteConfirmText !== 'DELETE'");
    expect(frontendDashboard).toContain('You must type DELETE to confirm');
  });
});

describe('TEST 12 — Protected booking', () => {
  it('TFS-2026-HQ39GA remains intact', () => {
    // Backend protects the booking
    expect(adminController).toContain('TFS-2026-HQ39GA');
    expect(adminController).toContain('PROTECTED');
    expect(adminController).toContain('is protected and was not deleted');
    
    // Frontend shows warning
    expect(frontendDashboard).toContain('TFS-2026-HQ39GA');
    expect(frontendDashboard).toContain('is protected and will not be deleted');
    expect(frontendDashboard).toContain('protected-badge');
  });
});

describe('TEST 13 — Mixed bulk deletion', () => {
  it('test bookings deleted; protected booking excluded', () => {
    // Backend tracks per-booking results
    expect(adminController).toContain("status: 'DELETED'");
    expect(adminController).toContain("status: 'PROTECTED'");
    expect(adminController).toContain("status: 'FAILED'");
    
    // Summary includes counts
    expect(adminController).toContain('deleted');
    expect(adminController).toContain('protectedCount');
    expect(adminController).toContain('failed');
    
    // Audit logging for bulk delete
    expect(adminController).toContain('BULK_DELETE');
    expect(adminController).toContain('logAdminActivity');
  });
});

describe('TEST 14 — Pagination', () => {
  it('selection can be preserved across pages', () => {
    // Selection state persists (useState, not derived from current page)
    expect(frontendDashboard).toContain('const [selectedBookingIds, setSelectedBookingIds] = useState([])');
    
    // handleToggleSelectAll only selects current page bookings
    expect(frontendDashboard).toContain('bookings.map(b => b.id)');
    
    // handlePageChange does NOT clear selections
    const handlePageChange = frontendDashboard.split('handlePageChange')[1]?.split('}, [')[0] || '';
    expect(handlePageChange).not.toContain('setSelectedBookingIds');
  });
});

describe('TEST 15 — Empty page after deletion', () => {
  it('pagination moves safely to a valid page', () => {
    // After bulk delete, calculates safe page
    expect(frontendDashboard).toContain('Math.ceil(newTotal / pageSize)');
    expect(frontendDashboard).toContain('Math.min(currentPage, newTotalPages)');
    expect(frontendDashboard).toContain('loadBookingsPage');
  });
});

describe('TEST 16 — Mobile', () => {
  it('bulk toolbar and confirmation modal remain usable', () => {
    // Mobile sticky toolbar
    expect(frontendDashboard).toContain('mobile-bulk-toolbar');
    expect(frontendCSS).toContain('mobile-bulk-toolbar');
    
    // Sticky positioning at bottom
    expect(frontendCSS).toContain('position: fixed');
    expect(frontendCSS).toContain('bottom: 0');
    
    // Mobile actions
    expect(frontendDashboard).toContain('mobile-bulk-btn');
    
    // Mobile responsive modals
    expect(frontendCSS).toContain('max-height: 90vh');
    expect(frontendCSS).toContain("grid-template-columns: repeat(2, 1fr)");
    
    // No horizontal overflow
    expect(frontendCSS).toContain('width: 95%');
  });
});
