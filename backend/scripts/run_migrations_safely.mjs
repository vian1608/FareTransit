import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

import fs from 'fs';
import path from 'path';
import { assertDestructiveAllowed, getEnvironment } from '../src/config/environment-safety.mjs';

export async function runMigrationsSafely(targetDir) {
  let migrationsDir = targetDir;
  if (!migrationsDir) {
    migrationsDir = fs.existsSync('./migrations') ? './migrations' : './backend/migrations';
  }

  const stage = getEnvironment();
  console.log(`\n==================================================`);
  console.log(`  DEPLOYMENT SAFETY MIGRATION RUNNER`);
  console.log(`  ACTIVE STAGE: [ ${stage.toUpperCase()} ]`);
  console.log(`==================================================\n`);

  if (!fs.existsSync(migrationsDir)) {
    console.error(`❌ Migrations directory not found: ${migrationsDir}`);
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`Found ${files.length} SQL migration files in ${migrationsDir}.\n`);

  const executed = [];
  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sqlContent = fs.readFileSync(filePath, 'utf8');

    // Pre-execution deployment safety inspection
    try {
      assertDestructiveAllowed(`Migration ${file}`, sqlContent);
      console.log(`✔ [${stage.toUpperCase()}] Migration ${file} inspected & cleared.`);
      executed.push(file);
    } catch (err) {
      console.error(`\n❌ MIGRATION BLOCKED: ${file}`);
      console.error(`   Reason: ${err.message}\n`);
      throw err;
    }
  }

  console.log(`\n🎉 ALL ${executed.length} MIGRATIONS PASSED DEPLOYMENT SAFETY INSPECTION FOR [${stage.toUpperCase()}]!\n`);
  return { success: true, stage, executedCount: executed.length };
}

if (process.argv[1]?.includes('run_migrations_safely')) {
  runMigrationsSafely().catch(err => {
    process.exit(1);
  });
}
