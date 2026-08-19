import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('========================================================================');
console.log('  ADMIN DASHBOARD MODULE INITIALIZATION & TDZ CHECK TEST SUITE');
console.log('========================================================================\n');

// 1. Static Analysis: Check AdminDashboardPage.js for Temporal Dead Zone patterns
console.log('--- TEST 1: Static AST / Text Inspection for TDZ Errors in AdminDashboardPage.js ---');
const adminDashboardPath = path.resolve(__dirname, '../../frontend/src/features/admin/pages/AdminDashboardPage.js');
assert.ok(fs.existsSync(adminDashboardPath), 'AdminDashboardPage.js file must exist');

const content = fs.readFileSync(adminDashboardPath, 'utf8');

// Ensure handleSelectBooking is declared before handleItineraryImported
const handleSelectBookingIdx = content.indexOf('const handleSelectBooking =');
const handleItineraryImportedIdx = content.indexOf('const handleItineraryImported =');

assert.ok(handleSelectBookingIdx !== -1, 'handleSelectBooking declaration must exist');
assert.ok(handleItineraryImportedIdx !== -1, 'handleItineraryImported declaration must exist');

assert.ok(
  handleSelectBookingIdx < handleItineraryImportedIdx,
  `handleSelectBooking (idx: ${handleSelectBookingIdx}) must be declared BEFORE handleItineraryImported (idx: ${handleItineraryImportedIdx}) to prevent TDZ errors`
);

console.log('✓ TEST 1 PASSED: handleSelectBooking is declared before handleItineraryImported.\n');

// 2. Check for circular import cycles in GdsItineraryImportModal and gdsParser
console.log('--- TEST 2: GDS Importer & Parser Module Import Evaluation ---');

const parserPath = path.resolve(__dirname, '../../frontend/src/features/admin/utils/gdsParser.js');
const modalPath = path.resolve(__dirname, '../../frontend/src/features/admin/components/GdsItineraryImportModal.js');

assert.ok(fs.existsSync(parserPath), 'gdsParser.js must exist');
assert.ok(fs.existsSync(modalPath), 'GdsItineraryImportModal.js must exist');

const parserContent = fs.readFileSync(parserPath, 'utf8');
const modalContent = fs.readFileSync(modalPath, 'utf8');

// Ensure modal imports gdsParser, but gdsParser does NOT import modal (no circular dependency)
assert.ok(modalContent.includes("from '../utils/gdsParser'"), 'Modal must import gdsParser');
assert.ok(!parserContent.includes('GdsItineraryImportModal'), 'gdsParser must NOT import UI components (no circular dependency)');

console.log('✓ TEST 2 PASSED: Modular separation verified with zero circular dependencies.\n');

console.log('🎉 ALL MODULE INITIALIZATION & TDZ CHECKS PASSED SUCCESSFULLY!\n');
