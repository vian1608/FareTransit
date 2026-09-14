const fs = require('fs');
const path = require('path');

const frontendRoot = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(frontendRoot, relativePath), 'utf8');
const failures = [];

function requireText(file, text, description) {
  if (!read(file).includes(text)) failures.push(`${file}: ${description}`);
}
function forbidText(file, text, description) {
  if (read(file).includes(text)) failures.push(`${file}: ${description}`);
}

requireText('src/index.js', "const isAdminPath = /^\\/admin(?:\\/|$)/", 'all authenticated /admin paths must enter the unified shell');
forbidText('src/index.js', 'AdminUniversalNav', 'the retired duplicate global admin bar must not be mounted');
requireText('src/features/admin/pages/AdminLoginPage.js', "window.location.assign('/admin');", 'successful login must hand off to the unified admin home');

const shell = read('src/features/backoffice/BackOfficeShell.js');
[
  ["label: 'Dashboard', href: '/admin'", 'Dashboard'],
  ["label: 'Bookings', href: '/admin/bookings'", 'Bookings'],
  ["label: 'Customers', href: '/admin/customers'", 'Customers'],
  ["label: 'Payments', href: '/admin/payments'", 'Payments'],
  ["label: 'Settings', href: '/admin/settings'", 'Settings']
].forEach(([needle, label]) => { if (!shell.includes(needle)) failures.push(`BackOfficeShell.js: missing primary ${label} destination`); });
if ((shell.match(/label:\s*'/g) || []).length !== 5) failures.push('BackOfficeShell.js: permanent sidebar must contain exactly five primary destinations');
if (!shell.includes('<NavLink to="/admin" end className="backoffice-brand"')) failures.push('BackOfficeShell.js: FareTransit brand must link to /admin');
if (shell.includes('THE FINAL SEAT')) failures.push('BackOfficeShell.js: legacy THE FINAL SEAT branding must not appear in FareTransit Admin');
if (!shell.includes("navigate('/admin/bookings/new')")) failures.push('BackOfficeShell.js: New Booking must remain a top-level action');

const routerFile = 'src/features/backoffice/BackOfficeRouter.js';
[
  '<Route path="/admin"',
  '<Route path="/admin/bookings"',
  '<Route path="/admin/customers"',
  '<Route path="/admin/payments"',
  '<Route path="/admin/settings"'
].forEach(route => requireText(routerFile, route, `missing primary route ${route}`));
requireText(routerFile, "window.location.replace('/admin/login')", 'unauthenticated admin requests must perform a full login handoff instead of SPA-looping');
requireText(routerFile, '<Route path="/admin/backoffice" element={<Navigate to="/admin" replace />} />', 'legacy backoffice URL must resolve to the new home');
requireText(routerFile, '<Route path="/admin/dashboard" element={<Navigate to="/admin/bookings?type=flight" replace />} />', 'legacy flight dashboard URL must resolve into unified bookings');
requireText(routerFile, '<Route path="/admin/bookings/hotels" element={<Navigate to="/admin/bookings?type=hotel" replace />} />', 'legacy hotel list must resolve into unified bookings');
requireText(routerFile, '<Route path="/admin/bookings/cars" element={<Navigate to="/admin/bookings?type=car" replace />} />', 'legacy car list must resolve into unified bookings');

const pagesFile = 'src/features/backoffice/AdminOperationsPages.js';
requireText(pagesFile, 'export function AdminHomePage()', 'new operational dashboard must exist');
requireText(pagesFile, 'export function UnifiedBookingsPage()', 'unified bookings workspace must exist');
requireText(pagesFile, 'export function CustomersHubPage()', 'customer workspace must exist');
requireText(pagesFile, 'export function PaymentsNav', 'payments grouping must exist');
requireText(pagesFile, 'export function SettingsHomePage()', 'settings hub must exist');
['Transactions','Authorizations','Refunds'].forEach(label => requireText(pagesFile, `>${label}<`, `payments must include ${label}`));
['Business','Users & Permissions','Email','Integrations','Security','Audit Log'].forEach(label => requireText(pagesFile, `'${label}'`, `settings must include ${label}`));

const css = read('src/features/backoffice/BackOfficeShell.css');
['--admin-navy:#12345b','--admin-blue:#1769e0','--admin-bg:#f6f8fb'].forEach(token => { if (!css.includes(token)) failures.push(`BackOfficeShell.css: missing design token ${token}`); });

if (failures.length) {
  console.error('Admin architecture verification failed:');
  failures.forEach(failure => console.error(` - ${failure}`));
  process.exit(1);
}

console.log('Admin architecture verification passed: five primary destinations, unified booking/payment/settings hubs, legacy redirects, safe login handoff and FareTransit-only branding.');
