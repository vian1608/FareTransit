import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '../../');

async function read(relativePath) {
  return fs.readFile(path.join(ROOT_DIR, relativePath), 'utf8');
}

async function run() {
  const index = await read('frontend/src/index.js');
  const interactions = await read('frontend/src/shared/styles/SitewideInteractionPolish.css');
  const carPage = await read('frontend/src/features/cars/pages/CarRentalsHomePage.js');
  const supportCallCta = await read('frontend/src/shared/components/SupportCallCTA.js');
  const supportSafety = await read('frontend/src/shared/components/SupportCallCTASafety.css');

  assert.ok(
    index.includes("import './shared/styles/SitewideInteractionPolish.css';"),
    'Sitewide interaction polish must be loaded globally'
  );

  assert.ok(
    interactions.includes('a[href][class*="btn"]') &&
      interactions.includes('a[href][class*="button"]') &&
      interactions.includes('a[href][class*="cta"]') &&
      interactions.includes('a[href][class*="action"]'),
    'Anchor-based button and CTA patterns must receive the global interaction treatment'
  );

  assert.ok(
    !interactions.includes('a[href][class*="cta"] > span') &&
      !interactions.includes('a[href][class*="cta"] > i') &&
      !interactions.includes('a[href][class*="button"] > span') &&
      !interactions.includes('a[href][class*="action"] > span'),
    'Global interaction styles must not seize descendant foreground colors from composite CTAs'
  );

  assert.ok(
    supportCallCta.includes("import './SupportCallCTA.css';") &&
      supportCallCta.includes("import './SupportCallCTASafety.css';") &&
      supportCallCta.indexOf("import './SupportCallCTASafety.css';") > supportCallCta.indexOf("import './SupportCallCTA.css';"),
    'SupportCallCTA contrast-safety styles must load after the component base styles'
  );

  assert.ok(
    supportSafety.includes('.support-call-cta > .support-call-cta__icon') &&
      supportSafety.includes('.support-call-cta > .support-call-cta__action') &&
      supportSafety.includes('.support-call-cta > .support-call-cta__action > strong') &&
      supportSafety.includes('.support-call-cta > .support-call-cta__action > span') &&
      supportSafety.includes('color: #fff !important;') &&
      supportSafety.includes('-webkit-text-fill-color: #fff !important;'),
    'Shared support call icon, action label, and phone number must remain explicitly white on accent backgrounds'
  );

  assert.ok(
    supportSafety.includes('.support-call-cta:hover > .support-call-cta__action') &&
      supportSafety.includes('.support-call-cta:hover > .support-call-cta__icon'),
    'Shared support call surfaces must expose visible hover feedback without sacrificing contrast'
  );

  assert.ok(
    interactions.includes('@media (hover: hover) and (pointer: fine)'),
    'Hover-only motion must be gated to devices that actually support hover'
  );

  const carLabelRule = interactions.slice(
    interactions.indexOf('.car-rentals-home-page .car-ppc-button > span'),
    interactions.indexOf('.car-rentals-home-page .car-ppc-button > i')
  );
  assert.ok(
    carLabelRule.includes('color: inherit;') &&
      carLabelRule.includes('font-size: inherit;') &&
      carLabelRule.includes('font-weight: inherit;') &&
      carLabelRule.includes('line-height: inherit;'),
    'Car-rental CTA labels must inherit the full button foreground and typography'
  );

  assert.ok(
    interactions.includes('.car-rentals-home-page .car-vehicle-callout > div > span'),
    'Muted vehicle-callout copy must be scoped to the explanatory text only'
  );

  assert.ok(
    interactions.includes('.car-rentals-home-page .car-ppc-button--primary:hover') &&
      interactions.includes('.car-rentals-home-page .car-ppc-button--secondary:hover') &&
      interactions.includes('.car-rentals-home-page .car-ppc-button--outline:hover'),
    'Every car-rental CTA variant must have an explicit visible hover state'
  );

  assert.ok(
    interactions.includes('.car-rentals-home-page .car-brand-card:hover') &&
      interactions.includes('.car-rentals-home-page .car-how-card:hover') &&
      interactions.includes('.car-rentals-home-page .car-benefit-card:hover') &&
      interactions.includes('.car-rentals-home-page .car-vehicle-card:hover'),
    'Every major car-rental information card group must expose visible desktop hover feedback'
  );

  assert.ok(
    interactions.includes('.car-rentals-home-page .car-brand-card:hover .car-brand-logo') &&
      interactions.includes('.car-rentals-home-page .car-how-card:hover .car-how-card__icon') &&
      interactions.includes('.car-rentals-home-page .car-benefit-card:hover .car-benefit-icon') &&
      interactions.includes('.car-rentals-home-page .car-vehicle-card:hover > i'),
    'Car-rental hover feedback must include the logo/icon layer, not only the outer card shadow'
  );

  assert.ok(
    interactions.includes('.car-rentals-home-page .car-faq-item summary:hover'),
    'Interactive car-rental FAQ summaries must expose a hover state'
  );

  assert.ok(
    carPage.includes('className="car-ppc-button car-ppc-button--primary"') &&
      carPage.includes('Call a Rental Specialist'),
    'Car-rental primary CTAs must remain wired to the shared call button'
  );

  assert.ok(
    interactions.includes('@media (prefers-reduced-motion: reduce)') &&
      supportSafety.includes('@media (prefers-reduced-motion: reduce)'),
    'Interaction polish and support CTA safety must honor reduced-motion preferences'
  );

  console.log('Sitewide interaction and support CTA contrast contract passed.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
