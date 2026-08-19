import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const home = read('frontend/src/features/flights/pages/Home.js');
const css = read('frontend/src/features/flights/pages/Home.css');

// Main flight search must swap both displayed values and selected airport objects.
assert.match(home, /const handleSwapSearchAirports = \(\) =>/);
assert.match(home, /from: prev\.to \|\| ''/);
assert.match(home, /to: prev\.from \|\| ''/);
assert.match(home, /fromAirport: prev\.toAirport \|\| null/);
assert.match(home, /toAirport: prev\.fromAirport \|\| null/);
assert.match(home, /onClick=\{handleSwapSearchAirports\}/);
assert.match(home, /aria-label="Swap origin and destination airports"/);

// Custom Inquiry gets the same origin/destination convenience without changing dates/passengers.
assert.match(home, /const handleSwapInquiryAirports = \(\) =>/);
assert.match(home, /origin: prev\.destination \|\| ''/);
assert.match(home, /destination: prev\.origin \|\| ''/);
assert.match(home, /onClick=\{handleSwapInquiryAirports\}/);

// Responsive control: horizontal between fields on desktop, vertical between stacked fields on mobile.
assert.match(css, /\.airport-swap-row\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\) 48px minmax\(0, 1fr\)/);
assert.match(css, /\.airport-swap-button\s*\{/);
assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.airport-swap-row[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
assert.match(css, /transform: rotate\(90deg\)/);

console.log('airport origin/destination swap control contract: PASS');
