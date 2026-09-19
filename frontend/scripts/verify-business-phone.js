const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');
const ignoredDirs = new Set(['.git', 'node_modules', 'build', 'dist', 'coverage', '.next']);
const textExtensions = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.html', '.css', '.json', '.md',
  '.txt', '.xml', '.yml', '.yaml', '.toml', '.ini', '.conf', '.env',
]);

const stalePhone = /(?:\+?1[\s.-]?)?\(?213\)?[\s.-]?965[\s.-]?9727/g;
const currentDisplay = '+1 (888) 780-8855';
const currentTelNumber = '+18887808855';
const currentTel = `tel:${currentTelNumber}`;
const currentSchema = '+1-888-780-8855';

// These are deliberately non-business examples/fixtures. They model passenger/PII input,
// not FareTransit public contact information, and must not be rewritten as business data.
const permittedLegacyFixtureFiles = new Set([
  'backend/tests/data_integrity_and_payment_splits.test.mjs',
  'backend/tests/google_ads_lead_conversion_complete.test.mjs',
  'backend/tests/passenger_authorization.test.mjs',
  'backend/tests/payment_transaction_reference.test.mjs',
  'frontend/src/features/admin/components/AdminBookingWorkspace.js',
]);

const matches = [];

function isTextFile(filePath) {
  const basename = path.basename(filePath);
  return basename.startsWith('.env') || textExtensions.has(path.extname(filePath).toLowerCase());
}

function scanDirectory(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue;

    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(fullPath);
      continue;
    }

    if (!entry.isFile() || !isTextFile(fullPath)) continue;

    const content = fs.readFileSync(fullPath, 'utf8');
    const relativePath = path.relative(repoRoot, fullPath).replaceAll('\\', '/');
    let match;
    stalePhone.lastIndex = 0;
    while ((match = stalePhone.exec(content)) !== null) {
      const line = content.slice(0, match.index).split('\n').length;
      matches.push({ relativePath, line, value: match[0] });
    }
  }
}

scanDirectory(repoRoot);

const unexpectedMatches = matches.filter(({ relativePath }) => !permittedLegacyFixtureFiles.has(relativePath));
const preservedFixtureMatches = matches.filter(({ relativePath }) => permittedLegacyFixtureFiles.has(relativePath));

if (unexpectedMatches.length) {
  console.error('Stale FareTransit business phone reference(s) found:');
  unexpectedMatches.forEach(({ relativePath, line, value }) => console.error(`  ${relativePath}:${line}: ${value}`));
  process.exit(1);
}

const readRepoFile = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const supportContact = readRepoFile('frontend/src/shared/constants/supportContact.js');
if (!supportContact.includes(`SUPPORT_PHONE_DISPLAY = '${currentDisplay}'`)) {
  throw new Error('FareTransit display phone constant is not the approved business number.');
}
if (!supportContact.includes(`SUPPORT_PHONE_TEL = '${currentTelNumber}'`)) {
  throw new Error(`FareTransit telephone constant must resolve to ${currentTel}.`);
}
if (!supportContact.includes("SUPPORT_PHONE_HREF = `tel:${SUPPORT_PHONE_TEL}`")) {
  throw new Error('FareTransit phone href is not derived from the central telephone constant.');
}
if (!supportContact.includes(`SUPPORT_PHONE_SCHEMA = '${currentSchema}'`)) {
  throw new Error('FareTransit schema phone constant is not the approved business number.');
}

const indexHtml = readRepoFile('frontend/public/index.html');
const schemaMatches = indexHtml.match(new RegExp(currentSchema.replace(/[+]/g, '\\+'), 'g')) || [];
if (schemaMatches.length < 2) {
  throw new Error('TravelAgency/Organization telephone and contactPoint.telephone are not both updated.');
}

const backendEnv = readRepoFile('backend/src/config/env.mjs');
for (const expected of [currentDisplay, currentTel, currentSchema]) {
  if (!backendEnv.includes(expected)) throw new Error(`Backend business support config is missing ${expected}.`);
}

const bookingEmail = readRepoFile('backend/src/integrations/resend/templates/booking-confirmation.html');
if (!bookingEmail.includes(`href="${currentTel}"`) || !bookingEmail.includes(currentDisplay)) {
  throw new Error('Booking confirmation email does not use the canonical FareTransit support phone.');
}

const emailRenderer = readRepoFile('backend/src/modules/emails/email-renderer.service.mjs');
if (!emailRenderer.includes("import env from '../../config/env.mjs';") || !emailRenderer.includes('env.supportPhoneDisplay')) {
  throw new Error('Email renderer must source the FareTransit support phone from backend env config.');
}

const seniorTravel = readRepoFile('frontend/src/features/flights/pages/SeniorTravelPage.js');
if (!seniorTravel.includes('SUPPORT_PHONE_SCHEMA') || seniorTravel.match(/telephone: SUPPORT_PHONE_SCHEMA/g)?.length < 2) {
  throw new Error('Senior travel Organization/contactPoint schema must use the shared phone schema constant.');
}

const airlineRoute = readRepoFile('frontend/src/features/flights/pages/AirlineRoute.js');
if (!airlineRoute.includes('href={SUPPORT_PHONE_HREF}') || !airlineRoute.includes('{SUPPORT_PHONE_DISPLAY}') || airlineRoute.includes('airline.phone')) {
  throw new Error('Airline booking CTA must use the centralized FareTransit phone href/display constants.');
}

// The normal global header intentionally owns navigation only. A route-scoped call
// control is allowed on the dedicated paid car-rental landing page, where the normal
// navigation is replaced rather than duplicated.
const header = readRepoFile('frontend/src/shared/components/Header.js');
if (header.includes('header-mobile-call')) {
  throw new Error('Header must not reintroduce the retired duplicate mobile Call Now control.');
}
if (header.includes('SUPPORT_PHONE_HREF')) {
  const hasDedicatedPaidGate = header.includes("location.pathname === '/car-rental/call-now'")
    && header.includes('if (isPaidCarCallLanding)')
    && header.includes('data-paid-car-call="true"');
  if (!hasDedicatedPaidGate) {
    throw new Error('Any Header phone CTA must be isolated to the dedicated paid car-rental landing route.');
  }
}

const ctaFiles = [
  'frontend/src/shared/components/Footer.js',
  'frontend/src/shared/components/SupportCallCTA.js',
  'frontend/src/shared/pages/ContactInfoPage.js',
  'frontend/src/features/authorizations/pages/PassengerAuthorizationPage.js',
  'frontend/src/features/flights/pages/AirlineRoute.js',
];
for (const relativePath of ctaFiles) {
  if (!readRepoFile(relativePath).includes('SUPPORT_PHONE_HREF')) {
    throw new Error(`${relativePath} must bind FareTransit call actions to SUPPORT_PHONE_HREF.`);
  }
}

console.log(`Business phone audit passed: ${currentDisplay} / ${currentTel}`);
if (preservedFixtureMatches.length) {
  const files = [...new Set(preservedFixtureMatches.map(({ relativePath }) => relativePath))];
  console.log(`Preserved ${preservedFixtureMatches.length} unrelated passenger/test fixture occurrence(s) in: ${files.join(', ')}`);
}
