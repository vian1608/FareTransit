import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '../../');

async function runOfficialSupportPhoneNumberTests() {
  console.log('================================================================================');
  console.log('  OFFICIAL SUPPORT PHONE NUMBER UPDATE AUTOMATED TEST SUITE');
  console.log('================================================================================\n');

  // Load configuration and files
  const supportContactJs = await fs.readFile(path.join(ROOT_DIR, 'frontend/src/shared/constants/supportContact.js'), 'utf8');
  const indexHtml = await fs.readFile(path.join(ROOT_DIR, 'frontend/public/index.html'), 'utf8');
  const envMjs = await fs.readFile(path.join(ROOT_DIR, 'backend/src/config/env.mjs'), 'utf8');
  const passAuthJs = await fs.readFile(path.join(ROOT_DIR, 'frontend/src/features/authorizations/pages/PassengerAuthorizationPage.js'), 'utf8');
  const resendServiceMjs = await fs.readFile(path.join(ROOT_DIR, 'backend/src/integrations/resend/resend.service.mjs'), 'utf8');
  const emailHtml = await fs.readFile(path.join(ROOT_DIR, 'backend/src/integrations/resend/templates/booking-confirmation.html'), 'utf8');
  const passAuthServiceMjs = await fs.readFile(path.join(ROOT_DIR, 'backend/src/modules/authorizations/passenger-authorization.service.mjs'), 'utf8');
  const homeJs = await fs.readFile(path.join(ROOT_DIR, 'frontend/src/features/flights/pages/Home.js'), 'utf8');

  // ----------------------------------------------------
  // TEST 1: SHARED CONFIGURATION SOURCE & VALUES
  // ----------------------------------------------------
  console.log('--- TEST 1: SHARED CONFIGURATION SOURCE & VALUES ---');
  assert.ok(supportContactJs.includes("SUPPORT_PHONE_DISPLAY = '+1 (888) 780-8855'"), 'Display number must be +1 (888) 780-8855');
  assert.ok(supportContactJs.includes("SUPPORT_PHONE_INTERNATIONAL = '+1 (888) 780-8855'"), 'International number must be +1 (888) 780-8855');
  assert.ok(supportContactJs.includes("SUPPORT_PHONE_SCHEMA = '+1-888-780-8855'"), 'Schema number must be +1-888-780-8855');
  assert.ok(supportContactJs.includes("SUPPORT_PHONE_TEL = '+18887808855'"), 'Tel URI number must be +18887808855');
  assert.ok(supportContactJs.includes("BUSINESS_CONTACT"), 'BUSINESS_CONTACT object must be exported');
  console.log('✔ TEST 1 PASSED: Shared configuration constants verified.\n');

  // ----------------------------------------------------
  // TEST 2: BACKEND ENVIRONMENT CONFIGURATION
  // ----------------------------------------------------
  console.log('--- TEST 2: BACKEND ENVIRONMENT CONFIGURATION ---');
  assert.ok(envMjs.includes('supportPhoneDisplay'), 'env.mjs must contain supportPhoneDisplay getter');
  assert.ok(envMjs.includes('+1 (888) 780-8855'), 'env.mjs default display number verified');
  assert.ok(envMjs.includes('tel:+18887808855'), 'env.mjs default tel URI verified');
  assert.ok(envMjs.includes('+1-888-780-8855'), 'env.mjs default schema number verified');
  console.log('✔ TEST 2 PASSED: Backend env.mjs getters verified.\n');

  // ----------------------------------------------------
  // TEST 3: STRUCTURED DATA (JSON-LD SCHEMA)
  // ----------------------------------------------------
  console.log('--- TEST 3: STRUCTURED DATA (JSON-LD SCHEMA) ---');
  assert.ok(indexHtml.includes('"telephone": "+1-888-780-8855"'), 'index.html JSON-LD telephone schema must be +1-888-780-8855');
  console.log('✔ TEST 3 PASSED: JSON-LD telephone schema verified.\n');

  // ----------------------------------------------------
  // TEST 4: CUSTOMER-FACING PAGES & HOMEPAGE CALL ACTIONS
  // ----------------------------------------------------
  console.log('--- TEST 4: CUSTOMER-FACING PAGES & HOMEPAGE ---');
  assert.ok(homeJs.includes('SUPPORT_PHONE_HREF'), 'Home.js must use SUPPORT_PHONE_HREF');
  assert.ok(passAuthJs.includes('SUPPORT_PHONE_DISPLAY'), 'PassengerAuthorizationPage.js must import SUPPORT_PHONE_DISPLAY');
  assert.ok(passAuthJs.includes('SUPPORT_PHONE_HREF'), 'PassengerAuthorizationPage.js must import SUPPORT_PHONE_HREF');
  console.log('✔ TEST 4 PASSED: Customer-facing pages phone binding verified.\n');

  // ----------------------------------------------------
  // TEST 5: EMAIL TEMPLATES & BACKEND SERVICES
  // ----------------------------------------------------
  console.log('--- TEST 5: EMAIL TEMPLATES & BACKEND SERVICES ---');
  assert.ok(emailHtml.includes('tel:+18887808855'), 'HTML email template must link to tel:+18887808855');
  assert.ok(emailHtml.includes('+1 (888) 780-8855'), 'HTML email template must display the approved support number');
  assert.ok(resendServiceMjs.includes('env.supportPhoneDisplay'), 'resend.service.mjs must use env.supportPhoneDisplay');
  assert.ok(passAuthServiceMjs.includes('env.supportPhoneDisplay'), 'passenger-authorization.service.mjs must use env.supportPhoneDisplay');
  console.log('✔ TEST 5 PASSED: Email templates & authorization backend service verified.\n');

  // ----------------------------------------------------
  // TEST 6: REPOSITORY AUDIT FOR PROHIBITED OLD NUMBERS
  // ----------------------------------------------------
  console.log('--- TEST 6: REPOSITORY AUDIT FOR PROHIBITED OLD NUMBERS ---');
  const prodFilesToScan = [
    'frontend/src/shared/constants/supportContact.js',
    'frontend/public/index.html',
    'frontend/src/features/authorizations/pages/PassengerAuthorizationPage.js',
    'backend/src/integrations/resend/resend.service.mjs',
    'backend/src/integrations/resend/templates/booking-confirmation.html',
    'backend/src/modules/authorizations/passenger-authorization.service.mjs',
  ];

  const legacyHyphenated = ['213', '965', '9727'].join('-');
  const legacyCompact = ['213', '965', '9727'].join('');
  for (const relPath of prodFilesToScan) {
    const content = await fs.readFile(path.join(ROOT_DIR, relPath), 'utf8');
    assert.ok(!content.includes(legacyHyphenated), `File ${relPath} must not contain the legacy hyphenated support number`);
    assert.ok(!content.includes(legacyCompact), `File ${relPath} must not contain the legacy compact support number`);
  }
  console.log('✔ TEST 6 PASSED: Zero old support numbers remain in production files.\n');

  console.log('================================================================================');
  console.log('  🎉 ALL 6 OFFICIAL SUPPORT PHONE NUMBER TESTS PASSED!');
  console.log('================================================================================\n');
}

runOfficialSupportPhoneNumberTests().catch((err) => {
  console.error('❌ Test Suite Failed:', err);
  process.exit(1);
});
