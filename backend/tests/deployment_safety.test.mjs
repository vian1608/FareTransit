import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

import assert from 'assert';
import environmentSafety, { assertDestructiveAllowed, getEnvironment } from '../src/config/environment-safety.mjs';
import { runMigrationsSafely } from '../scripts/run_migrations_safely.mjs';

async function runDeploymentSafetyTests() {
  console.log('=== RUNNING DEPLOYMENT SAFETY & ENVIRONMENT SEPARATION TESTS ===\n');

  const originalNodeEnv = process.env.NODE_ENV;
  const originalOverride = process.env.ALLOW_DESTRUCTIVE_PRODUCTION_OPERATIONS;

  try {
    // ----------------------------------------------------
    // TEST SECTION 1: ENVIRONMENT STAGE RESOLUTION
    // ----------------------------------------------------
    console.log('--- TEST SECTION 1: ENVIRONMENT STAGE RESOLUTION ---');

    process.env.NODE_ENV = 'development';
    assert.strictEqual(getEnvironment(), 'development');
    assert.strictEqual(environmentSafety.isDevelopment(), true);
    console.log('✔ Test 1a Passed: Development environment resolved.');

    process.env.NODE_ENV = 'staging';
    assert.strictEqual(getEnvironment(), 'staging');
    assert.strictEqual(environmentSafety.isStaging(), true);
    console.log('✔ Test 1b Passed: Staging environment resolved.');

    process.env.NODE_ENV = 'production';
    assert.strictEqual(getEnvironment(), 'production');
    assert.strictEqual(environmentSafety.isProduction(), true);
    console.log('✔ Test 1c Passed: Production environment resolved.');

    // ----------------------------------------------------
    // TEST SECTION 2: DESTRUCTIVE OPERATION BLOCKING IN PRODUCTION
    // ----------------------------------------------------
    console.log('\n--- TEST SECTION 2: DESTRUCTIVE OPERATION BLOCKING IN PRODUCTION ---');

    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_DESTRUCTIVE_PRODUCTION_OPERATIONS;

    // Test 2a: DROP TABLE in Production MUST be blocked
    console.log('Test 2a: Attempting DROP TABLE in Production...');
    try {
      assertDestructiveAllowed('Drop Bookings Table', 'DROP TABLE public.bookings;');
      assert.fail('Should have blocked DROP TABLE in production');
    } catch (err) {
      assert.strictEqual(err.code, 'DESTRUCTIVE_PRODUCTION_OPERATION_BLOCKED');
      console.log(`✔ Test 2a Passed: DROP TABLE in production blocked cleanly (${err.message})`);
    }

    // Test 2b: TRUNCATE in Production MUST be blocked
    console.log('\nTest 2b: Attempting TRUNCATE in Production...');
    try {
      assertDestructiveAllowed('Truncate Payments Table', 'TRUNCATE TABLE public.payments;');
      assert.fail('Should have blocked TRUNCATE in production');
    } catch (err) {
      assert.strictEqual(err.code, 'DESTRUCTIVE_PRODUCTION_OPERATION_BLOCKED');
      console.log(`✔ Test 2b Passed: TRUNCATE in production blocked cleanly (${err.message})`);
    }

    // Test 2c: Non-destructive query in Production MUST succeed
    console.log('\nTest 2c: Safe non-destructive SQL in Production...');
    const safeResult = assertDestructiveAllowed('Add Column', 'ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS notes TEXT;');
    assert.strictEqual(safeResult.safe, true);
    console.log('✔ Test 2c Passed: Non-destructive schema addition allowed in production.');

    // Test 2d: Emergency Override Flag
    console.log('\nTest 2d: Emergency override flag ALLOW_DESTRUCTIVE_PRODUCTION_OPERATIONS=true...');
    process.env.ALLOW_DESTRUCTIVE_PRODUCTION_OPERATIONS = 'true';
    const overrideResult = assertDestructiveAllowed('Emergency Schema Fix', 'DROP COLUMN legacy_field;');
    assert.strictEqual(overrideResult.safe, true);
    console.log('✔ Test 2d Passed: Emergency override flag permitted production alteration.');

    // ----------------------------------------------------
    // TEST SECTION 3: SAFE MIGRATION RUNNER
    // ----------------------------------------------------
    console.log('\n--- TEST SECTION 3: SAFE MIGRATION RUNNER ---');

    process.env.NODE_ENV = 'staging';
    delete process.env.ALLOW_DESTRUCTIVE_PRODUCTION_OPERATIONS;

    const migrationResult = await runMigrationsSafely();
    assert.strictEqual(migrationResult.success, true);
    assert.ok(migrationResult.executedCount > 0, 'Must inspect & clear migration files');
    console.log(`✔ Test 3 Passed: Safe migration runner validated ${migrationResult.executedCount} SQL files cleanly in Staging.`);

    console.log('\n🎉 ALL DEPLOYMENT SAFETY & ENVIRONMENT SEPARATION TESTS PASSED SUCCESSFULLY!\n');
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalOverride !== undefined) {
      process.env.ALLOW_DESTRUCTIVE_PRODUCTION_OPERATIONS = originalOverride;
    } else {
      delete process.env.ALLOW_DESTRUCTIVE_PRODUCTION_OPERATIONS;
    }
  }
}

runDeploymentSafetyTests().catch(err => {
  console.error('❌ Deployment Safety Test Failed:', err);
  process.exit(1);
});
