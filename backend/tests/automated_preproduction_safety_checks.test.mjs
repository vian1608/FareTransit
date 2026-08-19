import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');

console.log('========================================================================');
console.log('  AUTOMATED PRE-PRODUCTION SAFETY & RELIABILITY CHECKS');
console.log('========================================================================\n');

async function runSafetyChecks() {
  const failures = [];

  console.log('--- CHECK 1: Route Duplicate Scan ---');
  const adminRoutesPath = path.join(projectRoot, 'backend/src/modules/admin/admin.routes.mjs');
  const adminRoutesContent = await fs.readFile(adminRoutesPath, 'utf8');
  const routeRegex = /router\.(get|post|put|patch|delete)\(['"](.*?)['"]/g;
  const routeMap = new Map();
  let match;
  while ((match = routeRegex.exec(adminRoutesContent)) !== null) {
    const key = `${match[1].toUpperCase()} ${match[2]}`;
    if (routeMap.has(key)) failures.push(`Duplicate admin route definition: ${key}`);
    else routeMap.set(key, true);
  }
  console.log(failures.some((failure) => failure.includes('Duplicate admin route'))
    ? '❌ Duplicate admin routes found.\n'
    : '✓ Check 1 Passed: No duplicate admin routes found.\n');

  console.log('--- CHECK 2: Dev Token Bypass & Fallback Credential Safety ---');
  const authContent = await fs.readFile(path.join(projectRoot, 'backend/src/middleware/authenticate.mjs'), 'utf8');
  const envContent = await fs.readFile(path.join(projectRoot, 'backend/src/config/env.mjs'), 'utf8');
  const adminServiceContent = await fs.readFile(path.join(projectRoot, 'backend/src/modules/admin/admin.service.mjs'), 'utf8');

  if (authContent.includes("'dev_admin_token'") || authContent.includes("'mock_admin_token_dev'")) {
    if (!authContent.includes("nodeEnv !== 'production'") || !authContent.includes("nodeEnv !== 'staging'")) {
      failures.push('P0: authenticate.mjs contains development-token bypass without production+staging protection');
    }
  }

  if (envContent.includes("'your-secret-key-change-this-in-production'")) {
    if (!envContent.includes('throw new Error') && !envContent.includes("NODE_ENV === 'production'")) {
      failures.push('P0: env.mjs contains unvalidated jwtSecret default fallback');
    }
  }

  if (adminServiceContent.includes('// Development / Localhost override: Always permit login')) {
    failures.push('P0: admin.service.mjs contains passwordless login bypass');
  }

  console.log('--- CHECK 3: Undeclared Identifiers in Critical Services ---');
  const passAuthContent = await fs.readFile(path.join(projectRoot, 'backend/src/modules/authorizations/passenger-authorization.service.mjs'), 'utf8');
  if (passAuthContent.includes('currencyStr')) {
    const hasDeclaration = /const\s+currencyStr\s*=|let\s+currencyStr\s*=|var\s+currencyStr\s*=/.test(passAuthContent);
    if (!hasDeclaration) failures.push('P1: passenger-authorization.service.mjs references currencyStr without variable declaration');
  }

  console.log('--- CHECK 4: External HTTP Fetch Server-Side Timeout ---');
  const resendContent = await fs.readFile(path.join(projectRoot, 'backend/src/integrations/resend/resend.service.mjs'), 'utf8');
  const fetchCalls = (resendContent.match(/fetch\(['"]https:\/\/api\.resend\.com/g) || []).length;
  const timeoutSignals = (resendContent.match(/AbortSignal\.timeout/g) || []).length;
  if (fetchCalls > timeoutSignals) failures.push('P1: resend.service.mjs contains HTTP fetch call without server-side AbortSignal.timeout');

  console.log('--- CHECK 5: Production Acceptance Test Safety Guard ---');
  const acceptanceContent = await fs.readFile(path.join(projectRoot, 'backend/tests/final_production_acceptance_verification.test.mjs'), 'utf8');
  if (!acceptanceContent.includes("process.env.NODE_ENV === 'production'") || (!acceptanceContent.includes('process.exit(1)') && !acceptanceContent.includes('throw'))) {
    failures.push('P0: final_production_acceptance_verification.test.mjs lacks NODE_ENV production write block guard');
  }

  console.log('--- CHECK 6: Production Error Detail Exposure ---');
  const errorHandlerContent = await fs.readFile(path.join(projectRoot, 'backend/src/middleware/error-handler.mjs'), 'utf8');
  if (!errorHandlerContent.includes('isServerError') || !errorHandlerContent.includes('referenceId')) {
    failures.push('P1: error-handler.mjs does not mask unexpected 5xx errors behind a reference ID');
  }
  if (!errorHandlerContent.includes("env.nodeEnv !== 'development'")) {
    failures.push('P1: error-handler.mjs does not distinguish development diagnostics from production responses');
  }

  console.log('========================================================================');
  console.log(`SUMMARY: ${failures.length} active defects identified by safety scan.`);
  console.log('========================================================================');
  failures.forEach((failure, index) => console.log(`${index + 1}. ❌ ${failure}`));

  // This file is a CI gate, not a report-only script. A detected production
  // safety defect must make npm test / verify:production-ready fail.
  assert.equal(failures.length, 0, `Pre-production safety scan failed:\n${failures.join('\n')}`);
}

runSafetyChecks().catch((err) => {
  console.error('Check script error:', err);
  process.exitCode = 1;
});
