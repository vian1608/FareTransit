import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd(), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const design = read('frontend/src/shared/styles/TfsDesignSystem.css');
const pageTransition = read('frontend/src/shared/components/PageTransition.js');
const backButton = read('frontend/src/shared/components/CustomerBackButton.js');
const header = read('frontend/src/shared/components/Header.js');
const headerLayout = read('frontend/src/shared/components/HeaderLayoutOverrides.css');
const footer = read('frontend/src/shared/components/Footer.js');
const footerLayout = read('frontend/src/shared/components/FooterLayoutOverrides.css');
const results = read('frontend/src/features/flights/pages/SearchResultsReadability.css');
const confirmation = read('frontend/src/features/bookings/pages/PaymentSuccessPage.js');
const confirmationCss = read('frontend/src/features/bookings/pages/PaymentSuccessPage.css');
const airlineLogo = read('frontend/src/shared/components/AirlineLogo.js');

assert.match(design, /--tfs-wine-950:\s*#3b0a1c/i, 'Deep wine shade must remain defined.');
assert.match(design, /--tfs-wine-700:\s*#861b3d/i, 'Primary wine shade must remain defined.');
assert.match(design, /--tfs-gold-300:\s*#ead58e/i, 'Warm gold accent must remain defined.');
assert.match(design, /--tfs-navy-950:\s*#0b1628/i, 'Deep navy neutral must remain defined.');
assert.match(design, /--tfs-public-shell:\s*1440px/i, 'Public shell width must remain 1440px.');
assert.match(design, /--tfs-admin-shell:\s*1540px/i, 'Admin shell width must remain 1540px.');
assert.match(design, /body \.container\s*\{[\s\S]*?max-width:\s*var\(--tfs-public-shell\)/, 'Shared customer containers must use the public shell.');

assert.match(pageTransition, /pathname\.startsWith\('\/return-flight'\)/, 'Return-flight pages must declare contextual navigation.');
assert.match(pageTransition, /pathname\.startsWith\('\/booking-confirmed'\)/, 'Confirmation pages must declare contextual navigation.');
assert.match(pageTransition, /!hasContextualBack\s*&&\s*<CustomerBackButton/, 'Global back button must be suppressed when the page owns navigation.');
assert.match(backButton, /\^\\\/booking\(\?:\\\/\|\$\)\//, 'Back navigation must recognize tokenized /booking/c_ routes.');

assert.match(header, /HeaderLayoutOverrides\.css/, 'Header must load the shared shell override.');
assert.match(headerLayout, /max-width:\s*var\(--tfs-public-shell,\s*1440px\)/, 'Customer header must use the public shell.');
assert.match(headerLayout, /max-width:\s*var\(--tfs-admin-shell,\s*1540px\)/, 'Admin header must retain the admin shell.');
assert.match(footer, /FooterLayoutOverrides\.css/, 'Footer must load the shared shell override.');
assert.match(footerLayout, /max-width:\s*var\(--tfs-public-shell,\s*1440px\)/, 'Customer footer must use the public shell.');
assert.match(footerLayout, /max-width:\s*var\(--tfs-admin-shell,\s*1540px\)/, 'Admin footer must retain the admin shell.');
assert.match(results, /var\(--tfs-public-shell,\s*1440px\)/, 'Flight results must align to the public shell.');

assert.match(confirmation, /import AirlineLogo from/, 'Confirmation itinerary must use the shared airline logo component.');
assert.doesNotMatch(confirmation, /seg\.airlineLogoUrl\s*&&\s*<img/i, 'Confirmation must not render provider logo URLs as unguarded images.');
assert.match(confirmation, /airlineLogoSlugFor/, 'Confirmation must retain local airline-logo fallback mapping.');
assert.match(confirmation, /Back to My Bookings/, 'Confirmation must expose one aligned contextual back action.');
assert.match(confirmation, /className="confirmation-context-back"/, 'Confirmation contextual back action must use its dedicated style.');
assert.match(airlineLogo, /fa-plane/, 'Airline logo component must end with a visible plane-icon fallback.');
assert.match(confirmationCss, /\.confirmation-container\s*\{[\s\S]*?max-width:\s*960px;/, 'Confirmation content width must remain balanced at 960px.');
assert.match(confirmationCss, /\.confirmation-context-back\s*\{/, 'Confirmation back action must stay aligned inside the confirmation column.');
assert.match(confirmationCss, /\.segment-airline \.segment-logo/, 'Confirmation must size airline identity consistently.');

console.log('public UI consistency contract: PASS');
