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
const currentTel = 'tel:+18887808855';
const currentSchema = '+1-888-780-8855';
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
    let match;
    stalePhone.lastIndex = 0;
    while ((match = stalePhone.exec(content)) !== null) {
      const line = content.slice(0, match.index).split('\n').length;
      matches.push(`${path.relative(repoRoot, fullPath)}:${line}: ${match[0]}`);
    }
  }
}

scanDirectory(repoRoot);

if (matches.length) {
  console.error('Stale FareTransit business phone reference(s) found:');
  matches.forEach((match) => console.error(`  ${match}`));
  process.exit(1);
}

const supportContactPath = path.join(repoRoot, 'frontend/src/shared/constants/supportContact.js');
const supportContact = fs.readFileSync(supportContactPath, 'utf8');
if (!supportContact.includes(`SUPPORT_PHONE_DISPLAY = '${currentDisplay}'`)) {
  throw new Error('FareTransit display phone constant is not the approved business number.');
}
if (!supportContact.includes(`SUPPORT_PHONE_HREF = \`tel:${'${SUPPORT_PHONE_TEL}'}\``)) {
  throw new Error('FareTransit phone href is not derived from the central telephone constant.');
}
if (!supportContact.includes("SUPPORT_PHONE_TEL = '+18887808855'")) {
  throw new Error(`FareTransit telephone constant must resolve to ${currentTel}.`);
}

const indexPath = path.join(repoRoot, 'frontend/public/index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf8');
const schemaMatches = indexHtml.match(new RegExp(currentSchema.replace(/[+]/g, '\\+'), 'g')) || [];
if (schemaMatches.length < 2) {
  throw new Error('TravelAgency/Organization telephone and contactPoint.telephone are not both updated.');
}

console.log(`Business phone audit passed: ${currentDisplay} / ${currentTel}`);
