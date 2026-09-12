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
    interactions.includes('@media (hover: hover) and (pointer: fine)'),
    'Hover-only motion must be gated to devices that actually support hover'
  );

  assert.ok(
    interactions.includes('.car-rentals-home-page .car-ppc-button > span') &&
      interactions.includes('color: inherit;'),
    'Car-rental CTA labels must inherit their button foreground color'
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
    interactions.includes('.car-rentals-home-page .car-faq-item summary:hover'),
    'Interactive car-rental FAQ summaries must expose a hover state'
  );

  assert.ok(
    !interactions.includes('.car-brand-card:hover') &&
      !interactions.includes('.car-how-card:hover') &&
      !interactions.includes('.car-benefit-card:hover') &&
      !interactions.includes('.car-vehicle-card:hover'),
    'Static informational cards must not masquerade as clickable controls'
  );

  assert.ok(
    carPage.includes('className="car-ppc-button car-ppc-button--primary"') &&
      carPage.includes('Call a Rental Specialist'),
    'Car-rental primary CTAs must remain wired to the shared call button'
  );

  assert.ok(
    interactions.includes('@media (prefers-reduced-motion: reduce)'),
    'Interaction polish must honor reduced-motion preferences'
  );

  console.log('Sitewide interaction polish contract passed.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
