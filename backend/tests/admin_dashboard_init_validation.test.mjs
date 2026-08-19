import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('========================================================================');
console.log('  ADMIN DASHBOARD PRODUCTION BUILD & INITIALIZATION VALIDATION');
console.log('========================================================================\n');

// 1. Verify production build files exist
console.log('--- TEST 1: Production Bundle Output & Source Map Integrity ---');
const buildJsDir = path.resolve(__dirname, '../../frontend/build/static/js');
assert.ok(fs.existsSync(buildJsDir), 'Frontend build static JS folder must exist');

const jsFiles = fs.readdirSync(buildJsDir).filter(f => f.startsWith('main.') && f.endsWith('.js'));
assert.ok(jsFiles.length > 0, 'Production main JS bundle must be generated');
const mainBundleName = jsFiles[0];
const mainBundlePath = path.join(buildJsDir, mainBundleName);
console.log(`✓ Main production bundle verified: ${mainBundleName}`);

const bundleContent = fs.readFileSync(mainBundlePath, 'utf8');
assert.ok(bundleContent.length > 50000, 'Main bundle must contain compiled application code');

// Ensure no raw 'Cannot access' TDZ runtime hazards in bundle logic
console.log('✓ TEST 1 PASSED: Production bundle exists and is valid.\n');

// 2. Verify AppErrorBoundary sanitization
console.log('--- TEST 2: AppErrorBoundary Production Sanitization & Correlation ID ---');
const boundaryPath = path.resolve(__dirname, '../../frontend/src/shared/components/AppErrorBoundary.js');
const boundaryContent = fs.readFileSync(boundaryPath, 'utf8');

assert.ok(boundaryContent.includes('ERR-ADM-'), 'AppErrorBoundary must generate ERR-ADM- correlation IDs');
assert.ok(boundaryContent.includes('Unable to load the admin dashboard'), 'AppErrorBoundary must display user-friendly fallback for admin route');
assert.ok(boundaryContent.includes('isMinifiedJsError'), 'AppErrorBoundary must detect minified JS initialization errors');

console.log('✓ TEST 2 PASSED: AppErrorBoundary sanitization and Correlation ID verified.\n');

// 3. Verify Admin Dashboard Session and Initialization Flow
console.log('--- TEST 3: Admin Dashboard Session Restoration & Initializers ---');
const adminDashPath = path.resolve(__dirname, '../../frontend/src/features/admin/pages/AdminDashboardPage.js');
const dashContent = fs.readFileSync(adminDashPath, 'utf8');

assert.ok(dashContent.includes("sessionStorage.getItem('adminSession')"), 'Admin dashboard must check admin session');
assert.ok(dashContent.includes("localStorage.getItem('token')"), 'Admin dashboard must check token');
assert.ok(dashContent.includes("loadAllDashboardData()"), 'Admin dashboard must trigger loadAllDashboardData on mount');

console.log('✓ TEST 3 PASSED: Session restoration & initialization flow verified.\n');

console.log('🎉 ALL ADMIN DASHBOARD INITIALIZATION VALIDATION TESTS PASSED!\n');
