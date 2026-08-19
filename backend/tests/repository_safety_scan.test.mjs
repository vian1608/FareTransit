import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROHIBITED_PATTERNS = [
  /'4242'/,
  /"4242"/,
  /Visa ending in 4242/,
  /Card ending in 4242/,
  /•••• 4242/,
  /last4\s*\|\|\s*'4242'/,
  /card_last4\s*\|\|\s*'4242'/,
  /last4\s*\?\?\s*'4242'/
];

const projectRoot = path.resolve(__dirname, '../../');

const SCAN_DIRS = [
  path.join(projectRoot, 'frontend/src'),
  path.join(projectRoot, 'backend/src')
];

async function getFilesRecursively(dir) {
  let results = [];
  const list = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of list) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(await getFilesRecursively(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.mjs') || entry.name.endsWith('.jsx'))) {
      results.push(fullPath);
    }
  }
  return results;
}

async function runRepositorySafetyScan() {
  console.log('================================================================================');
  console.log('  REPOSITORY-WIDE PROHIBITED PAYMENT METADATA STATIC SAFETY SCANNER');
  console.log('================================================================================\n');

  let totalFilesScanned = 0;
  let violationsFound = [];

  for (const scanDir of SCAN_DIRS) {
    const files = await getFilesRecursively(path.resolve(scanDir));
    for (const filePath of files) {
      totalFilesScanned++;
      const content = await fs.readFile(filePath, 'utf8');

      for (const pattern of PROHIBITED_PATTERNS) {
        if (pattern.test(content)) {
          violationsFound.push({
            file: path.relative(process.cwd(), filePath),
            pattern: pattern.toString()
          });
        }
      }
    }
  }

  console.log(`Scanned ${totalFilesScanned} production source files in frontend/src and backend/src.\n`);

  if (violationsFound.length > 0) {
    console.error('❌ CRITICAL SAFETY VIOLATIONS FOUND:');
    violationsFound.forEach(v => {
      console.error(`  - File: ${v.file} | Matches Prohibited Pattern: ${v.pattern}`);
    });
    assert.fail(`Repository safety scan failed: ${violationsFound.length} prohibited hard-coded 4242 payment value(s) detected in production code.`);
  }

  console.log('================================================================================');
  console.log('  🎉 REPOSITORY SAFETY SCAN PASSED: ZERO HARD-CODED 4242 DEFAULTS IN PRODUCTION SOURCE CODE!');
  console.log('================================================================================\n');
}

runRepositorySafetyScan().catch(err => {
  console.error('❌ Scanner execution error:', err.message);
  process.exit(1);
});
