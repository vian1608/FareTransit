const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');
const frontendSrc = path.join(repoRoot, 'frontend/src');

function walk(directory, predicate, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, predicate, output);
    } else if (entry.isFile() && predicate(fullPath)) {
      output.push(fullPath);
    }
  }
  return output;
}

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function fail(message, details = []) {
  console.error(`UI interaction safety audit failed: ${message}`);
  for (const detail of details) console.error(`  ${detail}`);
  process.exit(1);
}

const cssFiles = walk(frontendSrc, (filePath) => filePath.endsWith('.css'));
const violations = [];

// A global selector may animate composite CTAs, but it must never seize color
// ownership from arbitrary direct descendants. That exact pattern previously
// turned the shared Call Now text and phone icon dark on dark backgrounds.
const cssBlock = /([^{}]+)\{([^{}]*)\}/g;
const genericInteractiveAnchor = /a\[href\]\[class\*=(?:"|')(?:btn|button|cta|action)(?:"|')\]/;
const compositeDescendant = />\s*(?:span|strong|small|i|svg)\b/;
const foregroundMutation = /(?:^|[;\s])(?:color|-webkit-text-fill-color)\s*:/;

for (const filePath of cssFiles) {
  const content = fs.readFileSync(filePath, 'utf8');
  const relativePath = path.relative(repoRoot, filePath).replaceAll('\\', '/');
  let match;
  cssBlock.lastIndex = 0;
  while ((match = cssBlock.exec(content)) !== null) {
    const selector = match[1];
    const body = match[2];
    if (genericInteractiveAnchor.test(selector) && compositeDescendant.test(selector) && foregroundMutation.test(body)) {
      violations.push(`${relativePath}: generic interactive anchor descendant selector mutates foreground color: ${selector.trim().replace(/\s+/g, ' ')}`);
    }
  }
}

if (violations.length) {
  fail('unsafe cross-component color selectors were found', violations);
}

const interactions = read('frontend/src/shared/styles/SitewideInteractionPolish.css');
for (const required of [
  'a[href][class*="btn"]:hover',
  'a[href][class*="button"]:hover',
  'a[href][class*="cta"]:hover',
  'a[href][class*="action"]:hover',
  'a[href][class*="cta"]:focus-visible',
  '@media (prefers-reduced-motion: reduce)',
]) {
  if (!interactions.includes(required)) fail(`sitewide interaction layer is missing ${required}`);
}

const supportComponent = read('frontend/src/shared/components/SupportCallCTA.js');
if (!supportComponent.includes("import './SupportCallCTA.css';") || !supportComponent.includes("import './SupportCallCTASafety.css';")) {
  fail('SupportCallCTA must load its base stylesheet followed by the contrast-safety stylesheet');
}
if (supportComponent.indexOf("import './SupportCallCTASafety.css';") < supportComponent.indexOf("import './SupportCallCTA.css';")) {
  fail('SupportCallCTASafety.css must load after SupportCallCTA.css');
}
if (!supportComponent.includes('href={SUPPORT_PHONE_HREF}')) {
  fail('SupportCallCTA must continue using the centralized support telephone href');
}

const supportSafety = read('frontend/src/shared/components/SupportCallCTASafety.css');
for (const required of [
  '.support-call-cta > .support-call-cta__icon',
  '.support-call-cta > .support-call-cta__action',
  '.support-call-cta > .support-call-cta__action > strong',
  '.support-call-cta > .support-call-cta__action > span',
  'color: #fff !important;',
  '-webkit-text-fill-color: #fff !important;',
  '.support-call-cta:hover > .support-call-cta__action',
  '.support-call-cta:hover > .support-call-cta__icon',
]) {
  if (!supportSafety.includes(required)) fail(`support CTA safety layer is missing ${required}`);
}

// No stylesheet outside the component's own base/safety files may recolor the
// shared support widget. Layout/motion overrides are fine; foreground overrides
// from unrelated pages are not.
const allowedSupportStyleFiles = new Set([
  'frontend/src/shared/components/SupportCallCTA.css',
  'frontend/src/shared/components/SupportCallCTASafety.css',
]);
const foreignSupportColorRules = [];
for (const filePath of cssFiles) {
  const relativePath = path.relative(repoRoot, filePath).replaceAll('\\', '/');
  if (allowedSupportStyleFiles.has(relativePath)) continue;
  const content = fs.readFileSync(filePath, 'utf8');
  let match;
  cssBlock.lastIndex = 0;
  while ((match = cssBlock.exec(content)) !== null) {
    const selector = match[1];
    const body = match[2];
    if ((selector.includes('.support-call-cta') || selector.includes('.support-call-sticky')) && foregroundMutation.test(body)) {
      foreignSupportColorRules.push(`${relativePath}: ${selector.trim().replace(/\s+/g, ' ')}`);
    }
  }
}
if (foreignSupportColorRules.length) {
  fail('unrelated stylesheets are recoloring the shared phone CTA', foreignSupportColorRules);
}

const majorInteractionFiles = [
  ['frontend/src/shared/components/LandingCtaSection.css', ['.landing-btn--primary:hover', '.landing-btn--secondary:hover']],
  ['frontend/src/shared/styles/InfoPages.css', ['.info-button:hover']],
  ['frontend/src/shared/components/Header.css', [':hover']],
  ['frontend/src/shared/components/Footer.css', [':hover']],
  ['frontend/src/shared/components/ServiceNav.css', [':hover']],
];
for (const [relativePath, requiredTokens] of majorInteractionFiles) {
  const content = read(relativePath);
  for (const token of requiredTokens) {
    if (!content.includes(token)) fail(`${relativePath} is missing expected interaction feedback: ${token}`);
  }
}

for (const required of [
  '.car-rentals-home-page .car-brand-card:hover',
  '.car-rentals-home-page .car-how-card:hover',
  '.car-rentals-home-page .car-benefit-card:hover',
  '.car-rentals-home-page .car-vehicle-card:hover',
  '.car-rentals-home-page .car-ppc-button--primary:hover',
  '.car-rentals-home-page .car-ppc-button:focus-visible',
]) {
  if (!interactions.includes(required)) fail(`car-rental interaction coverage is missing ${required}`);
}

console.log(`UI interaction safety audit passed: scanned ${cssFiles.length} frontend stylesheet(s).`);
console.log('Verified shared phone CTA contrast, CTA hover/focus coverage, reduced-motion handling, and cross-component color isolation.');
