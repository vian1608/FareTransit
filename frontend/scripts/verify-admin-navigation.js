const fs = require('fs');
const path = require('path');

const frontendRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(frontendRoot, relativePath), 'utf8');
const failures = [];

function requireText(file, text, description) {
  const content = read(file);
  if (!content.includes(text)) failures.push(`${file}: ${description}`);
}

function requireMatch(file, regex, description) {
  const content = read(file);
  if (!regex.test(content)) failures.push(`${file}: ${description}`);
}

requireText('src/index.js', "import AdminUniversalNav from './shared/components/admin/AdminUniversalNav';", 'universal admin navigation must be imported at the root');
requireText('src/index.js', '<AdminUniversalNav />', 'universal admin navigation must be mounted before admin route selection');

requireText('src/shared/components/admin/AdminUniversalNav.js', "const ADMIN_HOME = '/admin/backoffice';", 'Admin Home must resolve to /admin/backoffice');
requireText('src/shared/components/admin/AdminUniversalNav.js', 'href="/admin/dashboard"', 'Flight Dashboard must remain a separate destination');
requireText('src/shared/components/admin/AdminUniversalNav.js', 'href="/"', 'View Website must remain available');
requireText('src/shared/components/admin/AdminUniversalNav.js', "path === '/admin/login'", 'login page must be excluded from authenticated admin navigation');
requireText('src/shared/components/admin/AdminUniversalNav.js', "'.adv2-brand'", 'legacy flight dashboard brand must be home-enabled');
requireText('src/shared/components/admin/AdminUniversalNav.js', "'.backoffice-brand'", 'back office brand must be home-enabled');

requireMatch('src/features/backoffice/BackOfficeShell.js', /<NavLink to="\/admin\/backoffice" className="backoffice-brand"[^>]*aria-label="Admin Home"/, 'back office brand must be a semantic Admin Home link');
requireMatch('src/features/admin/pages/BaggageAdminPage.js', /href="\/admin\/backoffice">← Admin Home<\/a>/, 'baggage admin must link to Admin Home');
requireMatch('src/features/admin/pages/FlexAdminPage.js', /href="\/admin\/backoffice">Admin Home<\/a>/, 'Flex admin must link to Admin Home');

requireText('public/admin-car-reservations.html', 'class="brand-link" href="/admin/backoffice" aria-label="Admin Home"', 'car reservations brand must be clickable to Admin Home');
requireText('public/admin-car-reservations.html', 'href="/admin/backoffice">⌂ Admin Home</a>', 'car reservations must expose an explicit Admin Home control');
requireText('public/admin-car-reservations.html', 'href="/admin/dashboard">← Flight Dashboard</a>', 'car reservations must keep the Flight Dashboard shortcut');
requireText('public/admin-car-reservations.html', 'href="/">View Website ↗</a>', 'car reservations must expose View Website');

const appRoutes = [...read('src/app/App.js').matchAll(/<Route\s+path="(\/admin[^"]*)"/g)].map((match) => match[1]);
const backOfficeRoutes = [...read('src/features/backoffice/BackOfficeRouter.js').matchAll(/<Route\s+path="(\/admin[^"]*)"/g)].map((match) => match[1]);
const coveredRoutes = [...new Set([...appRoutes, ...backOfficeRoutes, '/admin/baggage', '/admin/flex'])];

if (coveredRoutes.length < 10) {
  failures.push(`admin route inventory unexpectedly small (${coveredRoutes.length}); review navigation coverage`);
}

if (failures.length) {
  console.error('Admin navigation verification failed:');
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}

console.log(`Admin navigation verification passed for ${coveredRoutes.length} React admin route patterns plus the standalone car-reservations admin page.`);
