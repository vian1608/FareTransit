import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const testDir = path.resolve(process.cwd(), 'tests');
const files = fs.readdirSync(testDir)
  .filter(name => name.startsWith('stabilization_') && name.endsWith('.test.mjs'))
  .sort();

if (!files.length) {
  console.error('No stabilization regression tests were found.');
  process.exit(1);
}

for (const file of files) {
  console.log(`\n[stabilization] ${file}`);
  const result = spawnSync(process.execPath, [path.join(testDir, file)], {
    stdio: 'inherit',
    env: process.env
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`\n[stabilization] ${files.length} test file(s) passed.`);
